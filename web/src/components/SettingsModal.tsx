import { useEffect, useState } from "react";
import { X, Eye, EyeOff, RefreshCw, Check } from "lucide-react";
import { PROVIDERS, PROVIDER_DEFAULTS, type ChatConfig, type ProviderId } from "../lib/types";
import { listModels } from "../lib/api";

const BASE_PLACEHOLDERS: Record<string, string> = {
  openai: "https://api.openai.com/v1",
  groq: "https://api.groq.com/openai/v1",
  mistral: "https://api.mistral.ai/v1",
  openrouter: "https://openrouter.ai/api/v1",
  ollama: "http://localhost:11434",
  anthropic: "https://api.anthropic.com",
  custom: "https://votre-fournisseur.example.com/v1",
  mock: ""
};

const label = "block text-[13px] font-medium fg-app mb-1";
const input =
  "w-full rounded-lg border-sub surface px-3 py-2 text-sm fg-app placeholder:fg-faint focus:outline-none focus:ring-2 focus:ring-accent/50";

export function SettingsModal({
  config,
  onSave,
  onClose
}: {
  config: ChatConfig;
  onSave: (c: ChatConfig) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<ChatConfig>(config);
  const [showKey, setShowKey] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [modelsOpen, setModelsOpen] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelsError, setModelsError] = useState("");

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const showBase = draft.provider === "custom" || draft.provider === "ollama";

  function set<K extends keyof ChatConfig>(k: K, v: ChatConfig[K]) {
    setDraft((d) => ({ ...d, [k]: v }));
  }

  function changeProvider(p: ProviderId) {
    const def = PROVIDER_DEFAULTS[p];
    setDraft((d) => ({ ...d, provider: p, baseUrl: def.baseUrl, model: def.model }));
    setModels([]);
    setModelsError("");
    setModelsOpen(false);
  }

  async function refresh() {
    setLoadingModels(true);
    setModelsError("");
    try {
      const res = await listModels(draft);
      setModels(res);
      setModelsOpen(true);
      if (res.length === 0) setModelsError("Aucun modèle retourné par le fournisseur.");
    } catch (e) {
      setModelsError((e as Error).message);
      setModelsOpen(false);
    } finally {
      setLoadingModels(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Paramètres"
    >
      <div
        className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl border-strong-sub shadow-card p-6 animate-pop-in"
        style={{ background: "var(--app-bg)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-serif font-bold text-xl fg-app">Paramètres</h2>
          <button onClick={onClose} className="pressable p-1.5 rounded fg-muted hover:fg-app" aria-label="Fermer">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label htmlFor="s-provider" className={label}>Fournisseur</label>
            <select
              id="s-provider"
              className={input}
              value={draft.provider}
              onChange={(e) => changeProvider(e.target.value as ProviderId)}
            >
              {PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </div>

          {showBase && (
            <div>
              <label htmlFor="s-base" className={label}>URL de base</label>
              <input
                id="s-base"
                className={input}
                value={draft.baseUrl}
                placeholder={BASE_PLACEHOLDERS[draft.provider]}
                onChange={(e) => set("baseUrl", e.target.value)}
              />
            </div>
          )}

          <div>
            <label htmlFor="s-key" className={label}>Clé API</label>
            <div className="relative">
              <input
                id="s-key"
                type={showKey ? "text" : "password"}
                className={input + " pr-10"}
                value={draft.apiKey}
                placeholder={draft.provider === "mock" ? "Non requise (fournisseur Mock)" : "sk-…"}
                disabled={draft.provider === "mock"}
                onChange={(e) => set("apiKey", e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowKey((s) => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded fg-faint hover:fg-app"
                aria-label={showKey ? "Masquer la clé" : "Afficher la clé"}
              >
                {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <p className="mt-1 text-[11px] fg-faint">Stockée uniquement dans votre navigateur (localStorage).</p>
          </div>

          <div>
            <label htmlFor="s-model" className={label}>Modèle</label>
            <div className="flex gap-2">
              <input
                id="s-model"
                className={input}
                value={draft.model}
                onChange={(e) => set("model", e.target.value)}
              />
              <button
                type="button"
                onClick={refresh}
                disabled={loadingModels}
                className="pressable shrink-0 rounded-lg border-sub surface px-3 flex items-center gap-1.5 text-sm fg-app hover:surface-2"
                aria-label="Charger les modèles"
                title="Charger les modèles disponibles"
              >
                {loadingModels ? <RefreshCw size={15} className="animate-spin" /> : <RefreshCw size={15} />}
              </button>
            </div>
            {modelsError && <p className="mt-1 text-[12px] text-red-400">{modelsError}</p>}
            {modelsOpen && models.length > 0 && (
              <div className="mt-2 rounded-lg border-sub surface overflow-hidden max-h-44 overflow-y-auto">
                {models.map((m) => (
                  <button
                    key={m}
                    onClick={() => set("model", m)}
                    className={
                      "pressable flex items-center justify-between w-full px-3 py-1.5 text-[13px] font-mono text-left " +
                      (m === draft.model ? "surface-2 fg-app" : "fg-muted hover:surface-2")
                    }
                  >
                    <span className="truncate">{m}</span>
                    {m === draft.model && <Check size={13} className="text-accent" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label htmlFor="s-temp" className={label}>
              Température <span className="font-mono fg-faint">({draft.temperature.toFixed(2)})</span>
            </label>
            <input
              id="s-temp"
              type="range"
              min={0}
              max={1.5}
              step={0.05}
              value={draft.temperature}
              onChange={(e) => set("temperature", Number(e.target.value))}
              className="w-full accent-indigo-500"
            />
          </div>

          <div>
            <label htmlFor="s-system" className={label}>Prompt système</label>
            <textarea
              id="s-system"
              className={input + " resize-none min-h-[80px]"}
              value={draft.systemPrompt}
              placeholder="Instructions système (optionnel)"
              onChange={(e) => set("systemPrompt", e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="s-steps" className={label}>Étapes max agent (budget initial)</label>
            <input
              id="s-steps"
              type="number"
              min={1}
              max={20}
              value={draft.maxSteps}
              onChange={(e) => set("maxSteps", Math.max(1, Math.min(20, Number(e.target.value))))}
              className={input}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onClose}
            className="pressable rounded-lg border-sub surface px-4 py-2 text-sm fg-app hover:surface-2"
          >
            Annuler
          </button>
          <button
            onClick={() => onSave(draft)}
            className="pressable accent-gradient text-white rounded-lg px-4 py-2 text-sm font-medium"
          >
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}
