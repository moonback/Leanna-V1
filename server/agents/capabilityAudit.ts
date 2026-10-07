/**
 * Capability Audit — Garde fail-fast des capabilities fantômes au boot
 *
 * Contexte (chaîne déterministe outil → capability → agent → permission →
 * executor) :
 *   Un agent peut déclarer dans ses `capabilities` (roles.ts) un outil qui
 *   n'est PAS réellement exécutable — soit absent de `EXECUTABLE_AGENT_TOOLS`
 *   (allowlist de l'AgentExecutor), soit jamais enregistré dans le
 *   ToolRegistry. On parle alors de « capability fantôme » : l'agent croit
 *   pouvoir faire X, l'exécuteur refuse → l'agent re-tente stérilement →
 *   boucle de retry qui mange le budget de contexte et fait dériver la
 *   mission. C'est un des freins réels à l'autonomie identifiés par l'audit
 *   interne (cf. roleCapabilities.test.ts, créé spécifiquement pour détecter
 *   ce désalignement — ex. historique `knowledge_graph_query`).
 *
 * `roleCapabilities.test.ts` détecte déjà ce désalignement en CI. Ce module le
 * promeut en garde RUNTIME au démarrage : au boot, un outil fantôme devient un
 * avertissement actionnable (défaut) ou une erreur de boot fail-closed (mode
 * strict), au lieu de n'exploser qu'au premier appel, en pleine mission.
 *
 * Aucun effet de bord : le module lit le registre d'agents + l'allowlist
 * d'exécution + (optionnellement) les outils réellement enregistrés, produit un
 * rapport, le logge, et — seulement si on le lui demande — lève une erreur. Il
 * ne mute jamais les capabilities ni les outils.
 *
 * Il réutilise les MÊMES sources de vérité que l'exécuteur
 * (`STATIC_AGENT_REGISTRY` + `EXECUTABLE_AGENT_TOOLS`), de sorte que le verdict
 * reflète exactement la garde runtime de l'AgentExecutor :
 *   `EXECUTABLE_AGENT_TOOLS.has(call.name) && agent.capabilities.includes(...)`.
 */

import { STATIC_AGENT_REGISTRY } from "./roles.js";
import { EXECUTABLE_AGENT_TOOLS } from "./AgentExecutor.js";

// ═══════════════════════════════════════════════════════════════════════════
// Types du rapport
// ═══════════════════════════════════════════════════════════════════════════

/** Une capability fantôme : outil déclaré par un rôle mais non exécutable. */
export interface PhantomCapability {
  /** Rôle qui déclare la capability. */
  role: string;
  /** Nom de l'outil déclaré mais non exécutable. */
  tool: string;
  /**
   * Raison du caractère fantôme :
   *   - "not_executable" : absent de `EXECUTABLE_AGENT_TOOLS` (l'exécuteur
   *     refuserait l'appel même si l'outil existait).
   *   - "not_registered" : exécutable d'après l'allowlist mais jamais
   *     enregistré dans le ToolRegistry (handler introuvable à l'exécution).
   */
  reason: "not_executable" | "not_registered";
}

/** Rapport d'audit des capabilities d'agents. */
export interface CapabilityAuditReport {
  /** Nombre total de couples (rôle, capability) examinés. */
  totalCapabilities: number;
  /** Nombre de rôles statiques audités. */
  totalRoles: number;
  /** Capabilities fantômes détectées (liste actionnable, triée). */
  phantoms: PhantomCapability[];
}

/**
 * Surface minimale du runtime consommée par l'audit : seulement les noms
 * d'outils réellement enregistrés. Facultative — si absente, on ne vérifie que
 * l'allowlist d'exécution. Typer sur ce contrat (plutôt que sur `AgentRuntime`)
 * garde l'audit découplé et trivialement testable. `AgentRuntime` est
 * structurellement compatible (`runtime.tools.getDeclarations()`).
 */
export interface RegisteredToolsView {
  tools: { getDeclarations(): Array<{ name: string }> };
}

/**
 * Erreur levée en mode fail-closed quand au moins une capability fantôme reste.
 * Porte la liste pour un diagnostic immédiat au boot.
 */
