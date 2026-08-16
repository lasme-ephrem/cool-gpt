import type { Message, ToolDef, ToolCall, Attachment } from "./types.js";

export const DEFAULT_BASE_URLS: Record<string, string> = {
  openai: "https://api.openai.com/v1",
  groq: "https://api.groq.com/openai/v1",
  mistral: "https://api.mistral.ai/v1",
  openrouter: "https://openrouter.ai/api/v1",
};

export type LLMEvent =
  | { type: "delta"; text: string }
  | { type: "reasoning_start" }
  | { type: "reasoning_delta"; text: string }
  | { type: "reasoning_end" }
  | { type: "tool_calls"; calls: ToolCall[]; reasoning?: { text: string; signature?: string } }
  | { type: "done"; usage?: { prompt_tokens: number; completion_tokens: number } }
  | { type: "error"; message: string };

export type LLMStream = AsyncGenerator<LLMEvent, void, undefined>;

export interface AdapterOptions {
  apiKey?: string;
  baseUrl?: string;
  model: string;
  temperature?: number;
  systemPrompt?: string;
  reasoning?: "off" | "low" | "mid" | "high";
}

function isReasoningModel(model: string): boolean {
  const m = model.toLowerCase();
  return /o1|o3|o4|gpt-5|reasoner|qwq|thinking|deepseek-r1|glm-4\.5|kimi-k2/i.test(m);
}

function openaiToolFormat(tools: ToolDef[]) {
  return tools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

type OpenAIOutMsg =
  | { role: "system" | "assistant" | "user" | "tool"; content: string | null; tool_calls?: unknown; tool_call_id?: string }
  | { role: "user"; content: { type: string; text?: string; image_url?: { url: string } }[] };

// Convert internal messages to the OpenAI wire format.
// Assistant tool calls are serialized back as tool_calls; tool results become role:"tool"
// messages answering their tool_call_id (required by the OpenAI protocol).
export function messagesOpenAI(messages: Message[]): OpenAIOutMsg[] {
  const out: OpenAIOutMsg[] = [];
  for (const m of messages) {
    if (m.role === "system") {
      out.push({ role: "system", content: m.content });
    } else if (m.role === "assistant") {
      const msg: OpenAIOutMsg = { role: "assistant", content: m.content || null };
      if (m.toolCalls && m.toolCalls.length > 0) {
        msg.tool_calls = m.toolCalls.map((c) => ({
          id: c.id,
          type: "function",
          function: { name: c.name, arguments: JSON.stringify(c.args ?? {}) },
        }));
      }
      out.push(msg);
    } else if (m.toolCallIds && m.toolCallIds.length > 0) {
      out.push({ role: "tool", content: m.content, tool_call_id: m.toolCallIds[0] });
    } else if (m.attachments && m.attachments.length > 0) {
      const content = [
        { type: "text", text: m.content || "(image)" },
        ...m.attachments.map((a) => ({ type: "image_url", image_url: { url: a.dataUrl ?? "" } })),
      ];
      out.push({ role: "user", content });
    } else {
      out.push({ role: "user", content: m.content });
    }
  }
  return out;
}

type AnthropicBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string }
  | { type: "thinking"; thinking: string; signature: string };

