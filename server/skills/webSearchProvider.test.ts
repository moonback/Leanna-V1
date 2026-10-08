import { describe, it } from "node:test";
import assert from "node:assert";
import {
  WebSearchProvider,
  parseDuckDuckGoHtml,
  parseBraveResults,
  decodeDdgHref,
  extractReadableText,
} from "./webSearchProvider.js";

// ── Fausse implémentation de fetch (aucun réseau) ─────────────────────────────
function makeFakeFetch(routes: Record<string, { status?: number; body: string; contentType?: string }>) {
  return async (input: string) => {
    const entry = routes[input] ?? Object.entries(routes).find(([k]) => input.startsWith(k))?.[1];
    if (!entry) {
      return {
        ok: false,
        status: 404,
        url: input,
        headers: { get: () => "text/html" },
        text: async () => "",
      };
    }
    return {
      ok: (entry.status ?? 200) < 400,
      status: entry.status ?? 200,
      url: input,
      headers: { get: (n: string) => (n.toLowerCase() === "content-type" ? entry.contentType ?? "text/html" : null) },
      text: async () => entry.body,
    };
  };
}

const DDG_SAMPLE = `
<div class="result results_links">
  <div class="result__body">
    <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Farticle&rut=abc">Un <b>titre</b> d'article</a>
    <a class="result__snippet" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Farticle">Ceci est l'extrait du résultat&nbsp;numéro un.</a>
  </div>
</div>
<div class="result results_links">
  <div class="result__body">
    <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fdocs.example.org%2Fguide">Guide officiel</a>
    <a class="result__snippet" href="#">Deuxième extrait.</a>
  </div>
</div>
`;

