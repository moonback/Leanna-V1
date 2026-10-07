/**
 * useResumeConfirmations — source unique de vérité pour les missions
 * interrompues (crash/redémarrage) qui attendent une décision explicite de
 * l'utilisateur : les **réactiver** ou les **effacer**.
 *
 * Pourquoi : au démarrage (ou à la connexion d'un workspace), le serveur ne
 * relance plus les missions interrompues d'office. Il émet un événement
 * `mission_resume_pending` par mission. Ce store partagé écoute le même flux
 * `Leanna-mission-event` que le reste de l'UI et expose la liste + un compteur,
 * permettant d'afficher une pastille de notification ailleurs (barre de statut,
 * entrée « Missions »).
 *
 * Contrairement aux approbations d'action, ces décisions n'ont PAS d'échéance :
 * une mission interrompue reste proposée tant que l'utilisateur n'a pas tranché.
 * Une décision prise (réactiver → `mission_resumed`, effacer → `mission_deleted`)
 * retire la carte correspondante.
 */

import { useSyncExternalStore } from 'react';

export interface ResumeConfirmationInfo {
  missionId: string;
  title: string;
  priority?: string;
  /** Statut persisté au moment de l'interruption (pending | in_progress). */
  status?: string;
  /** Dernière mise à jour persistée (ISO) — utile pour trier/afficher l'ancienneté. */
  updatedAt?: string;
  /** Timestamp (ms) de réception côté client. */
  receivedAt: number;
}

interface MissionEventDetail {
  type?: string;
  event?: string;
  missionId?: string;
  title?: string;
  priority?: string;
  status?: string;
  updatedAt?: string;
}

// ── État module-level partagé entre tous les abonnés ────────────────────────
let confirmations: ResumeConfirmationInfo[] = [];
const listeners = new Set<() => void>();
let initialized = false;

function emit() {
  for (const l of listeners) l();
}

function setConfirmations(next: ResumeConfirmationInfo[]) {
  confirmations = next;
  emit();
}

function handleMissionEvent(e: Event) {
  const detail = (e as CustomEvent<MissionEventDetail>).detail;
  if (!detail || detail.type !== 'mission_event' || !detail.missionId) return;

  if (detail.event === 'mission_resume_pending') {
    // Idempotent : ne pas dupliquer une mission déjà proposée.
    if (confirmations.some(c => c.missionId === detail.missionId)) return;
    setConfirmations([
      ...confirmations,
      {
        missionId: detail.missionId,
        title: detail.title ?? 'Mission',
        priority: detail.priority,
        status: detail.status,
        updatedAt: detail.updatedAt,
        receivedAt: Date.now(),
      },
    ]);
  } else if (
    // Toute transition terminale sur cette mission résout la décision.
    detail.event === 'mission_resumed' ||
    detail.event === 'mission_deleted' ||
    detail.event === 'mission_started'
  ) {
    const next = confirmations.filter(c => c.missionId !== detail.missionId);
    if (next.length !== confirmations.length) setConfirmations(next);
  }
}

function ensureInitialized() {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;
  window.addEventListener('Leanna-mission-event', handleMissionEvent);
}

function subscribe(callback: () => void): () => void {
  ensureInitialized();
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

function getSnapshot(): ResumeConfirmationInfo[] {
  return confirmations;
}

const EMPTY: ResumeConfirmationInfo[] = [];
function getServerSnapshot(): ResumeConfirmationInfo[] {
  return EMPTY;
}

/** Retire localement une mission (après décision utilisateur via l'API). */
export function clearResumeConfirmation(missionId: string) {
  const next = confirmations.filter(c => c.missionId !== missionId);
  if (next.length !== confirmations.length) setConfirmations(next);
}

/**
 * Remplace la liste complète (utilisé après un fetch initial de
 * `GET /api/missions/pending-resumes` au montage du panneau, afin de
 * reconstituer l'état même si l'événement WebSocket est arrivé trop tôt).
 */
export function seedResumeConfirmations(items: Omit<ResumeConfirmationInfo, 'receivedAt'>[]) {
  const now = Date.now();
  const merged = new Map<string, ResumeConfirmationInfo>();
  // Conserver les entrées existantes (receivedAt d'origine) puis compléter.
  for (const c of confirmations) merged.set(c.missionId, c);
  for (const item of items) {
    if (!merged.has(item.missionId)) {
      merged.set(item.missionId, { ...item, receivedAt: now });
    }
  }
  const next = Array.from(merged.values());
  if (next.length !== confirmations.length) setConfirmations(next);
}

/** Liste réactive des missions interrompues en attente de décision. */
export function useResumeConfirmations(): ResumeConfirmationInfo[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Nombre de missions interrompues en attente (pour pastilles/badges). */
export function useResumeConfirmationCount(): number {
  return useResumeConfirmations().length;
}
