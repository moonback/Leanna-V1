import path from "path";
import dotenv from "dotenv";
import { decrypt } from "./server/utils/crypto.js";
import { validateEnvironment } from "./server/config/environment.js";
import { loadEnv } from "./server/config/env.js";

const configRoot = process.env.Leanna_CONFIG_PATH || process.env.ELECTRON_APP_PATH || process.cwd();
dotenv.config({ path: path.join(configRoot, ".env") });
dotenv.config({ path: path.join(configRoot, ".env.local"), override: true });

for (const key of [
  "Leanna_API_TOKEN",
  "GEMINI_API_KEY",
  "OPENROUTER_API_KEY",
  "OPENROUTER_FREE_API_KEY",
  "GITHUB_TOKEN",
  "TELEGRAM_BOT_TOKEN",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_ANON_KEY",
]) {
  // decrypt() renvoie la valeur telle quelle si elle n'est pas chiffrée (pas de
  // préfixe "gcm:"), donc l'ajout de clés en clair ou vides reste sans effet.
  if (process.env[key]) process.env[key] = decrypt(process.env[key]!);
}

function validateSupabaseEnvironment(): void {
  const url = process.env.SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url && !serviceRoleKey) return;
  if (!url || !serviceRoleKey) {
    throw new Error("La configuration Supabase est incomplète : SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY doivent être définies ensemble.");
  }

  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") throw new Error();
  } catch {
    throw new Error("SUPABASE_URL doit être une URL HTTP(S) valide.");
  }

  process.env.SUPABASE_URL = url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = serviceRoleKey;
  process.stdout.write("[Bootstrap] Configuration Supabase validée.\n");
}

// En production/Electron, l'exe lance ce bootstrap DANS le process principal
// Electron (require('dist/server.cjs')). Un process.exit() ici fermerait toute
// l'application → fenêtre vide. On démarre donc le serveur même si le .env est
// incomplet : l'UI s'affiche et l'assistant EnvSetupModal guide la saisie des
// clés. En développement (process dédié), on garde l'échec strict et visible.
const isEmbedded =
  process.env.NODE_ENV === "production" ||
  Boolean(process.env.ELECTRON_APP_PATH);

try {
  validateEnvironment();
  validateSupabaseEnvironment();
  // Charge et met en cache la configuration typée (zod) après dotenv + decrypt.
  // Toute lecture ultérieure via getEnv() réutilise ce résultat validé.
  loadEnv();
  process.stdout.write("[Bootstrap] Variables d'environnement validées.\n");
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (isEmbedded) {
    // Non fatal : on logue et on continue. Les clés manquantes/invalides seront
    // renseignées via l'UI (/api/env + EnvSetupModal).
    process.stderr.write(
      `[Bootstrap] Configuration d'environnement incomplète (démarrage en mode dégradé) :\n${message}\n`,
    );
    // Amorce malgré tout le cache de config pour que getEnv() ne relève pas
    // l'erreur plus tard dans le process (lecture paresseuse). Si le parse
    // échoue encore, on l'ignore : les accès ultérieurs retomberont sur un
    // nouveau parse (toujours tolérant aux clés optionnelles vides).
    try { loadEnv(); } catch { /* config toujours incomplète : toléré */ }
  } else {
    process.stderr.write(`[Bootstrap] Échec de validation de la configuration :\n${message}\n`);
    process.exitCode = 1;
    process.exit();
  }
}

void import("./server.js").catch((error) => {
  const details = error instanceof Error ? (error.stack || error.message) : String(error);
  process.stderr.write(`[Bootstrap] Échec du démarrage du serveur: ${details}\n`);
  process.exitCode = 1;
});
