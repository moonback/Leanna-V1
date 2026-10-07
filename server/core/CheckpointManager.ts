/**
 * core/CheckpointManager.ts — P0.4 : snapshot / commit / rollback.
 *
 * Manque critique identifié par l'audit (§7, marqué 🔴) : Leanna sait vérifier
 * et réparer, mais ne sait pas revenir à l'état d'AVANT une modification. Sans
 * rollback transactionnel, un échec de vérification laisse le workspace dans un
 * état intermédiaire.
 *
 * Cycle transactionnel visé (§7) :
 *   PREPARE → SNAPSHOT → ACT → VERIFY → COMMIT
 *                                     └→ ROLLBACK → RECOVER → RETRY
 *
 * Un checkpoint capture, pour chaque fichier concerné : existait-il, son
 * contenu, et son hash (SHA-256, réutilisé de WorkspaceState). `rollback()`
 * restaure EXACTEMENT cet état — y compris en supprimant un fichier qui
 * n'existait pas au moment du snapshot (création à annuler).
 *
 * L'accès disque est injectable (interface `FileGateway`) pour des tests
 * déterministes sans toucher au vrai système de fichiers.
 */

import { WorkspaceState } from "../agents/WorkspaceState.js";
import { coreDir, writeJsonAtomic, readJson } from "./paths.js";
import fs from "node:fs";
import path from "node:path";

/** Abstraction minimale du système de fichiers (injectable pour les tests). */
export interface FileGateway {
  exists(filePath: string): boolean;
  read(filePath: string): string;
  write(filePath: string, content: string): void;
  remove(filePath: string): void;
}

/** Implémentation par défaut sur `node:fs`. */
export function makeNodeFileGateway(): FileGateway {
  return {
    exists: (p) => fs.existsSync(p),
    read: (p) => fs.readFileSync(p, "utf8"),
    write: (p, content) => {
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, content, "utf8");
    },
    remove: (p) => fs.rmSync(p, { force: true }),
  };
}

/** État capturé d'un fichier à l'instant du snapshot. */
export interface FileSnapshot {
  path: string;
  existed: boolean;
  /** Contenu au moment du snapshot (absent si le fichier n'existait pas). */
  content?: string;
  /** Hash SHA-256 du contenu (absent si le fichier n'existait pas). */
  hash?: string;
}

export type CheckpointStatus = "open" | "committed" | "rolledback";

/** Un checkpoint : ensemble de snapshots de fichiers + statut. */
export interface Checkpoint {
  id: string;
  missionId?: string;
  label?: string;
  createdAt: string;
  status: CheckpointStatus;
  files: FileSnapshot[];
}

export class CheckpointManager {
  private readonly gateway: FileGateway;
  private readonly dir: string;
  private readonly checkpoints = new Map<string, Checkpoint>();

  constructor(options: { gateway?: FileGateway; dirOverride?: string } = {}) {
    this.gateway = options.gateway ?? makeNodeFileGateway();
    this.dir = options.dirOverride ?? coreDir("checkpoints");
    this.hydrate();
  }

  private hydrate(): void {
    try {
      if (!fs.existsSync(this.dir)) return;
      for (const name of fs.readdirSync(this.dir)) {
        if (!name.endsWith(".json")) continue;
        const cp = readJson<Checkpoint | null>(path.join(this.dir, name), null);
        if (cp) this.checkpoints.set(cp.id, cp);
      }
    } catch {
      /* best-effort */
    }
  }

  private file(id: string): string {
    const safe = id.replace(/[^a-zA-Z0-9_.-]/g, "_");
    return path.join(this.dir, `${safe}.json`);
  }

  private persist(cp: Checkpoint): void {
    this.checkpoints.set(cp.id, cp);
    writeJsonAtomic(this.file(cp.id), cp);
  }

  /**
   * PREPARE + SNAPSHOT : capture l'état courant des fichiers indiqués AVANT
   * toute modification. Retourne le checkpoint (statut "open").
   */
  snapshot(files: string[], meta: { missionId?: string; label?: string } = {}): Checkpoint {
    const unique = [...new Set(files.map((f) => f.replace(/\\/g, "/")))];
    const snapshots: FileSnapshot[] = unique.map((filePath) => {
      if (this.gateway.exists(filePath)) {
        const content = this.gateway.read(filePath);
        return { path: filePath, existed: true, content, hash: WorkspaceState.hash(content) };
      }
      return { path: filePath, existed: false };
    });

    const cp: Checkpoint = {
      id: `cp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      missionId: meta.missionId,
      label: meta.label,
      createdAt: new Date().toISOString(),
      status: "open",
      files: snapshots,
    };
    this.persist(cp);
    return cp;
  }

  /** COMMIT : fige le checkpoint. Un rollback devient alors impossible. */
  commit(id: string): void {
    const cp = this.require(id);
    if (cp.status !== "open") {
      throw new Error(`Checkpoint ${id} déjà ${cp.status} — commit impossible.`);
    }
    this.persist({ ...cp, status: "committed" });
  }

  /**
   * ROLLBACK : restaure l'état capturé. Pour chaque fichier :
   *   - existait → réécrit le contenu d'origine ;
   *   - n'existait pas → supprime (annule une création).
   * Refuse de rollback un checkpoint committé.
   */
  rollback(id: string): void {
    const cp = this.require(id);
    if (cp.status === "committed") {
      throw new Error(`Checkpoint ${id} committé — rollback interdit.`);
    }
    if (cp.status === "rolledback") return; // idempotent

    for (const snap of cp.files) {
      if (snap.existed) {
        this.gateway.write(snap.path, snap.content ?? "");
      } else if (this.gateway.exists(snap.path)) {
        this.gateway.remove(snap.path);
      }
    }
    this.persist({ ...cp, status: "rolledback" });
  }

  /** Retourne un checkpoint connu (mémoire ou disque), ou undefined. */
  get(id: string): Checkpoint | undefined {
    return this.checkpoints.get(id);
  }

  /**
   * Indique si les fichiers d'un checkpoint ont changé depuis le snapshot
   * (comparaison de hash) — utile pour la phase VERIFY.
   */
  changedFiles(id: string): string[] {
    const cp = this.require(id);
    const changed: string[] = [];
    for (const snap of cp.files) {
      const nowExists = this.gateway.exists(snap.path);
      if (nowExists !== snap.existed) {
        changed.push(snap.path);
        continue;
      }
      if (nowExists) {
        const hash = WorkspaceState.hash(this.gateway.read(snap.path));
        if (hash !== snap.hash) changed.push(snap.path);
      }
    }
    return changed;
  }

  private require(id: string): Checkpoint {
    const cp = this.checkpoints.get(id);
    if (!cp) throw new Error(`Checkpoint ${id} introuvable.`);
    return cp;
  }
}
