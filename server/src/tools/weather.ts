import type { ToolDef } from "../types.js";

export const weatherDef: ToolDef = {
  name: "get_weather",
  description: "Donne la météo actuelle et les prévisions pour un lieu donné (source Open-Meteo).",
  icon: "cloud-sun",
  parameters: {
    type: "object",
    properties: {
      location: { type: "string", description: "Nom de la ville ou du lieu." },
      days: { type: "number", description: "Nombre de jours de prévision (1 à 5, défaut 1)." },
    },
    required: ["location"],
  },
};

function wmoLabel(code: number): string {
  if (code === 0) return "clair";
  if (code === 1 || code === 2) return "peu nuageux";
  if (code === 3) return "couvert";
  if (code === 45 || code === 48) return "brouillard";
  if (code >= 51 && code <= 57) return "bruine";
  if (code >= 61 && code <= 67) return "pluie";
  if (code >= 71 && code <= 77) return "neige";
  if (code >= 80 && code <= 82) return "averses";
  if (code === 85 || code === 86) return "averses de neige";
  if (code >= 95 && code <= 99) return "orage";
  return "inconnu";
}

export async function getWeather(args: Record<string, unknown>): Promise<string> {
  const location = String(args.location ?? "").trim();
  let days = Math.round(Number(args.days ?? 1) || 1);
  if (days < 1) days = 1;
  if (days > 5) days = 5;
  if (!location) return "Erreur : le lieu est manquant.";

  try {
    const geoRes = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=fr`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (!geoRes.ok) return "Erreur : service de géolocalisation indisponible.";
    const geo = (await geoRes.json()) as { results?: { latitude: number; longitude: number; name: string; country?: string }[] };
    const place = geo.results?.[0];
    if (!place) return `Erreur : lieu « ${location} » introuvable.`;
    const { latitude, longitude, name } = place;
    const country = place.country ?? "";

    const fcRes = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=${days}`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (!fcRes.ok) return "Erreur : service météo indisponible.";
    const fc = (await fcRes.json()) as {
      current?: { temperature_2m?: number; apparent_temperature?: number; relative_humidity_2m?: number; weather_code?: number; wind_speed_10m?: number };
      daily?: { time?: string[]; weather_code?: number[]; temperature_2m_max?: number[]; temperature_2m_min?: number[]; precipitation_probability_max?: number[] };
    };

    const cur = fc.current ?? {};
    let out = `Météo à ${name}${country ? ", " + country : ""}\n`;
    out += `Actuellement: ${wmoLabel(cur.weather_code ?? 0)}, ${cur.temperature_2m ?? "?"} °C (ressenti ${cur.apparent_temperature ?? "?"} °C), humidité ${cur.relative_humidity_2m ?? "?"} %, vent ${cur.wind_speed_10m ?? "?"} km/h\n`;

    const daily = fc.daily;
    if (daily && daily.time) {
      out += "Prévisions:\n";
      for (let i = 0; i < daily.time.length; i++) {
        const date = daily.time[i];
        const min = daily.temperature_2m_min?.[i] ?? "?";
        const max = daily.temperature_2m_max?.[i] ?? "?";
        const wc = daily.weather_code?.[i] ?? 0;
        const rain = daily.precipitation_probability_max?.[i] ?? "?";
        out += `${date}: min ${min} / max ${max} °C, ${wmoLabel(wc)}, pluie ${rain} %\n`;
      }
    }
    return out.trim();
  } catch (e) {
    return "Erreur : impossible de récupérer la météo (" + (e instanceof Error ? e.message : String(e)) + ").";
  }
}
