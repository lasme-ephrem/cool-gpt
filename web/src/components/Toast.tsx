import { CheckCircle2, AlertCircle, X } from "lucide-react";

export interface ToastItem {
  id: string;
  kind: "success" | "error";
  message: string;
}

export function Toast({
  toasts,
  onDismiss
}: {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="animate-pop-in pointer-events-auto flex items-center gap-2.5 rounded-xl border-sub surface px-4 py-2.5 shadow-soft backdrop-blur-md max-w-[90vw]"
          style={{ border: "1px solid", background: "var(--app-surface)" }}
          role="status"
        >
          {t.kind === "success" ? (
            <CheckCircle2 size={17} className="text-emerald-500 shrink-0" />
          ) : (
            <AlertCircle size={17} className="text-red-500 shrink-0" />
          )}
          <span className="text-sm fg-app">{t.message}</span>
          <button
            onClick={() => onDismiss(t.id)}
            className="p-0.5 rounded fg-faint hover:fg-app pressable"
            aria-label="Fermer la notification"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
