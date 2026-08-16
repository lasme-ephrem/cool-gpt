export type Role = "user" | "assistant" | "system";

export interface Attachment {
  name: string;
  mime: string;
  size: number;
  kind: "image" | "text" | "binary";
  text?: string;
  dataUrl?: string;
}

export interface Message {
  role: Role;
  content: string;
  /** Appels d'outils produits par l'assistant (protocole fournisseur). */
  toolCalls?: ToolCall[];
  /** Identifiants des appels auxquels répond ce message de résultat d'outil. */
  toolCallIds?: string[];
  /** Pièces jointes (images uniquement une fois l'enrichissement côté serveur effectué). */
  attachments?: Attachment[];
  /** Raisonnement produit par l'assistant (historique fournisseur uniquement). */
  reasoningText?: string;
  reasoningSignature?: string;
}

export interface ToolParam {
  type: string;
  description: string;
  enum?: string[];
  [k: string]: unknown;
}

export interface ToolDef {
  name: string;
  description: string;
  icon: "globe" | "cloud-sun" | "book" | "code" | "calculator" | "clock" | "coins";
  parameters: { type: "object"; properties: Record<string, ToolParam>; required?: string[] };
}

export interface ChatConfig {
  provider: string;
  apiKey?: string;
  baseUrl?: string;
  model: string;
  temperature?: number;
  systemPrompt?: string;
  maxSteps?: number;
  reasoning?: "off" | "low" | "mid" | "high";
}

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export type EmitEvent =
  | { type: "meta"; model: string; provider: string }
  | { type: "step"; index: number }
  | { type: "tool_start"; name: string; args: Record<string, unknown> }
  | { type: "tool_end"; name: string; ok: boolean; summary?: string; preview?: string; error?: string; chart?: string; chartData?: unknown }
  | { type: "delta"; text: string }
  | { type: "reasoning_start" }
  | { type: "reasoning_delta"; text: string }
  | { type: "reasoning_end" }
  | { type: "done"; usage?: { prompt_tokens: number; completion_tokens: number } }
  | { type: "error"; message: string };

export type Emit = (e: EmitEvent) => void;
