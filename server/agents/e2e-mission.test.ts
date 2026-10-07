/**
 * e2e-mission.test.ts — Phase 13/20 : Test d'intégration end-to-end autonome.
 *
 * Ce test démontre qu'un agent Leanna peut :
 *   1. Recevoir un objectif de mission
 *   2. Planifier (PLAN)
 *   3. Agir  — détecter une erreur TypeScript, localiser, corriger (ACT)
 *   4. Observer le résultat (OBSERVE)
 *   5. Vérifier de façon indépendante (VERIFY)
 *   6. Récupérer sur échec (RECOVER → REPLAN → ACT → VERIFY)
 *   7. Terminer avec un rapport structuré (COMPLETE)
 *
 * La chaîne exercée est réelle et sans réseau :
 *   AgentRuntime.run → plan (fake LLM) → execute (fake LLM → tool_calls)
 *   → ToolRegistry.call (fake fs) → WorkspaceState (SHA-256)
 *   → verify_file → recordVerification → (SUCCESS | RECOVER) → finish
 *
 * Le modèle LLM est remplacé par un modèle scripté déterministe (scriptedModel),
 * identique à celui utilisé dans mission-harness.test.ts. Aucune clé API requise.
 *
 * Format du rapport final :
 *   { mission, status, steps, agentsUsed, toolsUsed, retries, verificationPassed, humanInterventionRequired }
 */

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "crypto";

import { ToolRegistry } from "../runtime/ToolRegistry.js";
import { PermissionPolicy } from "../runtime/PermissionPolicy.js";
import { EventBus } from "../runtime/EventBus.js";
import { dynamicAgentRegistry } from "./DynamicAgentRegistry.js";
import type { VerificationRecord } from "./WorkspaceState.js";
import { AgenticRuntime, type GenerateTextFn } from "../runtime/agentic/index.js";

// ── Helpers ─────────────────────────────────────────────────────────────────

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

/** Réponse d'un "modèle" déterministe. */
function reply(text: string): Awaited<ReturnType<GenerateTextFn>> {
  return {
    text,
    provider: "gemini",
    model: "fake-e2e",
    tokenUsage: { inputTokens: 50, outputTokens: 30, totalTokens: 80 },
  };
}

/** Indique si le prompt est une demande de PLAN. */
const isPlanPrompt = (p: string) => /produis un plan|Analyse l'intention/i.test(p);
/** Indique si le prompt est une demande de synthèse FINALE. */
const isFinalPrompt = (p: string) => /synthèse finale/i.test(p);

const PLAN_JSON = JSON.stringify({
  intent: "Corriger l'erreur TypeScript dans src/broken.ts",
  successCriteria: ["verify_file passe sans erreur TypeScript"],
  rationale: "Remplacer la valeur numérique par une chaîne de caractères",
  steps: [
    {
      description: "Lire le fichier cassé",
      suggestedTools: ["read_project_file"],
      verification: "contenu lu",
    },
    {
      description: "Corriger le typage",
      suggestedTools: ["modify_project_file", "verify_file"],
      verification: "verify_file OK",
    },
  ],
});

const FINAL_JSON = JSON.stringify({
  summary: "Erreur de type corrigée",
  details: "Remplacement de 42 par '42' dans src/broken.ts",
  deliverables: ["src/broken.ts"],
  suggestions: [],
});

/** Encode un appel d'outil au format attendu par le runtime. */
const toolCall = (name: string, params: Record<string, unknown>) =>
  JSON.stringify({ tool_calls: [{ name, parameters: params }] });

// ── Fake FileSystem + ToolRegistry ──────────────────────────────────────────

interface FakeFs {
  content: Map<string, string>;
  isFixed: (content: string) => boolean;
}

function makeRegistry(fs: FakeFs) {
  const registry = new ToolRegistry({
    permissionPolicy: new PermissionPolicy({ mode: "off" }),
  });

  const writes: Array<{ path: string; content: string }> = [];

  registry.register({
    declaration: { name: "read_project_file", description: "lit un fichier", parameters: { path: "string" } },
    handler: async (a) => ({
      content: fs.content.get(String(a.path)) ?? "(fichier vide)",
      status: "success",
    }),
    permissions: ["read"],
  });

  registry.register({
    declaration: { name: "modify_project_file", description: "modifie un fichier", parameters: { path: "string", content: "string" } },
    handler: async (a) => {
      const path = String(a.path);
      const content = String(a.content ?? "");
      fs.content.set(path, content);
      writes.push({ path, content });
      return { ok: true, status: "success" };
    },
    permissions: ["write"],
  });

  registry.register({
    declaration: { name: "verify_file", description: "vérifie un fichier", parameters: { path: "string" } },
    handler: async (a) => {
      const path = String(a.path);
      const content = fs.content.get(path) ?? "";
      const h = sha(content);
      const ok = fs.isFixed(content);
      const issues = ok
        ? []
        : [{ type: "typecheck", file: path, line: 1, column: 14, severity: "error" as const, rule: "TS2322", message: "Type 'number' is not assignable to type 'string'." }];
      const record: VerificationRecord = {
        file: path,
        contentHash: h,
        hashBefore: h,
        hashAfter: h,
        verifiedAt: new Date().toISOString(),
        ok,
        status: ok ? "success" : "failed",
        issues,
        allIssues: issues,
      };
      return { status: ok ? "success" : "failed", ok, fileChanged: true, verificationRecord: record };
    },
    permissions: ["read"],
  });

  return { registry, writes };
}

