/**
 * FileWatcher — Surveillance incrémentale des fichiers projet
 *
 * Surveille les changements de fichiers dans le projet et déclenche
 * une ré-indexation incrémentale (fichier par fichier) plutôt qu'un
 * scan complet. Utilise fs.watch natif avec debounce pour performance.
 *
 * Architecture :
 *   FileWatcher.start()
 *     ├── fs.watch(root, { recursive: true })
 *     ├── debounce(500ms) → accumule les changements
 *     └── ProjectIndexer.scanFile() ou .removeFile() par fichier
 *
 * Avantages vs scanAll() :
 *   - Indexation quasi-instantanée (<50ms par fichier modifié)
 *   - Pas de freeze du serveur sur gros projets
 *   - Graphe toujours à jour sans intervention manuelle
 */

import fs from "fs";
import path from "path";
import { createLogger } from "../utils/logger.js";
import { SELF_ROOT } from "../utils/selfRoot.js";
import { shouldWatchPath } from "./indexingRules.js";

const log = createLogger("FileWatcher");

// ─── Configuration ──────────────────────────────────────────────────────────

/** Délai de debounce : accumule les changements pendant cette durée */
const DEBOUNCE_MS = 500;

/**
 * Délais de backoff pour le redémarrage automatique après erreur fs.watch.
 * Bug 6 : après une erreur EMFILE/ENOSPC/etc., le watcher tente de redémarrer
 * automatiquement avec ces délais successifs (ms). Après le dernier essai,
 * il abandonne et émet un événement "error" à destination de l'UI.
 */
const RESTART_BACKOFF_MS = [1_000, 2_000, 4_000];

// Les règles d'exclusion (dirs, fichiers, suffixes, extensions)
// sont importées depuis indexingRules.ts via shouldWatchPath().

// ═══════════════════════════════════════════════════════════════════════════════
// FileWatcher
// ═══════════════════════════════════════════════════════════════════════════════

export type FileChangeType = "created" | "modified" | "deleted";

export interface FileChangeEvent {
  relativePath: string;
  type: FileChangeType;
  timestamp: number;
}

export type FileChangeHandler = (events: FileChangeEvent[]) => Promise<void> | void;

/** Événement émis vers l'UI quand le watcher tombe définitivement. */
export interface WatcherErrorEvent {
  message: string;
  root: string;
}

export type WatcherErrorHandler = (event: WatcherErrorEvent) => void;

export class FileWatcher {
  private watcher: fs.FSWatcher | null = null;
  private pendingChanges: Map<string, FileChangeType> = new Map();
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private handlers: Set<FileChangeHandler> = new Set();
  private errorHandlers: Set<WatcherErrorHandler> = new Set();
  private isRunning: boolean = false;
  /** Racine sur laquelle le watcher tourne actuellement. */
  private currentRoot: string | null = null;
  /**
   * Promesse du batch en cours — garantit qu'un seul batch s'exécute à la fois.
   * Bug 7 : la chaîne .then() ne peut pas rester rejetée car on y attache
   * toujours un .catch() qui absorbe les erreurs et remet la chaîne à resolved.
   */
  private batchInFlight: Promise<void> = Promise.resolve();
  /** Tentatives de redémarrage en cours (backoff). */
  private restartAttempt = 0;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;

  private stats = {
    totalEventsProcessed: 0,
    totalBatchesDispatched: 0,
    lastEventAt: 0,
  };

  // ─── API publique ─────────────────────────────────────────────────────────

  /**
   * Retourne la racine du workspace actif.
   *
   * On surveille TOUJOURS la racine réelle (SELF_ROOT), jamais le sandbox :
   * armer fs.watch récursif sur `.Leanna/sandbox` juste après sa recopie
   * déclenchait une rafale d'évènements et donc une seconde vague d'indexation.
   */
  private getRoot(): string {
    return SELF_ROOT;
  }

