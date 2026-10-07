/**
 * Bootstrap — Initialisation du nouveau runtime avec les skills existantes
 * 
 * Ce fichier remplace les ~120 lignes d'initialisation chaînée de server.ts
 * par une séquence claire et testable.
 * 
 * Usage dans server.ts :
 *   import { bootstrapRuntime } from "./server/runtime/bootstrap.js";
 *   const { runtime, skillManager } = await bootstrapRuntime();
 * 
 * L'ancien server.ts peut continuer à utiliser `skillManager.handleToolCall()`
 * comme avant — mais en interne ça passe par le ToolRegistry.
 */

import { AgentRuntime } from "./AgentRuntime.js";
import { createAgentRuntime, type AgenticRuntime, type AgentBudget } from "./agentic/index.js";
import { SkillManagerV2 } from "./compat/SkillManagerV2.js";
import { PromptRegistry } from "./PromptRegistry.js";
import { PermissionPolicy } from "./PermissionPolicy.js";
import { DryRunController } from "./DryRun.js";
import { loadPromptTemplates } from "./prompts/loader.js";
import { defaultAgents, setAgenticRuntimeProvider } from "./agents/index.js";
import { createCoreKernel, type CoreKernel } from "../core/kernel.js";
import type { RuntimeConfig } from "./types.js";
import type { LegacySkill } from "./compat/SkillAdapter.js";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname_compat = typeof __dirname !== 'undefined'
  ? __dirname
  : path.dirname(fileURLToPath(import.meta.url));

// ═══════════════════════════════════════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════════════════════════════

