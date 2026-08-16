import { evaluate } from "mathjs";
import type { ToolDef } from "../types.js";

export const timeDef: ToolDef = {
  name: "get_current_time",
  description: "Donne la date et l'heure actuelles (éventuellement pour un fuseau horaire donné).",
  icon: "clock",
  parameters: {
    type: "object",
    properties: {
      timezone: { type: "string", description: "Fuseau IANA optionnel (ex. Europe/Paris)." },
    },
  },
};

export const currencyDef: ToolDef = {
  name: "convert_currency",
  description: "Convertit un montant d'une devise à une autre (taux de la Banque centrale européenne).",
  icon: "coins",
  parameters: {
    type: "object",
    properties: {
      amount: { type: "number", description: "Le montant à convertir." },
      from: { type: "string", description: "Code devise source (ex. EUR)." },
      to: { type: "string", description: "Code devise cible (ex. USD)." },
    },
    required: ["amount", "from", "to"],
  },
};

export const calcDef: ToolDef = {
  name: "calculate",
  description: "Évalue une expression mathématique et renvoie le résultat.",
  icon: "calculator",
  parameters: {
    type: "object",
    properties: {
      expression: { type: "string", description: "L'expression mathématique (ex. 2+3*4)." },
    },
    required: ["expression"],
  },
};

export function getCurrentTime(args: Record<string, unknown>): string {
  const tz = args.timezone ? String(args.timezone) : undefined;
  try {
    const fmt = new Intl.DateTimeFormat("fr-FR", {
      dateStyle: "full",
      timeStyle: "long",
      timeZone: tz,
    });
    return fmt.format(new Date());
  } catch {
    return `Erreur : fuseau horaire « ${tz} » invalide.`;
  }
}

export async function convertCurrency(args: Record<string, unknown>): Promise<string> {
  const amount = Number(args.amount);
  const from = String(args.from ?? "").toUpperCase();
  const to = String(args.to ?? "").toUpperCase();
  if (!Number.isFinite(amount)) return "Erreur : montant invalide.";
  try {
    const res = await fetch(
      `https://api.frankfurter.app/latest?amount=${amount}&from=${from}&to=${to}`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) return "Erreur : la conversion de devises a échoué (devise peut-être non prise en charge).";
    const j = (await res.json()) as { rates?: Record<string, number>; date?: string };
    const rate = j.rates?.[to];
    if (rate === undefined) return "Erreur : devise cible non prise en charge.";
    return `${amount} ${from} = ${rate} ${to} (taux au ${j.date ?? "?"})`;
  } catch {
    return "Erreur : service de conversion de devises indisponible.";
  }
}

export function calculate(args: Record<string, unknown>): string {
  const expr = String(args.expression ?? "");
  if (!expr.trim() || expr.length > 500) return "Erreur : expression invalide ou trop longue.";
  try {
    const result = evaluate(expr);
    return `${expr} = ${String(result)}`;
  } catch {
    return "Erreur : expression mathématique invalide.";
  }
}
