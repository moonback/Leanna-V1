/**
 * Tests du branchement « délégation sans cible → négociation contract-net ».
 *
 * Couvre :
 *  1. DelegationParser remonte les blocs sans CIBLE comme openDelegations.
 *  2. inferRequiredCapabilities déduit des capacités cohérentes du texte.
 *  3. DelegationDispatcher met les délégations ouvertes aux enchères et
 *     attribue au meilleur-match (via une vraie flotte d'agents).
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { DelegationParser } from "./DelegationParser.js";
import { inferRequiredCapabilities } from "./capabilityInference.js";
import { DelegationDispatcher } from "./DelegationDispatcher.js";
import { ContractNetNegotiator } from "./ContractNetNegotiator.js";
import { AgentMessageBus } from "./AgentMessageBus.js";
import { AutonomousAgent } from "./AutonomousAgent.js";
import type { AgentTask } from "./types.js";
import type { AgentTaskRunner } from "./AgentTaskRunner.js";
import type { AgentMessage, TaskRequestPayload } from "./AgentCommunication.js";

const stubRunner: AgentTaskRunner = {
  async execute(task: AgentTask): Promise<void> {
    task.status = "completed";
    task.result = { success: true, outcome: "success", summary: "stub", durationMs: 0 };
  },
};

function parentTask(): AgentTask {
  return {
    id: "parent-1",
    role: "architect",
    title: "Concevoir le module de paiement",
    description: "Mise en place du module de paiement",
    priority: "medium",
    status: "completed",
    context: { files: [] },
    createdAt: new Date().toISOString(),
  };
}

// ─── 1. Parser : blocs sans cible ─────────────────────────────────────────────

describe("DelegationParser — délégations ouvertes (sans cible)", () => {
  const parser = new DelegationParser();

  it("remonte un bloc sans CIBLE comme openDelegation au lieu de le jeter", () => {
    const text = [
      "## DÉLÉGATION",
      "RAISON: écrire des tests unitaires pour le module de paiement",
      "FICHIERS: src/payment.ts",
      "PRIORITÉ: high",
    ].join("\n");

    const result = parser.parse(text, "architect");

    assert.equal(result.delegations.length, 0, "pas de délégation ciblée");
    assert.equal(result.openDelegations.length, 1, "une délégation ouverte");
    assert.equal(result.openDelegations[0].priority, "high");
    assert.deepEqual(result.openDelegations[0].files, ["src/payment.ts"]);
    assert.match(result.openDelegations[0].reason, /tests unitaires/);
  });

  it("garde le routage ciblé quand la CIBLE est présente et autorisée", () => {
    // architect → coder est autorisé par DELEGATION_MATRIX.
    const text = [
      "## DÉLÉGATION",
      "CIBLE: coder",
      "RAISON: implémenter le module selon l'architecture",
    ].join("\n");

    const result = parser.parse(text, "architect");

    assert.equal(result.delegations.length, 1);
    assert.equal(result.openDelegations.length, 0);
    assert.equal(result.delegations[0].targetRole, "coder");
  });

  it("rejette (warning) un bloc sans CIBLE ni RAISON", () => {
    const text = ["## DÉLÉGATION", "FICHIERS: a.ts"].join("\n");
    const result = parser.parse(text, "architect");

    assert.equal(result.delegations.length, 0);
    assert.equal(result.openDelegations.length, 0);
    assert.ok(result.warnings.length > 0);
  });
});

// ─── 2. Heuristique de capacités ──────────────────────────────────────────────

describe("inferRequiredCapabilities", () => {
  it("déduit des capacités de test pour une tâche de tests", () => {
    const caps = inferRequiredCapabilities("écrire des tests unitaires et vérifier la couverture");
    assert.ok(caps.includes("run_project_command"));
    assert.ok(caps.includes("verify_full"));
  });

  it("déduit des capacités d'analyse pour une tâche d'architecture/impact", () => {
    const caps = inferRequiredCapabilities("analyser l'impact sur les dépendances et les entités du module");
    assert.ok(caps.includes("knowledge_search_entities"));
    assert.ok(caps.includes("knowledge_impact_analyze"));
  });

  it("retombe sur un socle générique quand rien ne matche (jamais vide)", () => {
    const caps = inferRequiredCapabilities("xyzzy blurp");
    assert.ok(caps.length > 0);
    assert.ok(caps.includes("read_project_file"));
  });
});

// ─── 3. Dispatcher : mise aux enchères end-to-end ─────────────────────────────

describe("DelegationDispatcher — négociation des délégations ouvertes", () => {
  let bus: AgentMessageBus;
  let negotiator: ContractNetNegotiator;
  let dispatcher: DelegationDispatcher;
  let agents: AutonomousAgent[];

  beforeEach(() => {
    bus = new AgentMessageBus();
    negotiator = new ContractNetNegotiator(bus, { biddingWindowMs: 60 });
    dispatcher = new DelegationDispatcher(negotiator);
  });

  afterEach(() => {
    for (const a of agents ?? []) a.stop();
  });

  it("met une délégation sans cible aux enchères et l'attribue au meilleur-match", async () => {
    agents = [
      new AutonomousAgent("tester", stubRunner, bus, { maxIterations: 1 }, negotiator),
      new AutonomousAgent("writer", stubRunner, bus, { maxIterations: 1 }, negotiator),
      new AutonomousAgent("researcher", stubRunner, bus, { maxIterations: 1 }, negotiator),
    ];
    for (const a of agents) a.start();

    // Capturer le task_request attribué au gagnant.
    let awardedRole: string | null = null;
    for (const role of ["tester", "writer", "researcher"]) {
      bus.subscribe(role, "task_request", async (msg: AgentMessage) => {
        const payload = msg.payload as TaskRequestPayload;
        if (payload.title.startsWith("[Enchère]")) awardedRole = msg.to as string;
      });
    }

    const text = [
      "## DÉLÉGATION",
      "RAISON: écrire des tests unitaires et vérifier la couverture du module",
      "FICHIERS: src/payment.ts",
    ].join("\n");

    const subTaskIds = await dispatcher.dispatchDelegations(parentTask(), text);

    // Capacités déduites (run_project_command + verify_full) → tester est le
    // meilleur-match. writer n'a aucune de ces capacités, researcher non plus.
    assert.equal(subTaskIds.length, 1, "une sous-tâche attribuée");
    assert.equal(awardedRole, "tester", "le meilleur-match (tester) remporte l'enchère");
  });

  it("ne retourne aucune sous-tâche si aucun agent éligible n'est en ligne", async () => {
    // Seul writer est en ligne ; il ne couvre pas les capacités de test.
    agents = [new AutonomousAgent("writer", stubRunner, bus, { maxIterations: 1 }, negotiator)];
    for (const a of agents) a.start();

    const text = [
      "## DÉLÉGATION",
      "RAISON: écrire des tests unitaires et vérifier la couverture",
    ].join("\n");

    const subTaskIds = await dispatcher.dispatchDelegations(parentTask(), text);
    assert.equal(subTaskIds.length, 0, "pas de gagnant → aucune sous-tâche");
  });
});
