import type { Message, ChatConfig, Emit, ToolCall, Attachment } from "./types.js";
import { toolDefinitions, executeTool } from "./tools/index.js";
import { defaultSystemPrompt } from "./prompts.js";
import {
  openaiCompatible,
  anthropic,
  mockAdapter,
  DEFAULT_BASE_URLS,
  type LLMStream,
} from "./llm.js";

const MAX_RESULT_CHARS = 4000;
const MAX_PREVIEW_CHARS = 300;

function truncate(s: string, n: number): string {
  if (s.length > n) return s.slice(0, n) + " [tronqué]";
  return s;
}

function firstLine(s: string): string {
  return s.split("\n").find((l) => l.trim() !== "")?.trim().slice(0, 120) ?? "";
}

interface InternalMsg {
  role: "user" | "assistant" | "system";
  content: string;
  toolCalls?: ToolCall[];
  toolCallIds?: string[];
  attachments?: Attachment[];
  reasoningText?: string;
  reasoningSignature?: string;
}

export async function runAgent(messages: Message[], config: ChatConfig, emit: Emit): Promise<void> {
  const provider = config.provider || "openai";
  const systemPrompt = config.systemPrompt ?? defaultSystemPrompt(new Date().toLocaleDateString("fr-FR", { dateStyle: "long" }));
  let maxSteps = Math.max(1, Math.min(config.maxSteps ?? 6, 20));

  const convo: InternalMsg[] = [
    { role: "system", content: systemPrompt },
    ...messages.map((m) => ({
      role: m.role,
      content: m.content,
      attachments: m.attachments,
      ...(m.reasoningText !== undefined ? { reasoningText: m.reasoningText } : {}),
      ...(m.reasoningSignature !== undefined ? { reasoningSignature: m.reasoningSignature } : {}),
    })),
  ];

  const tools = toolDefinitions();

  emit({ type: "meta", model: config.model, provider });

  let step = 0;
  while (step < maxSteps) {
    step++;
    emit({ type: "step", index: step });

    const adapter = optionsFromConfig(config, provider, systemPrompt);
    let stream: LLMStream;
    if (provider === "mock") {
      stream = mockAdapter(adapter, convo as Message[], tools);
    } else if (provider === "anthropic") {
      stream = anthropic(adapter, convo as Message[], tools);
    } else {
      stream = openaiCompatible(adapter, convo as Message[], tools);
    }

    let producedText = false;
    let toolCalls: ToolCall[] = [];
    let toolReasoning: { text: string; signature?: string } | undefined;
    let usage: { prompt_tokens: number; completion_tokens: number } | undefined;
    let hadError: string | null = null;

    for await (const ev of stream) {
      if (ev.type === "delta") {
        producedText = true;
        emit({ type: "delta", text: ev.text });
      } else if (ev.type === "reasoning_start") {
        emit({ type: "reasoning_start" });
      } else if (ev.type === "reasoning_delta") {
        emit({ type: "reasoning_delta", text: ev.text });
      } else if (ev.type === "reasoning_end") {
        emit({ type: "reasoning_end" });
      } else if (ev.type === "tool_calls") {
        toolCalls = ev.calls;
        toolReasoning = ev.reasoning;
      } else if (ev.type === "done") {
        usage = ev.usage;
      } else if (ev.type === "error") {
        hadError = ev.message;
        break;
      }
    }

    if (hadError) {
      emit({ type: "error", message: hadError });
      return;
    }

    // If tool calls were requested, execute them and loop.
    if (toolCalls.length > 0) {
      // Augmente le budget d'étapes quand des outils ont été appelés.
      maxSteps = Math.min(maxSteps + 2, 50);
      // Append assistant tool-call message to convo.
      const assistantMsg: InternalMsg = {
        role: "assistant",
        content: "",
        toolCalls,
        toolCallIds: toolCalls.map((c) => c.id),
        ...(toolReasoning ? { reasoningText: toolReasoning.text, reasoningSignature: toolReasoning.signature } : {}),
      };
      convo.push(assistantMsg);

      for (const call of toolCalls) {
        emit({ type: "tool_start", name: call.name, args: call.args });
      }

      // Execute in parallel
      const results = await Promise.all(
        toolCalls.map(async (call): Promise<{ ok: boolean; text: string; chart?: string; chartData?: unknown }> => {
          try {
            const r = await executeTool(call.name, call.args);
            if (typeof r === "string") return { ok: true, text: r };
            return { ok: true, text: r.text, chart: r.chart, chartData: r.chartData };
          } catch (e) {
            return { ok: false, text: "Erreur : " + (e instanceof Error ? e.message : String(e)) };
          }
        }),
      );

      const resultMessages: InternalMsg[] = [];
      toolCalls.forEach((call, i) => {
        const r = results[i];
        const text = truncate(r.text, MAX_RESULT_CHARS);
        if (r.ok) {
          emit({
            type: "tool_end",
            name: call.name,
            ok: true,
            summary: firstLine(r.text),
            preview: truncate(r.text.replace(/\s+/g, " ").trim(), MAX_PREVIEW_CHARS),
            ...(r.chart ? { chart: r.chart } : {}),
            ...(r.chartData ? { chartData: r.chartData } : {}),
          });
        } else {
          emit({ type: "tool_end", name: call.name, ok: false, error: firstLine(r.text) || "Erreur inconnue." });
        }
        resultMessages.push({ role: "user", content: `Résultat de l'outil ${call.name} (id ${call.id}) :\n${text}`, toolCallIds: [call.id] });
      });
      convo.push(...resultMessages);
      continue;
    }

    // No tool calls. If text was produced, that's a final answer.
    if (producedText) {
      emit({ type: "done", usage });
      return;
    }

    // Neither text nor tool calls -> error out.
    emit({ type: "error", message: "Erreur : le modèle n'a produit ni texte ni appel d'outil." });
    return;
  }

  // Budget d'étapes épuisé : fin propre, sans message d'interruption.
  emit({ type: "done" });
}

function optionsFromConfig(config: ChatConfig, provider: string, systemPrompt: string) {
  let baseUrl = config.baseUrl;
  if (!baseUrl && DEFAULT_BASE_URLS[provider]) baseUrl = DEFAULT_BASE_URLS[provider];
  if (provider === "custom" && !baseUrl) baseUrl = "";
  return {
    apiKey: config.apiKey,
    baseUrl,
    model: config.model,
    temperature: config.temperature,
    systemPrompt,
    reasoning: config.reasoning ?? "off",
  };
}
