import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { Header } from "./components/Header";
import { ChatArea } from "./components/ChatArea";
import { Composer } from "./components/Composer";
import { SettingsModal } from "./components/SettingsModal";
import { Toast, type ToastItem } from "./components/Toast";
import {
  DEFAULT_CONFIG,
  type ChatConfig,
  type Attachment,
  type Conversation,
  type Message,
  type Theme,
  type ToolEvent
} from "./lib/types";
import { streamChat, listModels, fetchTools } from "./lib/api";
import { loadSettings, saveSettings, loadConversations, saveConversations, loadTheme, saveTheme } from "./lib/storage";
import { uid, truncate } from "./lib/format";

export default function App() {
  const [config, setConfig] = useState<ChatConfig>(() => loadSettings() ?? DEFAULT_CONFIG);
  const [conversations, setConversations] = useState<Conversation[]>(() => loadConversations());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [theme, setTheme] = useState<Theme>(() => loadTheme());
  const [collapsed, setCollapsed] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [models, setModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [banner, setBanner] = useState<string>("");

  const abortRef = useRef<AbortController | null>(null);

  // ---------- theme ----------
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    saveTheme(theme);
  }, [theme]);

  // ---------- persist conversations ----------
  useEffect(() => {
    saveConversations(conversations);
  }, [conversations]);

  const active = useMemo(
    () => conversations.find((c) => c.id === activeId) ?? null,
    [conversations, activeId]
  );

  // ---------- toasts ----------
  const pushToast = useCallback((kind: "success" | "error", message: string) => {
    const id = uid();
    setToasts((t) => [...t, { id, kind, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  // ---------- update message helper ----------
  const patchMessage = useCallback(
    (convId: string, msgId: string, patch: (m: Message) => Message) => {
      setConversations((convs) =>
        convs.map((c) =>
          c.id !== convId
            ? c
            : { ...c, updatedAt: Date.now(), messages: c.messages.map((m) => (m.id === msgId ? patch(m) : m)) }
        )
      );
    },
    []
  );

  // ---------- conversations ----------
  const newConversation = useCallback(() => {
    setActiveId(null);
  }, []);

  const selectConversation = useCallback((id: string) => {
    if (streaming) {
      abortRef.current?.abort();
      setStreaming(false);
    }
    setActiveId(id);
  }, [streaming]);

  const deleteConversation = useCallback((id: string) => {
    setConversations((convs) => convs.filter((c) => c.id !== id));
    if (activeId === id) setActiveId(null);
  }, [activeId]);

  // ---------- models ----------
  const refreshModels = useCallback(
    async (silent?: boolean) => {
      setLoadingModels(true);
      try {
        const res = await listModels(config);
        setModels(res);
        if (!silent && res.length === 0) pushToast("error", "Aucun modèle retourné.");
      } catch (e) {
        setModels([]);
        if (!silent) pushToast("error", (e as Error).message);
      } finally {
        setLoadingModels(false);
      }
    },
    [config, pushToast]
  );

  // Actualisation AUTOMATIQUE de la liste des modèles quand le fournisseur change.
  useEffect(() => {
    void refreshModels(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.provider, config.baseUrl, config.apiKey]);

  useEffect(() => {
    fetchTools().catch(() => undefined);
  }, []);

  // ---------- streaming ----------
  const send = useCallback(
    async (text: string, attachments: Attachment[]) => {
      let convId = activeId;
      let messages: Message[] = active ? active.messages : [];

      const userMsg: Message = {
        id: uid(),
        role: "user",
        content: text,
        ...(attachments.length ? { attachments } : {})
      };
      const assistantMsg: Message = { id: uid(), role: "assistant", content: "", toolEvents: [], streaming: true, reasoning: undefined, reasoningDone: false };
      const newMsgs = [...messages, userMsg, assistantMsg];

      if (!convId) {
        convId = uid();
        const conv: Conversation = {
          id: convId,
          title: truncate(text, 40),
          messages: newMsgs,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          config
        };
        setConversations((convs) => [conv, ...convs]);
        setActiveId(convId);
      } else {
        setConversations((convs) =>
          convs.map((c) => (c.id === convId ? { ...c, updatedAt: Date.now(), messages: newMsgs } : c))
        );
      }

      const controller = new AbortController();
      abortRef.current = controller;
      setStreaming(true);
      setBanner("");

      const history = newMsgs
        .filter((m) => m.role === "user" || (m.role === "assistant" && m.content.length > 0))
        .map((m) =>
          m.role === "user"
            ? {
                role: m.role,
                content: m.content,
                ...(m.attachments && m.attachments.length
                  ? { attachments: m.attachments.map(({ id, ...rest }) => rest) }
                  : {})
              }
            : { role: m.role, content: m.content }
        );

      await streamChat(history, config, {
        signal: controller.signal,
        onEvent: (evt) => {
          if (evt.type === "reasoning_start") {
            patchMessage(convId!, assistantMsg.id, (m) => ({ ...m, reasoning: m.reasoning ?? "", reasoningDone: false }));
          } else if (evt.type === "reasoning_delta") {
            patchMessage(convId!, assistantMsg.id, (m) => ({ ...m, reasoning: (m.reasoning ?? "") + evt.text }));
          } else if (evt.type === "reasoning_end") {
            patchMessage(convId!, assistantMsg.id, (m) => ({ ...m, reasoningDone: true }));
          } else if (evt.type === "delta") {
            patchMessage(convId!, assistantMsg.id, (m) => ({ ...m, content: m.content + evt.text }));
          } else if (evt.type === "tool_start") {
            const te: ToolEvent = { id: uid(), name: evt.name, args: evt.args, status: "running" };
            patchMessage(convId!, assistantMsg.id, (m) => ({
              ...m,
              toolEvents: [...(m.toolEvents ?? []), te]
            }));
          } else if (evt.type === "tool_end") {
            patchMessage(convId!, assistantMsg.id, (m) => ({
              ...m,
              toolEvents: (m.toolEvents ?? []).map((t) =>
                t.name === evt.name && t.status === "running"
                  ? {
                      ...t,
                      status: evt.ok ? "done" : "error",
                      ok: evt.ok,
                      summary: evt.summary,
                      preview: evt.preview,
                      error: evt.error,
                      chart: evt.chart,
                      chartData: evt.chartData
                    }
                  : t
              )
            }));
          } else if (evt.type === "done") {
            patchMessage(convId!, assistantMsg.id, (m) => ({ ...m, usage: evt.usage }));
          } else if (evt.type === "error") {
            setBanner(evt.message);
            pushToast("error", evt.message);
          }
        }
      });

      patchMessage(convId!, assistantMsg.id, (m) => ({ ...m, streaming: false }));
      setStreaming(false);
      abortRef.current = null;
    },
    [active, activeId, config, patchMessage, pushToast]
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
    setStreaming(false);
  }, []);

  const handleSelectSuggestion = useCallback(
    (prompt: string) => {
      void send(prompt, []);
    },
    [send]
  );

  // ---------- settings ----------
  const saveConfig = useCallback(
    (c: ChatConfig) => {
      setConfig(c);
      saveSettings(c);
      setSettingsOpen(false);
      pushToast("success", "Paramètres enregistrés.");
    },
    [pushToast]
  );

  const changeModel = useCallback((m: string) => setConfig((prev) => ({ ...prev, model: m })), []);

  const canChat = config.provider === "mock" || config.apiKey.trim().length > 0;

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-app fg-app">
      <Sidebar
        conversations={conversations}
        activeId={activeId}
        collapsed={collapsed}
        modelLabel={config.model || "Paramètres"}
        onToggleCollapse={() => setCollapsed((c) => !c)}
        onNew={newConversation}
        onSelect={selectConversation}
        onDelete={deleteConversation}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <Header
          theme={theme}
          onToggleTheme={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
        />

        {banner && (
          <div className="mx-auto max-w-3xl w-full px-4 pt-3">
            <div className="rounded-lg bg-red-500/10 border border-red-500/30 text-red-500 px-3 py-2 text-[13px] animate-pop-in">
              {banner}
            </div>
          </div>
        )}

        <ChatArea messages={active ? active.messages : []} onSelectSuggestion={handleSelectSuggestion} />

        <Composer
          config={config}
          streaming={streaming}
          disabled={!canChat}
          onSend={(t, ats) => void send(t, ats)}
          onStop={stop}
          onFileError={(msg) => pushToast("error", msg)}
          models={models}
          loadingModels={loadingModels}
          onModelChange={changeModel}
          reasoning={config.reasoning}
          onReasoningChange={(r) =>
            setConfig((prev) => {
              const next = { ...prev, reasoning: r };
              saveSettings(next);
              return next;
            })
          }
        />
      </div>

      {settingsOpen && (
        <SettingsModal config={config} onSave={saveConfig} onClose={() => setSettingsOpen(false)} />
      )}

      <Toast toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}