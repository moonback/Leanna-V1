/**
 * Attribution Audit — Diagnostic déterministe de la chaîne outil → agent
 *
 * Contexte (chantier « chaîne déterministe ») :
 *   La chaîne cible est  outil → capability → agent → permission → executor.
 *   Aujourd'hui elle n'est PAS déterministe : sur ~212 outils exécutables,
 *   seule une fraction porte une attribution *certaine* (explicite ou
 *   capability de rôle). Le reste retombe sur une heuristique de catégorie
 *   (attribution *probable*), puis sur le rôle neutre `system` (aucune
 *   attribution). `reconcileCounts.ts` *mesure* cette fragmentation ; ce
 *   module la rend ACTIONNABLE puis, en option, la transforme en ERREUR de
 *   boot (fail-closed) pour interdire toute régression silencieuse.
 *
 * Ce module ne remplace pas la cascade de `toolAgentMapper.ts` : il la
 * réutilise (`resolveToolAttribution`, `getToolCategory`, `TOOL_CATEGORIES`)
 * afin que l'audit reflète EXACTEMENT ce que fait le runtime. Un divergence
 * entre l'audit et la résolution réelle serait pire qu'aucun audit.
 *
 * Aucun effet de bord runtime : le module lit le ToolRegistry, produit un
 * rapport, le logge, et — seulement si on le lui demande explicitement —
 * lève une erreur. Il ne mute jamais l'attribution des outils.
 */

import type { AgentRole } from "./types.js";
import {
  resolveToolAttribution,
  getToolCategory,
  TOOL_CATEGORIES,
  UNATTRIBUTED_ROLE,
  type AttributionSource,
} from "./toolAgentMapper.js";

// ═══════════════════════════════════════════════════════════════════════════
// Types du rapport
// ═══════════════════════════════════════════════════════════════════════════

/** Détail d'attribution pour un outil exécutable donné. */
export interface ToolAttributionEntry {
  /** Nom de l'outil tel qu'enregistré dans le ToolRegistry. */
  tool: string;
  /** Rôle résolu par la cascade réelle (identique au runtime). */
  role: AgentRole;
  /** Provenance de l'attribution (certaine / probable / absente). */
  source: AttributionSource;
  /**
   * Catégorie sémantique détectée par mot-clé, si l'outil en matche une.
   * Renseignée même pour les outils `unattributed` afin de PROPOSER un owner
   * plausible dans la liste actionnable (sans le décider en douce).
   */
  detectedCategory?: string;
  /**
   * Owner suggéré pour un outil `unattributed` : premier `typicalRoles` de la
   * catégorie détectée. `undefined` si aucune catégorie ne matche (l'outil
   * doit alors recevoir une attribution EXPLICITE dans le ToolRegistry).
   */
  suggestedOwner?: AgentRole;
}

/**
 * Rapport d'audit d'attribution. Purement descriptif : additionner
 * `certain + probable + unattributed` redonne `totalTools`.
 */
export interface AttributionAuditReport {
  totalTools: number;
  /** Outils à attribution CERTAINE (source `explicit` ou `capability`). */
  certain: number;
  /** Outils à attribution PROBABLE (source `category`, heuristique). */
  probable: number;
  /** Outils SANS attribution réelle (source `unattributed` → rôle `system`). */
  unattributed: number;
  /**
   * Liste actionnable des outils sans attribution : chacun avec sa catégorie
   * détectée (si elle existe) et l'owner suggéré. C'est le « burn-down » à
   * traiter en déclarant une attribution explicite côté ToolRegistry ou une
   * capability de rôle.
   */
  actionable: ToolAttributionEntry[];
  /** Détail complet de tous les outils (pour l'UI d'observabilité / debug). */
  entries: ToolAttributionEntry[];
}

/**
 * Surface minimale du runtime consommée par l'audit : seulement la liste des
 * noms d'outils exécutables. Typer sur ce contrat (plutôt que sur `AgentRuntime`
 * entier) découple l'audit du cœur runtime et le rend trivialement testable.
 * `AgentRuntime` est structurellement compatible (`runtime.tools.getDeclarations()`).
 */
