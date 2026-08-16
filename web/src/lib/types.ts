export type Role = "user" | "assistant";

export interface ToolEvent {
  id: string;
  name: string;
  args?: unknown;
  status: "running" | "done" | "error";
  ok?: boolean;
  summary?: string;
  preview?: string;
  chart?: string;
  chartData?: unknown;
  error?: string;
}

export interface Usage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface Attachment {
  id: string;
  name: string;
  mime: string;
  size: number;
  kind: "image" | "text" | "binary";
  text?: string;
  dataUrl?: string;
}

export interface Message {
  id: string;
  role: Role;
  content: string;
  attachments?: Attachment[];
  toolEvents?: ToolEvent[];
  usage?: Usage;
  streaming?: boolean;
  reasoning?: string;
  reasoningDone?: boolean;
}

export type ProviderId =
  | "openai"
  | "groq"
  | "mistral"
  | "openrouter"
  | "ollama"
  | "anthropic"
  | "mock"
  | "custom";

export interface ChatConfig {
  provider: ProviderId;
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  systemPrompt: string;
  maxSteps: number;
  reasoning: "off" | "low" | "mid" | "high";
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
  config: ChatConfig;
}

export type Theme = "dark" | "light";

export type ChatEvent =
  | { type: "meta"; model: string; provider: string }
  | { type: "step"; index: number }
  | { type: "tool_start"; name: string; args?: unknown }
  | { type: "tool_end"; name: string; ok: boolean; summary?: string; preview?: string; error?: string; chart?: string; chartData?: unknown }
  | { type: "reasoning_start" }
  | { type: "reasoning_delta"; text: string }
  | { type: "reasoning_end" }
  | { type: "delta"; text: string }
  | { type: "done"; usage?: Usage }
  | { type: "error"; message: string };

export interface ToolDef {
  name: string;
  description?: string;
}

export const PROVIDERS: { id: ProviderId; label: string }[] = [
  { id: "openai", label: "OpenAI" },
  { id: "groq", label: "Groq" },
  { id: "mistral", label: "Mistral" },
  { id: "openrouter", label: "OpenRouter" },
  { id: "ollama", label: "Ollama" },
  { id: "anthropic", label: "Anthropic" },
  { id: "mock", label: "Mock" },
  { id: "custom", label: "Personnalisé" }
];

export const PROVIDER_DEFAULTS: Record<ProviderId, { baseUrl: string; model: string }> = {
  openai: { baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  groq: { baseUrl: "https://api.groq.com/openai/v1", model: "llama-3.3-70b-versatile" },
  mistral: { baseUrl: "https://api.mistral.ai/v1", model: "mistral-small-latest" },
  openrouter: { baseUrl: "https://openrouter.ai/api/v1", model: "openai/gpt-4o-mini" },
  ollama: { baseUrl: "http://localhost:11434", model: "llama3.2" },
  anthropic: { baseUrl: "https://api.anthropic.com", model: "claude-sonnet-4-5" },
  custom: { baseUrl: "", model: "" },
  mock: { baseUrl: "", model: "mock-1" }
};

export const DEFAULT_CONFIG: ChatConfig = {
  provider: "openai",
  baseUrl: PROVIDER_DEFAULTS.openai.baseUrl,
  apiKey: "",
  model: PROVIDER_DEFAULTS.openai.model,
  temperature: 0.7,
  systemPrompt: "",
  maxSteps: 5,
  reasoning: "off"
};