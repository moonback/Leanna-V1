/**
 * knowledgeSettings — Préférences globales du Knowledge System.
 *
 * Stocke des réglages pilotables depuis l'UI Settings, indépendants du projet
 * actif (persistés au niveau de l'app, dans Leanna_APP_ROOT/.Leanna), afin que
 * le choix de l'utilisateur survive aux changements de workspace.
 *
 * Réglage actuel :
 *   • documentExtractionEnabled — active/désactive l'extraction automatique des
 *     documents du workspace (WorkspaceIndexer → DocumentStore). Désactivé, le
 *     Knowledge System continue d'indexer le code ; seule l'indexation
 *     documentaire (fichiers .md/.txt/.pdf/… → documents.json) est suspendue.
 */

import fs from "fs";
import path from "path";
import { Leanna_APP_ROOT } from "../utils/selfRoot.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("KnowledgeSettings");

// ─── Types ────────────────────────────────────────────────────────────────────

export interface KnowledgeSettings {
  /** Extraction automatique des documents du workspace (défaut: true). */
  documentExtractionEnabled: boolean;
}

const DEFAULT_SETTINGS: KnowledgeSettings = {
  documentExtractionEnabled: true,
};

// ─── Persistance ────────────────────────────────────────────────────────────

function getSettingsPath(): string {
  return path.join(Leanna_APP_ROOT, ".Leanna", "knowledge-settings.json");
}

let cache: KnowledgeSettings | null = null;

function load(): KnowledgeSettings {
  if (cache) return cache;
  try {
    const p = getSettingsPath();
    if (fs.existsSync(p)) {
      const raw = fs.readFileSync(p, "utf-8");
      const parsed = JSON.parse(raw);
      cache = { ...DEFAULT_SETTINGS, ...parsed };
      return cache!;
    }
  } catch (e: any) {
    log.warn(`⚠️ Échec lecture knowledge-settings.json: ${e?.message ?? e} — valeurs par défaut`);
  }
  cache = { ...DEFAULT_SETTINGS };
  return cache;
}

function persist(settings: KnowledgeSettings): void {
  try {
    const p = getSettingsPath();
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(settings, null, 2), "utf-8");
  } catch (e: any) {
    log.error(`❌ Échec écriture knowledge-settings.json: ${e?.message ?? e}`);
  }
}

// ─── API publique ───────────────────────────────────────────────────────────

/** Retourne une copie des réglages courants. */
export function getKnowledgeSettings(): KnowledgeSettings {
  return { ...load() };
}

/** Indique si l'extraction documentaire automatique est activée. */
export function isDocumentExtractionEnabled(): boolean {
  return load().documentExtractionEnabled;
}

/**
 * Met à jour l'activation de l'extraction documentaire et persiste.
 * Retourne la nouvelle valeur effective.
 */
export function setDocumentExtractionEnabled(enabled: boolean): boolean {
  const current = load();
  const next: KnowledgeSettings = { ...current, documentExtractionEnabled: enabled };
  cache = next;
  persist(next);
  log.info(`📄 Extraction documentaire ${enabled ? "activée" : "désactivée"} (persistée).`);
  return next.documentExtractionEnabled;
}
