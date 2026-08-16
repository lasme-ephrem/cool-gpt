import type { ChatConfig, ChatEvent, ToolDef } from "./types";

export interface StreamHandlers {
  onEvent: (evt: ChatEvent) => void;
  signal?: AbortSignal;
}

export function streamChat(
  messages: { role: string; content: string; attachments?: { name: string; mime: string; size: number; kind: "image" | "text" | "binary"; text?: string; dataUrl?: string }[] }[],
  config: ChatConfig,
  { onEvent, signal }: StreamHandlers
): Promise<void> {
  const body = JSON.stringify({
    messages,
    config: {
      provider: config.provider,
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      model: config.model,
      temperature: config.temperature,
      systemPrompt: config.systemPrompt,
      maxSteps: config.maxSteps,
      reasoning: config.reasoning
    }
  });

  return fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    signal
  })
    .then(async (res) => {
      if (!res.ok) {
        let msg = "Erreur " + res.status;
        try {
          const j = await res.json();
          if (j && typeof j.error === "string") msg = j.error;
          else if (j && typeof j.message === "string") msg = j.message;
        } catch {
          /* ignore */
        }
        if (res.status === 401) msg = "Clé API invalide ou absente (401).";
        else if (res.status === 400) msg = "Requête invalide (400). " + msg;
        else if (res.status === 500) msg = "Erreur interne du serveur (500).";
        onEvent({ type: "error", message: msg });
        return;
      }
      if (!res.body) {
        onEvent({ type: "error", message: "Réponse vide du serveur." });
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buffer.indexOf("\n\n")) !== -1) {
          const chunk = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          const line = chunk.trim();
          if (!line) continue;
          if (line.startsWith(":")) continue;
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6);
          try {
            onEvent(JSON.parse(json) as ChatEvent);
          } catch {
            /* malformed event: skip */
          }
        }
      }
    })
    .catch((err) => {
      if (err && (err as Error).name === "AbortError") return;
      onEvent({ type: "error", message: "Impossible de joindre le serveur (" + String(err) + ")." });
    });
}

export async function listModels(config: ChatConfig): Promise<string[]> {
  const res = await fetch("/api/models", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider: config.provider,
      baseUrl: config.baseUrl,
      apiKey: config.apiKey
    })
  });
  if (!res.ok) {
    let msg = "Échec de la récupération des modèles (" + res.status + ").";
    try {
      const j = await res.json();
      if (j && typeof j.error === "string") msg = j.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  const data = await res.json();
  const arr = Array.isArray(data) ? data : Array.isArray(data?.models) ? data.models : Array.isArray(data?.data) ? data.data : [];
  return arr.map((m: unknown) => (typeof m === "string" ? m : (m as { id?: string }).id ?? String(m)));
}

export async function fetchTools(): Promise<ToolDef[]> {
  const res = await fetch("/api/tools");
  if (!res.ok) return [];
  const data = await res.json();
  const arr = Array.isArray(data) ? data : Array.isArray(data?.tools) ? data.tools : [];
  return arr.map((t: unknown) =>
    typeof t === "string" ? { name: t } : { name: (t as { name?: string }).name ?? "", description: (t as { description?: string }).description }
  ).filter((t: ToolDef) => t.name);
}