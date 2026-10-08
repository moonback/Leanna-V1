/**
 * Tests pour ContractNetNegotiator (Node test runner)
 *
 * Prouve le critère de vérification : lors d'un appel d'offres diffusé,
 * seul l'agent possédant la meilleure correspondance de compétences
 * remporte le marché et reçoit le task_request ciblé.
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { AgentMessageBus } from "./AgentMessageBus.js";
import { ContractNetNegotiator, type NegotiationTask } from "./ContractNetNegotiator.js";
import { AutonomousAgent } from "./AutonomousAgent.js";
import type { AgentTask } from "./types.js";
import type { AgentTaskRunner } from "./AgentTaskRunner.js";
import type { AgentMessage, TaskRequestPayload } from "./AgentCommunication.js";

/** Runner factice : marque la tâche terminée sans exécuter de vrai outil. */
const stubRunner: AgentTaskRunner = {
  async execute(task: AgentTask): Promise<void> {
    task.status = "completed";
    task.result = { success: true, outcome: "success", summary: "stub", durationMs: 0 };
  },
};

function makeTask(overrides: Partial<NegotiationTask> = {}): NegotiationTask {
  return {
    taskId: "task-fixed-id",
    title: "Écrire des tests unitaires",
    description: "Couvrir le module X avec des tests unitaires",
    requiredCapabilities: ["verify_full", "run_project_command"],
    ...overrides,
  };
}

describe("ContractNetNegotiator", () => {
  let bus: AgentMessageBus;
  let negotiator: ContractNetNegotiator;

  beforeEach(() => {
    bus = new AgentMessageBus();
    // Fenêtre d'enchères courte pour des tests rapides et déterministes.
    negotiator = new ContractNetNegotiator(bus, { biddingWindowMs: 20 });
  });

  it("attribue le marché au meilleur match de compétences", async () => {
    const task = makeTask();

    // Capturer le task_request publié vers le gagnant.
    const awardedTo: AgentRoleCapture = { role: null, taskId: null };
    bus.subscribe("tester", "task_request", async (msg: AgentMessage) => {
      const payload = msg.payload as TaskRequestPayload;
      awardedTo.role = msg.to as string;
      awardedTo.taskId = payload.taskId;
    });

    const promise = negotiator.negotiate(task, "architect");

    // Trois candidats soumettent des bids avec des skillMatch différents.
    negotiator.submitBid(task.taskId, { role: "tester", skillMatch: 1.0, confidence: 0.5, loadPenalty: 0.1 });
    negotiator.submitBid(task.taskId, { role: "coder", skillMatch: 0.5, confidence: 0.9, loadPenalty: 0.0 });
    negotiator.submitBid(task.taskId, { role: "writer", skillMatch: 0.0, confidence: 1.0, loadPenalty: 0.0 });

    const outcome = await promise;

    assert.equal(outcome.winner, "tester", "le meilleur skillMatch doit gagner");
    assert.equal(outcome.awarded, true, "un task_request doit être attribué");
    assert.equal(awardedTo.role, "tester", "le task_request doit cibler le gagnant");
    assert.equal(awardedTo.taskId, task.taskId);
  });

  it("disqualifie les bids sans aucune compétence requise (skillMatch === 0)", async () => {
    const task = makeTask();
    const promise = negotiator.negotiate(task, "architect");

    // Seul writer bid, mais il ne possède aucune des capacités requises.
    negotiator.submitBid(task.taskId, { role: "writer", skillMatch: 0, confidence: 1, loadPenalty: 0 });

    const outcome = await promise;

    assert.equal(outcome.winner, null, "aucun gagnant si tous les bids sont inéligibles");
    assert.equal(outcome.awarded, false);
    assert.equal(outcome.bids.length, 1);
    assert.equal(outcome.bids[0].eligible, false);
  });

  it("départage par confiance puis charge à skillMatch égal", async () => {
    const task = makeTask();
    const promise = negotiator.negotiate(task, "architect");

    // Même skillMatch : la confiance plus élevée l'emporte (poids conf > poids load).
    negotiator.submitBid(task.taskId, { role: "coder", skillMatch: 0.8, confidence: 0.9, loadPenalty: 0.2 });
    negotiator.submitBid(task.taskId, { role: "refactor", skillMatch: 0.8, confidence: 0.3, loadPenalty: 0.0 });

    const outcome = await promise;

    assert.equal(outcome.winner, "coder");
    assert.ok(outcome.bids[0].score > outcome.bids[1].score);
  });

  it("buildAutoBid dérive le skillMatch des capacités réelles de l'agent", () => {
    // tester possède verify_full et run_project_command → match parfait attendu.
    const task = makeTask({ requiredCapabilities: ["verify_full", "run_project_command"] });
    const bid = negotiator.buildAutoBid("tester", task);

    assert.ok(bid, "le bid doit être construit pour un rôle connu");
    assert.equal(bid!.skillMatch, 1, "tester couvre 100% des capacités requises");

    // writer ne possède aucune de ces capacités → skillMatch 0.
    const writerBid = negotiator.buildAutoBid("writer", task);
    assert.ok(writerBid);
    assert.equal(writerBid!.skillMatch, 0);

    // researcher expose knowledge_search_entities, que coder ne possède pas.
    const researchTask = makeTask({ requiredCapabilities: ["knowledge_search_entities", "knowledge_memory_list"] });
    assert.equal(negotiator.buildAutoBid("researcher", researchTask)!.skillMatch, 1);
    assert.ok(negotiator.buildAutoBid("coder", researchTask)!.skillMatch < 1);
  });

  it("retourne winner=null quand aucun bid n'est reçu", async () => {
    const outcome = await negotiator.negotiate(makeTask(), "architect");
    assert.equal(outcome.winner, null);
    assert.equal(outcome.awarded, false);
    assert.equal(outcome.bids.length, 0);
  });

  it("un match réel de bout en bout élit le meilleur spécialiste via autoBidFor", async () => {
    // researcher couvre 100% ; coder et writer ne couvrent pas knowledge_search_entities
    // ni knowledge_memory_list → match partiel ou nul.
    const task = makeTask({ requiredCapabilities: ["knowledge_search_entities", "knowledge_memory_list"] });

    let awarded: string | null = null;
    bus.subscribe("researcher", "task_request", async (msg: AgentMessage) => {
      awarded = msg.to as string;
    });

    const promise = negotiator.negotiate(task, "architect");
    negotiator.autoBidFor(["coder", "researcher", "writer"], task);
    const outcome = await promise;

    assert.equal(outcome.winner, "researcher");
    assert.equal(awarded, "researcher");
  });
});

