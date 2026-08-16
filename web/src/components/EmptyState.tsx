import { Search, CloudSun, BookOpen, Code2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Orb } from "./Logo";

const SUGGESTIONS: { label: string; prompt: string; icon: LucideIcon }[] = [
  { label: "Rechercher sur le web", prompt: "Recherche les dernières actualités sur l'intelligence artificielle et résume-les.", icon: Search },
  { label: "Météo du jour", prompt: "Quelle est la météo aujourd'hui à Paris ?", icon: CloudSun },
  { label: "Explorer Wikipédia", prompt: "Explique-moi ce qu'est la photosynthèse d'après Wikipédia.", icon: BookOpen },
  { label: "Exécuter du Python", prompt: "Écris et exécute un script Python qui calcule les 20 premiers nombres de Fibonacci.", icon: Code2 }
];

export function EmptyState({ onSelect }: { onSelect: (prompt: string) => void }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center animate-pop-in">
      <Orb size={56} />
      <h1 className="font-serif text-4xl sm:text-5xl font-bold tracking-tight mt-8 fg-app">
        Comment puis-je vous aider ?
      </h1>
      <p className="mt-4 text-[15px] fg-muted max-w-md font-avenir font-light">
        Posez une question, lancez une recherche ou exécutez du code. cool-gpt orchestre
        les outils pour vous répondre.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-10 w-full max-w-xl">
        {SUGGESTIONS.map((s) => (
          <button
            key={s.label}
            onClick={() => onSelect(s.prompt)}
            className="pressable group flex items-center gap-3 rounded-xl border-sub surface px-4 py-3.5 text-left hover:border-strong-sub hover:surface-2"
          >
            <span className="accent-gradient text-white rounded-lg p-2">
              <s.icon size={16} />
            </span>
            <span className="text-sm font-medium fg-app">{s.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
