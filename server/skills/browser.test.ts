import { describe, it } from "node:test";
import assert from "node:assert";
import { browserSkill, normalizeUrl, rankLinkCandidates, classifyHost, isSponsoredLink, condenseSearchQuery } from "./browser.js";

describe("browser", () => {
  describe("URL policy and link ranking", () => {
    it("allows public URLs and localhost while rejecting private, loopback, and link-local destinations", () => {
      assert.equal(normalizeUrl("https://example.com/docs"), "https://example.com/docs");
      assert.equal(normalizeUrl("http://localhost:3000"), "http://localhost:3000");
      assert.equal(normalizeUrl("http://app.localhost:4173"), "http://app.localhost:4173");
      for (const url of [
        "http://127.0.0.1",
        "http://10.0.0.1",
        "http://192.168.1.10",
        "http://172.16.0.1",
        "http://169.254.169.254/latest/meta-data",
      ]) {
        assert.throws(() => normalizeUrl(url), /interdite|PRIVATE|LOCALHOST|LOOPBACK|LINK_LOCAL/);
      }
    });

    it("ranks, filters, and deduplicates link candidates", () => {
      const candidates = rankLinkCandidates([
        { text: "Accueil", href: "https://example.com/" },
        { text: "Résultat documentaire important", href: "https://docs.example.org/page?utm_source=test" },
        { text: "Résultat documentaire important (copie)", href: "https://docs.example.org/page#section" },
        { text: "Annonce sponsorisée", href: "https://ads.example.net/click" },
      ], "https://example.com/search");

      assert.equal(candidates.length, 3);
      assert.equal(candidates[0].domain, "docs.example.org");
      assert.equal(candidates[0].isNavigation, false);
      assert.equal(candidates.some((candidate) => candidate.isSponsored), true);
      assert.equal(new Set(candidates.map((candidate) => candidate.href)).size, candidates.length);
      assert.equal(candidates[0].isExternal, true);
    });
  });

  describe("condenseSearchQuery", () => {
    it("condenses an LLM paragraph into keywords and drops stopwords", () => {
      const raw =
        "Documentation officielle et sources fiables à jour sur l'API Gemini Live vocale : " +
        "noms des packages, endpoints WebSocket, méthodes.";
      const out = condenseSearchQuery(raw);
      // Garde seulement la première idée (coupe au ":").
      assert.ok(!out.includes("websocket"), "ne garde que la première phrase");
      // Retire les mots vides FR.
      assert.ok(!/\b(et|sur|la|les|des|à)\b/.test(out), `stopwords retirés: "${out}"`);
      // Conserve les termes significatifs.
      assert.match(out, /gemini/);
      assert.match(out, /api/);
      // Borne le nombre de termes.
      assert.ok(out.split(/\s+/).length <= 12, "au plus 12 termes");
    });

    it("preserves versioned identifiers like gemini-3.1", () => {
      const out = condenseSearchQuery("quelle est la dernière version de gemini-3.1-flash-live-preview");
      assert.match(out, /gemini-3\.1-flash-live-preview/);
    });

    it("supports a tighter term cap", () => {
      const out = condenseSearchQuery("alpha beta gamma delta epsilon zeta eta theta", 3);
      assert.equal(out.split(/\s+/).length, 3);
    });

    it("falls back to a prefix when everything is a stopword", () => {
      const out = condenseSearchQuery("the a an and or of to");
      assert.ok(out.length > 0, "ne renvoie jamais une chaîne vide");
    });
  });

  describe("Skill declaration", () => {
    it("should have the correct skill name", () => {
      assert.strictEqual(browserSkill.name, "browser");
    });

    it("should declare all browser tools", () => {
      const expectedTools = [
        "browser_navigate",
        "browser_open",
        "browser_search",
        "browser_close",
        "browser_scroll",
        "browser_back",
        "browser_forward",
        "browser_reload",
        "browser_read_content",
        "browser_get_links",
        "browser_open_link",
        "browser_click",
        "browser_type",
        "browser_snapshot",
        "browser_inspect",
        "browser_summarize_page",
        "browser_research",
        "browser_web_search",
        "browser_get_console",
        "browser_capture",
        "browser_new_tab",
        "browser_get_accessibility_snapshot",
        "browser_click_by_role",
        "browser_type_by_label",
        "browser_wait_for",
        "browser_get_element_text",
        "browser_get_element_attribute",
        "browser_fill_form",
        "browser_select_option",
      ];

      const declaredNames = browserSkill.declarations.map((d) => d.name);

      for (const tool of expectedTools) {
        assert.ok(
          declaredNames.includes(tool),
          `Tool ${tool} should be declared`
        );
      }

      assert.strictEqual(
        declaredNames.length,
        expectedTools.length,
        "Should have exactly the expected number of tools"
      );
    });

    it("should have descriptions for all declarations", () => {
      for (const decl of browserSkill.declarations) {
        assert.ok(decl.description, `${decl.name} should have a description`);
        assert.ok(
          decl.description.length > 20,
          `${decl.name} description should be meaningful`
        );
      }
    });

    it("should have parameters for all declarations", () => {
      for (const decl of browserSkill.declarations) {
        assert.ok(decl.parameters, `${decl.name} should have parameters`);
        assert.strictEqual(
          decl.parameters.type,
          "OBJECT",
          `${decl.name} parameters should be of type OBJECT`
        );
      }
    });
  });

  describe("Input schemas", () => {
    it("should have input schemas for all tools", () => {
      assert.ok(browserSkill.inputSchemas);

      const schemaKeys = Object.keys(browserSkill.inputSchemas);
      const declaredNames = browserSkill.declarations.map((d) => d.name);

      for (const toolName of declaredNames) {
        assert.ok(
          schemaKeys.includes(toolName),
          `Input schema for ${toolName} should exist`
        );
      }
    });

    describe("browser_navigate schema", () => {
      it("should validate url parameter", () => {
        const schema = browserSkill.inputSchemas!["browser_navigate"];
        assert.ok(schema);

        const validResult = schema.safeParse({
          url: "https://example.com",
        });
        assert.ok(validResult.success);
      });

      it("should reject empty url", () => {
        const schema = browserSkill.inputSchemas!["browser_navigate"];

        const invalidResult = schema.safeParse({
          url: "",
        });
        assert.ok(!invalidResult.success);
      });

      it("should require url parameter", () => {
        const schema = browserSkill.inputSchemas!["browser_navigate"];

        const invalidResult = schema.safeParse({});
        assert.ok(!invalidResult.success);
      });
    });

    describe("browser_search schema", () => {
      it("should validate search query", () => {
        const schema = browserSkill.inputSchemas!["browser_search"];

        const validResult = schema.safeParse({
          query: "test search",
          engine: "google",
        });
        assert.ok(validResult.success);
      });

      it("should accept all search engines", () => {
        const schema = browserSkill.inputSchemas!["browser_search"];
        const engines = ["google", "bing", "duckduckgo", "wikipedia"];

        for (const engine of engines) {
          const result = schema.safeParse({
            query: "test",
            engine,
          });
          assert.ok(
            result.success,
            `Engine ${engine} should be accepted`
          );
        }
      });

      it("should reject invalid search engine", () => {
        const schema = browserSkill.inputSchemas!["browser_search"];

        const invalidResult = schema.safeParse({
          query: "test",
          engine: "invalid",
        });
        assert.ok(!invalidResult.success);
      });

      it("should default to bing engine (Google n'est pas chargeable en webview)", () => {
        const schema = browserSkill.inputSchemas!["browser_search"];

        const result = schema.parse({
          query: "test",
        });
        assert.strictEqual(result.engine, "bing");
      });
    });

    describe("browser_scroll schema", () => {
      it("should validate scroll parameters", () => {
        const schema = browserSkill.inputSchemas!["browser_scroll"];

        const validResult = schema.safeParse({
          direction: "down",
          amount: 300,
        });
        assert.ok(validResult.success);
      });

      it("should accept all directions", () => {
        const schema = browserSkill.inputSchemas!["browser_scroll"];
        const directions = ["down", "up", "top", "bottom"];

        for (const direction of directions) {
          const result = schema.safeParse({
            direction,
          });
          assert.ok(
            result.success,
            `Direction ${direction} should be accepted`
          );
        }
      });

      it("should default to down and 300px", () => {
        const schema = browserSkill.inputSchemas!["browser_scroll"];

        const result = schema.parse({});
        assert.strictEqual(result.direction, "down");
        assert.strictEqual(result.amount, 300);
      });

      it("should enforce max amount of 5000", () => {
        const schema = browserSkill.inputSchemas!["browser_scroll"];

        const invalidResult = schema.safeParse({
          amount: 6000,
        });
        assert.ok(!invalidResult.success);
      });
    });

    describe("browser_click schema", () => {
      it("should validate selector parameter", () => {
        const schema = browserSkill.inputSchemas!["browser_click"];

        const validResult = schema.safeParse({
          selector: "button#submit",
        });
        assert.ok(validResult.success);
      });

      it("should reject empty selector", () => {
        const schema = browserSkill.inputSchemas!["browser_click"];

        const invalidResult = schema.safeParse({
          selector: "",
        });
        assert.ok(!invalidResult.success);
      });
    });

    describe("browser_type schema", () => {
      it("should validate type parameters", () => {
        const schema = browserSkill.inputSchemas!["browser_type"];

        const validResult = schema.safeParse({
          selector: "input#search",
          text: "test query",
          pressEnter: true,
        });
        assert.ok(validResult.success);
      });

      it("should default pressEnter to false", () => {
        const schema = browserSkill.inputSchemas!["browser_type"];

        const result = schema.parse({
          selector: "input",
          text: "test",
        });
        assert.strictEqual(result.pressEnter, false);
      });

      it("should require selector and text", () => {
        const schema = browserSkill.inputSchemas!["browser_type"];

        const invalidResult = schema.safeParse({
          selector: "input",
        });
        assert.ok(!invalidResult.success);
      });
    });

    describe("browser_get_links schema", () => {
      it("should validate get_links parameters", () => {
        const schema = browserSkill.inputSchemas!["browser_get_links"];

        const validResult = schema.safeParse({
          selector: "#content",
          limit: 50,
        });
        assert.ok(validResult.success);
      });

      it("should default limit to 50", () => {
        const schema = browserSkill.inputSchemas!["browser_get_links"];

        const result = schema.parse({});
        assert.strictEqual(result.limit, 50);
      });

      it("should enforce max limit of 200", () => {
        const schema = browserSkill.inputSchemas!["browser_get_links"];

        const invalidResult = schema.safeParse({
          limit: 300,
        });
        assert.ok(!invalidResult.success);
      });
    });

    describe("browser_open_link schema", () => {
      it("should validate with text parameter", () => {
        const schema = browserSkill.inputSchemas!["browser_open_link"];

        const validResult = schema.safeParse({
          text: "Read more",
        });
        assert.ok(validResult.success);
      });

      it("should validate with urlContains parameter", () => {
        const schema = browserSkill.inputSchemas!["browser_open_link"];

        const validResult = schema.safeParse({
          urlContains: "wikipedia.org",
        });
        assert.ok(validResult.success);
      });

      it("should validate with both parameters", () => {
        const schema = browserSkill.inputSchemas!["browser_open_link"];

        const validResult = schema.safeParse({
          text: "Read more",
          urlContains: "example.com",
        });
        assert.ok(validResult.success);
      });

      it("should reject when both parameters are empty", () => {
        const schema = browserSkill.inputSchemas!["browser_open_link"];

        const invalidResult = schema.safeParse({
          text: "",
          urlContains: "",
        });
        assert.ok(!invalidResult.success);
      });
    });

    describe("browser_research schema", () => {
      it("should validate research parameters", () => {
        const schema = browserSkill.inputSchemas!["browser_research"];

        const validResult = schema.safeParse({
          query: "AI research",
          engine: "google",
          maxSources: 3,
        });
        assert.ok(validResult.success);
      });

      it("should default engine to bing and maxSources to 3", () => {
        const schema = browserSkill.inputSchemas!["browser_research"];

        const result = schema.parse({
          query: "test",
        });
        assert.strictEqual(result.engine, "bing");
        assert.strictEqual(result.maxSources, 3);
      });

      it("should enforce max maxSources of 5", () => {
        const schema = browserSkill.inputSchemas!["browser_research"];

        const invalidResult = schema.safeParse({
          query: "test",
          maxSources: 10,
        });
        assert.ok(!invalidResult.success);
      });
    });

    describe("browser_inspect schema", () => {
      it("should validate inspect type", () => {
        const schema = browserSkill.inputSchemas!["browser_inspect"];

        const types = ["buttons", "inputs", "links", "all"];
        for (const type of types) {
          const result = schema.safeParse({ type });
          assert.ok(result.success, `Type ${type} should be valid`);
        }
      });

      it("should default to all", () => {
        const schema = browserSkill.inputSchemas!["browser_inspect"];

        const result = schema.parse({});
        assert.strictEqual(result.type, "all");
      });
    });

    describe("Accessibility schemas (Sprint 1 - J1)", () => {
      it("should validate browser_click_by_role schema", () => {
        const schema = browserSkill.inputSchemas!["browser_click_by_role"];

        const validResult = schema.safeParse({
          role: "button",
          name: "Submit",
          waitFor: "#results",
        });
        assert.ok(validResult.success);
      });

      it("should validate browser_type_by_label schema", () => {
        const schema = browserSkill.inputSchemas!["browser_type_by_label"];

        const validResult = schema.safeParse({
          label: "Email",
          text: "user@example.com",
          pressEnter: false,
        });
        assert.ok(validResult.success);
      });

      it("should default pressEnter to false in type_by_label", () => {
        const schema = browserSkill.inputSchemas!["browser_type_by_label"];

        const result = schema.parse({
          label: "Email",
          text: "test",
        });
        assert.strictEqual(result.pressEnter, false);
      });
    });

    describe("Robustness schemas (Sprint 1 - J2)", () => {
      it("should validate browser_wait_for schema", () => {
        const schema = browserSkill.inputSchemas!["browser_wait_for"];

        const validResult = schema.safeParse({
          condition: "#results",
          conditionType: "selector",
          timeout: 10000,
        });
        assert.ok(validResult.success);
      });

      it("should default to selector type and 10s timeout", () => {
        const schema = browserSkill.inputSchemas!["browser_wait_for"];

        const result = schema.parse({
          condition: "test",
        });
        assert.strictEqual(result.conditionType, "selector");
        assert.strictEqual(result.timeout, 10000);
      });

      it("should enforce max timeout of 30000ms", () => {
        const schema = browserSkill.inputSchemas!["browser_wait_for"];

        const invalidResult = schema.safeParse({
          condition: "test",
          timeout: 50000,
        });
        assert.ok(!invalidResult.success);
      });

      it("should validate all conditionTypes", () => {
        const schema = browserSkill.inputSchemas!["browser_wait_for"];
        const types = ["selector", "text", "url"];

        for (const conditionType of types) {
          const result = schema.safeParse({
            condition: "test",
            conditionType,
          });
          assert.ok(
            result.success,
            `ConditionType ${conditionType} should be valid`
          );
        }
      });
    });

    describe("Primitive actions schemas (Sprint 1 - J3)", () => {
      it("should validate browser_get_element_text schema", () => {
        const schema = browserSkill.inputSchemas!["browser_get_element_text"];

        const validResult = schema.safeParse({
          selector: "#error-msg",
        });
        assert.ok(validResult.success);
      });

      it("should validate browser_get_element_attribute schema", () => {
        const schema = browserSkill.inputSchemas!["browser_get_element_attribute"];

        const validResult = schema.safeParse({
          selector: "a.link",
          attribute: "href",
        });
        assert.ok(validResult.success);
      });

      it("should validate browser_fill_form schema", () => {
        const schema = browserSkill.inputSchemas!["browser_fill_form"];

        const validResult = schema.safeParse({
          selector: "input#email",
          value: "test@example.com",
          waitFor: ".success",
        });
        assert.ok(validResult.success);
      });

      it("should validate browser_select_option schema", () => {
        const schema = browserSkill.inputSchemas!["browser_select_option"];

        const validResult = schema.safeParse({
          selector: "select#country",
          value: "US",
        });
        assert.ok(validResult.success);
      });
    });
  });

  describe("handleToolCall", () => {
    it("should be a function", () => {
      assert.strictEqual(typeof browserSkill.handleToolCall, "function");
    });

    it("should return error for unknown tool", async () => {
      const result = await browserSkill.handleToolCall(
        "unknown_tool",
        {},
        undefined
      );

      assert.ok(result.status === "error" || result.error);
      if (result.message) {
        assert.ok(result.message.includes("inconnu") || result.message.includes("unknown"));
      }
    });

    describe("Actions without emitIdeAction", () => {
      it("should return error for browser_navigate without emit", async () => {
        const result = await browserSkill.handleToolCall(
          "browser_navigate",
          { url: "https://example.com" },
          undefined
        );

        assert.strictEqual(result.status, "error");
        assert.ok(result.message);
      });

      it("should return error for browser_open without emit", async () => {
        const result = await browserSkill.handleToolCall(
          "browser_open",
          {},
          undefined
        );

        assert.strictEqual(result.status, "error");
        assert.ok(result.message);
      });

      it("should return error for browser_search without emit", async () => {
        const result = await browserSkill.handleToolCall(
          "browser_search",
          { query: "test" },
          undefined
        );

        assert.strictEqual(result.status, "error");
        assert.ok(result.message);
      });
    });

    describe("Empty schemas", () => {
      const emptySchemaTools = [
        "browser_open",
        "browser_close",
        "browser_back",
        "browser_forward",
        "browser_reload",
        "browser_snapshot",
        "browser_get_accessibility_snapshot",
      ];

      for (const tool of emptySchemaTools) {
        it(`should validate empty args for ${tool}`, () => {
          const schema = browserSkill.inputSchemas![tool];
          const result = schema.safeParse({});
          assert.ok(result.success, `${tool} should accept empty args`);
        });
      }
    });
  });

  describe("Schema consistency", () => {
    it("all tools should have matching schemas", () => {
      const declaredNames = browserSkill.declarations.map((d) => d.name);
      const schemaNames = Object.keys(browserSkill.inputSchemas!);

      assert.deepStrictEqual(
        declaredNames.sort(),
        schemaNames.sort(),
        "Declaration names and schema names should match"
      );
    });

    it("all required parameters should be enforced", () => {
      const toolsWithRequiredParams = [
        { name: "browser_navigate", required: ["url"] },
        { name: "browser_search", required: ["query"] },
        { name: "browser_click", required: ["selector"] },
        { name: "browser_type", required: ["selector", "text"] },
        { name: "browser_summarize_page", required: ["url"] },
        { name: "browser_research", required: ["query"] },
        { name: "browser_click_by_role", required: ["role", "name"] },
        { name: "browser_type_by_label", required: ["label", "text"] },
        { name: "browser_wait_for", required: ["condition"] },
        { name: "browser_get_element_text", required: ["selector"] },
        { name: "browser_get_element_attribute", required: ["selector", "attribute"] },
        { name: "browser_fill_form", required: ["selector", "value"] },
        { name: "browser_select_option", required: ["selector", "value"] },
      ];

      for (const { name, required } of toolsWithRequiredParams) {
        const schema = browserSkill.inputSchemas![name];
        const invalidResult = schema.safeParse({});

        // Should fail when required params are missing
        if (required.length > 0) {
          assert.ok(
            !invalidResult.success,
            `${name} should require parameters: ${required.join(", ")}`
          );
        }
      }
    });
  });

  describe("classifyHost (SSRF policy)", () => {
    it("treats legitimate domains starting with fc/fd/fe8… as public web", () => {
      // Ces domaines commencent par des préfixes IPv6 mais ne sont PAS des IP.
      for (const host of ["fedex.com", "fda.gov", "fcc.gov", "feedly.com", "fdhosting.com"]) {
        assert.equal(classifyHost(host), "PUBLIC_WEB", `${host} doit être PUBLIC_WEB`);
      }
    });

    it("classifies ordinary public domains and subdomains as public web", () => {
      for (const host of ["example.com", "docs.google.com", "developers.google.com"]) {
        assert.equal(classifyHost(host), "PUBLIC_WEB");
      }
    });

    it("blocks loopback, private, and link-local IPv4", () => {
      assert.equal(classifyHost("127.0.0.1"), "LOOPBACK");
      assert.equal(classifyHost("10.0.0.1"), "PRIVATE_NETWORK");
      assert.equal(classifyHost("192.168.1.10"), "PRIVATE_NETWORK");
      assert.equal(classifyHost("172.16.0.1"), "PRIVATE_NETWORK");
      assert.equal(classifyHost("169.254.169.254"), "LINK_LOCAL");
    });

    it("blocks IPv6 loopback, ULA and link-local, with or without brackets", () => {
      assert.equal(classifyHost("::1"), "LOOPBACK");
      assert.equal(classifyHost("[::1]"), "LOOPBACK");
      assert.equal(classifyHost("fd00::1"), "PRIVATE_NETWORK");
      assert.equal(classifyHost("[fd00::1]"), "PRIVATE_NETWORK");
      assert.equal(classifyHost("fe80::1"), "LINK_LOCAL");
      assert.equal(classifyHost("[fe80::1]"), "LINK_LOCAL");
    });

    it("blocks IPv4-mapped IPv6 loopback (SSRF bypass)", () => {
      assert.equal(classifyHost("[::ffff:127.0.0.1]"), "LOOPBACK");
      assert.equal(classifyHost("::ffff:127.0.0.1"), "LOOPBACK");
      assert.equal(classifyHost("[::ffff:7f00:1]"), "LOOPBACK");
    });

    it("rejects mapped-loopback and private hosts through normalizeUrl", () => {
      for (const url of [
        "http://[::ffff:127.0.0.1]/",
        "http://[fd00::1]/",
        "http://[fe80::1]/",
      ]) {
        assert.throws(() => normalizeUrl(url), /interdite|PRIVATE|LOOPBACK|LINK_LOCAL/);
      }
    });

    it("still allows legitimate fc/fd-prefixed domains through normalizeUrl", () => {
      assert.equal(normalizeUrl("https://fedex.com/track"), "https://fedex.com/track");
      assert.equal(normalizeUrl("https://feedly.com"), "https://feedly.com");
    });
  });

  describe("isSponsoredLink (precision)", () => {
    it("does not flag official sources containing 'pub'/'ads' as substrings", () => {
      assert.equal(isSponsoredLink("Service Public", "https://www.service-public.fr/"), false);
      assert.equal(isSponsoredLink("PubMed Central", "https://pubmed.ncbi.nlm.nih.gov/"), false);
      assert.equal(isSponsoredLink("Publications", "https://example.org/publications"), false);
      assert.equal(isSponsoredLink("Downloads", "https://example.org/downloads"), false);
    });

    it("flags explicit sponsored labels", () => {
      assert.equal(isSponsoredLink("Annonce sponsorisée", "https://ads.example.net/x"), true);
      assert.equal(isSponsoredLink("Sponsored", "https://example.net/x"), true);
      assert.equal(isSponsoredLink("Publicité", "https://example.net/x"), true);
    });

    it("flags links carrying ad tracking parameters", () => {
      assert.equal(isSponsoredLink("Résultat", "https://example.com/p?gclid=abc"), true);
      assert.equal(isSponsoredLink("Résultat", "https://example.com/p?utm_source=ad"), true);
    });
  });
});
