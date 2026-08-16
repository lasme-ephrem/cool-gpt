import { useEffect, useState } from "react";
import type { Attachment, Message as MessageType } from "../lib/types";
import { FileText, FileSpreadsheet, Image as ImageIcon, BrainCircuit, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { formatSize } from "../lib/format";
import { Markdown } from "./Markdown";
import { ToolChips } from "./ToolChips";
import { ChartView } from "./ChartView";
import { Orb } from "./Logo";

function attachmentChip(a: Attachment) {
  const Icon = a.kind === "text" ? FileText : a.kind === "image" ? ImageIcon : FileSpreadsheet;
  return (
    <span
      key={a.id}
      className="inline-flex items-center gap-1.5 rounded-lg border-sub surface px-2 py-1 text-xs fg-app"
    >
      <Icon size={13} className="fg-muted shrink-0" />
      <span className="max-w-[140px] truncate">{a.name}</span>
      <span className="fg-faint">{formatSize(a.size)}</span>
    </span>
  );
}

function Thinking() {
  return (
    <span className="flex items-center gap-1.5 fg-faint" aria-label="En cours de réflexion">
      <span className="thinking-dot" />
      <span className="thinking-dot" />
      <span className="thinking-dot" />
    </span>
  );
}

function ReasoningBlock({ message }: { message: MessageType }) {
  const [collapsed, setCollapsed] = useState(false);
  const done = message.reasoningDone === true;
  const reasoningText = message.reasoning ?? "";

  useEffect(() => {
    if (done) setCollapsed(true);
  }, [done]);

  const showBody = !done || !collapsed;
  const summary = reasoningText.slice(0, 80);

  return (
    <div className="rounded-xl border border-sub surface-2 px-3 py-2 mb-3 animate-pop-in">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <BrainCircuit size={14} className="text-accent shrink-0" />
          <span className="text-xs font-medium fg-muted">Réflexion</span>
        </div>
        <div className="flex items-center gap-2">
          {!done ? (
            <Loader2 size={13} className="fg-faint animate-spin" />
          ) : (
            <>
              {collapsed && reasoningText && !showBody && (
                <span className="text-xs fg-faint italic truncate max-w-[300px]">{summary}</span>
              )}
              <button
                onClick={() => setCollapsed((c) => !c)}
                className="pressable fg-faint hover:fg-app p-0.5 rounded"
                aria-label={collapsed ? "Afficher la réflexion" : "Replier la réflexion"}
              >
                {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
              </button>
            </>
          )}
        </div>
      </div>
      {showBody && (
        <div className="mt-1.5 text-[13px] fg-muted whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto font-avenir font-light">
          {reasoningText}
        </div>
      )}
    </div>
  );
}

export function Message({ message }: { message: MessageType }) {
  if (message.role === "user") {
    const atts = message.attachments ?? [];
    return (
      <div className="animate-pop-in flex justify-end my-3">
        <div className="max-w-[85%] rounded-2xl surface-2 px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap fg-app font-avenir font-light">
          {message.content}
          {atts.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {atts.map((a) => attachmentChip(a))}
            </div>
          )}
        </div>
      </div>
    );
  }

  const hasContent = message.content.length > 0;
  const showThinking = message.streaming && message.toolEvents && message.toolEvents.some((e) => e.status === "running");

  // Graphiques produits par les outils : rendu animé (chartData) ou image statique (chart).
  const events = message.toolEvents ?? [];
  const charts = events.filter((e) => e.chartData !== undefined).map((e) => e.chartData);
  const pngs = events.filter((e) => e.chart && e.chartData === undefined).map((e) => e.chart as string);

  return (
    <div className="animate-pop-in my-4">
      <div className="flex items-center gap-2.5 mb-1.5">
        <Orb size={22} />
        <span className="text-sm font-semibold fg-app">cool-gpt</span>
        {message.streaming && !hasContent && !showThinking && <Thinking />}
      </div>

      <div className="pl-[30px]">
        <ToolChips events={events} />

        {message.reasoning !== undefined && <ReasoningBlock message={message} />}

        {charts.map((c, i) => (
          <ChartView key={"chart-" + i} data={c} />
        ))}
        {pngs.map((p, i) => (
          <div key={"png-" + i} className="rounded-xl border border-sub surface p-3 my-3 animate-pop-in">
            <img src={p} alt="Graphique généré par Python" className="rounded-lg max-w-full" />
          </div>
        ))}

        {hasContent && (
          <div className={message.streaming ? "stream-caret" : ""}>
            <Markdown content={message.content} />
          </div>
        )}
        {showThinking && <Thinking />}
      </div>
    </div>
  );
}