import express from "express";
import cors from "cors";
import { spawn } from "node:child_process";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import * as XLSX from "xlsx";
import { runAgent } from "./agent.js";
import { toolDefinitions } from "./tools/index.js";
import { DEFAULT_BASE_URLS } from "./llm.js";
import type { Message, ChatConfig, EmitEvent, Attachment } from "./types.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "4mb" }));

// Detect python availability once at startup.
function pythonAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn("python", ["--version"], { stdio: "ignore" });
    const timer = setTimeout(() => { child.kill(); resolve(false); }, 3000);
    child.on("error", () => { clearTimeout(timer); resolve(false); });
    child.on("close", (code) => { clearTimeout(timer); resolve(code === 0); });
  });
}

let python: boolean | null = null;
pythonAvailable().then((v) => { python = v; }).catch(() => { python = false; });

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, python: python ?? false, version: "0.1.0" });
});

app.get("/api/tools", (_req, res) => {
  res.json({ tools: toolDefinitions() });
});

interface ModelsBody {
  provider?: string;
  apiKey?: string;
  baseUrl?: string;
}

app.post("/api/models", async (req, res) => {
  const { provider = "", apiKey = "", baseUrl = "" } = (req.body ?? {}) as ModelsBody;

  try {
    if (provider === "anthropic") {
      res.json({
        models: [
          { id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5" },
          { id: "claude-opus-4-1", name: "Claude Opus 4.1" },
          { id: "claude-haiku-4-5", name: "Claude Haiku 4.5" },
        ],
      });
      return;
    }
    if (provider === "mock") {
      res.json({ models: [{ id: "mock-1", name: "Mock (démo)" }] });
      return;
    }
    if (provider === "ollama") {
      const url = (baseUrl || "http://localhost:11434").replace(/\/+$/, "") + "/api/tags";
      const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!r.ok) throw new Error("statut " + r.status);
      const j = (await r.json()) as { models?: { name: string }[] };
      const models = (j.models ?? []).map((m) => ({ id: m.name, name: m.name }));
      res.json({ models });
      return;
    }

    // openai / groq / mistral / openrouter / custom
    let base = baseUrl;
    if (!base && DEFAULT_BASE_URLS[provider]) base = DEFAULT_BASE_URLS[provider];
    if (!base) {
      res.status(400).json({ error: "Une URL de base est requise pour ce fournisseur." });
      return;
    }
    if (!apiKey) {
      res.status(400).json({ error: "Une clé API est requise pour ce fournisseur." });
      return;
    }
    const url = base.replace(/\/+$/, "") + "/models";
    const r = await fetch(url, {
      headers: { Authorization: "Bearer " + apiKey },
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) throw new Error("statut " + r.status + " " + (await r.text()).slice(0, 120));
    const j = (await r.json()) as { data?: { id: string }[] };
    const models = (j.data ?? []).map((m) => ({ id: m.id, name: m.id }));
    if (!models.length) throw new Error("liste vide");
    res.json({ models });
  } catch (e) {
    res.status(502).json({ error: "Impossible de récupérer les modèles (" + (e instanceof Error ? e.message : String(e)) + ")." });
  }
});

function supportsVision(provider: string, model: string): boolean {
  if (provider === "anthropic") return true;
  if (provider === "mock") return false;
  const m = model.toLowerCase();
  return /gpt-4o|gpt-4\.1|gpt-5|o3|o4|chatgpt-4o|gemini|claude|vision|pixtral|llava|bakllava|qwen.*vl|glm-4v|internvl|minicpm-v|yi-vision|llama-4/i.test(m);
}

function truncateText(s: string, n: number): string {
  if (s.length > n) return s.slice(0, n) + " [tronqué]";
  return s;
}

function ext(name: string): string {
  const m = /\.([^.]+)$/.exec(name);
  return m ? m[1].toLowerCase() : "";
}

async function parseBinary(name: string, dataUrl: string): Promise<string> {
  const b64 = dataUrl.replace(/^data:[^;]*;base64,/, "");
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(Buffer.from(b64, "base64"));
  } catch {
    return "Données binaires illisibles.";
  }
  const e = ext(name);
  try {
    if (e === "pdf") {
      const doc = await getDocument({ data: bytes, disableWorker: true } as Parameters<typeof getDocument>[0]).promise;
      const pages: string[] = [];
      const max = Math.min(doc.numPages, 20);
      for (let i = 1; i <= max; i++) {
        const page = await doc.getPage(i);
        const tc = await page.getTextContent();
        const txt = tc.items.map((it) => ("str" in it ? it.str : "")).join(" ");
        pages.push(txt);
      }
      return truncateText(pages.join("\n"), 20000);
    }
    if (e === "xlsx" || e === "xls" || e === "ods") {
      const wb = XLSX.read(Buffer.from(bytes), { type: "buffer" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      if (!sheet) return "(classeur vide)";
      const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });
      return truncateText(rows.map((r) => r.join("\t")).join("\n"), 10000);
    }
    if (e === "docx") {
      return "Format DOCX non analysable côté serveur.";
    }
  } catch (err) {
    return "Erreur d'analyse : " + (err instanceof Error ? err.message : String(err));
  }
  // Any other binary
  return "";
}