// Anthropic message conversion: no system role; system goes in the system param.
// Assistant tool calls become tool_use blocks and tool results become a single user
// message of tool_result blocks (required by the Anthropic protocol).
export function messagesAnthropic(messages: Message[]): { role: "user" | "assistant"; content: string | AnthropicBlock[] }[] {
  const out: { role: "user" | "assistant"; content: string | AnthropicBlock[] }[] = [];
  for (const m of messages) {
    if (m.role === "system") continue;
    if (m.role === "assistant") {
      if (m.toolCalls && m.toolCalls.length > 0) {
        const blocks: AnthropicBlock[] = [];
        if (m.reasoningText !== undefined) {
          blocks.push({ type: "thinking", thinking: m.reasoningText, signature: m.reasoningSignature || "" });
        }
        blocks.push(...m.toolCalls.map((c) => ({ type: "tool_use" as const, id: c.id, name: c.name, input: c.args ?? {} })));
        out.push({ role: "assistant", content: blocks });
      } else if (m.content) {
        const prev = out[out.length - 1];
        if (prev && prev.role === "assistant") {
          if (typeof prev.content === "string") prev.content = prev.content + "\n\n" + m.content;
          else prev.content = [...prev.content, { type: "text", text: m.content }];
        } else {
          out.push({ role: "assistant", content: m.content });
        }
      }
    } else if (m.toolCallIds && m.toolCallIds.length > 0) {
      const block: AnthropicBlock = { type: "tool_result", tool_use_id: m.toolCallIds[0], content: m.content };
      const prev = out[out.length - 1];
      if (prev && prev.role === "user" && Array.isArray(prev.content)) {
        prev.content = [...prev.content, block];
      } else {
        out.push({ role: "user", content: [block] });
      }
    } else {
      // Message utilisateur : avec images jointes, on produit des blocs (text + image).
      let blocks: AnthropicBlock[] | string;
      if (m.attachments && m.attachments.length > 0) {
        blocks = [
          { type: "text", text: m.content },
          ...m.attachments.map((a) => ({
            type: "image" as const,
            source: {
              type: "base64" as const,
              media_type: a.mime,
              data: (a.dataUrl ?? "").replace(/^data:[^;]*;base64,/, ""),
            },
          })),
        ];
      } else {
        blocks = m.content;
      }
      const prev = out[out.length - 1];
      if (prev && prev.role === "user") {
        if (typeof prev.content === "string" && typeof blocks === "string") {
          prev.content = prev.content + "\n\n" + blocks;
        } else if (typeof prev.content === "string" && Array.isArray(blocks)) {
          prev.content = [{ type: "text", text: prev.content }, ...blocks];
        } else if (Array.isArray(prev.content) && typeof blocks === "string") {
          prev.content = [...prev.content, { type: "text", text: blocks }];
        } else if (Array.isArray(prev.content) && Array.isArray(blocks)) {
          prev.content = [...prev.content, ...blocks];
        }
      } else {
        out.push({ role: "user", content: blocks });
      }
    }
  }
  return out;
}

export function anthropicToolFormat(tools: ToolDef[]) {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters,
  }));
}

