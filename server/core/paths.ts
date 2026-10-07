/**
 * core/paths.ts — Résolution des chemins de persistance locale du noyau P0.
 *
 * Le noyau P0 (state machine de mission, ledger d'idempotence, checkpoints,
 * evidence) doit survivre à un crash SANS dépendre de Supabase. On suit donc la
 * convention locale déjà employée par `DocumentStore` et `MarketplaceRegistry` :
 * écriture de fichiers JSON sous `.Leanna/`.
 *
 * `SELF_ROOT` peut être "" (aucun projet actif au démarrage) — dans ce cas on
 * retombe sur `process.cwd()` pour rester toujours disponible.
 */

import fs from "node:fs";
import path from "node:path";
import { SELF_ROOT } from "../utils/selfRoot.js";

/** Racine effective du workspace : SELF_ROOT s'il est défini, sinon cwd. */
export function workspaceRoot(): string {
  const root = SELF_ROOT && SELF_ROOT.trim().length > 0 ? SELF_ROOT : process.cwd();
  return path.resolve(root);
}

/** Répertoire `.Leanna/` du workspace actif (créé si nécessaire). */
export function leannaDir(...segments: string[]): string {
  const dir = path.join(workspaceRoot(), ".Leanna", ...segments);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Sous-répertoire dédié au noyau P0 : `.Leanna/core/<...segments>`.
 * Chaque sous-système (missions, ledger, checkpoints, evidence) y range ses
 * fichiers.
 */
export function coreDir(...segments: string[]): string {
  return leannaDir("core", ...segments);
}

/**
 * Écrit un objet JSON de façon atomique (write-then-rename) pour qu'un crash
 * en cours d'écriture ne laisse jamais un fichier tronqué/corrompu.
 */
export function writeJsonAtomic(filePath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
  try {
    fs.renameSync(tmp, filePath);
  } catch (err: any) {
    if (err.code === "EPERM" || err.code === "EBUSY" || err.code === "EACCES") {
      try {
        fs.copyFileSync(tmp, filePath);
        fs.unlinkSync(tmp);
        return;
      } catch {
        // Fallback to rethrow if copy also fails
      }
    }
    try {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    } catch {
      // Best-effort cleanup
    }
    throw err;
  }
}

/** Lit un fichier JSON. Retourne `fallback` si absent ou illisible. */
export function readJson<T>(filePath: string, fallback: T): T {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Ajoute une ligne à un fichier JSONL (append-only, une entrée par ligne). */
export function appendJsonl(filePath: string, entry: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, JSON.stringify(entry) + "\n", "utf8");
}

/** Lit un fichier JSONL et retourne les entrées valides (ligne à ligne). */
export function readJsonl<T>(filePath: string): T[] {
  try {
    if (!fs.existsSync(filePath)) return [];
    return fs
      .readFileSync(filePath, "utf8")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => {
        try {
          return JSON.parse(line) as T;
        } catch {
          return null;
        }
      })
      .filter((entry): entry is T => entry !== null);
  } catch {
    return [];
  }
}