async function enrichAttachments(messages: Message[], provider: string, model: string): Promise<{ ok: true } | { ok: false; model: string }> {
  for (const m of messages) {
    if (!m.attachments || m.attachments.length === 0) continue;
    const images: Attachment[] = [];
    for (const a of m.attachments) {
      if (a.kind === "image") {
        if (!supportsVision(provider, model)) return { ok: false, model };
        images.push(a);
      } else if (a.kind === "text") {
        const t = truncateText(a.text ?? "", 40000);
        m.content += "\n\n--- Fichier joint « " + a.name + " » ---\n" + t;
      } else {
        // binary
        const parsed = await parseBinary(a.name, a.dataUrl ?? "");
        const e = ext(a.name);
        if (e === "docx") {
          m.content += "\n\n--- Fichier joint « " + a.name + " » ---\n" + parsed;
        } else if (parsed) {
          m.content += "\n\n--- Fichier joint « " + a.name + " » (texte extrait) ---\n" + parsed;
        } else {
          m.content += "\n\n--- Fichier joint « " + a.name + " » : format binaire non analysable (taille " + a.size + " octets). ---";
        }
      }
    }
    // Strip text/binary attachments, keep images.
    if (images.length > 0) m.attachments = images;
    else delete m.attachments;
  }
  return { ok: true };
}

interface ChatBody {
  messages?: Message[];
  config?: ChatConfig;
}

app.post("/api/chat", async (req, res) => {
  const { messages = [], config } = (req.body ?? {}) as ChatBody;

  if (!config?.provider) {
    res.status(400).json({ error: "Le champ « provider » est requis." });
    return;
  }
  if (!config.model) {
    res.status(400).json({ error: "Le champ « model » est requis." });
    return;
  }
  const provider = config.provider;
  // Key required for all non-mock/ollama providers.
  if (provider !== "mock" && provider !== "ollama" && provider !== "anthropic" && !config.apiKey) {
    res.status(400).json({ error: "Une clé API est requise pour ce fournisseur." });
    return;
  }
  if (provider === "anthropic" && !config.apiKey) {
    res.status(400).json({ error: "Une clé API est requise pour Anthropic." });
    return;
  }
  if (provider === "custom" && !config.baseUrl) {
    res.status(400).json({ error: "Une URL de base est requise pour le fournisseur personnalisé." });
    return;
  }

  // Enrichie les pièces jointes (texte extrait, images conservées, vision vérifiée).
  const enriched = await enrichAttachments(messages, provider, config.model);

  // Set SSE headers.
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  let finished = false;
  const heartbeat = setInterval(() => {
    if (!finished) res.write(": ping\n\n");
  }, 15000);

  const send = (e: EmitEvent) => {
    if (finished) return;
    res.write("data: " + JSON.stringify(e) + "\n\n");
  };

  // Stop the heartbeat once the client disconnects (fires on the RESPONSE, not the request).
  res.on("close", () => {
    finished = true;
    clearInterval(heartbeat);
  });

  if (!enriched.ok) {
    send({ type: "error", message: "Ce modèle (« " + enriched.model + " ») ne comprend pas les images. Choisissez un modèle vision (par exemple gpt-4o, gpt-4.1, Claude, Gemini, Pixtral ou LLaVA) dans les paramètres, ou retirez l'image." });
    finished = true;
    clearInterval(heartbeat);
    res.end();
    return;
  }

  try {
    await runAgent(messages, config, send);
  } catch (e) {
    send({ type: "error", message: "Erreur interne : " + (e instanceof Error ? e.message : String(e)) });
  } finally {
    finished = true;
    clearInterval(heartbeat);
    res.end();
  }
});

const port = Number(process.env.PORT ?? 8789);
app.listen(port, () => {
  console.log(`cool-gpt backend listening on http://localhost:${port}`);
});
