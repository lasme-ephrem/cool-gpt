import type { ToolDef } from "../types.js";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 cool-gpt/0.1";

function decodeHtml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export const webSearchDef: ToolDef = {
  name: "web_search",
  description: "Recherche sur le web (DuckDuckGo) et renvoie une réponse instantanée ou une liste de résultats pertinents.",
  icon: "globe",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "La requête de recherche." },
      maxResults: { type: "number", description: "Nombre maximal de résultats (défaut 6)." },
    },
    required: ["query"],
  },
};

export async function webSearch(args: Record<string, unknown>): Promise<string> {
  const query = String(args.query ?? "");
  const maxResults = Number(args.maxResults ?? 6) || 6;
  if (!query.trim()) return "Erreur : la requête de recherche est vide.";

  const enc = encodeURIComponent(query);

  // Instant answer API
  let instant = "";
  try {
    const res = await fetch(
      `https://api.duckduckgo.com/?q=${enc}&format=json&no_html=1&skip_disambig=1`,
      { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(8000) },
    );
    if (res.ok) {
      const j = (await res.json()) as Record<string, unknown>;
      const abstractText = String(j.AbstractText ?? "").trim();
      const answer = String(j.Answer ?? "").trim();
      const heading = String(j.Heading ?? "").trim();
      const absUrl = String(j.AbstractURL ?? "").trim();
      if (answer) {
        instant = `Réponse instantanée: ${answer}`;
      } else if (abstractText) {
        instant = (heading ? heading + "\n" : "") + abstractText + (absUrl ? "\n" + absUrl : "");
      }
    }
  } catch {
    /* ignore instant answer failure */
  }

  // HTML search
  let blocks: string[] = [];
  try {
    const res = await fetch(`https://html.duckduckgo.com/html/?q=${enc}`, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      return "Erreur : la recherche web a échoué (possible limitation de débit de DuckDuckGo). Réessayez dans un instant.";
    }
    const html = await res.text();
    // split into result blocks by result__body
    const blocksHtml = html.split(/class="[^"]*result__body[^"]*"/);
    const linkRe = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/;
    const snippetRe = /class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/[a-z]+>/;
    for (const block of blocksHtml) {
      const lm = block.match(linkRe);
      const sm = block.match(snippetRe);
      if (!lm) continue;
      let url = lm[1];
      // decode redirect
      const uddg = url.match(/uddg=([^&]+)/);
      if (uddg) {
        try { url = decodeURIComponent(uddg[1]); } catch { url = url; }
      }
      const title = stripTags(decodeHtml(lm[2]));
      const snippet = sm ? stripTags(decodeHtml(sm[1])) : "";
      if (!title) continue;
      blocks.push(`Titre\n${title}\nURL\n${url}\nExtrait\n${snippet}`);
      if (blocks.length >= maxResults) break;
    }
  } catch {
    /* fall through */
  }

  const parts: string[] = [];
  if (instant) parts.push("Réponse instantanée:\n" + instant);
  if (blocks.length) parts.push(blocks.join("\n\n"));
  if (parts.length === 0) {
    return "Erreur : la recherche web a échoué (possible limitation de débit de DuckDuckGo). Réessayez dans un instant.";
  }
  return parts.join("\n\n");
}
