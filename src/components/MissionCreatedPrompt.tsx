import { useCallback, useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import { Rocket, X, ArrowRight } from 'lucide-react';
import { Modal } from './ui/Modal.js';
import { Button } from './ui/Button.js';

/**
 * MissionCreatedPrompt — À la création d'une mission, propose d'ouvrir la vue
 * des missions (MissionPanel). La modale disparaît automatiquement après
 * AUTO_DISMISS_MS si l'utilisateur ne répond pas.
 *
 * Écoute l'événement global `Leanna-mission-event` (émis par useLiveAPI) et
 * réagit à la première apparition d'une mission (`mission_plan` / `mission_started`).
 * Sur confirmation, émet `Leanna-open-missions`, écouté par IdeView pour
 * ouvrir le panneau des missions.
 *
 * UX :
 *  - Anneau de compte à rebours circulaire autour de l'icône.
 *  - Le compte à rebours se met en pause au survol / au focus clavier, afin de
 *    ne pas fermer la fenêtre sous le curseur de l'utilisateur.
 *  - Le bouton « Ouvrir » reçoit le focus initial (Entrée = ouvrir).
 */

const AUTO_DISMISS_MS = 5000;
const TICK_MS = 50; // rafraîchissement fluide de l'anneau

interface PendingPrompt {
  missionId: string;
  title: string;
  /** Distingue mission planifiée (pending) de mission démarrée (in_progress). */
  started: boolean;
}

export function MissionCreatedPrompt() {
  const [pending, setPending] = useState<PendingPrompt | null>(null);
  const [remainingMs, setRemainingMs] = useState(AUTO_DISMISS_MS);
  const [paused, setPaused] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  // Missions déjà annoncées : on ne propose qu'une fois par mission, même si
  // plusieurs événements (mission_plan puis mission_started) arrivent.
  const promptedRef = useRef<Set<string>>(new Set());
  // Horodatage de fin, recalculé quand on (re)prend le compte à rebours. Plus
  // fiable qu'un simple décrément par tick (pas de dérive cumulée).
  const deadlineRef = useRef<number>(0);

  // Détecte la création d'une mission via le bus d'événements global.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as
        | { type?: string; event?: string; missionId?: string; title?: string }
        | undefined;

      if (!detail || detail.type !== 'mission_event') return;
      if (detail.event !== 'mission_plan' && detail.event !== 'mission_started') return;

      const missionId = detail.missionId;
      if (!missionId || promptedRef.current.has(missionId)) return;

      promptedRef.current.add(missionId);
      setPending({
        missionId,
        title: detail.title ?? 'Nouvelle mission',
        started: detail.event === 'mission_started',
      });
      setRemainingMs(AUTO_DISMISS_MS);
      setPaused(false);
    };

    window.addEventListener('Leanna-mission-event', handler as EventListener);
    return () => window.removeEventListener('Leanna-mission-event', handler as EventListener);
  }, []);

  const dismiss = useCallback(() => {
    setPending(null);
  }, []);

  // Référence à la mission courante, synchronisée hors rendu. Permet à
  // openMissionView de dispatcher l'événement SANS lire l'état dans un updater
  // setState (React exécute les updaters pendant le rendu : y déclencher un
  // dispatchEvent → setState dans IdeView provoque le warning « Cannot update a
  // component while rendering a different component »).
  const pendingRef = useRef<PendingPrompt | null>(null);
  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  const openMissionView = useCallback(() => {
    const current = pendingRef.current;
    // Fermer d'abord (met à jour l'état local), puis notifier IdeView via
    // l'événement — en dehors de tout updater de rendu.
    setPending(null);
    if (current) {
      window.dispatchEvent(
        new CustomEvent('Leanna-open-missions', { detail: { missionId: current.missionId } }),
      );
    }
  }, []);

  // Compte à rebours — fermeture automatique sans réponse, avec pause au survol.
  useEffect(() => {
    if (!pending || paused) return;
    deadlineRef.current = Date.now() + remainingMs;

    const interval = setInterval(() => {
      const left = deadlineRef.current - Date.now();
      if (left <= 0) {
        setRemainingMs(0);
        dismiss();
        return;
      }
      setRemainingMs(left);
    }, TICK_MS);

    return () => clearInterval(interval);
    // On ne dépend PAS de remainingMs : la deadline est figée à la (re)prise et
    // le tick met à jour l'état sans relancer l'effet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, paused, dismiss]);

  const secondsLeft = Math.ceil(remainingMs / 1000);
  const progress = Math.max(0, Math.min(1, remainingMs / AUTO_DISMISS_MS));

  // Géométrie de l'anneau SVG.
  const RING_SIZE = 44;
  const RING_STROKE = 3;
  const radius = (RING_SIZE - RING_STROKE) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <Modal
      open={pending !== null}
      onClose={dismiss}
      size="sm"
      tone="info"
      layer="modal"
      hideClose
      aria-describedby="mission-created-desc"
    >
      <div
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocusCapture={() => setPaused(true)}
        onBlurCapture={() => setPaused(false)}
      >
        <Modal.Header>
          <div className="flex items-center gap-3">
            {/* Icône + anneau de compte à rebours circulaire */}
            <div className="relative flex-shrink-0" style={{ width: RING_SIZE, height: RING_SIZE }}>
              <svg
                width={RING_SIZE}
                height={RING_SIZE}
                className="absolute inset-0 -rotate-90"
                aria-hidden="true"
              >
                <circle
                  cx={RING_SIZE / 2}
                  cy={RING_SIZE / 2}
                  r={radius}
                  fill="none"
                  stroke="var(--border-base)"
                  strokeWidth={RING_STROKE}
                />
                <circle
                  cx={RING_SIZE / 2}
                  cy={RING_SIZE / 2}
                  r={radius}
                  fill="none"
                  stroke="var(--color-info)"
                  strokeWidth={RING_STROKE}
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={circumference * (1 - progress)}
                  style={{ transition: prefersReducedMotion ? undefined : `stroke-dashoffset ${TICK_MS}ms linear` }}
                />
              </svg>
              <div
                className="absolute inset-0 m-auto w-8 h-8 rounded-full flex items-center justify-center"
                style={{ backgroundColor: 'color-mix(in srgb, var(--color-info) 15%, transparent)' }}
              >
                <Rocket className="w-4 h-4" style={{ color: 'var(--color-info)' }} />
              </div>
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                Mission créée
              </h3>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Voulez-vous ouvrir la vue des missions ?
              </p>
            </div>
          </div>
        </Modal.Header>

        <Modal.Body>
          {pending && (
            <div className="space-y-3" id="mission-created-desc">
              <div
                className="rounded-xl p-4 space-y-2"
                style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-base)' }}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
                    Mission
                  </span>
                  <span className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                    {pending.title}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
                    État
                  </span>
                  <span
                    className="text-xs font-semibold rounded-lg px-2 py-0.5"
                    style={{
                      backgroundColor: pending.started
                        ? 'color-mix(in srgb, var(--color-success) 15%, transparent)'
                        : 'color-mix(in srgb, var(--color-info) 15%, transparent)',
                      color: pending.started ? 'var(--color-success)' : 'var(--color-info)',
                    }}
                  >
                    {pending.started ? 'En cours' : 'Planifiée'}
                  </span>
                </div>
              </div>

              <p
                className="text-xs text-center"
                style={{ color: 'var(--text-dimmed)' }}
                aria-live="polite"
              >
                {paused
                  ? 'Compte à rebours en pause'
                  : `Fermeture automatique dans ${secondsLeft} s`}
              </p>
            </div>
          )}
        </Modal.Body>

        <Modal.Footer>
          <Button variant="secondary" size="sm" onClick={dismiss}>
            <X className="w-3.5 h-3.5" />
            Plus tard
          </Button>
          <Button
            autoFocus
            size="sm"
            onClick={openMissionView}
            style={{ backgroundColor: 'var(--color-info)', color: 'white' } as React.CSSProperties}
          >
            Ouvrir
            <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        </Modal.Footer>
      </div>
    </Modal>
  );
}
