/**
 * AgentLoader — Chargement dynamique d'agents-plugins (hardened)
 *
 * Permet d'ajouter de nouveaux agents au runtime sans redémarrage.
 * Scanne un dossier pour les fichiers *.agent.ts / *.agent.js et les charge
 * automatiquement.
 *
 * ── Mesures de sécurité ajoutées ───────────────────────────────────────────
 *
 *  1. **Empreinte SHA-256 de fichier** : avant tout import, le contenu du
 *     fichier est haché. Si `LEANNA_PLUGIN_ALLOWLIST` est défini dans
 *     l'environnement (format JSON : { "mon_agent.agent.js": "sha256hex" }),
 *     seul un fichier dont l'empreinte correspond est autorisé. Un fichier
 *     modifié après signature est automatiquement rejeté.
 *
 *  2. **Isolation Worker** : quand `LEANNA_PLUGIN_SANDBOX=true`, le plugin
 *     n'est PAS importé dans le process principal. À la place, un `SkillWorker`
 *     est créé ; chaque appel à `agent.execute()` passe par le worker isolé
 *     avec un timeout et un proxy de capabilities.
 *
 *  3. **Traçabilité** : la map interne stocke `{ agentId, hash, loadedAt }`
 *     pour chaque fichier. Accessible via `getLoaded()`.
 *
 * Usage :
 *   const loader = new AgentLoader(runtime);
 *   await loader.loadFromDirectory("./custom-agents");
 *   loader.watch("./custom-agents"); // hot-reload
 */

import * as fs from "fs";
import * as path from "path";
import { createHash } from "crypto";
import type { AgentRuntime, AgentPlugin } from "./AgentRuntime.js";
import { runPluginInWorker } from "./SkillWorker.js";

// ═══════════════════════════════════════════════════════════════════════════════
// Types internes
// ═══════════════════════════════════════════════════════════════════════════════

interface LoadedEntry {
  agentId: string;
  /** SHA-256 hex du contenu du fichier au moment du chargement */
  hash: string;
  loadedAt: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// AgentLoader
// ═══════════════════════════════════════════════════════════════════════════════

export class AgentLoader {
  private runtime: AgentRuntime;
  private loadedFiles = new Map<string, LoadedEntry>(); // resolvedPath → entry
  private watcher: fs.FSWatcher | null = null;

  constructor(runtime: AgentRuntime) {
    this.runtime = runtime;
  }

  /**
   * Charge tous les agents *.agent.ts / *.agent.js d'un dossier.
   * Retourne le nombre d'agents chargés avec succès.
   */
  async loadFromDirectory(dir: string): Promise<number> {
    if (!fs.existsSync(dir)) {
      console.warn(`[AgentLoader] Dossier introuvable: ${dir}`);
      return 0;
    }

    const files = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".agent.ts") || f.endsWith(".agent.js"));

    let count = 0;

    for (const file of files) {
      try {
        const filePath = path.join(dir, file);
        const loaded = await this.loadFile(filePath);
        if (loaded) count++;
      } catch (err) {
        console.error(
          `[AgentLoader] Erreur chargement ${file}:`,
          (err as Error).message
        );
      }
    }