export class PhantomCapabilityError extends Error {
  public readonly phantoms: PhantomCapability[];
  public readonly report: CapabilityAuditReport;
  constructor(report: CapabilityAuditReport) {
    const detail = report.phantoms
      .map((p) => `${p.role} → ${p.tool} (${p.reason})`)
      .join(", ");
    super(
      `Capabilities fantômes détectées : ${report.phantoms.length} couple(s) ` +
        `(rôle → outil) déclaré(s) mais non exécutable(s). L'agent re-tenterait ` +
        `cet appel en vain. Corrigez roles.ts (retirer la capability) ou ` +
        `l'enregistrement d'outil (EXECUTABLE_AGENT_TOOLS / ToolRegistry). ` +
        `Fantômes : ${detail}.`
    );
    this.name = "PhantomCapabilityError";
    this.phantoms = report.phantoms;
    this.report = report;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Audit
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Construit le rapport d'audit des capabilities à partir du registre d'agents
 * statique et de l'allowlist d'exécution. Si une vue des outils enregistrés est
 * fournie, détecte aussi les capabilities exécutables d'après l'allowlist mais
 * jamais enregistrées dans le ToolRegistry.
 *
 * @param registeredTools - Vue optionnelle des outils réellement enregistrés
 *   (typiquement le runtime démarré). Omettre pour n'auditer que l'allowlist.
 */
export function auditAgentCapabilities(
  registeredTools?: RegisteredToolsView
): CapabilityAuditReport {
  const registeredNames = registeredTools
    ? new Set(registeredTools.tools.getDeclarations().map((d) => d.name))
    : undefined;

  const phantoms: PhantomCapability[] = [];
  let totalCapabilities = 0;
  const roles = Object.entries(STATIC_AGENT_REGISTRY);

  for (const [role, def] of roles) {
    for (const tool of def.capabilities) {
      totalCapabilities++;

      // 1. L'exécuteur refuse tout outil hors allowlist : c'est le fantôme le
      //    plus grave (l'outil pourrait même ne pas exister du tout).
      if (!EXECUTABLE_AGENT_TOOLS.has(tool)) {
        phantoms.push({ role, tool, reason: "not_executable" });
        continue;
      }

      // 2. Outil dans l'allowlist mais absent du ToolRegistry : le handler
      //    serait introuvable à l'exécution. Vérifié seulement si on dispose
      //    de la liste des outils enregistrés.
      if (registeredNames && !registeredNames.has(tool)) {
        phantoms.push({ role, tool, reason: "not_registered" });
      }
    }
  }

  // Tri reproductible : par rôle puis par outil, pour un diff stable des logs.
  phantoms.sort((a, b) =>
    a.role === b.role ? a.tool.localeCompare(b.tool) : a.role.localeCompare(b.role)
  );

  return {
    totalCapabilities,
    totalRoles: roles.length,
    phantoms,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Log & Enforcement
// ═══════════════════════════════════════════════════════════════════════════

/** Logge le rapport de façon lisible. Ne lève jamais. */
export function logCapabilityAudit(report: CapabilityAuditReport): void {
  if (report.phantoms.length === 0) {
    console.log(
      `[CapabilityAudit] ✅ Cohérence capabilities ↔ outils exécutables : ` +
        `${report.totalCapabilities} capability(ies) sur ${report.totalRoles} rôles, ` +
        `aucune fantôme.`
    );
    return;
  }

  const lines = report.phantoms.map((p) => {
    const hint =
      p.reason === "not_executable"
        ? "absent de EXECUTABLE_AGENT_TOOLS"
        : "non enregistré dans le ToolRegistry";
    return `    - agent "${p.role}" → "${p.tool}" (${hint})`;
  });

  console.warn(
    `[CapabilityAudit] ⚠️ ${report.phantoms.length} capability(ies) fantôme(s) ` +
      `(déclarée(s) mais non exécutable(s) — l'agent re-tenterait en vain) :\n` +
      lines.join("\n") +
      `\n  Corriger : retirer la capability dans roles.ts, ou enregistrer l'outil ` +
      `(EXECUTABLE_AGENT_TOOLS / ToolRegistry).`
  );
}

/** Politique d'application de l'audit (même sémantique que l'audit d'attribution). */
export type CapabilityEnforcementMode = "off" | "warn" | "strict";

/** Verdict retourné par `enforceCapabilities`. */
export interface CapabilityEnforcementResult {
  report: CapabilityAuditReport;
  /** Vrai si au moins une capability fantôme a été détectée. */
  violated: boolean;
  /** Message lisible du verdict. */
  message: string;
}

/**
 * Applique la politique de cohérence des capabilities.
 *
 *   - "off"    : ne fait rien (pas même le log).
 *   - "warn"   : logge le rapport (défaut sûr). N'échoue jamais.
 *   - "strict" : logge puis LÈVE `PhantomCapabilityError` s'il reste une
 *                capability fantôme. Fail-closed : un désalignement devient une
 *                erreur de boot plutôt qu'une boucle de retry en pleine mission.
 *
 * @param registeredTools - Vue optionnelle des outils enregistrés (runtime).
 * @param mode - Politique d'application. Défaut : "warn".
 */
export function enforceCapabilities(
  registeredTools?: RegisteredToolsView,
  mode: CapabilityEnforcementMode = "warn"
): CapabilityEnforcementResult {
  const report = auditAgentCapabilities(registeredTools);
  const violated = report.phantoms.length > 0;

  if (mode === "off") {
    return { report, violated, message: "Audit des capabilities désactivé (mode=off)." };
  }

  logCapabilityAudit(report);

  if (mode === "strict" && violated) {
    throw new PhantomCapabilityError(report);
  }

  const message = violated
    ? `${report.phantoms.length} capability(ies) fantôme(s) (mode=warn : non bloquant).`
    : `Capabilities cohérentes : ${report.totalCapabilities} capability(ies) toutes exécutables.`;

  return { report, violated, message };
}

/**
 * Résout le mode d'application depuis l'environnement :
 *   Leanna_CAPABILITY_ENFORCEMENT = off | warn | strict   (défaut : warn)
 *
 * Cohérent avec `attributionEnforcementFromEnv` et `PermissionPolicy.fromEnv` :
 * le durcissement est piloté par l'environnement, pas codé en dur.
 */
export function capabilityEnforcementFromEnv(
  env: NodeJS.ProcessEnv = process.env
): CapabilityEnforcementMode {
  const raw = (env.Leanna_CAPABILITY_ENFORCEMENT ?? "warn").trim().toLowerCase();
  return raw === "off" || raw === "strict" ? raw : "warn";
}