export interface ToolRegistryView {
  tools: { getDeclarations(): Array<{ name: string }> };
}

/**
 * Décision de politique appliquée au rapport, retournée par `enforceAttribution`.
 */
export interface AttributionEnforcementResult {
  report: AttributionAuditReport;
  /** Vrai si le rapport viole la politique (au moins un outil non attribué). */
  violated: boolean;
  /** Message lisible du verdict (loggé et/ou porté par l'erreur levée). */
  message: string;
}

/**
 * Erreur levée en mode fail-closed quand des outils exécutables restent sans
 * attribution déterministe. Porte la liste actionnable pour un diagnostic
 * immédiat au boot.
 */
export class UnattributedToolsError extends Error {
  public readonly tools: string[];
  public readonly report: AttributionAuditReport;
  constructor(report: AttributionAuditReport) {
    const tools = report.actionable.map((e) => e.tool);
    super(
      `Attribution déterministe violée : ${tools.length} outil(s) exécutable(s) ` +
        `sans attribution (ni explicite, ni capability, ni catégorie) — retomberaient ` +
        `sur le rôle "${UNATTRIBUTED_ROLE}". Déclarez leur attribution ` +
        `(ToolRegistry.attribution) ou une capability de rôle. Outils : ${tools.join(", ")}.`
    );
    this.name = "UnattributedToolsError";
    this.tools = tools;
    this.report = report;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Audit
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Owner suggéré pour un outil sans attribution : premier `typicalRoles` de sa
 * catégorie détectée. Ne DÉCIDE rien : c'est une proposition pour la liste
 * actionnable. Retourne `undefined` si aucune catégorie ne matche.
 */
function suggestOwnerForCategory(category: string | undefined): AgentRole | undefined {
  if (!category) return undefined;
  const roles = TOOL_CATEGORIES[category]?.typicalRoles;
  return roles && roles.length > 0 ? roles[0] : undefined;
}

/**
 * Construit le rapport d'audit à partir des outils réellement enregistrés dans
 * le ToolRegistry. Utilise la MÊME cascade que le runtime (resolveToolAttribution),
 * de sorte que le rapport ne peut pas mentir sur le comportement réel.
 *
 * @param runtime - Runtime démarré (ou toute vue exposant les déclarations
 *   d'outils). À appeler APRÈS l'enregistrement de tous les outils (custom
 *   skills inclus), sinon le total est sous-évalué.
 */
export function auditToolAttribution(runtime: ToolRegistryView): AttributionAuditReport {
  const toolNames = runtime.tools.getDeclarations().map((d) => d.name);

  const entries: ToolAttributionEntry[] = [];
  const actionable: ToolAttributionEntry[] = [];
  let certain = 0;
  let probable = 0;
  let unattributed = 0;

  for (const tool of toolNames) {
    const { role, source } = resolveToolAttribution(tool);
    const detectedCategory = getToolCategory(tool);

    const entry: ToolAttributionEntry = { tool, role, source };
    if (detectedCategory) entry.detectedCategory = detectedCategory;

    switch (source) {
      case "explicit":
      case "capability":
        certain++;
        break;
      case "category":
        probable++;
        break;
      default: {
        unattributed++;
        const suggestedOwner = suggestOwnerForCategory(detectedCategory);
        if (suggestedOwner) entry.suggestedOwner = suggestedOwner;
        actionable.push(entry);
        break;
      }
    }

    entries.push(entry);
  }

  // Tri stable de la liste actionnable : d'abord ceux SANS owner suggéré (les
  // plus urgents — aucune piste), puis par nom pour un diff reproductible.
  actionable.sort((a, b) => {
    const aHas = a.suggestedOwner ? 1 : 0;
    const bHas = b.suggestedOwner ? 1 : 0;
    if (aHas !== bHas) return aHas - bHas;
    return a.tool.localeCompare(b.tool);
  });

  return {
    totalTools: toolNames.length,
    certain,
    probable,
    unattributed,
    actionable,
    entries,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Log & Enforcement
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Logge le rapport d'audit de façon lisible. Ne lève jamais.
 * Les outils non attribués sont listés avec leur owner suggéré pour un
 * burn-down direct.
 */
export function logAttributionAudit(report: AttributionAuditReport): void {
  console.log(
    "[AttributionAudit] Chaîne outil → agent :\n" +
      `  • Attribution certaine (explicite/capability) : ${report.certain}\n` +
      `  • Attribution probable (catégorie, heuristique) : ${report.probable}\n` +
      `  • Sans attribution (→ rôle "${UNATTRIBUTED_ROLE}")     : ${report.unattributed}\n` +
      `  • Total outils exécutables                      : ${report.totalTools}`
  );

  if (report.actionable.length === 0) {
    console.log(
      `[AttributionAudit] ✅ Chaîne déterministe : chaque outil exécutable est attribué ` +
        `(aucun retour au rôle "${UNATTRIBUTED_ROLE}").`
    );
    return;
  }

  const lines = report.actionable.map((e) => {
    const cat = e.detectedCategory ? ` (catégorie: ${e.detectedCategory})` : " (aucune catégorie)";
    const owner = e.suggestedOwner
      ? ` → owner suggéré: ${e.suggestedOwner}`
      : " → AUCUNE piste, attribution explicite requise";
    return `    - ${e.tool}${cat}${owner}`;
  });

  console.warn(
    `[AttributionAudit] ⚠️ ${report.actionable.length} outil(s) sans attribution déterministe ` +
      `(à traiter — déclarer attribution ToolRegistry ou capability de rôle) :\n` +
      lines.join("\n")
  );
}

/** Politique d'application de l'audit. */
export type AttributionEnforcementMode = "off" | "warn" | "strict";

/**
 * Applique la politique d'attribution.
 *
 *   - "off"    : ne fait rien (pas même le log). Réservé aux cas exceptionnels.
 *   - "warn"   : logge le rapport (défaut sûr). N'échoue jamais.
 *   - "strict" : logge puis LÈVE `UnattributedToolsError` s'il reste des outils
 *                sans attribution. C'est le fail-closed : la présence d'un
 *                outil non attribué devient une erreur de boot.
 *
 * Retourne toujours un `AttributionEnforcementResult` (en mode strict, seulement
 * si aucune violation — sinon l'erreur est levée).
 *
 * @param runtime - Runtime démarré (tous les outils enregistrés), ou vue équivalente.
 * @param mode - Politique d'application. Défaut : "warn".
 */
export function enforceAttribution(
  runtime: ToolRegistryView,
  mode: AttributionEnforcementMode = "warn"
): AttributionEnforcementResult {
  const report = auditToolAttribution(runtime);
  const violated = report.actionable.length > 0;

  if (mode === "off") {
    return { report, violated, message: "Audit d'attribution désactivé (mode=off)." };
  }

  logAttributionAudit(report);

  if (mode === "strict" && violated) {
    throw new UnattributedToolsError(report);
  }

  const message = violated
    ? `${report.actionable.length} outil(s) sans attribution déterministe (mode=warn : non bloquant).`
    : `Chaîne d'attribution déterministe : ${report.totalTools} outils tous attribués.`;

  return { report, violated, message };
}

/**
 * Résout le mode d'application depuis l'environnement :
 *   Leanna_ATTRIBUTION_ENFORCEMENT = off | warn | strict   (défaut : warn)
 *
 * Cohérent avec la fabrique `PermissionPolicy.fromEnv` : le durcissement est
 * piloté par l'environnement, pas codé en dur, pour rester rétro-compatible.
 */
export function attributionEnforcementFromEnv(
  env: NodeJS.ProcessEnv = process.env
): AttributionEnforcementMode {
  const raw = (env.Leanna_ATTRIBUTION_ENFORCEMENT ?? "warn").trim().toLowerCase();
  return raw === "off" || raw === "strict" ? raw : "warn";
}