  /** Enregistre un handler appelé à chaque batch de changements. */
  onChange(handler: FileChangeHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  /**
   * Enregistre un handler d'erreur appelé si le watcher tombe définitivement
   * (après tous les essais de redémarrage). Utile pour notifier l'UI.
   */
  onError(handler: WatcherErrorHandler): () => void {
    this.errorHandlers.add(handler);
    return () => this.errorHandlers.delete(handler);
  }

  /**
   * Démarre la surveillance des fichiers.
   * Utilise fs.watch en mode récursif (Windows et macOS supporté nativement).
   *
   * Idempotent sur la même racine. Si la racine change (sandbox), redémarre.
   */
  start(): boolean {
    const root = this.getRoot();

    // Déjà actif sur la bonne racine — rien à faire
    if (this.isRunning && this.currentRoot === root) {
      log.debug("FileWatcher déjà actif sur la même racine");
      return true;
    }

    // Racine différente : arrêter l'ancien watcher
    if (this.isRunning) {
      log.info(`🔄 Racine changée (${this.currentRoot} → ${root}), redémarrage du FileWatcher`);
      this.stop();
    }

    return this._startWatcher(root);
  }

  /** Arrête la surveillance et annule tout redémarrage planifié. */
  stop(): void {
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    this.restartAttempt = 0;

    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.pendingChanges.clear();
    this.isRunning = false;
    this.currentRoot = null;
    log.info("🛑 FileWatcher arrêté");
  }

  /** Retourne si le watcher est actif. */
  get running(): boolean {
    return this.isRunning;
  }

  /** Retourne les statistiques du watcher. */
  getStats() {
    return { ...this.stats, running: this.isRunning };
  }

  // ─── Implémentation interne ───────────────────────────────────────────────

  /**
   * Crée et installe le fs.FSWatcher sur `root`.
   * Appelé par start() et par le mécanisme de redémarrage backoff.
   */
  private _startWatcher(root: string): boolean {
    try {
      const watcher = fs.watch(root, { recursive: true }, (eventType, filename) => {
        if (!filename) return;

        const relativePath = filename.replace(/\\/g, "/");
        if (!this.shouldWatch(relativePath)) return;

        const absPath = path.join(root, relativePath);
        let changeType: FileChangeType;

        try {
          if (fs.existsSync(absPath)) {
            // Bug 5 : ternaire mort corrigé — les deux branches renvoyaient
            // "modified". On utilise directement "modified" sans ternaire.
            changeType = "modified";
            // "rename" signale une création ou un déplacement
            if (eventType === "rename") changeType = "created";
          } else {
            changeType = "deleted";
          }
        } catch {
          changeType = "modified";
        }

        this.pendingChanges.set(relativePath, changeType);
        this.scheduleBatch();
      });

      // Bug 6 : redémarrage avec backoff après erreur fs.watch.
      watcher.on("error", (err: Error) => {
        log.error(`❌ Erreur fs.watch (${root}): ${err.message}`);
        this.stop();
        this._scheduleRestart(root);
      });

      this.watcher = watcher;
      this.isRunning = true;
      this.currentRoot = root;
      this.restartAttempt = 0; // succès → réinitialiser le compteur
      log.info(`👁️ FileWatcher démarré sur: ${root}`);
      return true;
    } catch (err) {
      log.error(`❌ Impossible de démarrer le FileWatcher: ${(err as Error).message}`);
      return false;
    }
  }

  /**
   * Planifie un redémarrage automatique avec backoff exponentiel.
   * Bug 6 : après une erreur, jusqu'à 3 tentatives (1 s, 2 s, 4 s).
   * Si toutes échouent, émet un événement d'erreur vers l'UI.
   */
  private _scheduleRestart(root: string): void {
    if (this.restartAttempt >= RESTART_BACKOFF_MS.length) {
      log.error(`❌ FileWatcher: ${RESTART_BACKOFF_MS.length} tentatives de redémarrage échouées sur ${root}. Surveillance désactivée.`);
      const msg = `Le watcher de fichiers a échoué après ${RESTART_BACKOFF_MS.length} tentatives sur ${root}.`;
      for (const h of this.errorHandlers) {
        try { h({ message: msg, root }); } catch { /* ignore */ }
      }
      return;
    }

    const delay = RESTART_BACKOFF_MS[this.restartAttempt];
    this.restartAttempt++;
    log.warn(`🔁 Tentative de redémarrage du FileWatcher dans ${delay} ms (essai ${this.restartAttempt}/${RESTART_BACKOFF_MS.length})…`);

    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      const ok = this._startWatcher(root);
      if (!ok) this._scheduleRestart(root);
    }, delay);
  }

  /**
   * Vérifie si un fichier doit être surveillé.
   * Délègue à shouldWatchPath() depuis indexingRules.ts.
   */
  private shouldWatch(relativePath: string): boolean {
    return shouldWatchPath(relativePath);
  }

  /** Programme l'envoi d'un batch après le debounce. */
  private scheduleBatch(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);

    this.debounceTimer = setTimeout(() => {
      // Bug 7 : .catch() à la fin de la chaîne pour absorber toute exception
      // non gérée dans dispatchBatch — la chaîne ne peut pas rester rejetée.
      this.batchInFlight = this.batchInFlight
        .then(() => this.dispatchBatch())
        .catch((err) => {
          log.error(`❌ dispatchBatch a levé une exception inattendue: ${(err as Error).message}`);
        });
    }, DEBOUNCE_MS);
  }

  /** Envoie le batch de changements accumulés aux handlers. */
  private async dispatchBatch(): Promise<void> {
    if (this.pendingChanges.size === 0) return;

    const events: FileChangeEvent[] = [];
    const now = Date.now();

    for (const [relativePath, type] of this.pendingChanges) {
      events.push({ relativePath, type, timestamp: now });
    }

    this.pendingChanges.clear();
    this.stats.totalEventsProcessed += events.length;
    this.stats.totalBatchesDispatched++;
    this.stats.lastEventAt = now;

    log.info(`📦 Batch: ${events.length} fichier(s) changé(s) [${events.map(e => `${e.type}:${path.basename(e.relativePath)}`).join(", ")}]`);

    for (const handler of this.handlers) {
      try {
        await handler(events);
      } catch (err) {
        log.error(`❌ Handler FileWatcher a échoué: ${(err as Error).message}`);
      }
    }
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

/** Instance singleton partagée du FileWatcher */
export const fileWatcher = new FileWatcher();
