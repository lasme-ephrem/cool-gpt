import type { ToolDef } from "../types.js";
import { webSearchDef, webSearch } from "./webSearch.js";
import { webFetchDef, webFetch } from "./webFetch.js";
import { weatherDef, getWeather } from "./weather.js";
import { wikipediaSearchDef, wikipediaSearch, wikipediaArticleDef, wikipediaArticle } from "./wikipedia.js";
import { pythonDef, runPython, type ChartSpec } from "./python.js";
import { timeDef, getCurrentTime, currencyDef, convertCurrency, calcDef, calculate } from "./misc.js";

export type ToolResult = string | { text: string; chart?: string; chartData?: ChartSpec };

export interface ToolEntry {
  def: ToolDef;
  execute: (args: Record<string, unknown>) => Promise<ToolResult> | ToolResult;
}

export const tools: ToolEntry[] = [
  { def: webSearchDef, execute: webSearch },
  { def: webFetchDef, execute: webFetch },
  { def: weatherDef, execute: getWeather },
  { def: wikipediaSearchDef, execute: wikipediaSearch },
  { def: wikipediaArticleDef, execute: wikipediaArticle },
  { def: pythonDef, execute: runPython },
  { def: timeDef, execute: getCurrentTime },
  { def: currencyDef, execute: convertCurrency },
  { def: calcDef, execute: calculate },
];

export function toolDefinitions(): ToolDef[] {
  return tools.map((t) => t.def);
}

export function findTool(name: string): ToolEntry | undefined {
  return tools.find((t) => t.def.name === name);
}

export async function executeTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
  const t = findTool(name);
  if (!t) return `Erreur : outil « ${name} » inconnu.`;
  try {
    return await t.execute(args);
  } catch (e) {
    return "Erreur : l'outil a rencontré un problème (" + (e instanceof Error ? e.message : String(e)) + ").";
  }
}
