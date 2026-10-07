/**
 * core/DurableMissionStore.ts — P0.2 : persistance locale du cycle de vie.
 *
 * Contrairement à `server/mission/MissionStore.ts` (Supabase, souvent
 * désactivé), ce store écrit sous `.Leanna/core/missions/<id>.json` et est
 * TOUJOURS disponible. Il persiste le `MissionLifecycleSnapshot` après chaque
 * transition, ce qui permet la reprise après crash exigée par l'audit (§15).
 *
 * L'écriture est atomique (write-then-rename) : un crash en pleine écriture ne
 * laisse jamais un snapshot corrompu.
 */

import fs from "node:fs";
import path from "node:path";
import { coreDir, writeJsonAtomic, readJson } from "./paths.js";
import {
  MissionStateMachine,
  type MissionLifecycleSnapshot,
  type MissionLifecycleState,
} from "./MissionStateMachine.js";

export class DurableMissionStore {
  /** Répertoire override (tests) ; sinon `.Leanna/core/missions`. */
  constructor(private readonly dirOverride?: string) {}

  private dir(): string {
    return this.dirOverride ?? coreDir("missions");
  }

  private file(missionId: string): string {
    // Un id de mission peut contenir des caractères sûrs (UUID) ; on borne
    // néanmoins le nom de fichier pour éviter toute traversée de chemin.
    const safe = missionId.replace(/[^a-zA-Z0-9_.-]/g, "_");
    return path.join(this.dir(), `${safe}.json`);
  }

  /** Persiste le snapshot d'une machine (appelé après chaque transition). */
  save(machine: MissionStateMachine): void {
    writeJsonAtomic(this.file(machine.missionId), machine.snapshot());
  }

  /** Recharge une machine depuis le disque, ou undefined si absente. */
  load(missionId: string): MissionStateMachine | undefined {
    const snapshot = readJson<MissionLifecycleSnapshot | null>(this.file(missionId), null);
    if (!snapshot) return undefined;
    return MissionStateMachine.fromSnapshot(snapshot);
  }

  /** Liste tous les snapshots persistés (pour la reprise au démarrage). */
  listSnapshots(): MissionLifecycleSnapshot[] {
    const dir = this.dir();
    if (!fs.existsSync(dir)) return [];
    return fs
      .readdirSync(dir)
      .filter((name) => name.endsWith(".json"))
      .map((name) => readJson<MissionLifecycleSnapshot | null>(path.join(dir, name), null))
      .filter((s): s is MissionLifecycleSnapshot => s !== null);
  }

  /**
   * Retourne les missions interrompues (état non terminal) à reprendre au
   * démarrage — équivalent local de `MissionStore.listByStatus(pending,running)`.
   */
  listResumable(): MissionLifecycleSnapshot[] {
    const nonTerminal: ReadonlySet<MissionLifecycleState> = new Set([
      "CREATED",
      "PLANNING",
      "READY",
      "RUNNING",
      "VERIFYING",
      "RECOVERING",
      "WAITING_APPROVAL",
      "PAUSED",
      "COMMITTING",
    ]);
    return this.listSnapshots().filter((s) => nonTerminal.has(s.state));
  }

  /** Supprime le snapshot d'une mission (nettoyage optionnel). */
  delete(missionId: string): void {
    try {
      fs.rmSync(this.file(missionId), { force: true });
    } catch {
      /* best-effort */
    }
  }
}
