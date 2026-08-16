import type { ToolDef } from "../types.js";

export const wikipediaSearchDef: ToolDef = {
  name: "wikipedia_search",
  description: "Recherche des articles sur Wikipédia en français.",
  icon: "book",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "Le terme à rechercher." },
      limit: { type: "number", description: "Nombre maximal de résultats (défaut 5)." },
    },
    required: ["query"],
  },
};

export const wikipediaArticleDef: ToolDef = {
  name: "wikipedia_article",
  description: "Récupère le résumé d'un article Wikipédia en français par son titre.",
  icon: "book",
  parameters: {
    type: "object",
    properties: {
      title: { type: "string", description: "Le titre exact de l'article." },
    },
    required: ["title"],
  },
};

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, " ");
}

function truncate(s: string, n: number): string {
  if (s.length > n) return s.slice(0, n) + "...[tronqué]";
  return s;
}

export async function wikipediaSearch(args: Record<string, unknown>): Promise<string> {
  const query = String(args.query ?? "");
  const limit = Math.round(Number(args.limit ?? 5) || 5);
  if (!query.trim()) return "Erreur : la requête est vide.";
  try {
    const res = await fetch(
      `https://fr.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=${limit}&srprop=snippet`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) return "Erreur : Wikipédia est indisponible.";
    const j = (await res.json()) as { query?: { search?: { title: string; snippet: string }[] } };
    const results = j.query?.search ?? [];
    if (!results.length) return "Aucun résultat trouvé sur Wikipédia.";
    return results
      .map((r) => `Titre\n${r.title}\nExtrait\n${stripTags(r.snippet).replace(/\s+/g, " ").trim()}`)
      .join("\n\n");
  } catch {
    return "Erreur : impossible de consulter Wikipédia.";
  }
}

export async function wikipediaArticle(args: Record<string, unknown>): Promise<string> {
  const title = String(args.title ?? "").trim();
  if (!title) return "Erreur : le titre de l'article est vide.";
  try {
    const res = await fetch(
      `https://fr.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (res.ok) {
      const j = (await res.json()) as { title?: string; extract?: string; content_urls?: { desktop?: { page?: string } } };
      if (j.extract) {
        let out = `Titre\n${j.title ?? title}\n`;
        if (j.content_urls?.desktop?.page) out += `URL\n${j.content_urls.desktop.page}\n`;
        out += "Extrait\n" + j.extract;
        return truncate(out, 4000);
      }
    }
    // fallback
    const fRes = await fetch(
      `https://fr.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&format=json&titles=${encodeURIComponent(title)}`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (!fRes.ok) return "Erreur : article introuvable sur Wikipédia.";
    const fj = (await fRes.json()) as { query?: { pages?: Record<string, { title: string; extract?: string }> } };
    const pages = fj.query?.pages ?? {};
    const first = Object.values(pages)[0];
    if (!first || !first.extract) return `Erreur : article « ${title} » introuvable sur Wikipédia.`;
    return truncate(`Titre\n${first.title}\nExtrait\n${first.extract}`, 4000);
  } catch {
    return "Erreur : impossible de consulter Wikipédia.";
  }
}
