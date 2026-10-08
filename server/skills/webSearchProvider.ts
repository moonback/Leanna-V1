/**
 * webSearchProvider — recherche web + lecture de pages 100 % côté serveur.
 *
 * Remplace le scraping fragile d'une page de résultats dans la webview visible
 * (cf. task.md §3). La recherche renvoie des résultats STRUCTURÉS (titre, URL,
 * extrait), et la lecture des sources se fait en PARALLÈLE via `fetch` + une
 * extraction d'article, sans détourner le navigateur de l'utilisateur.
 *
 * Points clés :
 *   - `fetch` est INJECTABLE → tests sans réseau.
 *   - Garde SSRF stricte (assertPublicHttpUrl) avant toute requête.
 *   - Fournisseur enfichable : DuckDuckGo HTML par défaut ; une clé Brave/Tavily
 *     pourra être branchée plus tard via l'environnement.
 *   - Tout texte externe est neutralisé (prompt-injection guard) par l'appelant.
 */

import { assertPublicHttpUrl } from "./browser.js";

export interface SearchHit {
  title: string;
  url: string;
  snippet: string;
}

export interface FetchedPage {
  url: string;
  finalUrl: string;
  title: string;
  text: string;
  truncated: boolean;
  ok: boolean;
  error?: string;
}

type FetchLike = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    redirect?: "follow" | "manual" | "error";
    signal?: AbortSignal;
  },
) => Promise<{
  ok: boolean;
  status: number;
  url?: string;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}>;

export interface WebSearchProviderOptions {
  /** Implémentation de fetch (défaut : global `fetch`). Injectable pour les tests. */
  fetchImpl?: FetchLike;
  /** Timeout par requête réseau, en ms (défaut : 12 000). */
  timeoutMs?: number;
  /** Taille max de HTML lue par page, en octets (défaut : 2 000 000). */
  maxBytes?: number;
  /** User-Agent annoncé. */
  userAgent?: string;
  /**
   * Clé API Brave Search (header `X-Subscription-Token`). Si fournie, la
   * recherche interroge l'API Brave en PRIORITÉ (résultats structurés fiables),
   * avec repli automatique sur DuckDuckGo HTML en cas d'échec. Défaut : lue
   * depuis `BRAVE_SEARCH_API_KEY` par la fabrique `createWebSearchProvider`.
   */
  braveApiKey?: string;
  /**
   * Force le backend de recherche. "auto" (défaut) = Brave si clé présente,
   * sinon DuckDuckGo. "brave" = Brave uniquement. "duckduckgo" = DDG uniquement.
   */
  searchBackend?: "auto" | "brave" | "duckduckgo";
}

/** Un résultat brut de l'API Brave Web Search (champs utilisés). */
interface BraveWebResult {
  title?: string;
  url?: string;
  description?: string;
}

const DEFAULT_UA =
  "Mozilla/5.0 (compatible; LeannaBot/1.0; +https://leanna.local) Chrome/124.0 Safari/537.36";
const DEFAULT_TIMEOUT = 12_000;
const DEFAULT_MAX_BYTES = 2_000_000;
const MAX_TEXT_LENGTH = 15_000;

// ─── Décodage des liens DuckDuckGo ────────────────────────────────────────────

/**
 * DuckDuckGo HTML enveloppe les liens dans un redirecteur
 * `//duckduckgo.com/l/?uddg=<url-encodée>&…`. On extrait l'URL réelle du
 * paramètre `uddg` (corrige le bug task.md : `.result__url` est tronqué).
 */
export function decodeDdgHref(href: string): string | null {
  if (!href) return null;
  let raw = href.trim();
  if (raw.startsWith("//")) raw = `https:${raw}`;
  // Lien direct déjà en http(s).
  if (/^https?:\/\//i.test(raw) && !/duckduckgo\.com\/l\//i.test(raw)) return raw;
  try {
    const u = new URL(raw, "https://duckduckgo.com");
    const uddg = u.searchParams.get("uddg");
    if (uddg) return decodeURIComponent(uddg);
    if (/^https?:\/\//i.test(raw)) return raw;
  } catch {
    return null;
  }
  return null;
}

/** Déséchappe les entités HTML courantes d'un fragment texte. */
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_m, d) => String.fromCodePoint(Number(d)));
}