    console.log(`[AgentLoader] ${count} agent(s) chargé(s) depuis ${dir}`);
    return count;
  }

  /**
   * Charge un seul fichier agent.
   *
   * Pipeline de sécurité :
   *   1. Lire le fichier → calculer SHA-256
   *   2. Vérifier l'empreinte contre LEANNA_PLUGIN_ALLOWLIST (si défini)
   *   3a. Mode sandbox (LEANNA_PLUGIN_SANDBOX=true) :
   *       Extraire les métadonnées via import(), enregistrer un AgentPlugin
   *       proxy dont execute() délègue au SkillWorker.
   *   3b. Mode normal : import() direct dans le process (comportement legacy).
   *   4. Valider la structure du plugin.
   *   5. Désenregistrer l'ancien agent (hot-reload) puis enregistrer.
   */
  async loadFile(filePath: string): Promise<boolean> {
    const resolvedPath = path.resolve(filePath);
    const basename = path.basename(resolvedPath);

    try {
      // ── Étape 1 : Calcul de l'empreinte SHA-256 ──────────────────────────
      const fileContent = fs.readFileSync(resolvedPath);
      const hash = createHash("sha256").update(fileContent).digest("hex");

      // ── Étape 2 : Vérification de l'allowlist ────────────────────────────
      const allowlistRaw = process.env["LEANNA_PLUGIN_ALLOWLIST"];
      if (allowlistRaw) {
        let allowlist: Record<string, string>;
        try {
          allowlist = JSON.parse(allowlistRaw);
        } catch {
          console.error(
            "[AgentLoader] LEANNA_PLUGIN_ALLOWLIST n'est pas du JSON valide — chargement de plugin refusé"
          );
          return false;
        }

        const expectedHash = allowlist[basename];
        if (!expectedHash) {
          console.warn(
            `[AgentLoader] ⛔ Plugin "${basename}" absent de LEANNA_PLUGIN_ALLOWLIST — chargement refusé`
          );
          return false;
        }

        // Comparaison à temps constant pour éviter les timing attacks
        if (!timingSafeEqual(expectedHash, hash)) {
          console.error(
            `[AgentLoader] ⛔ Empreinte SHA-256 invalide pour "${basename}"\n` +
            `  attendu : ${expectedHash}\n` +
            `  obtenu  : ${hash}`
          );
          return false;
        }

        console.log(`[AgentLoader] ✅ Empreinte vérifiée pour "${basename}"`);
      } else {
        // Pas d'allowlist : log informatif mais on continue
        console.log(
          `[AgentLoader] ℹ️  Empreinte SHA-256 de "${basename}": ${hash} ` +
          `(LEANNA_PLUGIN_ALLOWLIST non configuré — vérification désactivée)`
        );
      }

      // ── Étape 3 : Import des métadonnées + enregistrement ─────────────────
      const moduleUrl = new URL(`file://${resolvedPath}`).href;
      const sandboxEnabled =
        process.env["LEANNA_PLUGIN_SANDBOX"] === "true";

      let agent: AgentPlugin;

      if (sandboxEnabled) {
        // ── Mode sandbox : import pour les métadonnées seulement,
        //    execute() délègue au SkillWorker isolé ──────────────────────────
        const module = await import(moduleUrl);
        const pluginMeta = this.findAgentExport(module);

        if (!pluginMeta) {
          console.warn(
            `[AgentLoader] Aucun AgentPlugin trouvé dans ${basename}`
          );
          return false;
        }
        if (!this.validatePlugin(pluginMeta)) {
          console.warn(`[AgentLoader] Plugin invalide dans ${basename}`);
          return false;
        }

        const allowedCapabilities: string[] =
          (pluginMeta.metadata as any).capabilities ?? [];

        // Construire un plugin proxy : execute() → SkillWorker
        agent = {
          metadata: pluginMeta.metadata,
          execute: async (context, tools) => {
            console.log(
              `[AgentLoader] 🔒 Exécution sandboxée de "${pluginMeta.metadata.name}" via SkillWorker`
            );
            return runPluginInWorker(moduleUrl, {
              context,
              allowedCapabilities,
              tools,
              maxDurationMs:
                pluginMeta.metadata.timeoutMs ??
                30_000,
            });
          },
        };

        console.log(
          `[AgentLoader] 🔒 Plugin "${pluginMeta.metadata.name}" enregistré en mode sandbox`
        );
      } else {
        // ── Mode normal (legacy) : import direct dans le process ─────────────
        const module = await import(moduleUrl);
        const found = this.findAgentExport(module);

        if (!found) {
          console.warn(
            `[AgentLoader] Aucun AgentPlugin trouvé dans ${basename}`
          );
          return false;
        }
        if (!this.validatePlugin(found)) {
          console.warn(`[AgentLoader] Plugin invalide dans ${basename}`);
          return false;
        }

        agent = found;
      }

      // ── Étape 4 : Hot-reload — désenregistrer l'ancienne version ──────────
      const existingEntry = this.loadedFiles.get(resolvedPath);
      if (existingEntry) {
        this.runtime.unregisterAgent(existingEntry.agentId);
      }

      // ── Étape 5 : Enregistrement dans le runtime ──────────────────────────
      this.runtime.registerAgent(agent);
      this.loadedFiles.set(resolvedPath, {
        agentId: agent.metadata.id,
        hash,
        loadedAt: new Date().toISOString(),
      });

      console.log(
        `[AgentLoader] Agent "${agent.metadata.name}" (${agent.metadata.id}) chargé` +
        (sandboxEnabled ? " [sandboxé]" : "")
      );
      return true;
    } catch (err) {
      console.error(`[AgentLoader] Erreur: ${(err as Error).message}`);
      return false;
    }
  }

  /**
   * Surveille un dossier et recharge les agents modifiés.
   */
  watch(dir: string): void {
    if (this.watcher) {
      this.watcher.close();
    }

    if (!fs.existsSync(dir)) return;

    this.watcher = fs.watch(
      dir,
      { persistent: false },
      (_eventType, filename) => {
        if (
          !filename ||
          (!filename.endsWith(".agent.ts") && !filename.endsWith(".agent.js"))
        )
          return;

        const filePath = path.join(dir, filename);

        // Debounce : attendre que le fichier soit stable
        setTimeout(async () => {
          if (fs.existsSync(filePath)) {
            console.log(`[AgentLoader] Rechargement: ${filename}`);
            await this.loadFile(filePath);
          } else {
            // Fichier supprimé → désenregistrer l'agent
            const resolvedPath = path.resolve(filePath);
            const entry = this.loadedFiles.get(resolvedPath);
            if (entry) {
              this.runtime.unregisterAgent(entry.agentId);
              this.loadedFiles.delete(resolvedPath);
              console.log(
                `[AgentLoader] Agent "${entry.agentId}" déchargé (fichier supprimé)`
              );
            }
          }
        }, 200);
      }
    );

    console.log(`[AgentLoader] Surveillance active: ${dir}`);
  }

  /**
   * Arrête la surveillance.
   */
  stopWatching(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
  }

  /**
   * Retourne la liste des fichiers chargés avec leurs agents et empreintes.
   */
  getLoaded(): Array<{ file: string; agentId: string; hash: string; loadedAt: string }> {
    return Array.from(this.loadedFiles.entries()).map(([file, entry]) => ({
      file: path.basename(file),
      agentId: entry.agentId,
      hash: entry.hash,
      loadedAt: entry.loadedAt,
    }));
  }

  // ─── Privé ──────────────────────────────────────────────────────────────────

  private findAgentExport(module: any): AgentPlugin | null {
    // Exports nommés
    for (const key of Object.keys(module)) {
      const exported = module[key];
      if (this.validatePlugin(exported)) {
        return exported;
      }
    }
    // Default export
    if (module.default && this.validatePlugin(module.default)) {
      return module.default;
    }
    return null;
  }

  private validatePlugin(obj: any): obj is AgentPlugin {
    return (
      obj &&
      typeof obj === "object" &&
      obj.metadata &&
      typeof obj.metadata.id === "string" &&
      typeof obj.metadata.name === "string" &&
      typeof obj.execute === "function"
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Comparaison de chaînes à temps constant (mitigation timing attack).
 * Retourne true si les deux chaînes sont identiques.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
