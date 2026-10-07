import { z } from "zod";

/**
 * Schéma de validation strict des variables d'environnement (Phase 3).
 *
 * Objectif : une source unique, typée et validée pour toute la configuration.
 * Au lieu de lire `process.env.X` dispersé dans le code (non typé, non validé),
 * on parse `process.env` UNE fois au démarrage via {@link loadEnv} puis on
 * récupère un objet immuable et typé via {@link getEnv}.
 *
 * Règles :
 * - toute variable est optionnelle (comportement historique : les valeurs par
 *   défaut et l'auto-génération des secrets restent gérées par le runtime) ;
 * - les variables présentes doivent respecter leur format (URL, booléen, enum,
 *   entier…) sinon le boot échoue avec un message agrégé et lisible ;
 * - une chaîne vide ("") est traitée comme "non définie" pour rester compatible
 *   avec les `.env` où les clés optionnelles sont laissées vides.
 */

/** Traite "" comme absent (les .env laissent souvent les clés vides). */
const optionalString = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z.string().optional(),
);

/** Booléen tolérant : accepte "true"/"false" (insensible à la casse). */
const booleanFlag = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z
    .string()
    .refine((v) => ["true", "false"].includes(v.trim().toLowerCase()), {
      message: 'doit valoir "true" ou "false"',
    })
    .optional(),
);

/** URL contrainte à une liste de protocoles. */
function urlWithProtocols(protocols: string[], label: string) {
  return z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z
      .string()
      .refine(
        (v) => {
          try {
            return protocols.includes(new URL(v).protocol);
          } catch {
            return false;
          }
        },
        { message: `doit être une URL ${label} valide` },
      )
      .optional(),
  );
}

/** Entier positif (≥ 1) exprimé en chaîne. */
const positiveIntString = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z
    .string()
    .refine((v) => /^\d+$/.test(v) && Number(v) >= 1, {
      message: "doit être un entier positif",
    })
    .optional(),
);

/**
 * Schéma complet. On déclare explicitement les variables connues et validées ;
 * `.passthrough()` conserve les autres clés d'environnement intactes pour ne
 * rien casser (le runtime lit encore quelques variables non critiques).
 */
