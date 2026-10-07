/**
 * AuthorizationGate — Composition unifiée des 4 axes d'autorisation
 *
 * Problème adressé :
 *   Leanna sépare (à juste titre) quatre décisions distinctes, mais elles sont
 *   éparpillées entre plusieurs points d'exécution (ToolRegistry.call,
 *   Executor.decide), ce qui rend impossible un raisonnement unique « cet
 *   appel est-il autorisé, doit-il être approuvé, ou refusé ? ».
 *
 *   Les quatre axes, volontairement DISTINCTS :
 *     1. Runtime permissions  — l'outil a-t-il le droit read/write/network/exec ?
 *                               (+ autorisation PAR AGENT sur les outils à risque)
 *                               → PermissionPolicy
 *     2. Autonomy policy      — vu le curseur suggest/ask/auto (+ .leannaignore),
 *                               faut-il exécuter, demander, ou refuser ?
 *                               → AutonomyPolicy
 *     3. Sandbox isolation    — la cible d'écriture reste-t-elle dans le sandbox ?
 *                               → assertSafeSandboxPath
 *     4. (Approbation humaine) — résolue EN DEHORS du gate : le gate se contente
 *                               de RENVOYER `ask` ; c'est l'appelant (Executor)
 *                               qui bloque et demande l'approbation. Le gate reste
 *                               ainsi pur et synchrone.
 *
 * Le gate ne DUPLIQUE aucune logique : il orchestre les évaluateurs existants
 * (`PermissionPolicy.enforce`, `AutonomyPolicy.decide`, `assertSafeSandboxPath`)
 * et fusionne leurs sorties en un verdict unique et ordonné.
 *
 * Ordre d'évaluation (le plus restrictif l'emporte, court-circuit au 1er `deny`) :
 *   permission → per-agent → autonomy → sandbox target.
 * Un `deny` de n'importe quel axe est définitif. Un `ask` (autonomy) est retenu
 * si aucun axe n'a produit de `deny`. Sinon `allow`.
 *
 * Pur et sans effet de bord : aucune écriture, aucune émission d'événement,
 * aucune exécution d'outil. Testable en isolation totale.
 */

import type { ToolPermission, ToolAttribution } from "./types.js";
import type { PermissionPolicy, PermissionDecision } from "./PermissionPolicy.js";
import type { AutonomyPolicy, AutonomyVerdict } from "../mission/AutonomyPolicy.js";

// ═══════════════════════════════════════════════════════════════════════════
// Verdict unifié
// ═══════════════════════════════════════════════════════════════════════════

/** Décision finale du gate. Superset ordonné : deny > ask > allow. */
export type AuthorizationDecision = "allow" | "ask" | "deny";

/** Axe ayant produit la décision (pour l'audit et l'UI). */
export type AuthorizationAxis = "permission" | "agent" | "autonomy" | "sandbox";

/** Contribution d'un axe au verdict final. */
export interface AxisOutcome {
  axis: AuthorizationAxis;
  decision: AuthorizationDecision;
  reason: string;
}

/** Verdict complet, traçable axe par axe. */
export interface AuthorizationVerdict {
  /** Décision finale = axe le plus restrictif. */
  decision: AuthorizationDecision;
  /** Nom de l'outil évalué. */
  toolName: string;
  /** Agent à l'origine de l'appel, si connu. */
  agentId?: string;
  /** Résumé lisible (concaténation des motifs décisifs). */
  reason: string;
  /** Détail de chaque axe évalué, dans l'ordre. */
  outcomes: AxisOutcome[];
  /** Décision runtime-permission brute (pour compat/erreur PermissionDenied). */
  permissionDecision: PermissionDecision;
  /** Verdict autonomy brut, si l'axe a été évalué. */
  autonomyVerdict?: AutonomyVerdict;
}

/** Entrée d'une évaluation. */
export interface AuthorizationRequest {
  toolName: string;
  /** Permissions requises par l'outil (sa déclaration). */
  required?: ToolPermission[];
  /** Attribution de l'outil (allowedAgents/risk) pour l'axe per-agent. */
  attribution?: ToolAttribution;
  /** Agent appelant (soumet l'axe per-agent + trace). */
  agentId?: string;
  /** Arguments de l'appel (source des chemins pour autonomy + sandbox). */
  args?: Record<string, unknown>;
}

/**
 * Vérificateur de cible sandbox. Injecté pour garder le gate testable et
 * découplé de l'état global du sandbox. Doit LEVER si la cible n'est pas
 * autorisée (comme `assertSafeSandboxPath`), sinon retourner sans erreur.
 *
 * Signature volontairement compatible avec `assertSafeSandboxPath(path)`.
 */
export type SandboxTargetChecker = (relativePath: string) => unknown;

