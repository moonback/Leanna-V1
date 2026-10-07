import test from "node:test";
import assert from "node:assert/strict";
import { parseEnv, getEnv, loadEnv, resetEnvCache } from "./env.js";

test("parseEnv accepts a valid configuration and returns a typed object", () => {
  const env = parseEnv({
    NODE_ENV: "production",
    VITE_SERVER_PORT: "4000",
    APP_URL: "https://example.com",
    SUPABASE_URL: "https://example.supabase.co",
    REDIS_URL: "redis://localhost:6379",
    LEANNA_SAFETY_GATE: "enforce",
    LEANNA_AUTONOMY_MODE: "auto",
    LOG_LEVEL: "info",
    ENABLE_CHAIN_OF_THOUGHT: "true",
    SANDBOX_EXIT_CODE: "123456",
  });
  assert.equal(env.NODE_ENV, "production");
  assert.equal(env.SUPABASE_URL, "https://example.supabase.co");
  assert.equal(env.LEANNA_SAFETY_GATE, "enforce");
});

test('parseEnv treats empty strings as undefined for optional values', () => {
  const env = parseEnv({ GEMINI_API_KEY: "", SUPABASE_URL: "" });
  assert.equal(env.GEMINI_API_KEY, undefined);
  assert.equal(env.SUPABASE_URL, undefined);
});

test("parseEnv rejects invalid URL, boolean, enum and integer values together", () => {
  assert.throws(
    () =>
      parseEnv({
        SUPABASE_URL: "not-a-url",
        ENABLE_CHAIN_OF_THOUGHT: "yes",
        LOG_LEVEL: "verbose",
        LEANNA_KNOWLEDGE_CACHE_TTL_SECONDS: "0",
        SANDBOX_EXIT_CODE: "123",
        REDIS_URL: "http://nope",
      }),
    (error: unknown) => {
      const text = String(error);
      assert.match(text, /SUPABASE_URL/);
      assert.match(text, /ENABLE_CHAIN_OF_THOUGHT/);
      assert.match(text, /LOG_LEVEL/);
      assert.match(text, /LEANNA_KNOWLEDGE_CACHE_TTL_SECONDS/);
      assert.match(text, /SANDBOX_EXIT_CODE/);
      assert.match(text, /REDIS_URL/);
      return true;
    },
  );
});

test("getEnv caches the parsed result until resetEnvCache is called", () => {
  resetEnvCache();
  const prev = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = "debug";
  try {
    const first = getEnv();
    assert.equal(first.LOG_LEVEL, "debug");

    // Mutating process.env does NOT change the cached value.
    process.env.LOG_LEVEL = "warn";
    assert.equal(getEnv().LOG_LEVEL, "debug");

    // After reset, a fresh parse reflects the new value.
    resetEnvCache();
    assert.equal(getEnv().LOG_LEVEL, "warn");
  } finally {
    if (prev === undefined) delete process.env.LOG_LEVEL;
    else process.env.LOG_LEVEL = prev;
    resetEnvCache();
  }
});

// JWT de test (role=service_role / role=anon). Signature factice, non vérifiée.
const SERVICE_ROLE_JWT =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." +
  Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url") +
  ".sig";
const ANON_JWT =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." +
  Buffer.from(JSON.stringify({ role: "anon" })).toString("base64url") +
  ".sig";

test("parseEnv rejects a service_role key used as a Supabase anon key", () => {
  assert.throws(
    () => parseEnv({ SUPABASE_ANON_KEY: SERVICE_ROLE_JWT }),
    (error: unknown) => {
      const text = String(error);
      assert.match(text, /SUPABASE_ANON_KEY/);
      assert.match(text, /service_role/);
      return true;
    },
  );
});

test("parseEnv rejects a service_role key in VITE_SUPABASE_ANON_KEY", () => {
  assert.throws(
    () => parseEnv({ VITE_SUPABASE_ANON_KEY: SERVICE_ROLE_JWT }),
    /VITE_SUPABASE_ANON_KEY/,
  );
});

test("parseEnv accepts a genuine anon key", () => {
  assert.doesNotThrow(() =>
    parseEnv({ SUPABASE_ANON_KEY: ANON_JWT, VITE_SUPABASE_ANON_KEY: ANON_JWT }),
  );
});

test("loadEnv validates and primes the cache", () => {
  resetEnvCache();
  const loaded = loadEnv({ NODE_ENV: "test", LOG_LEVEL: "error" });
  assert.equal(loaded.NODE_ENV, "test");
  assert.equal(getEnv().LOG_LEVEL, "error");
  resetEnvCache();
});
