/**
 * ContextResolver — Résout la configuration runtime en PromptContext
 *
 * Le builder ne détermine plus lui-même le contexte : il délègue à ce
 * composant, qui normalise la config et déduit le taskType manquant.
 *
 * Point d'extension : le runtime peut injecter un taskType déjà classifié
 * via SystemPromptConfig, rendant le builder totalement déterministe.
 */

import type { SystemPromptConfig, AgentRole } from "./types.js";
import type { PromptContext, TaskType } from "./types/context.js";
import { VALID_AGENT_ROLES } from "./PolicyValidator.js";

// ═══════════════════════════════════════════════════════════════════════════════
// ContextResolver
// ═══════════════════════════════════════════════════════════════════════════════

export class ContextResolver {
  /**
   * Résout une SystemPromptConfig en PromptContext normalisé.
   *
   * Ordre de priorité pour taskType :
   *   1. config.taskType (fourni explicitement par le runtime/classifieur)
   *   2. Déduction depuis config.mode
   *   3. Valeur par défaut : "general"
   */
  resolve(config: SystemPromptConfig & { taskType?: TaskType } = {}): PromptContext {
    const mode = config.mode ?? "full";
    const { taskType, taskTypeInferred } = this.resolveTaskType(config, mode);

    return {
      mode,
      taskType,
      taskTypeInferred,

      // Défaut 'gemini' : préserve le comportement historique (directives Gemini
      // actives) quand le runtime ne fournit pas explicitement le fournisseur.
      provider: config.textProvider ?? "gemini",

      aiName: config.aiName ?? "Leanna",
      userName: config.userName,
      userRole: config.userRole,

      workspace: config.workspace,

      agents: {
        enabled: config.agents?.enabled !== false, // activé par défaut
        // C10 : filtrer les rôles inconnus avant de les exposer au pipeline.
        allowedRoles: this.sanitizeRoles(config.agents?.allowedRoles),
      },

      tools: {
        available: (config as any).tools?.available ?? [],
        enabled:   (config as any).tools?.enabled   ?? [],
      },

      language:      config.language,
      responseStyle: config.responseStyle,

      extraSections: config.extraSections?.map(s => ({
        id:        s.id,
        content:   s.content,
        // Les extra sections n'ont pas de scope : elles sont toujours incluses,
        // mais marquées `untrusted` : contenu runtime arbitraire traité comme
        // donnée hostile potentielle, jamais comme instruction système (C1).
        authority: "untrusted" as const,
      })),
    };
  }

  // ─── Privé ────────────────────────────────────────────────────────────────

  /**
   * Filtre les rôles inconnus (C10). Retourne undefined si la liste d'origine
   * était absente, pour préserver la sémantique « aucune restriction de rôle ».
   */
  private sanitizeRoles(roles: readonly unknown[] | undefined): AgentRole[] | undefined {
    if (!Array.isArray(roles)) return undefined;
    return roles.filter(
      (r): r is AgentRole => typeof r === "string" && VALID_AGENT_ROLES.has(r),
    );
  }

  private resolveTaskType(
    config: SystemPromptConfig & { taskType?: TaskType },
    mode:   string,
  ): { taskType: TaskType; taskTypeInferred: boolean } {
    // 1. Fourni explicitement — le builder est alors totalement déterministe.
    if (config.taskType) {
      return { taskType: config.taskType, taskTypeInferred: false };
    }

    // 2. Déduction sûre depuis le mode : "ask" ⇒ "document" (pas d'effet de bord).
    if (mode === "ask") {
      return { taskType: "document", taskTypeInferred: true };
    }

    // 3. C8 : tâche à effet de bord (mode "full") sans taskType classifié.
    //    On NE retombe PLUS silencieusement sur "general" (ce qui désactivait
    //    les règles scopeées coding/debugging/… et pouvait masquer une
    //    classification manquante). On conserve "general" comme type nominal
    //    MAIS on marque taskTypeInferred=true : les garde-fous critiques sont
    //    déjà en scope "global" (indépendants du taskType), et le flag permet
    //    au pipeline/validateur d'adopter une posture conservative et de tracer
    //    le fait que la tâche n'a pas été classifiée.
    return { taskType: "general", taskTypeInferred: true };
  }
}
