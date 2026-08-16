import { useEffect, useState } from "react";
import {
  Globe,
  CloudSun,
  BookOpen,
  Code2,
  Calculator,
  Clock,
  Coins,
  Loader2,
  Check,
  X,
  ChevronDown,
  Wrench,
  type LucideIcon
} from "lucide-react";
import type { ToolEvent } from "../lib/types";
import { summarizeArgs } from "../lib/format";

interface ToolInfo {
  icon: LucideIcon;
  label: string;
  desc: string;
}

// Noms français explicites des outils (affichés dans le chat).
const TOOL_INFO: Record<string, ToolInfo> = {
  web_search: { icon: Globe, label: "Recherche web", desc: "Recherche d'informations récentes sur le web" },
  web_fetch: { icon: Globe, label: "Lecture de page", desc: "Récupération du contenu d'une page web" },
  get_weather: { icon: CloudSun, label: "Météo", desc: "Conditions météo actuelles et prévisions" },
  wikipedia_search: { icon: BookOpen, label: "Recherche Wikipédia", desc: "Recherche d'articles encyclopédiques" },
  wikipedia_article: { icon: BookOpen, label: "Article Wikipédia", desc: "Lecture d'un article encyclopédique" },
  run_python: { icon: Code2, label: "Moteur Python", desc: "Exécution de code Python : calculs, données, graphiques" },
  get_current_time: { icon: Clock, label: "Heure actuelle", desc: "Date et heure dans un fuseau horaire" },
  convert_currency: { icon: Coins, label: "Conversion de devises", desc: "Taux de change entre deux monnaies" },
  calculate: { icon: Calculator, label: "Calculatrice", desc: "Évaluation d'une expression mathématique" },
};

function infoFor(name: string): ToolInfo {
  return TOOL_INFO[name] ?? { icon: Globe, label: name, desc: "Exécution d'un outil" };
}

function ToolRow({ ev, delay }: { ev: ToolEvent; delay: number }) {
  const [open, setOpen] = useState(false);
  const info = infoFor(ev.name);
  const Icon = info.icon;
  const running = ev.status === "running";
  const failed = ev.status === "error";
  const argsSummary = summarizeArgs(ev.args);
  const preview = ev.preview || ev.summary;

  return (
    <div
      className="animate-pop-in rounded-lg border-sub surface-2 px-2.5 py-2"
      style={{ animationDelay: delay + "ms" }}
    >
      <div className="flex items-center gap-2">
        <span className={"accent-gradient text-white rounded-md p-1 shrink-0 " + (running ? "animate-pulse" : "")}>
          <Icon size={12} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium fg-app truncate">{info.label}</div>
          <div className="text-[10px] fg-faint truncate">
            {running ? argsSummary || "Préparation…" : preview ? preview.slice(0, 70) : info.desc}
          </div>
        </div>
        {running ? (
          <Loader2 size={13} className="animate-spin fg-muted shrink-0" />
        ) : (
          <span className="text-emerald-500 shrink-0" title={failed ? "Échec" : "Terminé"}>
            {failed ? <X size={13} className="text-red-500" /> : <Check size={13} />}
          </span>
        )}
        {!running && (preview || (failed && ev.error)) && (
          <button
            onClick={() => setOpen((o) => !o)}
            className="fg-faint hover:fg-app pressable p-0.5 rounded shrink-0"
            aria-label={open ? "Replier l'aperçu" : "Afficher l'aperçu"}
            aria-expanded={open}
          >
            <ChevronDown size={12} className={"transition-transform " + (open ? "rotate-180" : "")} />
          </button>
        )}
      </div>

      {running && (
        <div className="mt-1.5 h-0.5 rounded-full overflow-hidden surface">
          <div className="h-full w-1/3 accent-gradient animate-shimmer" />
        </div>
      )}

      {open && !running && (
        <div className="mt-1.5">
          {preview && (
            <pre className="font-mono text-[11px] fg-muted whitespace-pre-wrap break-words max-h-32 overflow-y-auto">
              {preview}
            </pre>
          )}
          {typeof ev.chart === "string" && (
            <img
              src={ev.chart}
              alt={"Graphique généré par " + ev.name}
              className="mt-1.5 rounded-lg max-w-full border border-sub"
            />
          )}
          {!preview && failed && ev.error && <div className="text-[11px] text-red-400">{ev.error}</div>}
        </div>
      )}
    </div>
  );
}

export function ToolChips({ events }: { events: ToolEvent[] }) {
  const [open, setOpen] = useState(true);
  const running = events.some((e) => e.status === "running");
  const factorized = events.length >= 5;
  const names = events.map((e) => infoFor(e.name).label);

  // Repli automatique du cadre dès que tous les outils ont terminé.
  useEffect(() => {
    if (events.length > 0 && !running) setOpen(false);
  }, [running, events.length]);

  if (!events || events.length === 0) return null;

  const showBody = running || open;

  return (
    <div className="rounded-xl border border-sub surface my-3 overflow-hidden animate-pop-in">
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="accent-gradient text-white rounded-md p-1 shrink-0">
          <Wrench size={13} />
        </span>
        <span className="text-xs font-semibold fg-app">Exécution des outils</span>
        <span className="rounded-full border-sub surface-2 px-1.5 py-0.5 text-[10px] fg-muted">
          {events.length}
        </span>
        {running ? (
          <span className="ml-1 flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-60" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-accent" />
            </span>
            <span className="text-[11px] fg-muted">en cours…</span>
          </span>
        ) : (
          <span className="ml-1 flex items-center gap-1 text-[11px] fg-faint">
            <Check size={12} className="text-emerald-500 shrink-0" />
            {events.length} outil{events.length > 1 ? "s" : ""} exécuté{events.length > 1 ? "s" : ""}
          </span>
        )}
        <button
          onClick={() => setOpen((o) => !o)}
          className="ml-auto fg-faint hover:fg-app pressable p-0.5 rounded"
          aria-label={open ? "Replier les outils" : "Afficher les outils"}
          aria-expanded={open}
        >
          <ChevronDown size={14} className={"transition-transform " + (open ? "rotate-180" : "")} />
        </button>
      </div>

      {showBody && (
        <div
          className={
            "border-t border-sub px-2 py-2 flex flex-col gap-1.5 " +
            (factorized ? "max-h-64 overflow-y-auto" : "")
          }
        >
          {events.map((ev, i) => (
            <ToolRow key={ev.id} ev={ev} delay={i * 90} />
          ))}
        </div>
      )}

      {!showBody && factorized && (
        <div className="px-3 pb-2 text-[11px] fg-faint italic truncate">
          {names.slice(0, 3).join(" · ")}
          {events.length > 3 ? " · +" + (events.length - 3) : ""}
        </div>
      )}
    </div>
  );
}
