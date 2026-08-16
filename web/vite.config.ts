import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8789"
    },
    watch: {
      // évite les crashes EBUSY du watcher sur les fichiers temporaires d'édition atomique (Windows)
      ignored: ["**/.*.tmpdir/**", "**/*.tmp", "**/.qa/**"]
    }
  }
});
