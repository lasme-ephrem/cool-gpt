import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";

// Applique le thème enregistré avant le premier rendu pour éviter tout flash.
function applyInitialTheme(): void {
  let theme = "light";
  try {
    const raw = localStorage.getItem("cool-gpt:theme:v2");
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed === "light" || parsed === "dark") theme = parsed;
    }
  } catch {
    /* clé absente ou invalide : thème clair par défaut */
  }
  document.documentElement.classList.toggle("dark", theme === "dark");
}

applyInitialTheme();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