export async function* openaiCompatible(opts: AdapterOptions, messages: Message[], tools: ToolDef[]): LLMStream {
  const baseUrl = (opts.baseUrl ?? "").replace(/\/+$/, "");
  const url = baseUrl + "/chat/completions";
  const body: Record<string, unknown> = {
    model: opts.model,
    messages: messagesOpenAI(messages),
    stream: true,
    tool_choice: "auto",
    tools: openaiToolFormat(tools),
  };
  if (opts.temperature !== undefined) body.temperature = opts.temperature;
  if (opts.reasoning !== "off" && opts.reasoning !== undefined && isReasoningModel(opts.model)) {
    body.reasoning_effort = opts.reasoning === "low" ? "low" : opts.reasoning === "mid" ? "medium" : "high";
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + (opts.apiKey ?? ""),
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    yield { type: "error", message: "Erreur : impossible de contacter le fournisseur (" + (e instanceof Error ? e.message : String(e)) + ")." };
    return;
  }

  if (!res.ok) {
    let excerpt = "";
    try {
      excerpt = (await res.text()).slice(0, 300);
    } catch { /* ignore */ }
    yield { type: "error", message: `Erreur du fournisseur (statut ${res.status})${excerpt ? " : " + excerpt : ""}` };
    return;
  }

  if (!res.body) {
    yield { type: "error", message: "Erreur : réponse du fournisseur sans corps de flux." };
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let usage: { prompt_tokens: number; completion_tokens: number } | undefined;
  // accumulate tool calls by index
  const toolCallsAcc = new Map<number, { id: string; name: string; args: string }>();
  let finishReason: string | null = null;
  let reasoningStarted = false;
  let reasoningEnded = false;
  let reasoningText = "";

  const endReasoningIfActive = () => {
    if (reasoningStarted && !reasoningEnded) {
      reasoningEnded = true;
      return true;
    }
    return false;
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (data === "[DONE]") continue;
        let chunk: Record<string, unknown>;
        try { chunk = JSON.parse(data); } catch { continue; }
        const choices = chunk.choices as { delta?: Record<string, unknown>; finish_reason?: string | null }[] | undefined;
        const choice = choices?.[0];
        if (choice?.finish_reason) finishReason = choice.finish_reason;
        if (chunk.usage) {
          usage = chunk.usage as { prompt_tokens: number; completion_tokens: number };
        }
        const delta = choice?.delta;
        if (!delta) continue;
        const reasoningField = (["reasoning_content", "reasoning", "thinking"] as const)
          .find((f) => typeof delta[f] === "string" && (delta[f] as string).length > 0);
        if (reasoningField) {
          const text = delta[reasoningField] as string;
          if (!reasoningStarted) {
            reasoningStarted = true;
            yield { type: "reasoning_start" };
          }
          reasoningText += text;
          yield { type: "reasoning_delta", text };
        }
        if (typeof delta.content === "string" && delta.content) {
          if (endReasoningIfActive()) yield { type: "reasoning_end" };
          yield { type: "delta", text: delta.content };
        }
        const tc = delta.tool_calls as { index?: number; id?: string; function?: { name?: string; arguments?: string } }[] | undefined;
        if (tc) {
          for (const c of tc) {
            const idx = c.index ?? 0;
            const cur = toolCallsAcc.get(idx) ?? { id: "", name: "", args: "" };
            if (c.id) cur.id = c.id;
            if (c.function?.name) cur.name += c.function.name;
            if (c.function?.arguments) cur.args += c.function.arguments;
            toolCallsAcc.set(idx, cur);
          }
        }
      }
    }
  } catch (e) {
    yield { type: "error", message: "Erreur de lecture du flux (" + (e instanceof Error ? e.message : String(e)) + ")." };
    return;
  }

  if (finishReason === "tool_calls" || toolCallsAcc.size > 0) {
    if (endReasoningIfActive()) yield { type: "reasoning_end" };
    const calls: ToolCall[] = [];
    const sorted = [...toolCallsAcc.entries()].sort((a, b) => a[0] - b[0]);
    for (const [, tc] of sorted) {
      let args: Record<string, unknown> = {};
      try { args = JSON.parse(tc.args || "{}"); } catch { args = {}; }
      calls.push({ id: tc.id || `call_${calls.length}`, name: tc.name, args });
    }
    if (calls.length) {
      const payload: { type: "tool_calls"; calls: ToolCall[]; reasoning?: { text: string } } = { type: "tool_calls", calls };
      if (reasoningText) payload.reasoning = { text: reasoningText };
      yield payload;
    }
  } else {
    if (endReasoningIfActive()) yield { type: "reasoning_end" };
  }
  yield { type: "done", usage };
}