export interface AuthorizationGateConfig {
  permissionPolicy: PermissionPolicy;
  /** Optionnel : sans lui, l'axe autonomy est neutre (allow). */
  autonomyPolicy?: AutonomyPolicy;
  /**
   * Optionnel : vérificateur de cible sandbox. Sans lui, l'axe sandbox est
   * neutre. Fourni typiquement comme `assertSafeSandboxPath` quand le sandbox
   * est actif.
   */
  sandboxChecker?: SandboxTargetChecker;
  /**
   * Ensemble des permissions considérées comme « effet de bord » pour décider
   * si une cible doit être validée par le sandbox. Défaut : write + dangerous
   * (on ne sandboxe pas les lectures ni le réseau — le sandbox protège les
   * ÉCRITURES de fichiers).
   */
  sideEffectForSandbox?: ReadonlySet<ToolPermission>;
}

/** Champs d'arguments couramment porteurs de chemins de fichiers. */
const PATH_ARG_KEYS = [
  "path",
  "filePath",
  "file",
  "target",
  "oldPath",
  "newPath",
  "dir",
  "directory",
] as const;

/** Permissions qui déclenchent une validation de cible sandbox (écriture). */
const DEFAULT_SANDBOX_SIDE_EFFECTS: ReadonlySet<ToolPermission> = new Set<ToolPermission>([
  "write",
  "dangerous",
]);

// ═══════════════════════════════════════════════════════════════════════════
// Gate
// ═══════════════════════════════════════════════════════════════════════════

export class AuthorizationGate {
  private readonly permissionPolicy: PermissionPolicy;
  private readonly autonomyPolicy?: AutonomyPolicy;
  private readonly sandboxChecker?: SandboxTargetChecker;
  private readonly sandboxSideEffects: ReadonlySet<ToolPermission>;

  constructor(config: AuthorizationGateConfig) {
    this.permissionPolicy = config.permissionPolicy;
    this.autonomyPolicy = config.autonomyPolicy;
    this.sandboxChecker = config.sandboxChecker;
    this.sandboxSideEffects = config.sideEffectForSandbox ?? DEFAULT_SANDBOX_SIDE_EFFECTS;
  }

  /**
   * Évalue un appel d'outil à travers les 4 axes et retourne un verdict unique.
   * Ne lève jamais : les erreurs (ex. sandbox) sont converties en `deny`.
   */
  authorize(req: AuthorizationRequest): AuthorizationVerdict {
    const outcomes: AxisOutcome[] = [];

    // ── Axe 1 & 2 : runtime permission + autorisation par agent ──────────────
    // PermissionPolicy.enforce couvre DÉJÀ les deux : permission de base puis
    // évaluation per-agent (allowedAgents/risk). On n'émet pas d'événement ici
    // (enforce le fait) : on lit sa décision et on la traduit en axes.
    const permissionDecision = this.permissionPolicy.enforce(
      req.toolName,
      req.required,
      req.agentId,
      req.attribution
    );

    const agentReason = permissionDecision.missing.find(
      (m): m is `agent-not-allowed:${string}` =>
        typeof m === "string" && m.startsWith("agent-not-allowed:")
    );

    if (!permissionDecision.allowed) {
      if (agentReason) {
        outcomes.push({
          axis: "agent",
          decision: "deny",
          reason: `Agent "${req.agentId}" non autorisé sur l'outil à risque "${req.toolName}".`,
        });
      } else {
        outcomes.push({
          axis: "permission",
          decision: "deny",
          reason: `Permission(s) [${permissionDecision.missing.join(", ")}] non accordée(s).`,
        });
      }
      return this.finalize(req, permissionDecision, outcomes);
    }

    // La permission passe. Si un motif agent est présent en mode audit
    // (allowed=true mais missing contient agent-not-allowed), on le trace sans
    // bloquer — cohérent avec la sémantique audit de PermissionPolicy.
    if (agentReason) {
      outcomes.push({
        axis: "agent",
        decision: "allow",
        reason: `Agent "${req.agentId}" hors liste (signalé en audit, non bloquant).`,
      });
    }
    outcomes.push({
      axis: "permission",
      decision: "allow",
      reason: "Permissions requises accordées.",
    });

    // ── Axe 3 : curseur d'autonomie (suggest/ask/auto + .leannaignore) ───────
    let autonomyVerdict: AutonomyVerdict | undefined;
    if (this.autonomyPolicy) {
      autonomyVerdict = this.autonomyPolicy.decide(req.toolName, req.args ?? {});
      outcomes.push({
        axis: "autonomy",
        decision: autonomyVerdict.decision,
        reason: autonomyVerdict.reason,
      });
      if (autonomyVerdict.decision === "deny") {
        return this.finalize(req, permissionDecision, outcomes, autonomyVerdict);
      }
    }

    // ── Axe 4 : validation de la cible sandbox (écritures uniquement) ────────
    // On ne valide la cible QUE pour les outils à effet d'écriture ET quand un
    // vérificateur est fourni (sandbox actif). Un chemin hors sandbox lève →
    // on convertit l'exception en `deny` explicite.
    if (this.sandboxChecker && this.requiresSandboxCheck(req.required)) {
      const paths = this.extractPaths(req.args ?? {});
      for (const p of paths) {
        try {
          this.sandboxChecker(p);
        } catch (err) {
          outcomes.push({
            axis: "sandbox",
            decision: "deny",
            reason: `Cible "${p}" rejetée par le sandbox : ${(err as Error).message}`,
          });
          return this.finalize(req, permissionDecision, outcomes, autonomyVerdict);
        }
      }
      if (paths.length > 0) {
        outcomes.push({
          axis: "sandbox",
          decision: "allow",
          reason: `Cible(s) [${paths.join(", ")}] validée(s) dans le sandbox.`,
        });
      }
    }

    return this.finalize(req, permissionDecision, outcomes, autonomyVerdict);
  }

