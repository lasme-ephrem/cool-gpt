import { Sun, Moon } from "lucide-react";
import type { Theme } from "../lib/types";

export function Header({
  theme,
  onToggleTheme
}: {
  theme: Theme;
  onToggleTheme: () => void;
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-sub backdrop-blur-md theme-fade">
      <div className="mx-auto max-w-3xl px-4 h-14 flex items-center justify-end">
        <button
          onClick={onToggleTheme}
          className="pressable p-2 rounded-lg border-sub surface fg-muted hover:fg-app hover:surface-2"
          aria-label={theme === "dark" ? "Activer le mode clair" : "Activer le mode sombre"}
          title={theme === "dark" ? "Mode clair" : "Mode sombre"}
        >
          {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
        </button>
      </div>
    </header>
  );
}