export interface BootstrapConfig {
  /** Configuration du runtime */
  runtime?: Partial<RuntimeConfig>;
  /**
   * Politique de permissions appliquée au runtime.
   * Si absente, construite depuis l'environnement
   * (Leanna_PERMISSION_MODE / Leanna_GRANTED_PERMISSIONS).
   */
  permissionPolicy?: PermissionPolicy;
  /**
   * Contrôleur de simulation globale (dry-run).
   * Si absent, construit depuis l'environnement (Leanna_DRY_RUN).
   */
  dryRun?: DryRunController;
  /** Skills à enregistrer (toutes les skills existantes) */
  skills?: LegacySkill[];
  /** Désactiver les agents par défaut */
  disableDefaultAgents?: boolean;
  /** Budget par défaut du runtime agentique (maxIterations, maxToolCalls, …). */
  agenticBudget?: Partial<AgentBudget>;
  /** Dossier des prompts (défaut: server/runtime/prompts/) */
  promptsDir?: string;
  /**
   * Force l'activation de la garde d'idempotence P0 sur le ToolRegistry.
   * Par défaut, lue depuis `LEANNA_IDEMPOTENCY`. Non branchée = comportement
   * strictement inchangé.
   */
  enableIdempotency?: boolean;
  /** Callback post-initialisation */
  onReady?: (runtime: AgentRuntime, skillManager: SkillManagerV2) => void | Promise<void>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Bootstrap
// ═══════════════════════════════════════════════════════════════════════════════

export interface BootstrapResult {
  runtime: AgentRuntime;
  skillManager: SkillManagerV2;
  prompts: PromptRegistry;
  /**
   * Runtime agentique branché sur le `ToolRegistry` du runtime.
   * C'est lui qui exécute la vraie boucle OBSERVE→PLAN→ACT→VERIFY→RECOVER.
   */
  agentic: AgenticRuntime;
  /**
   * Noyau P0 (état durable de mission, ledger d'idempotence, checkpoints,
   * evidence, supervisor). La garde d'idempotence n'est branchée au
   * ToolRegistry que si `LEANNA_IDEMPOTENCY` est activé — sinon comportement
   * strictement inchangé.
   */
  kernel: CoreKernel;
}

/**
 * Initialise le runtime complet avec compatibilité SkillManager.
 * 
 * Séquence :
 *   1. Créer le runtime (EventBus, ToolRegistry, Memory, FSM)
 *   2. Créer le SkillManagerV2 (wrapper ToolRegistry)
 *   3. Enregistrer les skills existantes
 *   4. Enregistrer les agents plugins
 *   5. Démarrer le runtime
 *   6. Retourner les instances
 */
export async function bootstrapRuntime(config: BootstrapConfig = {}): Promise<BootstrapResult> {
  const startTime = Date.now();

  // 1. Créer le runtime (avec la politique de permissions et le dry-run)
  const permissionPolicy = config.permissionPolicy ?? PermissionPolicy.fromEnv();
  const dryRun = config.dryRun ?? DryRunController.fromEnv();
  const runtime = new AgentRuntime(config.runtime, { permissionPolicy, dryRun });

  // 1.5. Préparer l'AgentOrchestrator (l'initialisation de la flotte se fera après configuration du runner agentique)
  const { agentOrchestrator } = await import("../agents/AgentOrchestrator.js");

  // 2. Créer le SkillManagerV2 qui partage le ToolRegistry du runtime
  const skillManager = new SkillManagerV2({
    eventBus: runtime.events,
    registry: runtime.tools,
  });

  // 3. Charger les prompts depuis les fichiers .md
  const prompts = new PromptRegistry();
  const promptsDir = config.promptsDir ?? path.join(__dirname_compat, "prompts");
  const promptCount = loadPromptTemplates(prompts, promptsDir);

  // 4. Enregistrer les skills si fournies
  if (config.skills?.length) {
    skillManager.registerAllSkills(config.skills);
  }

  // 5. Enregistrer les agents
  if (!config.disableDefaultAgents) {
    for (const agent of defaultAgents) {
      runtime.registerAgent(agent);
    }
  }

  // 6. Démarrer le runtime
  await runtime.start();

  // 6b. Alimenter le mapper d'attribution à partir du ToolRegistry (source de
  // vérité). Les outils qui déclarent `attribution` priment sur le mapping
  // dérivé des capabilities de rôle. Import dynamique pour éviter le couplage
  // server/runtime → server/agents au chargement du module.
  try {
    const { applyToolRegistryAttribution, applyRuntimeAgentAuthorization } = await import(
      "../agents/toolAgentMapper.js"
    );
    const defs = runtime.tools.getDefinitions();
    // Autorisation par agent (chantier C) : estampille allowedAgents + risk sur
    // les outils sensibles AVANT de calculer le cache d'affichage, afin que la
    // même vérité serve l'exécution (PermissionPolicy) et la télémétrie.
    const stamped = applyRuntimeAgentAuthorization(defs);
    applyToolRegistryAttribution(defs);
    if (stamped > 0) {
      console.log(
        `[Bootstrap] Autorisation par agent — ${stamped} outil(s) sensible(s) estampillé(s) ` +
        `(allowedAgents + risk). Un agent hors liste est refusé en mode "enforce".`
      );
    }
  } catch (err) {
    console.error("[Bootstrap] applyToolRegistryAttribution échec:", err);
  }

  // 6c. Audit d'attribution déterministe. Une fois l'attribution finalisée
  // (socle sensible + ToolRegistry), on vérifie que chaque outil exécutable
  // possède un propriétaire résoluble (explicite, capability ou catégorie).
  // Les outils restants retomberaient sur le rôle neutre "system" : on les
  // liste de façon actionnable (owner suggéré) et, en mode "strict"
  // (Leanna_ATTRIBUTION_ENFORCEMENT=strict), on ÉCHOUE le boot pour interdire
  // toute régression silencieuse. Défaut "warn" : non bloquant, rétro-compatible.
  try {
    const { enforceAttribution, attributionEnforcementFromEnv } = await import(
      "../agents/attributionAudit.js"
    );
    enforceAttribution(runtime, attributionEnforcementFromEnv());
  } catch (err) {
    // En mode strict, UnattributedToolsError doit remonter : on ne l'avale pas.
    if ((err as Error)?.name === "UnattributedToolsError") throw err;
    console.error("[Bootstrap] Audit d'attribution échec:", err);
  }

  // 6d. Garde fail-fast des capabilities fantômes. Un agent peut déclarer dans
  // ses capabilities (roles.ts) un outil non exécutable (absent de
  // EXECUTABLE_AGENT_TOOLS) ou jamais enregistré dans le ToolRegistry : à
  // l'exécution, l'exécuteur refuse l'appel et l'agent re-tente en vain
  // (boucle de retry stérile qui mange le budget de contexte). On détecte ce
  // désalignement AU BOOT — avertissement actionnable par défaut, erreur de
  // boot en mode "strict" (Leanna_CAPABILITY_ENFORCEMENT=strict) — au lieu
  // d'attendre le premier appel en pleine mission.
  try {
    const { enforceCapabilities, capabilityEnforcementFromEnv } = await import(
      "../agents/capabilityAudit.js"
    );
    enforceCapabilities(runtime, capabilityEnforcementFromEnv());
  } catch (err) {
    // En mode strict, PhantomCapabilityError doit remonter : on ne l'avale pas.
    if ((err as Error)?.name === "PhantomCapabilityError") throw err;
    console.error("[Bootstrap] Audit des capabilities échec:", err);
  }

  // 7. Callback post-init
  if (config.onReady) {
    await config.onReady(runtime, skillManager);
  }

  const elapsed = Date.now() - startTime;
  console.log(
    `[Bootstrap] Runtime initialisé en ${elapsed}ms — ` +
    `${runtime.tools.size} outils, ${runtime.listAgents().length} agents, ${promptCount} prompts`
  );
  console.log(
    `[Bootstrap] Permissions runtime — mode="${permissionPolicy.getMode()}", ` +
    `accordées=[${permissionPolicy.getGranted().join(", ")}]`
  );
  if (dryRun.isEnabled()) {
    console.log(`[Bootstrap] 🧪 Dry-run global ACTIVÉ — aucun effet de bord ne sera réellement exécuté.`);
  }

  // Runtime agentique : réutilise le ToolRegistry/EventBus déjà configurés,
  // de sorte que les agents reçoivent réellement leurs outils déclarés.
  const agentic = createAgentRuntime(runtime, { budget: config.agenticBudget });

  // Brancher le pont Runtime-plugin → boucle agentique. Les 8 plugins
  // d'ingénierie (coder, debugger, …) exécutent alors leurs tâches
  // AgentRuntime.submit() via la MÊME boucle plan→act→verify.
  setAgenticRuntimeProvider(agentic);

  // Migration : l'orchestrateur exécute désormais les tâches via le runtime
  // agentique (boucle plan→act→verify→recover), plus via l'AgentExecutor legacy.
  agentOrchestrator.enableAgenticRuntime(agentic);
  // Initialiser la flotte d'agents une seule fois, directement sur le runner agentique
  agentOrchestrator.setSkillHandler((name: string, args: any, options?: { signal?: AbortSignal }) =>
    runtime.tools.call(name, args, { signal: options?.signal })
  );

  // Noyau P0 : branche (si activé) la garde d'idempotence sur le MÊME
  // ToolRegistry que le runtime agentique, de sorte qu'une action à effet de
  // bord interrompue par un crash ne soit jamais rejouée à la reprise.
  const kernel = createCoreKernel({
    registry: runtime.tools,
    enableIdempotency: config.enableIdempotency,
  });
  if (kernel.idempotencyEnabled) {
    console.log(
      `[Bootstrap] 🔒 Idempotence P0 ACTIVÉE — les actions à effet de bord sont ` +
      `journalisées ; un rejeu après crash est bloqué.`
    );
  }
  if (kernel.safetyGateMode !== "off") {
    console.log(
      `[Bootstrap] 🛡️  Safety gate Jev ${kernel.safetyGateMode === "enforce" ? "ACTIVÉ (enforce)" : "en AUDIT"} — ` +
      `les actions à effet de bord sont évaluées avant exécution.`
    );
  }

  return { runtime, skillManager, prompts, agentic, kernel };
}

/**
 * Version synchrone pour les cas où on ne peut pas await au top-level.
 * Retourne les instances immédiatement, l'initialisation async se fait en arrière-plan.
 */
export function bootstrapRuntimeSync(config: BootstrapConfig = {}): BootstrapResult {
  const permissionPolicy = config.permissionPolicy ?? PermissionPolicy.fromEnv();
  const dryRun = config.dryRun ?? DryRunController.fromEnv();
  const runtime = new AgentRuntime(config.runtime, { permissionPolicy, dryRun });
  const skillManager = new SkillManagerV2({
    eventBus: runtime.events,
    registry: runtime.tools,
  });
  console.log(
    `[Bootstrap] Permissions runtime — mode="${permissionPolicy.getMode()}", ` +
    `accordées=[${permissionPolicy.getGranted().join(", ")}]`
  );
  if (dryRun.isEnabled()) {
    console.log(`[Bootstrap] 🧪 Dry-run global ACTIVÉ — aucun effet de bord ne sera réellement exécuté.`);
  }

  // Charger les prompts
  const prompts = new PromptRegistry();
  const promptsDir = config.promptsDir ?? path.join(__dirname_compat, "prompts");
  loadPromptTemplates(prompts, promptsDir);

  if (config.skills?.length) {
    skillManager.registerAllSkills(config.skills);
  }

  if (!config.disableDefaultAgents) {
    for (const agent of defaultAgents) {
      runtime.registerAgent(agent);
    }
  }

  // Démarrage async en arrière-plan
  runtime.start().then(() => {
    if (config.onReady) {
      return config.onReady(runtime, skillManager);
    }
  }).catch((err) => {
    console.error("[Bootstrap] Erreur lors du démarrage:", err);
  });

  const agentic = createAgentRuntime(runtime, { budget: config.agenticBudget });

  // Brancher le pont Runtime-plugin → boucle agentique (voir version async).
  setAgenticRuntimeProvider(agentic);

  // Brancher l'orchestrateur sur le runtime agentique (import dynamique pour
  // éviter la dépendance circulaire ; best-effort en mode synchrone).
  import("../agents/AgentOrchestrator.js")
    .then(({ agentOrchestrator }) => agentOrchestrator.enableAgenticRuntime(agentic))
    .catch((err) => console.error("[Bootstrap] enableAgenticRuntime (sync) échec:", err));

  // Noyau P0 (voir version async). Branchement de la garde d'idempotence gouverné
  // par LEANNA_IDEMPOTENCY / config.enableIdempotency ; sinon inchangé.
  const kernel = createCoreKernel({
    registry: runtime.tools,
    enableIdempotency: config.enableIdempotency,
  });
  if (kernel.idempotencyEnabled) {
    console.log(`[Bootstrap] 🔒 Idempotence P0 ACTIVÉE (mode synchrone).`);
  }
  if (kernel.safetyGateMode !== "off") {
    console.log(`[Bootstrap] 🛡️  Safety gate Jev ${kernel.safetyGateMode} (mode synchrone).`);
  }

  return { runtime, skillManager, prompts, agentic, kernel };
}
