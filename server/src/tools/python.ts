import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtemp, writeFile, readFile, readdir, rm } from "node:fs/promises";
import type { ToolDef } from "../types.js";

export const pythonDef: ToolDef = {
  name: "run_python",
  description: "Exécute du code Python et renvoie sa sortie. Pour produire un graphique affiché dans le chat : rendu statique avec matplotlib et plt.savefig('chart.png') (jamais plt.show()) ; rendu interactif animé (recommandé) en écrivant EN PLUS un fichier chart.json au format {\"type\": \"line|bar|area|pie|scatter\", \"title\": \"...\", \"x\": [...], \"series\": [{\"name\": \"...\", \"data\": [...]}]} — rendu comme un tableau de bord animé dans le chat.",
  icon: "code",
  parameters: {
    type: "object",
    properties: {
      code: { type: "string", description: "Le code Python à exécuter." },
    },
    required: ["code"],
  },
};

export interface ChartSpec {
  type: "line" | "bar" | "area" | "pie" | "scatter";
  title?: string;
  x?: (string | number)[];
  series?: { name?: string; data: (number | string | null)[] }[];
}

export type PythonResult = string | { text: string; chart?: string; chartData?: ChartSpec };

function validateChartSpec(raw: unknown): ChartSpec | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const types = ["line", "bar", "area", "pie", "scatter"];
  if (typeof o.type !== "string" || !types.includes(o.type)) return undefined;
  const spec: ChartSpec = { type: o.type as ChartSpec["type"] };
  if (typeof o.title === "string") spec.title = o.title;
  if (Array.isArray(o.x)) spec.x = o.x as (string | number)[];
  if (Array.isArray(o.series)) {
    const series = (o.series as unknown[])
      .filter((s) => s && typeof s === "object" && Array.isArray((s as { data?: unknown }).data))
      .map((s) => {
        const so = s as { name?: unknown; data: unknown[] };
        return { name: typeof so.name === "string" ? so.name : undefined, data: so.data as (number | string | null)[] };
      });
    if (series.length > 0) spec.series = series;
  }
  if (!spec.x && !spec.series) return undefined;
  return spec;
}

export async function runPython(args: Record<string, unknown>): Promise<PythonResult> {
  const code = String(args.code ?? "");
  if (!code.trim()) return "Erreur : le code à exécuter est vide.";

  const dir = await mkdtemp(join(tmpdir(), "coolgpt-"));
  const scriptPath = join(dir, "script.py");

  try {
    // Préfixe le backend Agg uniquement quand matplotlib est réellement utilisé.
    let finalCode = code;
    if (/matplotlib|plt\.|savefig/.test(code)) {
      finalCode = "import matplotlib\nmatplotlib.use('Agg')\n" + code;
    }
    await writeFile(scriptPath, finalCode, "utf8");
  } catch {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
    return "Erreur : impossible d'écrire le fichier temporaire (l'environnement a bloqué l'écriture).";
  }

  const result = await new Promise<string>((resolve) => {
    const child = spawn("python", ["script.py"], { cwd: dir, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    let killed = false;
    let settled = false;
    const timer = setTimeout(() => {
      killed = true;
      child.kill();
    }, 30000);
    child.stdout.on("data", (d: Buffer) => { out += d.toString(); });
    child.stderr.on("data", (d: Buffer) => { err += d.toString(); });
    const finish = (text: string) => {
      if (settled) return;
      settled = true;
      resolve(text);
    };
    child.on("error", (e: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      if (e.code === "ENOENT") {
        finish("Erreur : Python n'est pas installé sur cette machine (commande « python » introuvable).");
      } else {
        finish("Erreur : l'environnement d'exécution a bloqué le sous-processus (" + (e.code ?? e.message) + ").");
      }
    });
    child.on("close", (codeN: number | null) => {
      clearTimeout(timer);
      let text = "";
      if (out.trim()) text += "Sortie:\n" + out.trimEnd();
      else if (err.trim()) text += "Erreur:\n" + err.trimEnd();
      else text = "Pas de sortie.";
      if (killed) text += "\n(exécution interrompue après 30 secondes)";
      else text += "\nCode de sortie: " + (codeN ?? 0);
      finish(text);
    });
  });

  // 1. Spec interactif (chart.json) — rendu animé côté frontend.
  let chartData: ChartSpec | undefined;
  try {
    const raw = JSON.parse(await readFile(join(dir, "chart.json"), "utf8"));
    chartData = validateChartSpec(raw);
  } catch {
    chartData = undefined;
  }

  // 2. PNG statique : chart.png en priorité, sinon un unique autre PNG produit par le script.
  let chart: string | undefined;
  try {
    const entries = await readdir(dir);
    const pngs = entries.filter((f) => f.toLowerCase().endsWith(".png"));
    const target = pngs.includes("chart.png") ? "chart.png" : pngs.length === 1 ? pngs[0] : undefined;
    if (target) {
      const buf = await readFile(join(dir, target));
      chart = "data:image/png;base64," + buf.toString("base64");
    }
  } catch {
    chart = undefined;
  }

  try { await rm(dir, { recursive: true, force: true }); } catch { /* ignore */ }

  if (chartData || chart) return { text: result, chart, chartData };
  return result;
}
