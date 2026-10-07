/**
 * agentDefinitionSchema.ts — Schéma Zod + vérification HMAC pour DynamicAgentDefinition
 *
 * Deux couches de défense complémentaires :
 *
 *  1. Validation structurelle (Zod) :
 *     - role       : snake_case sans traversal (`..`, `/`) ni injection shell
 *     - capabilities : chaque entrée doit appartenir à l'ensemble ALLOWED_CAPABILITIES
 *     - systemPrompt : longueur max + détection de marqueurs d'injection courants
 *     - maxConcurrency / defaultTimeoutMs : plafonds raisonnables
 *
 *  2. Vérification d'empreinte HMAC-SHA256 (optionnelle) :
 *     Quand la variable d'environnement LEANNA_AGENT_SECRET est définie, chaque
 *     définition critique doit porter un champ `signature` calculé comme :
 *       HMAC-SHA256(LEANNA_AGENT_SECRET, stableStringify(définition sans "signature"))
 *     Cette vérification transforme le registre dynamique en liste blanche signée :
 *     un agent tiers injecté sans la clé secrète est refusé.
 *
 * Usage :
 *   import { validateAgentDefinition } from "../security/agentDefinitionSchema.js";
 *   validateAgentDefinition(def);  // lève AgentSecurityError si invalide
 */

import { z } from "zod";
import { createHmac } from "crypto";
import type { DynamicAgentDefinition } from "../agents/DynamicAgentRegistry.js";

// ═══════════════════════════════════════════════════════════════════════════════
// Ensemble des capacités autorisées
// Toute capability non listée ici est refusée — défense en profondeur contre
// un agent tiers qui s'attribuerait des outils dangereux inventés.
// ═══════════════════════════════════════════════════════════════════════════════

// ⚠️ SOURCE DE VÉRITÉ : cette liste DOIT rester synchronisée avec
// `EXECUTABLE_AGENT_TOOLS` dans server/agents/AgentExecutor.ts — l'ensemble des
// skills structurés réellement exécutables par un agent. On la duplique ici
// (plutôt que de l'importer) pour garder ce module de sécurité auto-contenu et
// auditable, sans tirer la lourde chaîne de dépendances de l'exécuteur. Un nom
// de capability qui n'est pas un vrai outil ne protège rien ; un vrai outil
// absent de cette liste bloque à tort tout agent légitime qui le déclare.
export const ALLOWED_CAPABILITIES = new Set<string>([
  // ── Lecture / analyse de fichiers ──
  "list_project_files", "read_project_file", "read_file_outline",
  "search_in_files", "analyze_project_file",
  // ── Écriture / édition contrôlée ──
  "write_project_file", "modify_project_file", "apply_patch",
  "patch_project_file", "rename_project_file", "delete_project_file",
  "create_project_directory",
  // ── Vérification ──
  "verify_file", "verify_typecheck", "verify_lint", "verify_format",
  "verify_full",
  // ── Exécution encadrée & qualité ──
  "run_project_command", "quality_loop",
  // ── Connaissance / mémoire ──
  "knowledge_build_context", "knowledge_semantic_search",
  "knowledge_search_entities", "knowledge_memory_search",
  "knowledge_memory_add", "knowledge_memory_list",
  "knowledge_impact_analyze", "knowledge_status", "knowledge_reindex",
  // ── AST call-graph ──
  "knowledge_ast_callers", "knowledge_ast_callees",
  "knowledge_ast_call_chain", "knowledge_ast_file_inspect",
  // ── Automatisation & vision ──
  "automation_navigate", "automation_click", "automation_type",
  "automation_extract", "automation_inspect", "automation_screenshot",
  "automation_analyze_screenshot", "automation_scroll",
  // ── Raisonnement & délégation ──
  "reasoning_think", "agent_execute",
]);

// ═══════════════════════════════════════════════════════════════════════════════
// Patterns d'injection à détecter dans systemPrompt
// ═══════════════════════════════════════════════════════════════════════════════

const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+instructions?/i,
  /you\s+are\s+now\s+/i,
  /disregard\s+(your|the)\s+(system|previous|above)/i,
  /act\s+as\s+(a\s+)?(?:different|new|another)\s+ai/i,
  /\bsudo\b.*\bmode\b/i,
  /override\s+(safety|security|policy)/i,
  // Marqueurs de sortie de contexte système
  /<\/?(system|user|assistant)>/i,
  /\[INST\]|\[\/INST\]/i,
  /<<SYS>>|<\/SYS>/i,
];

// ═══════════════════════════════════════════════════════════════════════════════
// Contraintes numériques
// ═══════════════════════════════════════════════════════════════════════════════

const MAX_CONCURRENCY = 10;
const MAX_TIMEOUT_MS  = 5 * 60 * 1000;  // 5 minutes
const MAX_PROMPT_LEN  = 8_000;           // ~2k tokens, largement suffisant
const MAX_CAP_COUNT   = 20;              // limite le blast radius d'un agent tiers

// ═══════════════════════════════════════════════════════════════════════════════
// Erreur dédiée — permet de la distinguer d'autres erreurs de validation
// ═══════════════════════════════════════════════════════════════════════════════

