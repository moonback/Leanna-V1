import { parseEnv } from "./env.js";

/**
 * Validation stricte des variables d'environnement (Phase 3).
 *
 * La validation de format (URL, booléen, enum, entier, longueur…) est déléguée
 * au schéma zod {@link parseEnv} (voir `server/config/env.ts`). Cette fonction
 * conserve son ancienne signature `(environment) => void` et y ajoute la seule
 * règle inter-champs qui ne peut pas être exprimée par le schéma : les deux
 * variables Supabase serveur doivent être définies ensemble (ou aucune).
 *
 * En cas d'erreur, une `Error` est levée avec un message agrégé lisible.
 */
export function validateEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): void {
  const errors: string[] = [];

  // Règle inter-champs : SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY vont par paire.
  const supabaseUrl = environment.SUPABASE_URL?.trim();
  const supabaseKey = environment.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const hasUrl = supabaseUrl !== undefined && supabaseUrl !== "";
  const hasKey = supabaseKey !== undefined && supabaseKey !== "";
  if (hasUrl !== hasKey) {
    errors.push(
      "SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY doivent être définies ensemble.",
    );
  }

  // Validation de format déléguée à zod.
  try {
    parseEnv(environment);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Retire le préfixe de parseEnv pour ne pas le dupliquer ; on ne garde que
    // les lignes `- NOM: raison`.
    for (const line of message.split("\n")) {
      const trimmed = line.replace(/^-\s*/, "").trim();
      if (trimmed && !trimmed.startsWith("Configuration d'environnement")) {
        errors.push(trimmed);
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `Configuration d'environnement invalide :\n- ${errors.join("\n- ")}`,
    );
  }
}
