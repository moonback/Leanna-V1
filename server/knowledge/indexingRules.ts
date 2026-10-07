/**
 * indexingRules.ts — Règles d'exclusion partagées entre ProjectIndexer et FileWatcher.
 *
 * Source unique de vérité pour savoir quels fichiers/dossiers ignorer lors du
 * scan et de la surveillance. Avant ce module, chaque fichier maintenait sa
 * propre liste (EXCLUDED_DIRS, IGNORED_DIRS, EXCLUDED_FILES, IGNORED_FILES)
 * qui divergeaient silencieusement.
 */

/**
 * Dossiers à exclure selon leur profondeur dans le projet.
 *
 * Bug 9 : certains dossiers (assets, public, build, out, release) ne doivent
 * être exclus qu'au niveau racine du projet — un dossier `src/assets/` avec du
 * code TypeScript ou `scripts/build/` ne doit pas disparaître de l'index.
 *
 * On sépare les exclusions en deux catégories :
 *  - EXCLUDED_DIRS_ALWAYS : exclus à n'importe quelle profondeur (jamais du code
 *    utile, très lourds, ex. node_modules/.git)
 *  - EXCLUDED_DIRS_ROOT_ONLY : exclus seulement si le premier segment du chemin
 *    relatif (= niveau racine du projet) correspond au nom du dossier.
 */
export const EXCLUDED_DIRS_ALWAYS = new Set([
  "node_modules",
  ".git",
  "coverage",
  ".vscode",
  ".idea",
  ".Leanna",
]);

export const EXCLUDED_DIRS_ROOT_ONLY = new Set([
  "dist",
  "build",
  "out",
  "release",
  "assets",
  "public",
]);

/**
 * Union des deux ensembles — rétro-compatibilité pour les imports existants
 * qui n'ont besoin que d'une liste plate (ex. logs, UI).
 */
export const EXCLUDED_DIRS = new Set([
  ...EXCLUDED_DIRS_ALWAYS,
  ...EXCLUDED_DIRS_ROOT_ONLY,
]);

// ─── Fichiers exclus ──────────────────────────────────────────────────────────

/**
 * Noms de fichiers à ignorer (sans égard au répertoire parent).
 *
 * Inclut les fichiers ÉCRITS PAR LE PROCESS LUI-MÊME (état de connaissance,
 * mémoire, profil) : sans ça, sauvegarder l'un d'eux déclenche le watcher qui
 * relance une indexation qui ré-écrit ces fichiers → boucle infinie.
 */
export const EXCLUDED_FILES = new Set([
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  ".DS_Store",
  "thumbs.db",
  ".gitignore",
  ".env",
  ".env.local",
  ".gemini-keys.json",
  ".npmrc",
  // Fichiers de persistance du Knowledge System
  ".project-knowledge.json",
  ".project-memory.json",
  ".Leanna-profile.json",
  ".Leanna-profile.json.tmp",
]);

// ─── Suffixes temporaires ─────────────────────────────────────────────────────

/** Suffixes indiquant un fichier temporaire ou en cours d'écriture. */
export const EXCLUDED_SUFFIXES = [".tmp", ".swp", ".lock"];

/** Motif des fichiers temporaires d'écriture atomique (ex. foo.json.tmp_1790…). */
export const TMP_WRITE_PATTERN = /\.tmp[_.]?\d*$/i;

// ─── Extensions analysables ───────────────────────────────────────────────────

/** Extensions de fichiers que le scanner et le parser peuvent traiter. */
export const ANALYZABLE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  ".md",
  ".css",
  ".scss",
  ".html",
]);

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Détermine si un chemin relatif doit être ignoré par le scanner ou le watcher.
 *
 * Bug 9 : les dossiers "depth-sensitive" (dist, build, out, release, assets,
 * public) ne sont exclus que si le PREMIER segment du chemin correspond —
 * c'est-à-dire uniquement au niveau racine. Ainsi `src/assets/` ou
 * `scripts/build/` restent indexés. Les dossiers always-excluded
 * (node_modules, .git, …) sont exclus à n'importe quelle profondeur.
 *
 * @param relativePath       Chemin relatif depuis la racine du projet (séparateurs /)
 * @param isDotfileAllowed   Si false (défaut), les dotfiles sont ignorés.
 */
export function shouldIgnorePath(
  relativePath: string,
  isDotfileAllowed = false
): boolean {
  const segments = relativePath.split("/");

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];

    // Dotfiles — ignorés sauf autorisation explicite
    if (!isDotfileAllowed && segment.startsWith(".")) return true;

    // Toujours exclus (node_modules, .git, coverage, …) — toute profondeur
    if (EXCLUDED_DIRS_ALWAYS.has(segment)) return true;

    // Exclus seulement au niveau racine (dist, build, assets, public, …)
    if (i === 0 && EXCLUDED_DIRS_ROOT_ONLY.has(segment)) return true;
  }

  const filename = segments[segments.length - 1];

  if (EXCLUDED_FILES.has(filename)) return true;
  if (TMP_WRITE_PATTERN.test(filename)) return true;
  if (EXCLUDED_SUFFIXES.some((s) => filename.endsWith(s))) return true;

  return false;
}

/**
 * Détermine si un chemin de fichier doit être surveillé par le FileWatcher.
 * Ajoute la vérification d'extension en plus de shouldIgnorePath.
 */
export function shouldWatchPath(relativePath: string): boolean {
  if (shouldIgnorePath(relativePath)) return false;

  const ext = relativePath.slice(relativePath.lastIndexOf(".")).toLowerCase();
  return ANALYZABLE_EXTENSIONS.has(ext);
}
