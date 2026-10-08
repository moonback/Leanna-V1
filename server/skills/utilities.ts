import { Skill, validateArgs } from "./base.js";
import { z } from "zod";

/**
 * utilities.ts — Outils utilitaires du quotidien pour l'assistante généraliste.
 *
 * Deux outils, tous deux sans clé API (fonctionnels immédiatement) :
 *   - get_news      : titres d'actualité récents via le flux RSS Google News.
 *   - lookup_topic  : résumé encyclopédique fiable via l'API REST de Wikipédia.
 *
 * Lecture seule, accès réseau sortant uniquement → permission ["network"].
 */

const FETCH_TIMEOUT_MS = 8000;

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

/** Extrait les N premiers <item> d'un flux RSS sans dépendance XML lourde. */
function parseRssItems(xml: string, limit: number): Array<{ title: string; link: string; source?: string; pubDate?: string }> {
  const items: Array<{ title: string; link: string; source?: string; pubDate?: string }> = [];
  const itemBlocks = xml.split(/<item>/i).slice(1);
  for (const block of itemBlocks) {
    if (items.length >= limit) break;
    const body = block.split(/<\/item>/i)[0] ?? "";
    const title = decodeEntities(extractTag(body, "title"));
    const link = extractTag(body, "link").trim();
    const source = decodeEntities(extractTag(body, "source"));
    const pubDate = extractTag(body, "pubDate").trim();
    if (title) {
      items.push({ title, link, source: source || undefined, pubDate: pubDate || undefined });
    }
  }
  return items;
}

function extractTag(xml: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = xml.match(re);
  if (!m) return "";
  // Nettoie une éventuelle section CDATA.
  return m[1].replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "").trim();
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

export const utilitiesSkill: Skill = {
  name: "utilities",
  permissions: ["network"],
  declarations: [
    {
      name: "get_news",
      description:
        "Obtenir les titres d'actualité récents. Optionnellement filtrer par sujet ou mot-clé. Utilise ceci pour toute question sur l'actualité, les dernières nouvelles ou un événement en cours.",
      parameters: {
        type: "OBJECT",
        properties: {
          topic: {
            type: "STRING",
            description: "Sujet ou mot-clé optionnel, par exemple 'technologie', 'sport', 'élection'. Laisser vide pour les gros titres généraux.",
          },
          language: {
            type: "STRING",
            description: "Code langue à deux lettres, par exemple 'fr' ou 'en'. Défaut 'fr'.",
          },
          limit: {
            type: "NUMBER",
            description: "Nombre de titres à retourner (1 à 10). Défaut 5.",
          },
        },
        required: [],
      },
    },
    {
      name: "lookup_topic",
      description:
        "Obtenir un résumé encyclopédique factuel sur un sujet, une personne, un lieu ou un concept via Wikipédia. Utilise ceci pour une définition fiable ou un aperçu rapide d'un sujet.",
      parameters: {
        type: "OBJECT",
        properties: {
          query: {
            type: "STRING",
            description: "Le sujet à rechercher, par exemple 'photosynthèse', 'Marie Curie', 'Tokyo'.",
          },
          language: {
            type: "STRING",
            description: "Code langue à deux lettres, par exemple 'fr' ou 'en'. Défaut 'fr'.",
          },
        },
        required: ["query"],
      },
    },
  ],
  inputSchemas: {
    get_news: z.object({
      topic: z.string().optional(),
      language: z.string().min(2).max(5).optional(),
      limit: z.number().int().min(1).max(10).optional(),
    }),
    lookup_topic: z.object({
      query: z.string().min(1, "Le sujet à rechercher est requis"),
      language: z.string().min(2).max(5).optional(),
    }),
  },
  handleToolCall: async (name, args) => {
    if (name === "get_news") {
      const { topic, language, limit } = validateArgs(utilitiesSkill.inputSchemas!["get_news"], args);
      const lang = (language ?? "fr").toLowerCase();
      const max = limit ?? 5;
      const region = lang === "fr" ? "FR" : "US";
      try {
        const base = topic?.trim()
          ? `https://news.google.com/rss/search?q=${encodeURIComponent(topic.trim())}&hl=${lang}&gl=${region}&ceid=${region}:${lang}`
          : `https://news.google.com/rss?hl=${lang}&gl=${region}&ceid=${region}:${lang}`;
        const res = await fetchWithTimeout(base);
        if (!res.ok) return { error: `Service d'actualités indisponible (HTTP ${res.status})` };
        const xml = await res.text();
        const items = parseRssItems(xml, max);
        if (items.length === 0) return { error: "Aucune actualité trouvée pour ce sujet." };
        return {
          topic: topic?.trim() || "gros titres",
          language: lang,
          count: items.length,
          headlines: items,
        };
      } catch (e: any) {
        return { error: e?.name === "AbortError" ? "Délai dépassé en interrogeant le service d'actualités." : e.message };
      }
    }

    if (name === "lookup_topic") {
      const { query, language } = validateArgs(utilitiesSkill.inputSchemas!["lookup_topic"], args);
      const lang = (language ?? "fr").toLowerCase();
      try {
        const url = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query.trim())}`;
        const res = await fetchWithTimeout(url, { headers: { Accept: "application/json" } });
        if (res.status === 404) return { error: `Aucun article trouvé pour « ${query} ».` };
        if (!res.ok) return { error: `Service encyclopédique indisponible (HTTP ${res.status})` };
        const data: any = await res.json();
        if (data.type && String(data.type).includes("disambiguation")) {
          return {
            query,
            disambiguation: true,
            note: `« ${query} » peut désigner plusieurs choses. Précise ta demande.`,
          };
        }
        return {
          title: data.title,
          summary: data.extract,
          url: data.content_urls?.desktop?.page,
          language: lang,
        };
      } catch (e: any) {
        return { error: e?.name === "AbortError" ? "Délai dépassé en interrogeant l'encyclopédie." : e.message };
      }
    }

    return undefined;
  },
};