/** Retire les balises d'un fragment et normalise les espaces. */
function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
}

/**
 * Parse la page HTML de résultats de `html.duckduckgo.com/html/`.
 * Cible les ancres `a.result__a` (titre + lien réel via `uddg`) et les
 * extraits `a.result__snippet` / `.result__snippet`.
 */
export function parseDuckDuckGoHtml(html: string, limit = 10): SearchHit[] {
  const hits: SearchHit[] = [];
  const seen = new Set<string>();

  // Chaque résultat : <a ... class="result__a" href="...">TITRE</a>
  const anchorRe = /<a\b[^>]*class="[^"]*\bresult__a\b[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  // Les extraits suivent, classe result__snippet.
  const snippetRe = /class="[^"]*\bresult__snippet\b[^"]*"[^>]*>([\s\S]*?)<\/a>|class="[^"]*\bresult__snippet\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i;

  // On découpe grossièrement par bloc de résultat pour associer titre + extrait.
  const blocks = html.split(/<div[^>]*class="[^"]*\bresult\b[^"]*"/i).slice(1);
  const source = blocks.length ? blocks : [html];

  for (const block of source) {
    anchorRe.lastIndex = 0;
    const m = anchorRe.exec(block);
    if (!m) continue;
    const realUrl = decodeDdgHref(m[1]);
    if (!realUrl || !/^https?:\/\//i.test(realUrl)) continue;
    if (seen.has(realUrl)) continue;
    const title = stripTags(m[2]);
    if (!title) continue;
    const snipMatch = snippetRe.exec(block);
    const snippet = snipMatch ? stripTags(snipMatch[1] ?? snipMatch[2] ?? "") : "";
    seen.add(realUrl);
    hits.push({ title, url: realUrl, snippet });
    if (hits.length >= limit) break;
  }
  return hits;
}

// ─── Résultats Brave Search (JSON) ────────────────────────────────────────────

/**
 * Parse la réponse JSON de l'API Brave Web Search (`res/v1/web/search`).
 * Les résultats web sont sous `web.results[]` avec `title`, `url`,
 * `description` (extrait). Robuste à un JSON malformé ou à une forme inattendue.
 */
export function parseBraveResults(json: string, limit = 10): SearchHit[] {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return [];
  }
  const results = (data as { web?: { results?: BraveWebResult[] } })?.web?.results;
  if (!Array.isArray(results)) return [];

  const hits: SearchHit[] = [];
  const seen = new Set<string>();
  for (const r of results) {
    const url = typeof r?.url === "string" ? r.url : "";
    if (!/^https?:\/\//i.test(url)) continue;
    if (seen.has(url)) continue;
    const title = stripTags(String(r?.title ?? ""));
    if (!title) continue;
    seen.add(url);
    hits.push({
      title,
      url,
      snippet: stripTags(String(r?.description ?? "")),
    });
    if (hits.length >= limit) break;
  }
  return hits;
}

// ─── Extraction d'article (HTML → texte lisible) ──────────────────────────────

/**
 * Extraction « mode lecture » légère : retire scripts/styles/nav/footer/aside,
 * privilégie <main>/<article>, convertit en texte en préservant les sauts de
 * ligne entre blocs. Sans dépendance externe (pas de Readability/cheerio).
 */
