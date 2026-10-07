/**
 * Tests unitaires — SkillWorker.ts
 *
 * Couvre :
 *   - Exécution réussie d'un plugin via le Worker
 *   - Enforcement du timeout (plugin qui boucle)
 *   - Capability enforcement côté main thread (appel d'outil non autorisé bloqué)
 *   - Plugin qui lève une exception (error message propagé)
 *   - Appel d'outil autorisé bridgé correctement via proxy
 *
 * NOTE : Ces tests créent de vrais Workers. Ils nécessitent Node.js >= 12 avec
 * `worker_threads` disponible. Ils s'exécutent via :
 *   node --import tsx --test server/runtime/skillWorker.test.ts
 */

import test from "node:test";
import assert from "node:assert/strict";
import * as os from "os";
import * as fs from "fs";
import * as path from "path";
import { runPluginInWorker } from "./SkillWorker.js";
import type { AgentContext, TaskResult } from "./types.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TMP_DIR = os.tmpdir();

/** Écrit un fichier .mjs temporaire qui exporte un AgentPlugin factice */
function writeTmpPlugin(filename: string, body: string): string {
  const filepath = path.join(TMP_DIR, filename);
  fs.writeFileSync(filepath, body, "utf-8");
  return filepath;
}

function fileUrl(p: string): string {
  return new URL(`file://${p}`).href;
}

const BASE_CONTEXT: AgentContext = {
  taskId: "task_test_01",
  title: "Test task",
  description: "Used by unit tests",
  files: [],
};

/**
 * ToolRegistry stub minimal utilisé dans les tests.
 * Reflète l'API réelle de ToolRegistry consommée par SkillWorker : has()
 * (présence) + call(name, args) (exécution, retourne directement le résultat).
 */