describe("webSearchProvider", () => {
  describe("decodeDdgHref", () => {
    it("extracts the real URL from a DuckDuckGo redirect (uddg param)", () => {
      assert.equal(
        decodeDdgHref("//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fx&rut=z"),
        "https://example.com/x",
      );
    });
    it("passes through direct http(s) links unchanged", () => {
      assert.equal(decodeDdgHref("https://example.com/direct"), "https://example.com/direct");
    });
    it("returns null for junk", () => {
      assert.equal(decodeDdgHref(""), null);
      assert.equal(decodeDdgHref("javascript:alert(1)"), null);
    });
  });

  describe("parseDuckDuckGoHtml", () => {
    it("parses titles, real URLs and snippets", () => {
      const hits = parseDuckDuckGoHtml(DDG_SAMPLE);
      assert.equal(hits.length, 2);
      assert.equal(hits[0].url, "https://example.com/article");
      assert.equal(hits[0].title, "Un titre d'article");
      assert.match(hits[0].snippet, /extrait du résultat/);
      assert.equal(hits[1].url, "https://docs.example.org/guide");
    });

    it("respects the limit", () => {
      assert.equal(parseDuckDuckGoHtml(DDG_SAMPLE, 1).length, 1);
    });
  });

  describe("extractReadableText", () => {
    it("extracts title and strips scripts/styles/nav", () => {
      const html = `<html><head><title>Ma Page</title></head><body>
        <nav>menu accueil contact</nav>
        <script>var x = 1;</script>
        <style>.a{color:red}</style>
        <main><h1>Titre</h1><p>Paragraphe un.</p><p>Paragraphe deux.</p></main>
        <footer>pied de page</footer>
      </body></html>`;
      const { title, text } = extractReadableText(html);
      assert.equal(title, "Ma Page");
      assert.match(text, /Titre/);
      assert.match(text, /Paragraphe un\./);
      assert.match(text, /Paragraphe deux\./);
      assert.doesNotMatch(text, /var x = 1/);
      assert.doesNotMatch(text, /color:red/);
      assert.doesNotMatch(text, /menu accueil/);
    });
  });

  describe("WebSearchProvider.search", () => {
    it("returns structured hits from the search endpoint", async () => {
      const provider = new WebSearchProvider({
        fetchImpl: makeFakeFetch({ "https://html.duckduckgo.com/html/": { body: DDG_SAMPLE } }),
      });
      const hits = await provider.search("test", 5);
      assert.equal(hits.length, 2);
      assert.equal(hits[0].url, "https://example.com/article");
    });

    it("throws on an anti-bot page", async () => {
      const provider = new WebSearchProvider({
        fetchImpl: makeFakeFetch({ "https://html.duckduckgo.com/html/": { body: "<html>unusual traffic detected, please solve the captcha</html>" } }),
      });
      await assert.rejects(() => provider.search("test"), /anti-bot|CAPTCHA|anomaly/i);
    });
  });

  describe("parseBraveResults", () => {
    const BRAVE_JSON = JSON.stringify({
      web: {
        results: [
          { title: "Gemini Live <b>API</b>", url: "https://ai.google.dev/live", description: "Doc officielle&nbsp;live." },
          { title: "Guide", url: "https://example.org/guide", description: "Un guide." },
          { title: "Mauvais", url: "ftp://nope", description: "ignoré (schéma)" },
          { title: "", url: "https://example.net/vide", description: "sans titre -> ignoré" },
        ],
      },
    });

    it("extracts title/url/snippet and strips tags/entities", () => {
      const hits = parseBraveResults(BRAVE_JSON);
      assert.equal(hits.length, 2);
      assert.equal(hits[0].url, "https://ai.google.dev/live");
      assert.equal(hits[0].title, "Gemini Live API");
      assert.match(hits[0].snippet, /Doc officielle live\./);
      assert.equal(hits[1].url, "https://example.org/guide");
    });

    it("respects the limit", () => {
      assert.equal(parseBraveResults(BRAVE_JSON, 1).length, 1);
    });

    it("returns [] on malformed JSON or unexpected shape", () => {
      assert.deepEqual(parseBraveResults("{not json"), []);
      assert.deepEqual(parseBraveResults(JSON.stringify({ nope: true })), []);
    });
  });

  describe("WebSearchProvider.search — Brave backend", () => {
    const BRAVE_URL = "https://api.search.brave.com/res/v1/web/search";
    const braveBody = JSON.stringify({
      web: { results: [{ title: "Brave hit", url: "https://brave.example/x", description: "ok" }] },
    });

    it("uses Brave when an API key is provided", async () => {
      let braveCalled = false;
      const provider = new WebSearchProvider({
        braveApiKey: "test-key",
        fetchImpl: async (u: string) => {
          if (u.startsWith(BRAVE_URL)) braveCalled = true;
          return {
            ok: true, status: 200, url: u,
            headers: { get: () => "application/json" },
            text: async () => braveBody,
          };
        },
      });
      const hits = await provider.search("gemini live", 5);
      assert.equal(braveCalled, true, "Brave doit être interrogé en priorité");
      assert.equal(hits[0].url, "https://brave.example/x");
    });

    it("falls back to DuckDuckGo when Brave fails in auto mode", async () => {
      let ddgCalled = false;
      const provider = new WebSearchProvider({
        braveApiKey: "test-key",
        searchBackend: "auto",
        fetchImpl: async (u: string) => {
          if (u.startsWith(BRAVE_URL)) {
            return { ok: false, status: 429, url: u, headers: { get: () => "application/json" }, text: async () => "" };
          }
          ddgCalled = true;
          return { ok: true, status: 200, url: u, headers: { get: () => "text/html" }, text: async () => DDG_SAMPLE };
        },
      });
      const hits = await provider.search("test", 5);
      assert.equal(ddgCalled, true, "DDG doit prendre le relais");
      assert.equal(hits[0].url, "https://example.com/article");
    });

    it("propagates the error in explicit brave mode (no fallback)", async () => {
      const provider = new WebSearchProvider({
        braveApiKey: "test-key",
        searchBackend: "brave",
        fetchImpl: async (u: string) => ({
          ok: false, status: 401, url: u, headers: { get: () => "application/json" }, text: async () => "",
        }),
      });
      await assert.rejects(() => provider.search("test"), /Brave.*(refusée|401)/i);
    });

    it("skips Brave and uses DDG when no key is configured", async () => {
      let braveCalled = false;
      const provider = new WebSearchProvider({
        fetchImpl: async (u: string) => {
          if (u.startsWith(BRAVE_URL)) braveCalled = true;
          return { ok: true, status: 200, url: u, headers: { get: () => "text/html" }, text: async () => DDG_SAMPLE };
        },
      });
      const hits = await provider.search("test", 5);
      assert.equal(braveCalled, false, "sans clé, Brave n'est pas interrogé");
      assert.equal(hits.length, 2);
    });
  });

  describe("WebSearchProvider.fetchPage (SSRF + extraction)", () => {
    it("refuses to fetch private/loopback hosts (SSRF guard)", async () => {
      let called = false;
      const provider = new WebSearchProvider({
        fetchImpl: async (u: string) => { called = true; return { ok: true, status: 200, url: u, headers: { get: () => "text/html" }, text: async () => "" }; },
      });
      const res = await provider.fetchPage("http://169.254.169.254/latest/meta-data");
      assert.equal(res.ok, false);
      assert.match(res.error ?? "", /interdite|LINK_LOCAL|PRIVATE|LOOPBACK/);
      assert.equal(called, false, "fetch ne doit jamais être appelé pour un hôte interdit");
    });

    it("fetches and extracts a public page", async () => {
      const provider = new WebSearchProvider({
        fetchImpl: makeFakeFetch({
          "https://example.com/article": { body: "<html><head><title>Doc</title></head><body><main><p>Contenu lisible important.</p></main></body></html>" },
        }),
      });
      const res = await provider.fetchPage("https://example.com/article");
      assert.equal(res.ok, true);
      assert.equal(res.title, "Doc");
      assert.match(res.text, /Contenu lisible important/);
    });

    it("reads multiple pages in parallel", async () => {
      const provider = new WebSearchProvider({
        fetchImpl: makeFakeFetch({
          "https://a.example/": { body: "<title>A</title><main><p>alpha text here</p></main>" },
          "https://b.example/": { body: "<title>B</title><main><p>beta text here</p></main>" },
        }),
      });
      const pages = await provider.fetchPages(["https://a.example/", "https://b.example/"]);
      assert.equal(pages.length, 2);
      assert.equal(pages[0].ok, true);
      assert.equal(pages[1].ok, true);
    });
  });
});