export async function* anthropic(opts: AdapterOptions, messages: Message[], tools: ToolDef[]): LLMStream {
  const body: Record<string, unknown> = {
    model: opts.model,
    max_tokens: 4096,
    stream: true,
    messages: messagesAnthropic(messages),
    tools: anthropicToolFormat(tools),
  };
  if (opts.systemPrompt) body.system = opts.systemPrompt;
  if (opts.reasoning !== "off" && opts.reasoning !== undefined) {
    body.thinking = {
      type: "enabled",
      budget_tokens: opts.reasoning === "low" ? 2048 : opts.reasoning === "mid" ? 4096 : 8192,
    };
  } else if (opts.temperature !== undefined) {
    body.temperature = opts.temperature;
  }

  let res: Response;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": opts.apiKey ?? "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    yield { type: "error", message: "Erreur : impossible de contacter Anthropic (" + (e instanceof Error ? e.message : String(e)) + ")." };
    return;
  }

  if (!res.ok) {
    let excerpt = "";
    try { excerpt = (await res.text()).slice(0, 300); } catch { /* ignore */ }
    yield { type: "error", message: `Erreur d'Anthropic (statut ${res.status})${excerpt ? " : " + excerpt : ""}` };
    return;
  }

  if (!res.body) {
    yield { type: "error", message: "Erreur : réponse d'Anthropic sans corps de flux." };
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  const toolAcc = new Map<number, { id: string; name: string; input: string }>();
  let usage: { prompt_tokens: number; completion_tokens: number } | undefined;
  let stopReason: string | null = null;
  let reasoningStarted = false;
  let reasoningEnded = false;
  let reasoningText = "";
  let reasoningSignature = "";

  const endReasoningIfActive = () => {
    if (reasoningStarted && !reasoningEnded) {
      reasoningEnded = true;
      return true;
    }
    return false;
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        let ev: Record<string, unknown>;
        try { ev = JSON.parse(data); } catch { continue; }
        const type = ev.type as string;
        if (type === "content_block_start") {
          const block = ev.content_block as { type: string; index?: number; id?: string; name?: string };
          if (block?.type === "thinking") {
            if (!reasoningStarted) {
              reasoningStarted = true;
              yield { type: "reasoning_start" };
            }
          } else if (block?.type === "tool_use") {
            toolAcc.set(block.index ?? 0, { id: block.id ?? "", name: block.name ?? "", input: "" });
          }
        } else if (type === "content_block_delta") {
          const delta = ev.delta as { type: string; text?: string; partial_json?: string; thinking?: string; signature?: string };
          if (delta?.type === "thinking_delta" && typeof delta.thinking === "string" && delta.thinking) {
            if (!reasoningStarted) {
              reasoningStarted = true;
              yield { type: "reasoning_start" };
            }
            reasoningText += delta.thinking;
            yield { type: "reasoning_delta", text: delta.thinking };
          } else if (delta?.type === "signature_delta" && typeof delta.signature === "string") {
            reasoningSignature += delta.signature;
          } else if (delta?.type === "text_delta" && delta.text) {
            if (endReasoningIfActive()) yield { type: "reasoning_end" };
            yield { type: "delta", text: delta.text };
          } else if (delta?.type === "input_json_delta" && delta.partial_json) {
            const idx = (ev.index as number) ?? 0;
            const cur = toolAcc.get(idx);
            if (cur) { cur.input += delta.partial_json; toolAcc.set(idx, cur); }
          }
        } else if (type === "message_delta") {
          const d = ev.delta as { stop_reason?: string };
          if (d?.stop_reason) stopReason = d.stop_reason;
          const u = ev.usage as { input_tokens?: number; output_tokens?: number };
          if (u) {
            usage = { prompt_tokens: u.input_tokens ?? 0, completion_tokens: u.output_tokens ?? 0 };
          }
        } else if (type === "message_stop") {
          // final
        }
      }
    }
  } catch (e) {
    yield { type: "error", message: "Erreur de lecture du flux Anthropic (" + (e instanceof Error ? e.message : String(e)) + ")." };
    return;
  }

  if (stopReason === "tool_use" && toolAcc.size > 0) {
    if (endReasoningIfActive()) yield { type: "reasoning_end" };
    const calls: ToolCall[] = [];
    const sorted = [...toolAcc.entries()].sort((a, b) => a[0] - b[0]);
    for (const [, tc] of sorted) {
      let args: Record<string, unknown> = {};
      try { args = JSON.parse(tc.input || "{}"); } catch { args = {}; }
      calls.push({ id: tc.id || `call_${calls.length}`, name: tc.name, args });
    }
    if (calls.length) {
      const payload: { type: "tool_calls"; calls: ToolCall[]; reasoning?: { text: string; signature?: string } } = { type: "tool_calls", calls };
      if (reasoningText || reasoningSignature) {
        payload.reasoning = { text: reasoningText, signature: reasoningSignature };
      }
      yield payload;
    }
  } else {
    if (endReasoningIfActive()) yield { type: "reasoning_end" };
  }
  yield { type: "done", usage };
}

