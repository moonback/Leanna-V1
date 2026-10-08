import { Skill, validateArgs } from "./base.js";
import { z } from "zod";

/**
 * Traduit un code météo WMO (open-meteo) en description française lisible.
 * Référence : https://open-meteo.com/en/docs (WMO Weather interpretation codes).
 */
function describeWeatherCode(code: number): string {
  const map: Record<number, string> = {
    0: "ciel dégagé",
    1: "principalement dégagé",
    2: "partiellement nuageux",
    3: "couvert",
    45: "brouillard",
    48: "brouillard givrant",
    51: "bruine légère",
    53: "bruine modérée",
    55: "bruine dense",
    56: "bruine verglaçante légère",
    57: "bruine verglaçante dense",
    61: "pluie faible",
    63: "pluie modérée",
    65: "pluie forte",
    66: "pluie verglaçante légère",
    67: "pluie verglaçante forte",
    71: "neige faible",
    73: "neige modérée",
    75: "neige forte",
    77: "grains de neige",
    80: "averses faibles",
    81: "averses modérées",
    82: "averses violentes",
    85: "averses de neige faibles",
    86: "averses de neige fortes",
    95: "orage",
    96: "orage avec grêle légère",
    99: "orage avec grêle forte",
  };
  return map[code] ?? "conditions inconnues";
}

export const weatherSkill: Skill = {
  name: "weather",
  permissions: ["network"],
  declarations: [
    {
      name: "get_weather",
      description: "Obtenir la météo actuelle pour une ville donnée.",
      parameters: {
        type: "OBJECT",
        properties: {
          city: { type: "STRING", description: "Le nom de la ville, par exemple Paris, Tokyo" }
        },
        required: ["city"]
      }
    }
  ],
  inputSchemas: {
    "get_weather": z.object({
      city: z.string().min(1, "Le nom de la ville est requis")
    })
  },
  handleToolCall: async (name, args) => {
    if (name === "get_weather") {
       // Validation des paramètres
       const validatedArgs = validateArgs(weatherSkill.inputSchemas!["get_weather"], args);
       
       try {
           const geoController = new AbortController();
           const geoTimeoutId = setTimeout(() => geoController.abort(), 8000);
           const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(validatedArgs.city)}&count=1&language=fr&format=json`, {
               signal: geoController.signal
           });
           clearTimeout(geoTimeoutId);
           const geoData = await geoRes.json();
           
           if (!geoData.results || geoData.results.length === 0) {
               return { error: "Ville non trouvée" };
           }
           
           const { latitude, longitude, name: cityName, country } = geoData.results[0];
           const weatherController = new AbortController();
           const weatherTimeoutId = setTimeout(() => weatherController.abort(), 8000);
           const weatherRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code&timezone=auto`, {
               signal: weatherController.signal
           });
           clearTimeout(weatherTimeoutId);
           const weatherData = await weatherRes.json();
           const current = weatherData.current ?? {};
           const code = Number(current.weather_code);
           const condition = describeWeatherCode(code);

           return {
               city: cityName,
               country: country ?? undefined,
               temperature_celsius: current.temperature_2m,
               feels_like_celsius: current.apparent_temperature,
               humidity_percent: current.relative_humidity_2m,
               wind_speed_kmh: current.wind_speed_10m,
               weather_code: code,
               condition,
               summary: `À ${cityName}${country ? ` (${country})` : ""} : ${condition}, ${current.temperature_2m}°C (ressenti ${current.apparent_temperature}°C).`
           };
       } catch (e: any) {
           return { error: e.message };
       }
    }
    return undefined;
  }
};
