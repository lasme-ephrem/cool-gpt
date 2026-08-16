import { useEffect, useRef, useState } from "react";
import { SendHorizontal, Square, Paperclip, FileText, FileSpreadsheet, Image, X, BrainCircuit, ChevronDown, Check, Loader2 } from "lucide-react";
import type { Attachment, ChatConfig } from "../lib/types";
import { formatSize, uid } from "../lib/format";

const MAX_SIZE = 2 * 1024 * 1024;
const MAX_FILES = 4;
const TEXT_EXT = [
  "csv", "txt", "md", "json", "js", "ts", "py", "log", "xml", "yml", "yaml", "html", "css"
];

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function ext(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

function fileKind(file: File): "image" | "text" | "binary" {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("text/")) return "text";
  if (/(json|xml|csv)/.test(file.type)) return "text";
  if (TEXT_EXT.includes(ext(file.name))) return "text";
  return "binary";
}

function kindIcon(kind: Attachment["kind"]) {
  if (kind === "text") return FileText;
  if (kind === "image") return Image;
  return FileSpreadsheet;
}

export function Composer({
  config,
  streaming,
  disabled,
  onSend,
  onStop,
  onFileError,
  models,
  loadingModels,
  onModelChange,
  reasoning,
  onReasoningChange
}: {
  config: ChatConfig;
  streaming: boolean;
  disabled: boolean;
  onSend: (text: string, attachments: Attachment[]) => void;
  onStop: () => void;
  onFileError?: (msg: string) => void;
  models: string[];
  loadingModels: boolean;
  onModelChange: (m: string) => void;
  reasoning: string;
  onReasoningChange: (r: "off" | "low" | "mid" | "high") => void;
}) {
  const [value, setValue] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const modelMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (modelMenuRef.current && !modelMenuRef.current.contains(e.target as Node)) {
        setModelMenuOpen(false);
      }
    }
    function onDocKey(e: KeyboardEvent) {
      if (e.key === "Escape") setModelMenuOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onDocKey);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onDocKey);
    };
  }, []);

  const canSend = (value.trim().length > 0 || attachments.length > 0) && !disabled;

  const REASONING_ORDER = ["off", "low", "mid", "high"] as const;
  const REASONING_LABEL: Record<string, string> = {
    off: "arrêt",
    low: "faible",
    mid: "moyen",
    high: "élevé"
  };
  const currentReasoning = (REASONING_ORDER as readonly string[]).includes(reasoning)
    ? reasoning
    : "off";
  const reasoningLabel = REASONING_LABEL[currentReasoning];
  const modelOptions = models.length > 0 ? models : [config.model];

  function cycleReasoning() {
    const idx = REASONING_ORDER.indexOf(currentReasoning as (typeof REASONING_ORDER)[number]);
    const next = REASONING_ORDER[(idx + 1) % REASONING_ORDER.length];
    onReasoningChange(next);
  }

  function submit() {
    if (!canSend) return;
    const text = value.trim();
    const sent = attachments;
    setValue("");
    setAttachments([]);
    if (ref.current) ref.current.style.height = "auto";
    if (fileRef.current) fileRef.current.value = "";
    onSend(text, sent);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  async function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    const room = MAX_FILES - attachments.length;
    if (room <= 0) {
      onFileError?.("Maximum 4 fichiers par message.");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    if (files.length > room) {
      onFileError?.("Maximum 4 fichiers par message.");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }

    const accepted: Attachment[] = [];
    for (const file of files) {
      if (file.size > MAX_SIZE) {
        onFileError?.("Fichier trop volumineux (maximum 2 Mo).");
        continue;
      }
      const kind = fileKind(file);
      if (kind === "text") {
        const raw = await file.text();
        accepted.push({
          id: uid(),
          name: file.name,
          mime: file.type || "text/plain",
          size: file.size,
          kind: "text",
          text: raw.length > 30000 ? raw.slice(0, 30000) : raw
        });
      } else {
        const dataUrl = await readAsDataUrl(file);
        accepted.push({
          id: uid(),
          name: file.name,
          mime: file.type || (kind === "image" ? "image/png" : "application/octet-stream"),
          size: file.size,
          kind,
          dataUrl
        });
      }
    }

    if (accepted.length > 0) {
      setAttachments((prev) => [...prev, ...accepted]);
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  const sendBtn = streaming ? (
    <button
      onClick={onStop}
      className="pressable accent-gradient text-white rounded-full w-9 h-9 flex items-center justify-center"
      aria-label="Arrêter la génération"
      title="Arrêter"
    >
      <Square size={15} fill="currentColor" />
    </button>
  ) : (
    <button
      onClick={submit}
      disabled={!canSend}
      className="pressable accent-gradient text-white rounded-full w-9 h-9 flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
      aria-label="Envoyer le message"
      title={disabled ? "Configurez une clé API dans les paramètres" : "Envoyer"}
    >
      <SendHorizontal size={16} />
    </button>
  );

  return (
    <div className="sticky bottom-0 z-10 px-4 pb-4 pt-2">
      <div className="relative mx-auto w-full max-w-3xl" ref={modelMenuRef}>
        <div
          className="pointer-events-none absolute inset-x-0 -top-8 h-8"
          style={{ background: "linear-gradient(to top, var(--app-bg), transparent)" }}
        />
        {modelMenuOpen && (
          <div className="absolute bottom-full left-0 mb-2 z-40 w-72 rounded-xl border-strong-sub surface shadow-card p-1.5 animate-pop-in">
            <div className="px-2 pt-1 pb-1.5 text-[10px] uppercase tracking-wide fg-faint flex items-center gap-1.5">
              Modèles disponibles
              {loadingModels && <Loader2 size={11} className="animate-spin text-accent" />}
            </div>
            <div className="max-h-56 overflow-y-auto flex flex-col gap-0.5">
              {modelOptions.length === 0 ? (
                <div className="px-2.5 py-2 text-xs fg-faint">
                  Liste indisponible pour ce fournisseur.
                </div>
              ) : (
                modelOptions.map((m) => (
                  <button
                    key={m}
                    onClick={() => {
                      onModelChange(m);
                      setModelMenuOpen(false);
                    }}
                    className={
                      "pressable flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-xs text-left " +
                      (m === config.model
                        ? "text-accent bg-accent-soft"
                        : "fg-muted hover:surface-2 hover:fg-app")
                    }
                  >
                    <span className="truncate">{m}</span>
                    {m === config.model && <Check size={13} className="shrink-0" />}
                  </button>
                ))
              )}
            </div>
          </div>
        )}
        <div className="relative rounded-2xl border-sub surface shadow-soft focus-within:ring-2 focus-within:ring-accent/50 theme-fade">
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 px-3 pt-3">
              {attachments.map((a) => {
                const Icon = kindIcon(a.kind);
                return (
                  <span
                    key={a.id}
                    className="animate-pop-in flex items-center gap-1.5 rounded-lg border-sub surface-2 px-2 py-1 text-xs fg-app"
                  >
                    <Icon size={13} className="fg-muted shrink-0" />
                    <span className="max-w-[140px] truncate">{a.name}</span>
                    <span className="fg-faint">{formatSize(a.size)}</span>
                    <button
                      onClick={() => setAttachments((prev) => prev.filter((x) => x.id !== a.id))}
                      className="pressable fg-faint hover:fg-app p-0.5 -mr-0.5"
                      aria-label="Retirer le fichier"
                    >
                      <X size={13} />
                    </button>
                  </span>
                );
              })}
            </div>
          )}
          <textarea
            ref={ref}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              const el = e.target;
              el.style.height = "auto";
              el.style.height = Math.min(el.scrollHeight, 220) + "px";
            }}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder="Écrivez votre message…"
            aria-label="Votre message"
            className="composer-area no-scrollbar w-full bg-transparent px-4 pt-3.5 pb-1 text-[15px] leading-relaxed fg-app placeholder:fg-faint focus:outline-none"
          />
          <div className="flex items-center justify-between px-3 pb-2.5">
            <div className="flex items-center gap-2 min-w-0">
              <input
                ref={fileRef}
                type="file"
                multiple
                className="hidden"
                onChange={onFiles}
              />
              <button
                onClick={() => fileRef.current?.click()}
                className="pressable fg-faint hover:fg-app p-1 rounded-md"
                aria-label="Joindre un fichier"
                title="Joindre un fichier"
              >
                <Paperclip size={16} />
              </button>
              <button
                onClick={() => setModelMenuOpen((o) => !o)}
                className="pressable flex items-center gap-1.5 rounded-full border border-sub surface px-2.5 py-1 text-[11px] fg-muted hover:fg-app hover:border-strong-sub max-w-[200px]"
                aria-label="Choisir le modèle"
                aria-expanded={modelMenuOpen}
                title="Choisir le modèle"
              >
                <span className="truncate">{config.model}</span>
                <ChevronDown
                  size={12}
                  className={"shrink-0 fg-faint transition-transform " + (modelMenuOpen ? "rotate-180" : "")}
                />
              </button>
              <span className="hidden sm:inline text-[11px] fg-faint">
                Entrée pour envoyer · Maj+Entrée pour nouvelle ligne
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={cycleReasoning}
                className={`pressable flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] border ${currentReasoning !== "off" ? "text-accent border-accent/40 bg-accent-soft" : "fg-faint border-sub"}`}
                aria-label="Changer le mode de raisonnement"
                title={`Mode de raisonnement : ${reasoningLabel}`}
              >
                <BrainCircuit size={14} />
                <span>Raisonnement : {reasoningLabel}</span>
              </button>
              {sendBtn}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}