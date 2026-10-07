/**
 * Tests unitaires — McpBridge.sanitizePathArgs() (version récursive + symlink-aware)
 *
 * Couvre :
 *   - Chemins valides dans SELF_ROOT (top-level)
 *   - Chemins valides dans SELF_ROOT (objets imbriqués, tableaux)
 *   - Rejet path traversal top-level
 *   - Rejet path traversal imbriqué dans un objet
 *   - Rejet path traversal dans un tableau d'objets
 *   - Clés non-path laissées intactes
 *   - Respect de la profondeur max (MAX_DEPTH = 8)
 *   - Valeurs non-string (null, number, boolean) ignorées
 *
 * Stratégie d'accès à la méthode privée :
 *   On dérive `TestableMcpBridge` qui expose `sanitizePathArgs` comme méthode
 *   publique. Aucune modification du code de production.
 */

import path from "path";
import { fileURLToPath } from "url";
import test from "node:test";
import assert from "node:assert/strict";
import { McpBridge } from "./McpBridge.js";
import { setSelfRoot, SELF_ROOT } from "../utils/selfRoot.js";

// ── SELF_ROOT bootstrap ───────────────────────────────────────────────────────
// mcpBridgeSanitize.test.ts lives in server/mcp/ → two levels up = project root
{
  const __filename_local = fileURLToPath(import.meta.url);
  setSelfRoot(path.resolve(path.dirname(__filename_local), "../.."));
}

// ── TestableMcpBridge ─────────────────────────────────────────────────────────
// Subclass that promotes the private method to public for unit testing.
// TypeScript allows this pattern: a subclass can redeclare a private member as
// public without modifying the parent class.
class TestableMcpBridge extends McpBridge {
  public async sanitizePathArgsPublic(
    args: Record<string, any>
  ): Promise<Record<string, any>> {
    // Access private method via bracket notation (TypeScript allows at runtime)
    return (this as any).sanitizePathArgs(args);
  }
}

const bridge = new TestableMcpBridge();

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Retourne un chemin absolu garantit dans SELF_ROOT */
function insideRoot(...parts: string[]) {
  return path.join(SELF_ROOT, ...parts);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Chemins valides — top-level
// ═══════════════════════════════════════════════════════════════════════════════

test("sanitizePathArgs: accepte un chemin valide dans SELF_ROOT (top-level)", async () => {
  const input = { path: insideRoot("package.json") };
  const output = await bridge.sanitizePathArgsPublic(input);
  assert.ok(
    (output["path"] as string).startsWith(SELF_ROOT),
    `Expected path inside SELF_ROOT, got: ${output["path"]}`
  );
});

test("sanitizePathArgs: laisse les clés non-path inchangées", async () => {
  const input = {
    path: insideRoot("package.json"),
    message: "hello",
    count: 42,
    enabled: true,
    nothing: null,
  };
  const output = await bridge.sanitizePathArgsPublic(input);
  assert.strictEqual(output["message"], "hello");
  assert.strictEqual(output["count"], 42);
  assert.strictEqual(output["enabled"], true);
  assert.strictEqual(output["nothing"], null);
});

// ═══════════════════════════════════════════════════════════════════════════════
// Chemins valides — récursion sur objets imbriqués et tableaux
// ═══════════════════════════════════════════════════════════════════════════════

test("sanitizePathArgs: valide un chemin dans un objet imbriqué", async () => {
  const input = {
    options: {
      outputPath: insideRoot("src", "main.tsx"),
    },
  };
  const output = await bridge.sanitizePathArgsPublic(input);
  const nested = (output["options"] as any)["outputPath"] as string;
  assert.ok(nested.startsWith(SELF_ROOT), `Nested path not inside SELF_ROOT: ${nested}`);
});

test("sanitizePathArgs: valide un chemin dans un tableau d'objets", async () => {
  const input = {
    files: [
      { path: insideRoot("package.json") },
      { path: insideRoot("server", "security.ts") },
    ],
  };
  const output = await bridge.sanitizePathArgsPublic(input);
  const arr = output["files"] as Array<{ path: string }>;
  assert.strictEqual(arr.length, 2);
  for (const item of arr) {
    assert.ok(item.path.startsWith(SELF_ROOT), `Path not inside SELF_ROOT: ${item.path}`);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// Rejet — path traversal
// ═══════════════════════════════════════════════════════════════════════════════

test("sanitizePathArgs: rejette un path traversal top-level", async () => {
  const input = { path: "/etc/passwd" };
  await assert.rejects(
    () => bridge.sanitizePathArgsPublic(input),
    (err: Error) => {
      assert.ok(
        err.message.includes("MCP Security"),
        `Unexpected message: ${err.message}`
      );
      return true;
    }
  );
});

test("sanitizePathArgs: rejette ../../../ top-level", async () => {
  const input = { filePath: "../../../etc/shadow" };
  await assert.rejects(
    () => bridge.sanitizePathArgsPublic(input),
    (err: Error) => {
      assert.ok(err.message.includes("MCP Security"), err.message);
      return true;
    }
  );
});

test("sanitizePathArgs: rejette un path traversal dans un objet imbriqué", async () => {
  const input = {
    config: {
      directory: "../../outside/secrets",
    },
  };
  await assert.rejects(
    () => bridge.sanitizePathArgsPublic(input),
    (err: Error) => {
      assert.ok(err.message.includes("MCP Security"), err.message);
      return true;
    }
  );
});

test("sanitizePathArgs: rejette un path traversal dans un tableau d'objets", async () => {
  const input = {
    items: [
      { source: insideRoot("src") },
      { source: "/etc/passwd" },           // chemin malicieux caché dans un tableau
    ],
  };
  await assert.rejects(
    () => bridge.sanitizePathArgsPublic(input),
    (err: Error) => {
      assert.ok(err.message.includes("MCP Security"), err.message);
      return true;
    }
  );
});

// ═══════════════════════════════════════════════════════════════════════════════
// Limites & cas limites
// ═══════════════════════════════════════════════════════════════════════════════

test("sanitizePathArgs: ignore les valeurs non-string dans les clés path", async () => {
  // path = 42 (nombre) — ne doit pas lever d'erreur
  const input = { path: 42, file: null, dir: undefined };
  const output = await bridge.sanitizePathArgsPublic(input as any);
  assert.strictEqual(output["path"], 42);
  assert.strictEqual(output["file"], null);
});

test("sanitizePathArgs: respecte la limite de profondeur MAX_DEPTH=8 sans erreur de stack overflow", async () => {
  // Construit un objet imbriqué à 10 niveaux (dépasse MAX_DEPTH de 8)
  let deep: any = { path: insideRoot("package.json") };
  for (let i = 0; i < 10; i++) {
    deep = { nested: deep };
  }
  // Ne doit pas lever ni provoquer de stack overflow — les niveaux > 8 sont retournés tels quels
  await assert.doesNotReject(() => bridge.sanitizePathArgsPublic(deep));
});

test("sanitizePathArgs: args vide retourné inchangé", async () => {
  const output = await bridge.sanitizePathArgsPublic({});
  assert.deepStrictEqual(output, {});
});
