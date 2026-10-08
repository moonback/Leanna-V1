/**
 * capabilityInference — Déduction heuristique des capacités requises
 *
 * Quand une délégation n'a pas de cible explicite (voir `OpenDelegation`), le
 * négociateur contract-net a besoin d'un ensemble de `requiredCapabilities`
 * pour scorer les bids. Ce module déduit ces capacités à partir du texte libre
 * de la tâche (RAISON + INSTRUCTIONS), par simple correspondance de mots-clés
 * FR/EN vers des capacités d'agents réelles (telles que déclarées dans roles.ts).
 *
 * C'est volontairement une HEURISTIQUE : si rien ne matche, on retombe sur un
 * socle générique de lecture/analyse que la plupart des agents possèdent, afin
 * de ne jamais produire un appel d'offres sans aucune capacité (ce qui
 * disqualifierait tout le monde).
 */

/** Règle : si l'un des mots-clés apparaît, ajouter ces capacités requises. */
interface InferenceRule {
  keywords: string[];
  capabilities: string[];
}

/**
 * Table de correspondance mots-clés → capacités.
 * Les capacités référencées existent dans les définitions d'agents (roles.ts).
 * L'ordre n'a pas d'importance : toutes les règles qui matchent sont unionnées.
 */
const INFERENCE_RULES: InferenceRule[] = [
  // ── Tests & QA ──
  {
    keywords: ["test", "tests", "unitaire", "couverture", "coverage", "qa", "e2e", "non-regression", "non-régression", "régression", "regression"],
    capabilities: ["run_project_command", "verify_full"],
  },
  // ── Débogage ──
  {
    keywords: ["bug", "debug", "débogage", "debogage", "stacktrace", "stack trace", "erreur", "exception", "crash", "diagnostic", "root cause", "root-cause"],
    capabilities: ["verify_typecheck", "run_project_command"],
  },
  // ── Revue de code ──
  {
    keywords: ["revue", "review", "audit", "qualité", "qualite", "lint", "anti-pattern", "antipattern", "maintenabilité", "maintenabilite"],
    capabilities: ["verify_lint", "verify_typecheck", "analyze_project_file"],
  },
  // ── Refactorisation ──
  {
    keywords: ["refactor", "refactorisation", "restructuration", "dette technique", "clean code", "solid", "dry", "découplage", "decouplage"],
    capabilities: ["modify_project_file", "knowledge_impact_analyze", "verify_full"],
  },
  // ── Sécurité ──
  {
    keywords: ["sécurité", "securite", "security", "faille", "vulnérabilité", "vulnerabilite", "owasp", "secret", "token", "injection", "xss", "csrf"],
    capabilities: ["analyze_project_file", "search_in_files"],
  },
  // ── Architecture ──
  {
    keywords: ["architecture", "conception", "schéma", "schema", "module", "contrat d'interface", "contrats d'interface", "design système", "design systeme", "impact"],
    capabilities: ["knowledge_impact_analyze", "knowledge_search_entities", "knowledge_build_context"],
  },
  // ── Recherche / analyse ──
  {
    keywords: ["recherche", "research", "analyse d'impact", "analyse impact", "dépendance", "dependance", "dependency", "mémoire projet", "memoire projet", "entités", "entites"],
    capabilities: ["knowledge_search_entities", "knowledge_memory_list", "knowledge_impact_analyze"],
  },
  // ── Implémentation / code ──
  {
    keywords: ["implémenter", "implementer", "implément", "implement", "coder", "développer", "developper", "fonctionnalité", "fonctionnalite", "feature", "composant"],
    capabilities: ["write_project_file", "modify_project_file", "verify_typecheck"],
  },
  // ── Rédaction ──
  {
    keywords: ["rédiger", "rediger", "rédaction", "redaction", "write", "readme", "guide", "article", "rapport", "documentation", "doc"],
    capabilities: ["write_project_file"],
  },
  // ── Relecture / correction ──
  {
    keywords: ["relecture", "correction", "corriger", "orthographe", "grammaire", "proofread", "stylistique"],
    capabilities: ["modify_project_file", "verify_file"],
  },
  // ── Traduction ──
  {
    keywords: ["traduire", "traduction", "translate", "translation", "localisation", "localization"],
    capabilities: ["write_project_file", "modify_project_file"],
  },
  // ── Résumé / synthèse ──
  {
    keywords: ["résumé", "resume", "synthèse", "synthese", "summary", "summarize", "abstract", "condensé", "condense"],
    capabilities: ["read_project_file", "knowledge_memory_search"],
  },
  // ── Performance ──
  {
    keywords: ["performance", "optimisation", "optimiser", "bottleneck", "lenteur", "core web vitals", "lazy loading", "code splitting", "bundle"],
    capabilities: ["knowledge_impact_analyze", "verify_full", "run_project_command"],
  },
  // ── Accessibilité ──
  {
    keywords: ["accessibilité", "accessibilite", "accessibility", "wcag", "aria", "a11y", "contraste", "navigation clavier"],
    capabilities: ["analyze_project_file", "modify_project_file"],
  },
];

/**
 * Socle générique appliqué quand aucune règle ne matche : lecture + analyse,
 * capacités que possèdent la quasi-totalité des agents. Évite un appel d'offres
 * sans aucune capacité requise (qui disqualifierait tous les candidats).
 */
const FALLBACK_CAPABILITIES = ["read_project_file", "analyze_project_file"];

/**
 * Déduit les capacités requises d'une tâche à partir de son texte libre.
 *
 * @param reason        description/raison de la tâche (obligatoire)
 * @param instructions  instructions complémentaires (optionnel)
 * @returns liste dédupliquée de capacités requises (jamais vide)
 */
export function inferRequiredCapabilities(reason: string, instructions?: string): string[] {
  const haystack = `${reason} ${instructions ?? ""}`.toLowerCase();
  const inferred = new Set<string>();

  for (const rule of INFERENCE_RULES) {
    if (rule.keywords.some((kw) => haystack.includes(kw))) {
      for (const cap of rule.capabilities) inferred.add(cap);
    }
  }

  if (inferred.size === 0) {
    for (const cap of FALLBACK_CAPABILITIES) inferred.add(cap);
  }

  return [...inferred];
}