function makeToolRegistryStub(tools: Record<string, (args: any) => any> = {}): any {
  return {
    has: (name: string) => Object.prototype.hasOwnProperty.call(tools, name),
    call: (name: string, args: any) => {
      const fn = tools[name];
      if (!fn) return Promise.reject(new Error(`Outil "${name}" introuvable`));
      return Promise.resolve(fn(args));
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════════

test("SkillWorker: exécute un plugin simple et retourne son résultat", async () => {
  const pluginPath = writeTmpPlugin(
    "simple_success.mjs",
    `
export default {
  metadata: { id: "simple_success", name: "Simple Success", description: "ok", capabilities: [], maxConcurrency: 1, timeoutMs: 5000 },
  async execute(_ctx, _tools) {
    return { success: true, summary: "done", durationMs: 1 };
  }
};
`
  );

  const result: TaskResult = await runPluginInWorker(fileUrl(pluginPath), {
    context: BASE_CONTEXT,
    allowedCapabilities: [],
    tools: makeToolRegistryStub(),
    maxDurationMs: 5_000,
  });

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.summary, "done");
});

test("SkillWorker: timeout — rejette si le plugin dépasse maxDurationMs", async () => {
  const pluginPath = writeTmpPlugin(
    "infinite_loop.mjs",
    `
export default {
  metadata: { id: "infinite_loop", name: "Infinite Loop", description: "loops", capabilities: [], maxConcurrency: 1, timeoutMs: 5000 },
  async execute(_ctx, _tools) {
    // Simule un plugin bloquant
    await new Promise(() => {}); // jamais résolu
  }
};
`
  );

  await assert.rejects(
    () =>
      runPluginInWorker(fileUrl(pluginPath), {
        context: BASE_CONTEXT,
        allowedCapabilities: [],
        tools: makeToolRegistryStub(),
        maxDurationMs: 300, // timeout très court
      }),
    (err: Error) => {
      assert.ok(err.message.includes("Timeout") || err.message.includes("timeout"), err.message);
      return true;
    }
  );
});

test("SkillWorker: propagation d'erreur — le plugin qui throw retourne une erreur", async () => {
  const pluginPath = writeTmpPlugin(
    "throws_plugin.mjs",
    `
export default {
  metadata: { id: "throws_plugin", name: "Throws", description: "throws", capabilities: [], maxConcurrency: 1, timeoutMs: 5000 },
  async execute(_ctx, _tools) {
    throw new Error("Plugin internal error");
  }
};
`
  );

  await assert.rejects(
    () =>
      runPluginInWorker(fileUrl(pluginPath), {
        context: BASE_CONTEXT,
        allowedCapabilities: [],
        tools: makeToolRegistryStub(),
        maxDurationMs: 5_000,
      }),
    (err: Error) => {
      assert.ok(err.message.includes("Plugin internal error"), err.message);
      return true;
    }
  );
});

test("SkillWorker: capability enforcement — appel d'outil non autorisé est bloqué", async () => {
  const pluginPath = writeTmpPlugin(
    "unauthorized_tool.mjs",
    `
export default {
  metadata: { id: "unauthorized_tool", name: "Unauthorized", description: "tries forbidden tool", capabilities: ["read_file"], maxConcurrency: 1, timeoutMs: 5000 },
  async execute(_ctx, tools) {
    // Tente d'appeler un outil qui n'est PAS dans allowedCapabilities
    const result = await tools.call("rm_rf_everything", {});
    return { success: false, summary: "should not reach here", durationMs: 0 };
  }
};
`
  );

  // allowedCapabilities ne contient que "read_file" — "rm_rf_everything" doit être bloqué
  await assert.rejects(
    () =>
      runPluginInWorker(fileUrl(pluginPath), {
        context: BASE_CONTEXT,
        allowedCapabilities: ["read_file"],
        tools: makeToolRegistryStub({
          rm_rf_everything: () => ({ deleted: "everything" }),
        }),
        maxDurationMs: 5_000,
      }),
    (err: Error) => {
      assert.ok(
        err.message.includes("non autorisé") || err.message.includes("not allowed"),
        `Unexpected message: ${err.message}`
      );
      return true;
    }
  );
});

test("SkillWorker: capability enforcement — appel d'outil autorisé est bridgé correctement", async () => {
  const pluginPath = writeTmpPlugin(
    "authorized_tool.mjs",
    `
export default {
  metadata: { id: "authorized_tool", name: "Authorized", description: "calls allowed tool", capabilities: ["read_file"], maxConcurrency: 1, timeoutMs: 5000 },
  async execute(_ctx, tools) {
    const result = await tools.call("read_file", { path: "/some/path" });
    return { success: true, summary: String(result?.content ?? "no content"), durationMs: 1 };
  }
};
`
  );

  let toolWasCalled = false;

  const result: TaskResult = await runPluginInWorker(fileUrl(pluginPath), {
    context: BASE_CONTEXT,
    allowedCapabilities: ["read_file"],
    tools: makeToolRegistryStub({
      read_file: (_args: any) => {
        toolWasCalled = true;
        return { content: "hello from file" };
      },
    }),
    maxDurationMs: 5_000,
  });

  assert.ok(toolWasCalled, "Le ToolRegistry principal n'a pas été appelé");
  assert.strictEqual(result.success, true);
  assert.ok(result.summary.includes("hello from file"), result.summary);
});

test("SkillWorker: module invalide (pas d'export AgentPlugin) lève une erreur", async () => {
  const pluginPath = writeTmpPlugin(
    "no_export.mjs",
    `export const notAnAgent = 42;`
  );

  await assert.rejects(
    () =>
      runPluginInWorker(fileUrl(pluginPath), {
        context: BASE_CONTEXT,
        allowedCapabilities: [],
        tools: makeToolRegistryStub(),
        maxDurationMs: 5_000,
      }),
    (err: Error) => {
      assert.ok(
        err.message.includes("AgentPlugin") || err.message.includes("export"),
        `Unexpected message: ${err.message}`
      );
      return true;
    }
  );
});
