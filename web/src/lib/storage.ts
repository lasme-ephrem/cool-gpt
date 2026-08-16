import type { ChatConfig, Conversation, Theme } from "./types";

const SETTINGS_KEY = "cool-gpt:settings";
const CONVERSATIONS_KEY = "cool-gpt:conversations";
const THEME_KEY = "cool-gpt:theme:v2";

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore quota / serialization errors */
  }
}

export const loadSettings = (): ChatConfig => read<ChatConfig>(SETTINGS_KEY, null as unknown as ChatConfig);
export const saveSettings = (config: ChatConfig): void => write(SETTINGS_KEY, config);
export const loadConversations = (): Conversation[] => read<Conversation[]>(CONVERSATIONS_KEY, []);
export const saveConversations = (convs: Conversation[]): void => write(CONVERSATIONS_KEY, convs);
export const loadTheme = (): Theme => read<Theme>(THEME_KEY, "light");
export const saveTheme = (theme: Theme): void => write(THEME_KEY, theme);
