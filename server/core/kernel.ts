/**
 * core/kernel.ts — Assemblage et branchement du noyau P0.
 *
 * Fournit une fabrique unique qui instancie les briques P0 (ledger, checkpoints,
 * evidence, state store, supervisor) et les relie au runtime existant SANS le
 * casser :
 *   - la garde d'idempotence n'est branchée sur le `ToolRegistry` que si elle
 *     est explicitement activée (`enableIdempotency`), sinon comportement
 *     strictement inchangé ;
 *   - tout le reste est disponible pour les appelants qui veulent gouverner une
 *     mission via le Supervisor.
 *
 * Activation par variable d'environnement (convention du projet) :
 *   LEANNA_IDEMPOTENCY = "true" | "1"  → branche la garde d'idempotence.
 */

import type { ToolRegistry } from "../runtime/ToolRegistry.js";
import { ExecutionLedger } from "./ExecutionLedger.js";
import { LedgerGuard } from "./LedgerGuard.js";
import { JevSafetyGate, safetyGateModeFromEnv, type SafetyGateMode } from "./JevSafetyGate.js";
import { CheckpointManager } from "./CheckpointManager.js";
import { EvidenceEngine } from "./EvidenceEngine.js";
import { DurableMissionStore } from "./DurableMissionStore.js";
import { LeannaSupervisor, type SupervisedResult } from "./LeannaSupervisor.js";
import { createAgenticMissionRunner, type AgenticLike } from "./AgenticMissionRunner.js";
import { randomUUID } from "node:crypto";

/** Paramètres d'une mission agentique gouvernée par le Supervisor. */
export interface SupervisedAgenticMissionParams {
  /** Objectif en langage naturel. */
  goal: string;
  /** Identifiant de mission (généré si absent). */
  missionId?: string;
  /** Rôle d'agent à incarner (défaut "coder"). */
  role?: string;
  /** Instructions additionnelles pour l'agent. */
  instructions?: string;
  /**
   * Fichiers susceptibles d'être modifiés, connus AVANT l'exécution. Snapshottés
   * pour permettre un rollback fidèle si la preuve échoue.
   */
  plannedFiles?: string[];
}

export interface CoreKernel {
  ledger: ExecutionLedger;
  guard: LedgerGuard;
  checkpoints: CheckpointManager;
  evidence: EvidenceEngine;
  missionStore: DurableMissionStore;
  supervisor: LeannaSupervisor;
  /** Indique si la garde d'idempotence a été branchée au ToolRegistry. */
  idempotencyEnabled: boolean;
  /** Garde de sécurité Jev (undefined si mode "off" ou pas de registry). */
  safetyGate?: JevSafetyGate;
  /** Mode effectif du garde de sécurité. */
  safetyGateMode: SafetyGateMode;
  /**
   * Exécute une mission agentique SOUS GOUVERNANCE : état durable, snapshot/
   * rollback, preuve (la preuve prime sur la narration) et récupération. C'est
   * la couture P0.1 qui fait passer une exécution réelle par le Supervisor.
   */
  runSupervisedAgenticMission(
    runtime: AgenticLike,
    params: SupervisedAgenticMissionParams
  ): Promise<SupervisedResult>;
}

export interface CoreKernelOptions {
  /**
   * ToolRegistry sur lequel brancher la garde d'idempotence. Requis pour que
   * l'idempotence couvre le chemin agentique.
   */
  registry?: ToolRegistry;
  /**
   * Force l'activation/désactivation de la garde d'idempotence. Par défaut,
   * lue depuis `LEANNA_IDEMPOTENCY`.
   */
  enableIdempotency?: boolean;
  /**
   * Force le mode du garde de sécurité Jev. Par défaut, lu depuis
   * `LEANNA_SAFETY_GATE` (off | audit | enforce).
   */
  safetyGateMode?: SafetyGateMode;
  /** Clé/modèle OpenRouter passés au garde Jev (sinon repli sur l'env). */
  safetyGateApiKey?: string;
  safetyGateModel?: string;
  /** Environnement (tests). */
  env?: NodeJS.ProcessEnv;
  /**
   * Surcharge du fichier de ledger (tests) — permet d'isoler chaque exécution.
   * Par défaut, `.Leanna/core/ledger/actions.jsonl`.
   */
  ledgerFile?: string;
}

/** Lit l'activation de l'idempotence depuis l'environnement. */
export function idempotencyEnabledFromEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = (env.LEANNA_IDEMPOTENCY ?? "").toLowerCase().trim();
  return raw === "true" || raw === "1";
}

/**
 * Construit le noyau P0 et, si demandé, branche la garde d'idempotence sur le
 * ToolRegistry fourni. Retourne toutes les briques pour usage ultérieur.
 */
export function createCoreKernel(options: CoreKernelOptions = {}): CoreKernel {
  const env = options.env ?? process.env;
  const ledger = new ExecutionLedger(options.ledgerFile);
  const guard = new LedgerGuard(ledger);
  const checkpoints = new CheckpointManager();
  const evidence = new EvidenceEngine();
  const missionStore = new DurableMissionStore();
  const supervisor = new LeannaSupervisor({ missionStore, checkpoints, evidence });

  const enable = options.enableIdempotency ?? idempotencyEnabledFromEnv(env);
  let idempotencyEnabled = false;
  if (enable && options.registry) {
    options.registry.setIdempotencyGuard(guard);
    idempotencyEnabled = true;
  }

  // Garde de sécurité Jev : branché sur le ToolRegistry uniquement si le mode
  // n'est pas "off". Fail-closed intégré dans jevGating (erreur → review).
  const safetyGateMode = options.safetyGateMode ?? safetyGateModeFromEnv(env);
  let safetyGate: JevSafetyGate | undefined;
  if (safetyGateMode !== "off" && options.registry) {
    safetyGate = new JevSafetyGate(safetyGateMode, {
      apiKey: options.safetyGateApiKey,
      model: options.safetyGateModel,
    });
    options.registry.setSafetyGate(safetyGate);
  }

  const runSupervisedAgenticMission = async (
    runtime: AgenticLike,
    params: SupervisedAgenticMissionParams
  ): Promise<SupervisedResult> => {
    const missionId = params.missionId ?? randomUUID();
    const runner = createAgenticMissionRunner(runtime, {
      role: params.role,
      instructions: params.instructions,
    });

    // Rend les clés d'idempotence stables pour cette mission (si la garde est
    // branchée). On restaure le contexte précédent en fin d'exécution.
    guard.setContext({ missionId });
    safetyGate?.setContext({ missionId });
    try {
      return await supervisor.runMission({
        missionId,
        goal: params.goal,
        plannedFiles: params.plannedFiles,
        runner,
      });
    } finally {
      guard.clearContext();
      safetyGate?.clearContext();
    }
  };

  return {
    ledger,
    guard,
    checkpoints,
    evidence,
    missionStore,
    supervisor,
    idempotencyEnabled,
    safetyGate,
    safetyGateMode,
    runSupervisedAgenticMission,
  };
}