// Mock adapter — deterministic, exercises tool selection + a French Markdown answer.
export async function* mockAdapter(opts: AdapterOptions, messages: Message[], tools: ToolDef[]): LLMStream {
  void tools;
  const reasoning = opts.reasoning !== undefined ? opts.reasoning : "off";
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const emitReasoning = async function* (lines: string[]) {
    yield { type: "reasoning_start" } as const;
    for (const line of lines) {
      yield { type: "reasoning_delta", text: line + "\n" } as const;
      await sleep(180);
    }
    yield { type: "reasoning_end" } as const;
  };

  // If a previous turn already produced a tool result, emit the final Markdown answer.
  const resultMsg = [...messages].reverse().find((m) => m.role === "user" && m.content.startsWith("Résultat de l'outil "));
  if (resultMsg) {
    if (reasoning !== "off") {
      yield* emitReasoning(["Interprétation du résultat de l'outil…", "Synthèse de la réponse en français…"]);
    }
    const preview = resultMsg.content.replace(/^Résultat de l'outil \S+ \(id [^)]+\) :\n/, "").slice(0, 160);
    const answer = [
      "## Résultat",
      "",
      "Voici une réponse synthétique en **Markdown**, construite à partir du résultat de l'outil :",
      "",
      "> " + (preview || "(résultat vide)"),
      "",
      "- Point clé numéro **un**",
      "- Point clé numéro *deux*",
      "- Exemple : `console.log('cool-gpt')`",
      "",
      "Le résultat ci-dessus est fiable et provient de l'outil exécuté.",
      "",
    ];
    for (const chunk of answer) {
      yield { type: "delta", text: chunk + "\n" };
    }
    yield { type: "done", usage: { prompt_tokens: 12, completion_tokens: 80 } };
    return;
  }

  // Step 1: pick the tool from the latest user message.
  const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
  let toolName: string;
  let toolArgs: Record<string, unknown>;
  if (/m[eé]t[eé]o/i.test(lastUser)) {
    toolName = "get_weather"; toolArgs = { location: "Paris" };
  } else if (/wiki/i.test(lastUser)) {
    toolName = "wikipedia_article"; toolArgs = { title: "Intelligence artificielle" };
  } else if (/python/i.test(lastUser)) {
    toolName = "run_python";
    toolArgs = { code: "import matplotlib.pyplot as plt\nimport numpy as np\nimport json\nx = np.linspace(0, 10, 100)\nplt.plot(x, np.sin(x))\nplt.title('Signal de démonstration')\nplt.savefig('chart.png')\njson.dump({'type': 'line', 'title': 'Signal de démonstration', 'x': list(np.round(x, 2)), 'series': [{'name': 'sin(x)', 'data': list(np.round(np.sin(x), 4))}]}, open('chart.json', 'w'))\nprint('Graphique créé')" };
  } else if (/codex|claude.?code|compar/i.test(lastUser)) {
    // Comparaison multi-séries sur le même graphique (démonstration).
    toolName = "run_python";
    toolArgs = { code: "import json\nimport matplotlib.pyplot as plt\nmois = ['2021-07', '2022-01', '2022-07', '2023-01', '2023-07', '2024-01', '2024-07', '2025-01', '2025-07']\ncodex = [0.4, 0.9, 1.5, 2.1, 3.0, 3.8, 4.2, 3.5, 3.0]\nclaude = [0.0, 0.0, 0.1, 0.4, 0.8, 1.6, 2.8, 4.1, 5.2]\nplt.plot(mois, codex, marker='o', label='OpenAI Codex')\nplt.plot(mois, claude, marker='o', label='Claude Code')\nplt.legend()\nplt.grid(alpha=0.3)\nplt.title('Évolution comparée des utilisateurs (démonstration)')\nplt.savefig('chart.png')\njson.dump({'type': 'line', 'title': 'Évolution comparée des utilisateurs (démonstration)', 'x': mois, 'series': [{'name': 'OpenAI Codex', 'data': codex}, {'name': 'Claude Code', 'data': claude}]}, open('chart.json', 'w'))\nprint('Graphique comparatif créé')" };
  } else if (/csv|somme|analyse|calcul|graphique|données|modélisation/i.test(lastUser)) {
    // Tâche numérique / données : routage vers le moteur Python avec graphique.
    toolName = "run_python";
    toolArgs = { code: "import matplotlib.pyplot as plt\nimport json\n# Analyse des données jointes\ncolonnes = ['a', 'b', 'c']\nvaleurs = [5, 7, 9]\nprint('Somme de la colonne b :', valeurs[1])\nplt.bar(colonnes, valeurs, color='#9e3ffd')\nplt.title('Analyse du fichier joint')\nplt.savefig('chart.png')\njson.dump({'type': 'bar', 'title': 'Analyse du fichier joint', 'x': colonnes, 'series': [{'name': 'Valeurs', 'data': valeurs}]}, open('chart.json', 'w'))\nprint('Graphique généré')" };
  } else {
    toolName = "web_search"; toolArgs = { query: lastUser };
  }

  await sleep(400);
  if (reasoning !== "off") {
    yield* emitReasoning(["Analyse de la question de l'utilisateur…", "Sélection de l'outil le plus adapté…", "Préparation de l'appel d'outil…"]);
  }
  yield { type: "tool_calls", calls: [{ id: "mock_1", name: toolName, args: toolArgs }] };
  yield { type: "done" };
}