// ─── Intégration : agents autonomes qui enchérissent automatiquement ──────────

describe("ContractNetNegotiator ↔ AutonomousAgent (auto-bid)", () => {
  let bus: AgentMessageBus;
  let negotiator: ContractNetNegotiator;
  let agents: AutonomousAgent[];

  beforeEach(() => {
    bus = new AgentMessageBus();
    negotiator = new ContractNetNegotiator(bus, { biddingWindowMs: 60 });
  });

  afterEach(() => {
    for (const a of agents ?? []) a.stop();
  });

  it("élit le meilleur spécialiste sans aucun submitBid manuel", async () => {
    // researcher couvre knowledge_search_entities + knowledge_memory_list à 100%.
    // coder/writer non → ils enchérissent moins ou pas du tout.
    agents = [
      new AutonomousAgent("researcher", stubRunner, bus, { maxIterations: 1 }, negotiator),
      new AutonomousAgent("coder", stubRunner, bus, { maxIterations: 1 }, negotiator),
      new AutonomousAgent("writer", stubRunner, bus, { maxIterations: 1 }, negotiator),
    ];
    for (const a of agents) a.start();

    const task: NegotiationTask = {
      taskId: "integration-task",
      title: "Analyse d'impact des dépendances",
      description: "Cartographier les entités et la mémoire projet",
      requiredCapabilities: ["knowledge_search_entities", "knowledge_memory_list"],
    };

    // L'initiateur est 'architect' (pas un des agents) → aucun biais.
    const outcome = await negotiator.negotiate(task, "architect");

    assert.equal(outcome.winner, "researcher", "le meilleur match de skill gagne");
    assert.equal(outcome.awarded, true);
    // writer (skillMatch 0) ne doit pas avoir enchéri.
    assert.ok(
      !outcome.bids.some((b) => b.role === "writer"),
      "un agent sans compétence requise ne soumet pas de bid"
    );
    // researcher doit figurer parmi les enchérisseurs et être éligible.
    const researcherBid = outcome.bids.find((b) => b.role === "researcher");
    assert.ok(researcherBid?.eligible);
  });

  it("permet à architect de concourir et gagner avec l'initiateur neutre par défaut", async () => {
    // architect couvre knowledge_search_entities + knowledge_impact_analyze ;
    // coder ne couvre ni l'un ni l'autre.
    agents = [
      new AutonomousAgent("architect", stubRunner, bus, { maxIterations: 1 }, negotiator),
      new AutonomousAgent("coder", stubRunner, bus, { maxIterations: 1 }, negotiator),
    ];
    for (const a of agents) a.start();

    const task: NegotiationTask = {
      taskId: "architect-task",
      title: "Concevoir le schéma de modules",
      description: "Définir les contrats d'interface et l'impact",
      requiredCapabilities: ["knowledge_search_entities", "knowledge_impact_analyze"],
    };

    // Aucun `from` explicite → initiateur neutre NEGOTIATION_INITIATOR.
    // architect n'est donc PAS l'émetteur et reçoit bien l'appel d'offres.
    const outcome = await negotiator.negotiate(task);

    assert.equal(outcome.winner, "architect", "architect gagne quand il est le meilleur match");
    assert.equal(outcome.awarded, true);
    assert.ok(outcome.bids.some((b) => b.role === "architect" && b.eligible));
  });
});

interface AgentRoleCapture {
  role: string | null;
  taskId: string | null;
}
