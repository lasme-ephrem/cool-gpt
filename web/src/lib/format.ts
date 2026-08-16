export function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? clean.slice(0, max).trimEnd() + "…" : clean;
}

export function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "À l'instant";
  if (min < 60) return "Il y a " + min + " min";
  const h = Math.floor(min / 60);
  if (h < 24) return "Il y a " + h + " h";
  const d = Math.floor(h / 24);
  if (d < 7) return "Il y a " + d + " j";
  return new Date(ts).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

export function summarizeArgs(args: unknown): string {
  if (args == null) return "";
  if (typeof args !== "object") return String(args);
  const obj = args as Record<string, unknown>;
  const keys = Object.keys(obj);
  if (keys.length === 0) return "";
  const first = obj[keys[0]];
  if (keys.length === 1) {
    const s = typeof first === "string" ? first : JSON.stringify(first);
    return truncate(s, 60);
  }
  return truncate(JSON.stringify(obj), 60);
}


export function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + " o";
  const ko = bytes / 1024;
  if (ko < 1024) return ko.toFixed(1).replace(".", ",") + " Ko";
  const mo = ko / 1024;
  return mo.toFixed(1).replace(".", ",") + " Mo";
}

export function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}