export class AgentSecurityError extends Error {
  constructor(message: string, public readonly details?: string[]) {
    super(message);
    this.name = "AgentSecurityError";
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Schéma Zod
// ═══════════════════════════════════════════════════════════════════════════════

const roleSchema = z
  .string()
  .min(1)
  .max(64)
  // snake_case uniquement, sans point-point ni slash (pas de traversal)
  .regex(
    /^[a-z][a-z0-9_]*$/,
    "Le rôle doit être en snake_case (lettres minuscules, chiffres, underscores). Pas de '..' ni '/'."
  )
  .refine((r) => !r.includes("..") && !r.includes("/"), {
    message: "Traversal de chemin interdit dans le rôle",
  });

const capabilitySchema = z
  .string()
  .refine((cap) => ALLOWED_CAPABILITIES.has(cap), {
    message: `Capability non autorisée. Valeurs permises : ${[...ALLOWED_CAPABILITIES].join(", ")}`,
  });

const systemPromptSchema = z
  .string()
  .min(1)
  .max(MAX_PROMPT_LEN, `systemPrompt trop long (max ${MAX_PROMPT_LEN} caractères)`)
  .refine(
    (prompt) => !INJECTION_PATTERNS.some((re) => re.test(prompt)),
    { message: "systemPrompt contient un pattern d'injection connu" }
  );

export const agentDefinitionSchema = z.object({
  role: roleSchema,
  name: z.string().min(1).max(128),
  description: z.string().min(1).max(500),
  capabilities: z
    .array(capabilitySchema)
    .max(MAX_CAP_COUNT, `Trop de capabilities (max ${MAX_CAP_COUNT})`),
  systemPrompt: systemPromptSchema,
  maxConcurrency: z.number().int().min(1).max(MAX_CONCURRENCY),
  defaultTimeoutMs: z.number().int().min(1_000).max(MAX_TIMEOUT_MS),
  // Champs optionnels — pas de contrainte métier forte
  id: z.string().optional(),
  version: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  author: z.string().max(256).optional(),
  isActive: z.boolean().optional(),
  tags: z.array(z.string().max(64)).max(20).optional(),
  // Signature HMAC optionnelle — requise quand LEANNA_AGENT_SECRET est présent
  signature: z.string().optional(),
  // Permissions de délégation — validées structurellement
  permissions: z
    .object({
      allowDelegation: z.boolean(),
      allowReceiveDelegation: z.boolean(),
      maxDelegationDepth: z.number().int().min(0).max(5),
      allowedTargets: z.array(z.string()).optional(),
      allowedCapabilities: z.array(z.string()).optional(),
      allowedTools: z.array(z.string()).optional(),
      budget: z
        .object({
          maxDelegations: z.number().int().min(0).optional(),
          maxTokens: z.number().int().min(0).optional(),
        })
        .optional(),
      riskLevel: z.enum(["low", "medium", "high", "critical"]).optional(),
    })
    .optional(),
});

export type ValidatedAgentDefinition = z.infer<typeof agentDefinitionSchema>;

// ═══════════════════════════════════════════════════════════════════════════════
// Vérification de signature HMAC
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Sérialisation stable (clés triées) pour le calcul HMAC.
 * Exclut le champ `signature` lui-même.
 */
function stableStringify(def: Record<string, unknown>): string {
  const { signature: _sig, updatedAt: _upd, ...rest } = def;
  return JSON.stringify(rest, Object.keys(rest).sort());
}

/**
 * Calcule la signature HMAC-SHA256 d'une définition d'agent.
 *
 * @param def   - Définition de l'agent (sans `signature`)
 * @param secret - Clé secrète HMAC
 */
export function computeAgentSignature(
  def: Record<string, unknown>,
  secret: string
): string {
  return createHmac("sha256", secret).update(stableStringify(def)).digest("hex");
}

/**
 * Vérifie la signature d'une définition d'agent.
 * Utilise une comparaison à temps constant pour éviter les timing attacks.
 *
 * @returns `true` si la signature est valide, `false` sinon
 */
export function verifyAgentSignature(
  def: Record<string, unknown>,
  signature: string,
  secret: string
): boolean {
  const expected = computeAgentSignature(def, secret);
  // Comparaison à temps constant
  if (expected.length !== signature.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return mismatch === 0;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Point d'entrée principal
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Valide une définition d'agent dynamique.
 *
 * 1. Valide la structure via Zod.
 * 2. Si LEANNA_AGENT_SECRET est défini, vérifie la signature HMAC.
 *
 * @throws {AgentSecurityError} si la validation échoue
 */
export function validateAgentDefinition(
  raw: unknown
): asserts raw is DynamicAgentDefinition {
  // ── Étape 1 : validation structurelle ──
  const result = agentDefinitionSchema.safeParse(raw);
  if (!result.success) {
    const details = result.error.issues.map(
      (i) => `[${i.path.join(".")}] ${i.message}`
    );
    throw new AgentSecurityError(
      `Définition d'agent invalide (${details.length} erreur(s))`,
      details
    );
  }

  // ── Étape 2 : vérification HMAC (optionnelle, requise quand la clé est présente) ──
  const secret = process.env["LEANNA_AGENT_SECRET"];
  if (secret) {
    const def = result.data;
    if (!def.signature) {
      throw new AgentSecurityError(
        `LEANNA_AGENT_SECRET est configuré : la définition de l'agent "${def.role}" doit porter un champ "signature".`
      );
    }
    const valid = verifyAgentSignature(
      def as unknown as Record<string, unknown>,
      def.signature,
      secret
    );
    if (!valid) {
      throw new AgentSecurityError(
        `Signature HMAC invalide pour l'agent "${def.role}". Définition refusée.`
      );
    }
  }
}