export const envSchema = z
  .object({
    // ── Environnement & réseau ──
    NODE_ENV: z
      .preprocess(
        (v) => (typeof v === "string" ? v.trim().toLowerCase() : v),
        z.enum(["development", "production", "test"]).optional(),
      ),
    VITE_SERVER_PORT: positiveIntString,
    Leanna_LISTEN_HOST: optionalString,
    DISABLE_HMR: booleanFlag,
    APP_URL: urlWithProtocols(["http:", "https:"], "HTTP(S)"),

    // ── Sécurité & secrets ──
    Leanna_API_TOKEN: optionalString,
    VITE_Leanna_API_TOKEN: optionalString,
    Leanna_MASTER_KEY: optionalString,
    LEANNA_AGENT_SECRET: optionalString,
    SANDBOX_EXIT_CODE: z.preprocess(
      (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
      z
        .string()
        .refine((v) => /^\d{6}$/.test(v), {
          message: "doit contenir exactement 6 chiffres",
        })
        .optional(),
    ),

    // ── Fournisseurs IA ──
    GEMINI_API_KEY: optionalString,
    OPENROUTER_API_KEY: optionalString,
    OPENROUTER_FREE_API_KEY: optionalString,
    OPENROUTER_MODEL: optionalString,
    OPENROUTER_REFERER: optionalString,
    OPENROUTER_TITLE: optionalString,
    OPENROUTER_IMAGE_MODEL: optionalString,
    OPENROUTER_EMBEDDING_MODEL: optionalString,
    LEANNA_SAFETY_GATE: z.preprocess(
      (v) => (typeof v === "string" ? v.trim().toLowerCase() : v),
      z.enum(["off", "audit", "enforce"]).optional(),
    ),

    // ── Comportement de l'assistant ──
    ENABLE_CHAIN_OF_THOUGHT: booleanFlag,
    FORCE_TIERED_TOOLS: booleanFlag,
    SELF_HEAL_READONLY: booleanFlag,
    ALLOW_FTP_PRIVATE_IPS: booleanFlag,

    // ── Autonomie ──
    LEANNA_AUTONOMY_MODE: z.preprocess(
      (v) => (typeof v === "string" ? v.trim().toLowerCase() : v),
      z.enum(["suggest", "ask", "auto"]).optional(),
    ),
    LEANNA_AUTO_ALLOW_DANGEROUS: booleanFlag,

    // ── Permissions ──
    Leanna_PERMISSION_MODE: z.preprocess(
      (v) => (typeof v === "string" ? v.trim().toLowerCase() : v),
      z.enum(["enforce", "audit", "off"]).optional(),
    ),
    Leanna_GRANTED_PERMISSIONS: optionalString,
    Leanna_DRY_RUN: booleanFlag,

    // ── Audits de boot ──
    Leanna_ATTRIBUTION_ENFORCEMENT: z.preprocess(
      (v) => (typeof v === "string" ? v.trim().toLowerCase() : v),
      z.enum(["warn", "strict", "off"]).optional(),
    ),
    Leanna_CAPABILITY_ENFORCEMENT: z.preprocess(
      (v) => (typeof v === "string" ? v.trim().toLowerCase() : v),
      z.enum(["warn", "strict", "off"]).optional(),
    ),

    // ── Supabase ──
    SUPABASE_URL: urlWithProtocols(["http:", "https:"], "HTTP(S)"),
    SUPABASE_SERVICE_ROLE_KEY: optionalString,
    SUPABASE_ANON_KEY: optionalString,
    VITE_SUPABASE_URL: urlWithProtocols(["http:", "https:"], "HTTP(S)"),
    VITE_SUPABASE_ANON_KEY: optionalString,

    // ── Redis / cache ──
    REDIS_URL: urlWithProtocols(["redis:", "rediss:"], "Redis"),
    LEANNA_KNOWLEDGE_CACHE_TTL_SECONDS: positiveIntString,
    LEANNA_KNOWLEDGE_REDIS_URL: urlWithProtocols(["redis:", "rediss:"], "Redis"),
    LEANNA_LOCK_REDIS_URL: urlWithProtocols(["redis:", "rediss:"], "Redis"),
    LEANNA_EVENTBUS_REDIS_URL: urlWithProtocols(["redis:", "rediss:"], "Redis"),

    // ── Intégrations externes ──
    GITHUB_TOKEN: optionalString,
    TELEGRAM_BOT_TOKEN: optionalString,
    GRAPHIFY_BIN: optionalString,

    // ── Journalisation & observabilité ──
    LOG_LEVEL: z.preprocess(
      (v) => (typeof v === "string" ? v.trim().toLowerCase() : v),
      z.enum(["debug", "info", "warn", "error"]).optional(),
    ),
    OTEL_CONSOLE_EXPORT: optionalString,
    TOOL_LOG_TRANSCRIPT: optionalString,

    // ── Workspace & résolution de chemins ──
    JARVIS_DEFAULT_WORKSPACE: optionalString,
    Leanna_CONFIG_PATH: optionalString,
    ELECTRON_APP_PATH: optionalString,
  })
  .passthrough()
  .superRefine((env, ctx) => {
    // ── Garde-fou Supabase : une clé ANON ne doit JAMAIS être une service_role ──
    // La clé anon est exposée au navigateur (bundle Vite). Une service_role
    // contourne la RLS : la publier côté client ouvrirait un accès total à la
    // base. On refuse donc toute clé "anon" dont le rôle JWT est "service_role".
    const anonSlots: Array<keyof typeof env> = [
      "SUPABASE_ANON_KEY",
      "VITE_SUPABASE_ANON_KEY",
    ];
    for (const slot of anonSlots) {
      const value = env[slot];
      if (typeof value === "string" && jwtRole(value) === "service_role") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [slot as string],
          message:
            "contient une clé service_role alors qu'une clé anon (publique) est attendue. " +
            "La service_role contourne la RLS et ne doit JAMAIS être exposée au navigateur. " +
            "Récupérez la clé anon dans le tableau de bord Supabase (Project Settings → API).",
        });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

/**
 * Décode le claim `role` d'un JWT Supabase (payload base64url) sans vérifier la
 * signature. Retourne `undefined` si la chaîne n'est pas un JWT décodable.
 * Utilisé uniquement pour détecter une service_role mal placée.
 */
export function jwtRole(token: string): string | undefined {
  const parts = token.split(".");
  if (parts.length !== 3) return undefined;
  try {
    const payloadJson = Buffer.from(parts[1], "base64url").toString("utf8");
    const payload = JSON.parse(payloadJson) as { role?: unknown };
    return typeof payload.role === "string" ? payload.role : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Parse et valide un environnement. En cas d'erreur, lève une `Error` dont le
 * message agrège toutes les variables invalides (format `NOM: raison`).
 */
export function parseEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const lines = result.error.issues.map((issue) => {
      const name = issue.path.join(".") || "(racine)";
      return `${name}: ${issue.message}`;
    });
    throw new Error(
      `Configuration d'environnement invalide :\n- ${lines.join("\n- ")}`,
    );
  }
  return result.data;
}

let cachedEnv: Env | undefined;

/**
 * Valide `process.env` et met en cache le résultat typé. À appeler UNE fois au
 * démarrage (bootstrap), juste après le chargement dotenv et le déchiffrement.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  cachedEnv = parseEnv(source);
  return cachedEnv;
}

/**
 * Accès typé à la configuration validée. Charge paresseusement depuis
 * `process.env` si {@link loadEnv} n'a pas encore été appelé (utile en test).
 */
export function getEnv(): Env {
  if (!cachedEnv) {
    cachedEnv = parseEnv(process.env);
  }
  return cachedEnv;
}

/** Réinitialise le cache (tests). */
export function resetEnvCache(): void {
  cachedEnv = undefined;
}
