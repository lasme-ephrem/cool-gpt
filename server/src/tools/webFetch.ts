import type { ToolDef } from "../types.js";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 cool-gpt/0.1";

export const webFetchDef: ToolDef = {
  name: "web_fetch",
  description: "Récupère le contenu textuel d'une page web à partir de son URL.",
  icon: "globe",
  parameters: {
    type: "object",
    properties: {
      url: { type: "string", description: "L'URL complète (http ou https) de la page." },
    },
    required: ["url"],
  },
};

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;|&#x27;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&eacute;/g, "é")
    .replace(/&egrave;/g, "è")
    .replace(/&agrave;/g, "à")
    .replace(/&ccedil;/g, "ç")
    .replace(/&#\d+;/g, " ");
}

export async function webFetch(args: Record<string, unknown>): Promise<string> {
  const url = String(args.url ?? "").trim();
  if (!/^https?:\/\//i.test(url)) {
    return "Erreur : l'URL doit commencer par http:// ou https://.";
  }
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      return `Erreur : la page a répondu avec le statut ${res.status}.`;
    }
    let html = await res.text();
    html = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");
    let text = html.replace(/<[^>]+>/g, " ");
    text = decodeEntities(text);
    text = text.replace(/\s+/g, " ").trim();
    if (text.length > 6000) text = text.slice(0, 6000) + "...[tronqué]";
    return text || "Erreur : aucun contenu textuel exploitable sur cette page.";
  } catch (e) {
    return "Erreur : impossible de récupérer la page (voir " + (e instanceof Error ? e.message : String(e)) + ").";
  }
}
