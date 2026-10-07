/**
 * ResultParser — Stub de compatibilité
 * 
 * Extrait le résumé, les suggestions et normalise la sortie des agents.
 * Ce fichier existe uniquement pour que AgentExecutor.ts continue à fonctionner.
 */

export class ResultParser {
  /**
   * Normalise le résultat brut de reasoning_think en texte exploitable.
   */
  normalizeResult(thinkResult: any): string {
    if (!thinkResult) return "";
    if (typeof thinkResult === "string") return thinkResult;
    // reasoning_think retourne { thought, answer, reasoning }
    return thinkResult.answer || thinkResult.reasoning || thinkResult.thought || JSON.stringify(thinkResult);
  }

  /**
   * Extrait un résumé court de la sortie de l'agent.
   */
  extractSummary(text: string): string {
    // Chercher ## Résumé
    const summaryMatch = text.match(/## Résumé\n([\s\S]*?)(?=\n##|$)/);
    if (summaryMatch) {
      return summaryMatch[1].trim().slice(0, 500);
    }
    // Fallback: premiers paragraphes non vides
    const lines = text.split("\n").filter((l) => l.trim() && !l.startsWith("#"));
    return lines.slice(0, 3).join(" ").slice(0, 500);
  }

  /**
   * Extrait les suggestions/recommandations de la sortie.
   */
  extractSuggestions(text: string): string[] | undefined {
    const sugMatch = text.match(/## Recommandations([\s\S]*?)(?=\n##|$)/);
    if (!sugMatch) return undefined;

    const lines = sugMatch[1]
      .split("\n")
      .filter((l) => l.trim().startsWith("-"))
      .map((l) => l.replace(/^-\s*/, "").trim())
      .filter(Boolean);

    return lines.length > 0 ? lines : undefined;
  }

  /**
   * Détecte une déclaration d'échec irréfutable dans le rapport final du modèle.
   *
   * Deux canaux, du plus fiable au plus souple :
   *
   *   1. CANAL STRUCTURÉ (prioritaire, déterministe) — un marqueur machine émis
   *      par l'agent, p. ex. `<!-- leanna:outcome=failed reason=... -->` ou une
   *      ligne `Statut: FAILED`. C'est le contrat de sortie structuré : il ne
   *      dépend d'aucune tournure de phrase, donc un agent qui déclare "je n'ai
   *      pas pu terminer" via ce marqueur est détecté de façon fiable, là où
   *      l'heuristique textuelle le ratait. Les valeurs reconnues comme échec
   *      sont `failed` et `blocked` (un `blocked` reste un non-succès du point
   *      de vue du rapport ; la cause fine est portée ailleurs).
   *
   *   2. CANAL HEURISTIQUE (repli, inchangé) — on ne refuse QUE si l'agent
   *      déclare explicitement "Vérification : FAIL" (section preuves) ou un
   *      titre ## Échec / ## FAIL. Un texte honnête comme "aucune modification
   *      n'a pu être appliquée dans ce tour" n'est PAS un marqueur d'échec :
   *      cela reste géré par writeRequired dans collectEvidence.
   *
   * Priorité au canal structuré : s'il est présent, il tranche sans ambiguïté.
   * Sinon, repli sur l'heuristique historique (rétro-compatibilité totale pour
   * les agents qui n'émettent pas encore le marqueur).
   */
  detectFailure(text: string): string | null {
    // ── 1. Canal structuré (déterministe) ──────────────────────────────────
    const structured = this.detectStructuredOutcome(text);
    if (structured) {
      if (structured.outcome === "failed" || structured.outcome === "blocked") {
        const label = structured.outcome === "failed" ? "échec" : "blocage";
        return structured.reason
          ? `Le rapport final déclare un ${label} (statut structuré) : ${structured.reason}`
          : `Le rapport final déclare un ${label} via son statut structuré.`;
      }
      // Statut structuré explicitement non-échec (success/partial/no_change) :
      // on fait confiance au contrat et on NE déclenche PAS le repli heuristique,
      // afin qu'un mot comme "FAIL" cité dans une explication ne crée pas de faux échec.
      return null;
    }

    // ── 2. Canal heuristique (repli, comportement historique) ───────────────
    // 2a. Marqueur dans la section Preuves d'exécution : "Vérification : FAIL"
    const strictFail = text.match(
      /[-•]\s*vérification\s*:\s*(?:FAIL|ÉCHEC|ECHEC)\b/i
    );
    if (strictFail) return "Le rapport final déclare explicitement une vérification en échec.";

    // 2b. Titre de section d'échec irréfutable (## Échec / ## FAIL / ## Blocage)
    //     Ne pas capturer ## Incomplet, ## Tâche incomplète, ## Résultats vérifiés, etc.
    const failHeader = text.match(
      /(?:^|\n)\s*##\s+(?:Échec|Echec|FAIL)\b/i
    );
    if (failHeader) return failHeader[0].trim().replace(/^#+\s*/, "").slice(0, 200);

    return null;
  }

  /**
   * Extrait le marqueur de statut structuré émis par l'agent, s'il existe.
   *
   * Deux formes acceptées (insensibles à la casse), afin de laisser au modèle
   * un canal fiable qui ne dépend pas de la rédaction :
   *
   *   - Commentaire HTML machine : `<!-- leanna:outcome=failed reason=... -->`
   *   - Ligne de champ : `Statut: FAILED` / `Status: blocked` (reason optionnelle
   *     sur la même ligne, séparée par `—`, `-`, `:` ou `|`).
   *
   * Les valeurs d'outcome reconnues correspondent au type `TaskOutcome`
   * (success | partial | blocked | no_change | failed). Retourne `null` si
   * aucun marqueur n'est présent (l'appelant retombe alors sur l'heuristique).
   */
  private detectStructuredOutcome(
    text: string
  ): { outcome: string; reason?: string } | null {
    const normalize = (raw: string): string | null => {
      const v = raw.trim().toLowerCase();
      const map: Record<string, string> = {
        success: "success",
        succès: "success",
        succes: "success",
        ok: "success",
        partial: "partial",
        partiel: "partial",
        blocked: "blocked",
        bloqué: "blocked",
        bloque: "blocked",
        no_change: "no_change",
        nochange: "no_change",
        failed: "failed",
        fail: "failed",
        échec: "failed",
        echec: "failed",
      };
      return map[v] ?? null;
    };

    // Forme 1 : commentaire machine <!-- leanna:outcome=... reason=... -->
    const comment = text.match(
      /<!--\s*leanna:outcome\s*=\s*([a-zA-ZÀ-ÿ_]+)(?:\s+reason\s*=\s*([^>]*?))?\s*-->/i
    );
    if (comment) {
      const outcome = normalize(comment[1]);
      if (outcome) {
        const reason = comment[2]?.trim().slice(0, 300) || undefined;
        return { outcome, ...(reason ? { reason } : {}) };
      }
    }

    // Forme 2 : ligne de champ "Statut: FAILED — raison"
    const field = text.match(
      /(?:^|\n)\s*(?:statut|status)\s*:\s*([a-zA-ZÀ-ÿ_]+)\s*(?:[—\-:|]\s*(.+))?$/im
    );
    if (field) {
      const outcome = normalize(field[1]);
      if (outcome) {
        const reason = field[2]?.trim().slice(0, 300) || undefined;
        return { outcome, ...(reason ? { reason } : {}) };
      }
    }

    return null;
  }
}