function registerTestAgent(role: string): void {
  dynamicAgentRegistry.registerAgent(
    {
      role,
      name: `E2E Test ${role}`,
      description: "Agent de test e2e",
      capabilities: ["read_project_file", "modify_project_file", "verify_file"],
      systemPrompt: "Tu es un agent de test e2e. Exécute les étapes du plan.",
      maxConcurrency: 1,
      defaultTimeoutMs: 30_000,
    },
    true // force override
  );
}

/**
 * Construit un modèle déterministe scriptant la séquence :
 *   PLAN → exécution1 → exécution2 → … → FINAL
 */
function scriptedModel(executionSteps: string[]): GenerateTextFn {
  let stepIdx = 0;
  return (async (opts: { prompt: string; systemPrompt?: string }) => {
    if (isPlanPrompt(opts.prompt)) return reply(PLAN_JSON);
    if (isFinalPrompt(opts.prompt)) return reply(FINAL_JSON);
    const next = stepIdx < executionSteps.length ? executionSteps[stepIdx] : "";
    stepIdx++;
    return reply(next);
  }) as GenerateTextFn;
}

// ── Scénarios ────────────────────────────────────────────────────────────────

describe("E2E Mission — Autonomous Fix Loop", () => {
  const BROKEN_CONTENT = "const x: string = 42; // TS2322";
  const FIXED_CONTENT = "const x: string = '42';";

  // Enregistrer l'agent de test avant les tests
  before(() => {
    registerTestAgent("coder");
  });

  // ─── Scénario A : Succès direct (read → fix → verify OK) ─────────────────

  it("A — SUCCESS: lit, corrige, vérifie (1 boucle)", async () => {
    const fs: FakeFs = {
      content: new Map([["src/broken.ts", BROKEN_CONTENT]]),
      isFixed: (c) => c === FIXED_CONTENT,
    };
    const { registry, writes } = makeRegistry(fs);

    const model = scriptedModel([
      // Étape 1 : lire
      toolCall("read_project_file", { path: "src/broken.ts" }),
      // Étape 2 : corriger
      toolCall("modify_project_file", { path: "src/broken.ts", content: FIXED_CONTENT }),
      // Réponse finale
      "Terminé.",
    ]);

    const runtime = new AgenticRuntime({ registry, events: new EventBus(), model, budget: { maxRead: 5, maxWrite: 3, maxVerify: 3, maxRecovery: 2, maxPlan: 2, maxIterations: 10, maxFilesRead: 10, maxExecutionTimeMs: 30_000, maxCost: Infinity } });

    const result = await runtime.run({
      id: "e2e-test-A",
      role: "coder" as any,
      goal: "Corriger l'erreur TypeScript dans src/broken.ts",
      files: ["src/broken.ts"],
    });

    // Rapport structuré
    const report = {
      mission: "Corriger l'erreur TypeScript dans src/broken.ts",
      status: result.outcome,
      steps: result.plan?.steps.length ?? 0,
      agentsUsed: ["coder"],
      toolsUsed: result.toolsExecuted,
      retries: result.recoveries.length,
      verificationPassed: result.verifications.some(v => v.passed),
      humanInterventionRequired: false,
    };

    console.log("[E2E] Rapport mission A:", JSON.stringify(report, null, 2));

    assert.ok(
      result.outcome === "success" || result.outcome === "partial",
      `Outcome inattendu: ${result.outcome} — erreur: ${result.error ?? "n/a"}`
    );
    assert.ok(writes.length > 0, "Aucune écriture n'a eu lieu");
    assert.strictEqual(fs.content.get("src/broken.ts"), FIXED_CONTENT, "Fichier non corrigé");
    assert.ok(!report.humanInterventionRequired, "Intervention humaine requise non attendue");
  });

  // ─── Scénario B : Récupération (fix incorrect → repair → fix correct) ────

  it("B — RECOVERY: premier patch incorrect → repair → second patch correct", async () => {
    const WRONG_FIX = "const x: string = 43; // toujours faux";

    const fs: FakeFs = {
      content: new Map([["src/broken.ts", BROKEN_CONTENT]]),
      isFixed: (c) => c === FIXED_CONTENT,
    };
    const { registry, writes } = makeRegistry(fs);

    const model = scriptedModel([
      // Tentative 1 : mauvais fix
      toolCall("modify_project_file", { path: "src/broken.ts", content: WRONG_FIX }),
      // Tentative 2 : bon fix après échec de vérification
      toolCall("modify_project_file", { path: "src/broken.ts", content: FIXED_CONTENT }),
      "Terminé.",
    ]);

    const runtime = new AgenticRuntime({
      registry,
      events: new EventBus(),
      model,
      budget: { maxRead: 5, maxWrite: 5, maxVerify: 5, maxRecovery: 4, maxPlan: 2, maxIterations: 15, maxFilesRead: 10, maxExecutionTimeMs: 30_000, maxCost: Infinity },
    });

    const result = await runtime.run({
      id: "e2e-test-B",
      role: "coder" as any,
      goal: "Corriger l'erreur TypeScript dans src/broken.ts",
      files: ["src/broken.ts"],
    });

    const report = {
      mission: "Corriger l'erreur TypeScript dans src/broken.ts",
      status: result.outcome,
      steps: result.plan?.steps.length ?? 0,
      agentsUsed: ["coder"],
      toolsUsed: result.toolsExecuted,
      retries: result.recoveries.length,
      verificationPassed: result.verifications.some(v => v.passed),
      humanInterventionRequired: false,
    };

    console.log("[E2E] Rapport mission B:", JSON.stringify(report, null, 2));

    // Le rapport doit montrer qu'une récupération a eu lieu
    assert.ok(writes.length >= 2, `Attendu au moins 2 écritures (wrong+fix), obtenu ${writes.length}`);
    assert.ok(report.retries >= 1, `Le compteur de récupérations doit être >= 1, obtenu ${report.retries}`);
    // Le fichier final doit être correct (après le second fix)
    assert.strictEqual(fs.content.get("src/broken.ts"), FIXED_CONTENT, "Fichier non corrigé après recovery");
  });

  // ─── Scénario C : Budget épuisé — arrêt propre ───────────────────────────

  it("C — BUDGET: arrêt propre quand le budget est dépassé, sans boucle infinie", async () => {
    const fs: FakeFs = {
      content: new Map([["src/broken.ts", BROKEN_CONTENT]]),
      isFixed: () => false, // jamais corrigé
    };
    const { registry } = makeRegistry(fs);

    // Budget minimal — 1 seul appel en tout
    const model = scriptedModel([
      toolCall("modify_project_file", { path: "src/broken.ts", content: "toujours cassé" }),
      "Terminé.",
    ]);

    const runtime = new AgenticRuntime({
      registry,
      events: new EventBus(),
      model,
      budget: {
        maxRead: 1, maxWrite: 1, maxVerify: 1, maxRecovery: 0,
        maxPlan: 1, maxIterations: 3, maxFilesRead: 5,
        maxExecutionTimeMs: 10_000, maxCost: Infinity,
      },
    });

    const start = Date.now();
    const result = await runtime.run({
      id: "e2e-test-C",
      role: "coder" as any,
      goal: "Corriger src/broken.ts (budget minimal)",
    });
    const elapsed = Date.now() - start;

    console.log(`[E2E] Mission C terminée en ${elapsed}ms, outcome=${result.outcome}`);

    // Le runtime ne doit jamais boucler indéfiniment
    assert.ok(elapsed < 10_000, `Timeout dépassé : ${elapsed}ms`);
    // L'outcome doit être déterminé (success, partial, failed, no_change — jamais indéfini)
    assert.ok(
      ["success", "partial", "failed", "no_change", "blocked"].includes(result.outcome),
      `Outcome invalide : ${result.outcome}`
    );
  });

  // ─── Scénario D : Vérification indépendante ───────────────────────────────

  it("D — INDEPENDENT VERIFICATION: success !== outil retourné ok", async () => {
    // L'outil modify_project_file retourne ok:true mais le contenu écrit est toujours cassé.
    // Le runtime doit détecter l'échec via verify_file, pas via le retour de modify.

    const fs: FakeFs = {
      content: new Map([["src/broken.ts", BROKEN_CONTENT]]),
      isFixed: (c) => c === FIXED_CONTENT,
    };
    const { registry } = makeRegistry(fs);

    const model = scriptedModel([
      // L'agent écrit un contenu faux mais l'outil retourne ok:true
      toolCall("modify_project_file", { path: "src/broken.ts", content: "const x: string = 99; // encore faux" }),
      // Deuxième tentative : bon fix
      toolCall("modify_project_file", { path: "src/broken.ts", content: FIXED_CONTENT }),
      "Terminé.",
    ]);

    const runtime = new AgenticRuntime({
      registry,
      events: new EventBus(),
      model,
      budget: { maxRead: 3, maxWrite: 4, maxVerify: 4, maxRecovery: 3, maxPlan: 2, maxIterations: 10, maxFilesRead: 10, maxExecutionTimeMs: 30_000, maxCost: Infinity },
    });

    const result = await runtime.run({
      id: "e2e-test-D",
      role: "coder" as any,
      goal: "Corriger src/broken.ts et vérifier indépendamment",
      files: ["src/broken.ts"],
    });

    console.log(`[E2E] Mission D: outcome=${result.outcome}, verifications=${result.verifications.length}`);

    // Il doit y avoir eu au moins 1 vérification
    assert.ok(result.verifications.length >= 1, "Aucune vérification indépendante n'a eu lieu");
    // Le fichier final doit être correct (le runtime a récupéré de la vérification échouée)
    assert.strictEqual(
      fs.content.get("src/broken.ts"),
      FIXED_CONTENT,
      "La vérification indépendante n'a pas provoqué de correction"
    );
  });
});