export function extractReadableText(html: string): { title: string; text: string } {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? stripTags(titleMatch[1]) : "";

  // Isoler le corps principal si présent.
  let body = html;
  const mainMatch =
    html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i) ||
    html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i);
  if (mainMatch) body = mainMatch[1];

  // Retirer les blocs non-contenu.
  body = body
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<nav\b[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer\b[\s\S]*?<\/footer>/gi, " ")
    .replace(/<aside\b[\s\S]*?<\/aside>/gi, " ")
    .replace(/<form\b[\s\S]*?<\/form>/gi, " ");

  // Convertir les fins de bloc en sauts de ligne pour préserver la structure.
  body = body
    .replace(/<\/(p|div|section|h[1-6]|li|tr|br)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n");

  const text = decodeEntities(body.replace(/<[^>]+>/g, " "))
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n")
    .trim();

  return { title, text };
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export class WebSearchProvider {
  private readonly fetchImpl: FetchLike;
  private readonly timeoutMs: number;
  private readonly maxBytes: number;
  private readonly userAgent: string;
  private readonly braveApiKey: string;
  private readonly searchBackend: "auto" | "brave" | "duckduckgo";

  constructor(opts: WebSearchProviderOptions = {}) {
    const globalFetch = (globalThis as { fetch?: FetchLike }).fetch;
    const impl = opts.fetchImpl ?? globalFetch;
    if (!impl) throw new Error("Aucune implémentation de fetch disponible.");
    this.fetchImpl = impl;
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT;
    this.maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
    this.userAgent = opts.userAgent ?? DEFAULT_UA;
    this.braveApiKey = (opts.braveApiKey ?? "").trim();
    this.searchBackend = opts.searchBackend ?? "auto";
  }

  /**
   * Lance une requête avec timeout et nettoyage du timer. Les en-têtes par
   * défaut ciblent le HTML ; `headers` permet de les surcharger (ex. JSON +
   * token pour l'API Brave).
   */
  private async timedFetch(
    url: string,
    headers?: Record<string, string>,
  ): Promise<{ status: number; finalUrl: string; body: string; contentType: string }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(url, {
        redirect: "follow",
        headers: headers ?? { "User-Agent": this.userAgent, Accept: "text/html,application/xhtml+xml" },
        signal: controller.signal,
      });
      const contentType = res.headers.get("content-type") ?? "";
      // Lecture bornée : on tronque le corps pour éviter d'avaler une page énorme.
      const raw = await res.text();
      const body = raw.length > this.maxBytes ? raw.slice(0, this.maxBytes) : raw;
      return { status: res.status, finalUrl: res.url || url, body, contentType };
    } finally {
      clearTimeout(timer);
    }
  }

  /** Indique le backend effectivement sélectionné compte tenu de la config. */
  private resolveBackend(): "brave" | "duckduckgo" {
    if (this.searchBackend === "brave") return "brave";
    if (this.searchBackend === "duckduckgo") return "duckduckgo";
    return this.braveApiKey ? "brave" : "duckduckgo";
  }

  /**
   * Recherche web → résultats structurés.
   *   - Backend "auto" (défaut) : Brave API si une clé est configurée, sinon
   *     DuckDuckGo HTML. En cas d'échec de Brave, repli automatique sur DDG.
   *   - Détecte une page anti-bot DuckDuckGo (CAPTCHA / anomaly).
   */
  async search(query: string, limit = 8): Promise<SearchHit[]> {
    const backend = this.resolveBackend();

    if (backend === "brave") {
      try {
        return await this.searchBrave(query, limit);
      } catch (err) {
        // Repli DDG uniquement en mode "auto" (clé présente mais Brave KO).
        // En mode "brave" explicite, on propage l'erreur.
        if (this.searchBackend === "brave") throw err;
        return this.searchDuckDuckGo(query, limit);
      }
    }
    return this.searchDuckDuckGo(query, limit);
  }

  /** Recherche via l'API Brave (`res/v1/web/search`). Clé en header. */
  private async searchBrave(query: string, limit: number): Promise<SearchHit[]> {
    if (!this.braveApiKey) throw new Error("Clé API Brave absente.");
    const count = Math.min(Math.max(limit, 1), 20);
    const q = encodeURIComponent(query.trim());
    const url = `https://api.search.brave.com/res/v1/web/search?q=${q}&count=${count}`;
    assertPublicHttpUrl(url);
    const { body, status } = await this.timedFetch(url, {
      Accept: "application/json",
      "Accept-Encoding": "gzip",
      "X-Subscription-Token": this.braveApiKey,
    });
    if (status === 401 || status === 403) {
      throw new Error(`Brave Search : clé API refusée (HTTP ${status}).`);
    }
    if (status === 429) {
      throw new Error("Brave Search : quota/limite de débit atteint (HTTP 429).");
    }
    if (status >= 400) {
      throw new Error(`Brave Search a échoué (HTTP ${status}).`);
    }
    const hits = parseBraveResults(body, limit);
    if (hits.length === 0) throw new Error("Brave Search : aucun résultat.");
    return hits;
  }

  /** Recherche via DuckDuckGo HTML (sans clé). Détecte les pages anti-bot. */
  private async searchDuckDuckGo(query: string, limit: number): Promise<SearchHit[]> {
    const q = encodeURIComponent(query.trim());
    const url = `https://html.duckduckgo.com/html/?q=${q}`;
    assertPublicHttpUrl(url);
    const { body, status } = await this.timedFetch(url);
    if (status >= 400) {
      throw new Error(`Recherche échouée (HTTP ${status}).`);
    }
    if (/anomaly|unusual traffic|captcha|challenge-form/i.test(body) && !/result__a/i.test(body)) {
      throw new Error("Le moteur de recherche a renvoyé une page anti-bot (CAPTCHA / anomaly).");
    }
    return parseDuckDuckGoHtml(body, limit);
  }

  /**
   * Récupère et extrait le texte lisible d'UNE page. Protégée SSRF, bornée en
   * taille et en temps. Ne lève jamais : renvoie `ok:false` + `error`.
   */
  async fetchPage(url: string): Promise<FetchedPage> {
    try {
      assertPublicHttpUrl(url);
    } catch (e) {
      return { url, finalUrl: url, title: "", text: "", truncated: false, ok: false, error: (e as Error).message };
    }
    try {
      const { status, finalUrl, body, contentType } = await this.timedFetch(url);
      if (status >= 400) {
        return { url, finalUrl, title: "", text: "", truncated: false, ok: false, error: `HTTP ${status}` };
      }
      if (contentType && !/text\/html|application\/xhtml|text\/plain/i.test(contentType)) {
        return { url, finalUrl, title: "", text: "", truncated: false, ok: false, error: `Type non lisible : ${contentType}` };
      }
      const { title, text } = extractReadableText(body);
      const truncated = text.length > MAX_TEXT_LENGTH;
      return {
        url,
        finalUrl,
        title,
        text: truncated ? text.slice(0, MAX_TEXT_LENGTH) + "\n\n[...contenu tronqué...]" : text,
        truncated,
        ok: true,
      };
    } catch (e) {
      return { url, finalUrl: url, title: "", text: "", truncated: false, ok: false, error: (e as Error).message };
    }
  }

  /** Récupère plusieurs pages EN PARALLÈLE (lecture serveur simultanée). */
  async fetchPages(urls: string[]): Promise<FetchedPage[]> {
    return Promise.all(urls.map((u) => this.fetchPage(u)));
  }
}

/**
 * Fabrique le provider par défaut. Si `BRAVE_SEARCH_API_KEY` est défini dans
 * l'environnement, la recherche passe par l'API Brave (avec repli DuckDuckGo) ;
 * sinon elle utilise DuckDuckGo HTML. Les options explicites priment sur l'env.
 */
export function createWebSearchProvider(opts: WebSearchProviderOptions = {}): WebSearchProvider {
  const envKey = (process.env.BRAVE_SEARCH_API_KEY ?? "").trim();
  const braveApiKey = opts.braveApiKey ?? (envKey.length > 0 ? envKey : undefined);
  return new WebSearchProvider({ ...opts, braveApiKey });
}
