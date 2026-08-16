import { Plus, Trash2, Settings, PanelLeft } from "lucide-react";
import Logo from "./Logo";
import type { Conversation } from "../lib/types";
import { relativeTime } from "../lib/format";

export function Sidebar({
  conversations,
  activeId,
  collapsed,
  modelLabel,
  onToggleCollapse,
  onNew,
  onSelect,
  onDelete,
  onOpenSettings
}: {
  conversations: Conversation[];
  activeId: string | null;
  collapsed: boolean;
  modelLabel: string;
  onToggleCollapse: () => void;
  onNew: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onOpenSettings: () => void;
}) {
  return (
    <aside
      className={
        "flex flex-col h-full border-r border-sub theme-fade shrink-0 " +
        (collapsed ? "w-[64px]" : "w-[288px]")
      }
      style={{ background: "var(--app-bg)" }}
    >
      <div className="flex items-center justify-between px-4 h-14">
        <Logo collapsed={collapsed} />
        <button
          onClick={onToggleCollapse}
          className="pressable p-1.5 rounded fg-muted hover:fg-app"
          aria-label={collapsed ? "Développer la barre latérale" : "Réduire la barre latérale"}
          title={collapsed ? "Développer" : "Réduire"}
        >
          <PanelLeft size={17} />
        </button>
      </div>

      <div className={"px-3 " + (collapsed ? "py-2" : "py-3")}>
        <button
          onClick={onNew}
          className="pressable w-full flex items-center justify-center gap-2 rounded-xl accent-gradient text-white h-10 text-sm font-medium"
          aria-label="Nouvelle conversation"
          title="Nouvelle conversation"
        >
          <Plus size={17} />
          {!collapsed && <span>Nouvelle conversation</span>}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {!collapsed && <div className="px-2 py-2 text-[11px] uppercase tracking-wide fg-faint">Conversations</div>}
        <div className="flex flex-col gap-0.5">
          {conversations.map((conv) => (
            <div
              key={conv.id}
              className={
                "pressable group flex items-center rounded-lg px-2 py-2 cursor-pointer " +
                (conv.id === activeId ? "surface-2" : "hover:surface-2")
              }
              onClick={() => onSelect(conv.id)}
              role="button"
              tabIndex={0}
            >
              {!collapsed ? (
                <>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] fg-app truncate">{conv.title || "Sans titre"}</div>
                    <div className="text-[11px] fg-faint">{relativeTime(conv.updatedAt)}</div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); onDelete(conv.id); }}
                    className="opacity-0 group-hover:opacity-100 pressable p-1 rounded fg-faint hover:fg-app hover:text-red-400"
                    aria-label="Supprimer la conversation"
                    title="Supprimer"
                  >
                    <Trash2 size={14} />
                  </button>
                </>
              ) : (
                <div className="w-full flex justify-center" title={conv.title || "Sans titre"}>
                  <span className="w-2 h-2 rounded-full surface-2" />
                </div>
              )}
            </div>
          ))}
          {conversations.length === 0 && !collapsed && (
            <div className="px-2 py-3 text-[13px] fg-faint">Aucune conversation pour l'instant.</div>
          )}
        </div>
      </div>

      <div className="border-t border-sub p-2">
        <button
          onClick={onOpenSettings}
          className="pressable w-full flex items-center justify-center gap-2 rounded-lg px-2 py-2 text-sm fg-muted hover:surface-2 hover:fg-app"
          title="Paramètres"
        >
          <Settings size={16} />
          {!collapsed && <span className="truncate text-[13px]">{modelLabel}</span>}
        </button>
      </div>
    </aside>
  );
}