  // ─── Interne ───────────────────────────────────────────────────────────────

  /**
   * Fusionne les axes en une décision finale : le plus restrictif l'emporte
   * (deny > ask > allow). Construit le message lisible à partir des motifs
   * décisifs.
   */
  private finalize(
    req: AuthorizationRequest,
    permissionDecision: PermissionDecision,
    outcomes: AxisOutcome[],
    autonomyVerdict?: AutonomyVerdict
  ): AuthorizationVerdict {
    const decision = mergeDecisions(outcomes.map((o) => o.decision));
    const decisive = outcomes.filter((o) => o.decision === decision);
    const reason =
      decisive.length > 0
        ? decisive.map((o) => `[${o.axis}] ${o.reason}`).join(" ")
        : "Autorisé.";

    const verdict: AuthorizationVerdict = {
      decision,
      toolName: req.toolName,
      reason,
      outcomes,
      permissionDecision,
    };
    if (req.agentId !== undefined) verdict.agentId = req.agentId;
    if (autonomyVerdict !== undefined) verdict.autonomyVerdict = autonomyVerdict;
    return verdict;
  }

  /** Un outil doit voir sa cible validée si l'une de ses permissions écrit. */
  private requiresSandboxCheck(required: readonly ToolPermission[] | undefined): boolean {
    if (!required || required.length === 0) {
      // Sans permission déclarée : prudence, on valide la cible si un chemin
      // est présent (aligné sur le traitement « effet de bord potentiel »).
      return true;
    }
    return required.some((p) => this.sandboxSideEffects.has(p));
  }

  /** Extrait les chemins candidats des arguments (mêmes clés qu'AutonomyPolicy). */
  private extractPaths(args: Record<string, unknown>): string[] {
    if (!args || typeof args !== "object") return [];
    const paths: string[] = [];
    for (const key of PATH_ARG_KEYS) {
      const value = (args as Record<string, unknown>)[key];
      if (typeof value === "string" && value.trim()) paths.push(value.trim());
    }
    return paths;
  }
}

/**
 * Fusionne des décisions d'axes : `deny` domine `ask`, qui domine `allow`.
 * Exporté pour test.
 */
export function mergeDecisions(decisions: readonly AuthorizationDecision[]): AuthorizationDecision {
  if (decisions.includes("deny")) return "deny";
  if (decisions.includes("ask")) return "ask";
  return "allow";
}

// ═══════════════════════════════════════════════════════════════════════════
// Fabrique câblée au sandbox réel
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Construit un `AuthorizationGate` prêt pour la production, câblé au sandbox
 * réel : l'axe sandbox n'est actif que lorsque le sandbox est READY
 * (`isSandboxActive()`), et délègue alors la validation de cible à
 * `assertSafeSandboxPath`. En dehors de cet état, l'axe sandbox est neutre
 * (le sandbox n'est pas la seule protection : permission + autonomy restent).
 *
 * Import dynamique du module sandbox pour éviter tout couplage de chargement
 * runtime → utils et rester testable (le gate lui-même n'importe rien).
 *
 * @param permissionPolicy - Politique de permissions runtime (obligatoire).
 * @param autonomyPolicy - Curseur d'autonomie (optionnel).
 */
export async function createAuthorizationGate(
  permissionPolicy: PermissionPolicy,
  autonomyPolicy?: AutonomyPolicy
): Promise<AuthorizationGate> {
  let sandboxChecker: SandboxTargetChecker | undefined;
  try {
    const sandbox = await import("../utils/sandbox.js");
    // Le checker consulte l'état à CHAQUE appel : si le sandbox n'est pas
    // READY, on ne valide pas la cible (l'axe est neutre pour cet appel),
    // sinon `assertSafeSandboxPath` lève sur toute cible non conforme.
    sandboxChecker = (relativePath: string) => {
      if (!sandbox.isSandboxActive()) return undefined;
      return sandbox.assertSafeSandboxPath(relativePath);
    };
  } catch {
    sandboxChecker = undefined;
  }

  const config: AuthorizationGateConfig = { permissionPolicy };
  if (autonomyPolicy) config.autonomyPolicy = autonomyPolicy;
  if (sandboxChecker) config.sandboxChecker = sandboxChecker;
  return new AuthorizationGate(config);
}
