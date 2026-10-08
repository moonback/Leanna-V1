/**
 * activateProject — Séquence unique d'activation du Knowledge System.
 *
 * Historiquement, deux chemins activaient l'indexation du projet, et ils
 * DIVERGEAIENT :
 *   • Démarrage serveur (server.ts, projet actif au boot) : scanAll →
 *     projectIndexer.startWatching() → workspaceIndexer.extractAll() →
 *     workspaceIndexer.startWatching(). La chaîne complète.
 *   • Connexion d'un workspace à chaud (routes/self-root.ts : /change, /new,
 *     /scaffold, /clone) : knowledgeGraph.load() + projectMemory.load() +
 *     projectIndexer.scanAll() SEULEMENT. Ni l'armement du watcher
 *     d'indexation incrémentale, ni l'extraction des documents, ni leur
 *     watcher n'étaient relancés.
 *
 * Comme `initSelfRoot()` démarre TOUJOURS sans projet actif (sélecteur
 * Multi-Workspace obligatoire à chaque lancement), le chemin de démarrage
 * complet ne s'exécute jamais en usage normal : le graphe recevait son scan
 * initial puis se figeait (aucune mise à jour sur édition), et les documents
 * du workspace n'étaient jamais indexés.
 *
 * Ce module centralise la séquence complète en UNE fonction, appelée aussi bien
 * au démarrage (si un projet est actif) qu'à chaque connexion de workspace. Une
 * seule source de vérité : « projet actif → charge + scanne + arme les watchers
 * + extrait les documents ».
 */

import { knowledgeGraph } from "./KnowledgeGraph.js";
import { projectMemory } from "./ProjectMemory.js";
import { projectIndexer } from "./ProjectIndexer.js";
import { broadcastKnowledgeProgress } from "../utils/knowledgeBroadcaster.js";

/** Options d'activation. */
export interface ActivateProjectOptions {
  /**
   * Rafraîchit le profil d'intelligence projet (ProjectProfile) avant ET après
   * l'indexation, de sorte que Leanna « ne reparte jamais de zéro ». Activé par
   * défaut ; désactivable pour les chemins qui gèrent le profil eux-mêmes.
   */
  refreshProfile?: boolean;
}

/**
 * Charge le Knowledge System du projet actif, lance le scan complet, arme
 * l'indexation incrémentale (FileWatcher), puis extrait les documents du
 * workspace et arme leur extraction incrémentale.
 *
 * Best-effort et non bloquant pour l'appelant : le scan et l'extraction sont
 * lancés en arrière-plan (promesses non attendues), exactement comme le chemin
 * de démarrage historique. Les erreurs sont journalisées, jamais propagées.
 *
 * À n'appeler QUE lorsqu'un projet est actif (`hasProject()` vrai).
 */
export function activateProjectKnowledge(options: ActivateProjectOptions = {}): void {
  const { refreshProfile = true } = options;

  // 1. Charger graphe + mémoire persistés pour le projet courant.
  try {
    knowledgeGraph.load();
    projectMemory.load();
  } catch (e: any) {
    console.error("[KnowledgeGraph] ❌ Erreur chargement:", e?.message ?? e);
  }

  // 2. Charger immédiatement le profil projet (avant enrichissement par le scan).
  if (refreshProfile) {
    void refreshProjectProfileSafe();
  }

  // 3. Scan complet, puis armement des watchers et extraction documentaire.
  projectIndexer
    .scanAll({
      onProgress: (p) => broadcastKnowledgeProgress(p.phase, p.current, p.total, { file: p.file }),
    })
    .then((stats: any) => {
      broadcastKnowledgeProgress("done", stats.totalFiles, stats.totalFiles, {
        totalEntities: stats.totalEntities,
        durationMs: stats.durationMs,
        cached: stats.cached ?? false,
      });
      if (stats.cached) {
        console.log(
          `[KnowledgeGraph] ⚡ Projet inchangé: ${stats.totalFiles} fichiers, ${stats.totalEntities} entités (chargé depuis le cache en ${stats.durationMs}ms)`
        );
      } else {
        console.log(
          `[KnowledgeGraph] ✅ Projet indexé: ${stats.totalFiles} fichiers, ${stats.totalEntities} entités (${(stats.durationMs / 1000).toFixed(1)}s)`
        );
      }

      // Enrichir le profil une fois l'indexation terminée.
      if (refreshProfile) {
        void refreshProjectProfileSafe();
      }

      // 3b. Armer l'indexation incrémentale via FileWatcher.
      projectIndexer.startWatching();

      // 4. Extraction automatique des documents du workspace + watcher.
      import("./WorkspaceIndexer.js")
        .then(({ workspaceIndexer }) => {
          workspaceIndexer
            .extractAll()
            .then((docStats: any) => {
              console.log(
                `[WorkspaceIndexer] ✅ ${docStats.totalExtracted} document(s) extrait(s), ${docStats.totalWords} mots, ${docStats.totalSections} sections (${(docStats.durationMs / 1000).toFixed(1)}s)`
              );
              workspaceIndexer.startWatching();
            })
            .catch((e: any) => {
              console.error("[WorkspaceIndexer] ❌ Erreur extraction:", e?.message ?? e);
            });
        })
        .catch((e: any) => {
          console.error("[WorkspaceIndexer] ❌ Erreur import:", e?.message ?? e);
        });
    })
    .catch((e: any) => {
      console.error("[KnowledgeGraph] ❌ Erreur indexation:", e?.message ?? e);
    });
}

/** Rafraîchit ProjectProfile en best-effort (import dynamique, jamais bloquant). */
async function refreshProjectProfileSafe(): Promise<void> {
  try {
    const { projectProfile } = await import("./ProjectProfile.js");
    projectProfile.refresh();
  } catch {
    /* best-effort : le profil n'est pas critique pour l'indexation. */
  }
}
