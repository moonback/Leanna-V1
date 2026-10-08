import React, {
  useState, useEffect, useMemo, useCallback, useId,
} from 'react';
import {
  FolderOpen, KeyRound, AlertCircle, BookOpen,
  Sparkles, RotateCcw, Trash2, Loader2, Play, GitBranch, ArrowRight,
  Bot, Target, Globe, X,
} from 'lucide-react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { FileIcon } from './FileIcon.js';
import { useWorkspaceState } from '../../hooks/useWorkspaceState.js';
import { useLiveAPIContext } from '../../context/LiveAPIContext.js';
import { useProfile } from '../../context/UserProfileContext.js';
import {
  useResumeConfirmations,
  clearResumeConfirmation,
  seedResumeConfirmations,
  type ResumeConfirmationInfo,
} from '../../hooks/useResumeConfirmations.js';
import { ShortcutsModal } from './ShortcutsModal.js';
import { SystemModal } from './SystemModal.js';

// ─── Constantes ──────────────────────────────────────────────────────────

function detectMac(): boolean {
  if (typeof navigator === 'undefined') return false;
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const platform = nav.userAgentData?.platform || nav.platform || nav.userAgent || '';
  return /Mac|iPod|iPhone|iPad/.test(platform);
}

const MOD = detectMac() ? '⌘' : 'Ctrl';

const SPRING = { type: 'spring' as const, bounce: 0, duration: 0.4 };

type GeminiStatus = 'configured' | 'invalid' | 'unconfigured' | null;
type IconType = React.ComponentType<{ size?: number; style?: React.CSSProperties }>;

// ─── Hook : statut Git ───────────────────────────────────────────────────

interface GitInfo { branch?: string; files?: unknown; repository?: string }

function useGitInfo() {
  const [gitInfo, setGitInfo] = useState<GitInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/git/status')
      .then(res => res.json())
      .then(data => {
        if (!cancelled && data.status === 'success') {
          setGitInfo({
            branch: data.data?.branch,
            files: data.data?.files,
            repository: data.data?.repository,
          });
        }
      })
      .catch(() => { if (!cancelled) setGitInfo(null); });
    return () => { cancelled = true; };
  }, []);

  return gitInfo;
}

// ─── Hook : fichiers récents (localStorage) ──────────────────────────────

const RECENT_FILES_KEY = 'Leanna_recent_files';

interface RecentFile { path: string; language?: string; openedAt: number }

function readRecentFiles(): RecentFile[] {
  try {
    const raw = localStorage.getItem(RECENT_FILES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((r): r is RecentFile => !!r && typeof r.path === 'string')
      .sort((a, b) => (b.openedAt ?? 0) - (a.openedAt ?? 0));
  } catch {
    return [];
  }
}

function useRecentFiles() {
  const [files, setFiles] = useState<RecentFile[]>(() => (
    typeof window !== 'undefined' ? readRecentFiles() : []
  ));

  useEffect(() => {
    const refresh = () => setFiles(readRecentFiles());
    const onStorage = (e: StorageEvent) => {
      if (!e.key || e.key === RECENT_FILES_KEY) refresh();
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', refresh);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', refresh);
    };
  }, []);

  const remove = useCallback((path: string) => {
    setFiles((prev) => {
      const next = prev.filter((r) => r.path !== path);
      try { localStorage.setItem(RECENT_FILES_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setFiles([]);
    try { localStorage.removeItem(RECENT_FILES_KEY); } catch { /* ignore */ }
  }, []);

  return { files, remove, clear };
}

// ─── Hook : statut de la clé Gemini ──────────────────────────────────────

function useGeminiStatus(): GeminiStatus {
  const [status, setStatus] = useState<GeminiStatus>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch('/api/tokens').then(r => r.json()),
      fetch('/api/gemini-keys').then(r => r.json()),
    ])
      .then(([tokens, keys]) => {
        if (cancelled || tokens.status !== 'success' || keys.status !== 'success') return;
        const token = tokens.tokens?.find((t: { key: string }) => t.key === 'GEMINI_API_KEY');
        const hasPoolKey = keys.keys?.some((k: { disabled: boolean }) => !k.disabled) === true;
        setStatus(
          token?.valid === false ? 'invalid'
            : token?.configured === true || hasPoolKey ? 'configured'
              : 'unconfigured',
        );
      })
      .catch(() => { if (!cancelled) setStatus(null); });
    return () => { cancelled = true; };
  }, []);

  return status;
}

// ─── Hook : piège de focus, limité à la modale ouverte ───────────────────

function useFocusTrap(isActive: boolean) {
  useEffect(() => {
    if (!isActive) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const dialog = document.querySelector<HTMLElement>('[role="dialog"], [aria-modal="true"]');
      if (!dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      ));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [isActive]);
}

// ─── Styles partagés ─────────────────────────────────────────────────────
// Les transformations (survol, appui) sont gérées uniquement par motion :
// plus de conflit avec des règles CSS `transform`.

function GlobalStyles() {
  return (
    <style>{`
      .ee-focus { outline: none; }
      .ee-focus:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }

      /* Grain : bruit SVG très léger, mélangé pour casser les dégradés plats */
      .ee-grain {
        z-index: 0;
        opacity: 0.07;
        mix-blend-mode: soft-light;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
        background-size: 140px 140px;
      }
      /* Repli pour thèmes où soft-light ne rend presque rien */
      @supports not (mix-blend-mode: soft-light) {
        .ee-grain { mix-blend-mode: normal; opacity: 0.04; }
      }

      .ee-glass {
        position: relative;
        overflow: hidden;
        background-color: color-mix(in srgb, var(--surface) 50%, transparent);
        border: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        box-shadow: inset 0 1px 0 color-mix(in srgb, #fff 12%, transparent),
                    0 8px 24px color-mix(in srgb, #000 16%, transparent);
        transition: border-color 200ms ease-out, background-color 200ms ease-out;
      }
      .ee-glass::before {
        content: '';
        position: absolute; inset: 0; z-index: 0;
        border-radius: inherit;
        pointer-events: none;
        background: linear-gradient(135deg, color-mix(in srgb, #fff 10%, transparent) 0%, transparent 40%);
      }
      .ee-glass > * { position: relative; z-index: 1; }
      .ee-glass:hover { border-color: color-mix(in srgb, var(--primary) 45%, transparent); }

      /* Carte Leanna : accent primaire plus marqué */
      .ee-card-primary {
        border-color: color-mix(in srgb, var(--primary) 32%, var(--border));
        background-image: linear-gradient(135deg,
          color-mix(in srgb, var(--primary) 10%, transparent) 0%, transparent 60%);
      }

      /* Hero card : pleine largeur, accent primaire présent, icône plus grande */
      .ee-card-hero {
        border-color: color-mix(in srgb, var(--primary) 38%, var(--border));
        background-image:
          radial-gradient(120% 140% at 0% 0%, color-mix(in srgb, var(--primary) 16%, transparent) 0%, transparent 55%),
          linear-gradient(135deg, color-mix(in srgb, var(--primary) 8%, transparent) 0%, transparent 70%);
      }
      .ee-card-hero:hover:not(:disabled) {
        border-color: color-mix(in srgb, var(--primary) 55%, transparent);
        box-shadow: inset 0 1px 0 color-mix(in srgb, #fff 16%, transparent),
                    0 14px 40px color-mix(in srgb, var(--primary) 22%, transparent);
      }
      .ee-card-hero .ee-card-icon {
        width: 48px; height: 48px; border-radius: 14px;
      }

      /* Cartes d'action rapide : accent coloré par carte */
      .ee-card {
        position: relative;
        overflow: hidden;
        background-color: color-mix(in srgb, var(--surface) 50%, transparent);
        border: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        box-shadow: inset 0 1px 0 color-mix(in srgb, #fff 12%, transparent),
                    0 8px 24px color-mix(in srgb, #000 16%, transparent);
        transition: border-color 200ms ease-out, background-color 200ms ease-out,
                    box-shadow 200ms ease-out;
      }
      .ee-card::after {
        content: '';
        position: absolute; inset: 0; z-index: 0;
        border-radius: inherit;
        pointer-events: none;
        opacity: 0;
        background: linear-gradient(135deg,
          color-mix(in srgb, var(--card-accent) 10%, transparent) 0%, transparent 55%);
        transition: opacity 200ms ease-out;
      }
      .ee-card > * { position: relative; z-index: 1; }
      .ee-card:hover:not(:disabled) {
        border-color: color-mix(in srgb, var(--card-accent) 50%, transparent);
        box-shadow: inset 0 1px 0 color-mix(in srgb, #fff 14%, transparent),
                    0 10px 28px color-mix(in srgb, var(--card-accent) 18%, transparent);
      }
      .ee-card:hover:not(:disabled)::after { opacity: 1; }
      .ee-card:hover:not(:disabled) .ee-card-icon {
        background-color: color-mix(in srgb, var(--card-accent) 20%, transparent);
        border-color: color-mix(in srgb, var(--card-accent) 40%, transparent);
      }
      .ee-card-icon { transition: background-color 200ms ease-out, border-color 200ms ease-out; }

      .ee-card-arrow {
        opacity: 0;
        transform: translateX(-4px);
        transition: opacity 180ms ease-out, transform 180ms ease-out;
      }
      .ee-card:hover:not(:disabled) .ee-card-arrow,
      .ee-card:focus-visible .ee-card-arrow {
        opacity: 1;
        transform: translateX(0);
      }

      @supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
        .ee-card { background-color: var(--surface); }
      }

      @media (prefers-reduced-motion: reduce) {
        .ee-card-arrow { transition: opacity 150ms ease-out; transform: none; }
        .ee-card:hover:not(:disabled) .ee-card-arrow { transform: none; }
      }

      /* Fichiers récents : bouton de suppression révélé au survol */
      .ee-recent-remove {
        opacity: 0;
        background-color: color-mix(in srgb, var(--surface-soft) 70%, transparent);
        transition: opacity 150ms ease-out, color 150ms ease-out, background-color 150ms ease-out;
      }
      .ee-recent:hover .ee-recent-remove,
      .ee-recent-remove:focus-visible {
        opacity: 1;
      }
      .ee-recent-remove:hover {
        color: var(--color-error);
        background-color: color-mix(in srgb, var(--color-error) 14%, transparent);
      }
      /* Laisse la place au bouton de suppression dans la carte récente */
      .ee-recent:hover .ee-card { padding-right: 1.75rem; }

      .ee-chip {
        display: inline-flex; align-items: center; gap: 6px;
        padding: 4px 10px; border-radius: 999px;
        font-size: 0.75rem; font-weight: 500;
        color: var(--text-muted);
        background-color: color-mix(in srgb, var(--surface-soft) 55%, transparent);
        border: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
      }

      .ee-link {
        padding: 4px 8px; border-radius: 6px;
        font-size: 0.8125rem; font-weight: 500;
        color: var(--text-muted);
        transition: color 150ms, background-color 150ms;
      }
      .ee-link:hover {
        color: var(--primary);
        background-color: color-mix(in srgb, var(--surface-soft) 55%, transparent);
      }

      .ee-btn {
        display: inline-flex; align-items: center; gap: 6px;
        padding: 6px 12px; border-radius: 8px;
        font-size: 0.75rem; font-weight: 600;
        transition: opacity 150ms, background-color 150ms;
      }
      .ee-btn:disabled { opacity: 0.5; cursor: not-allowed; }

      @supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
        .ee-glass { background-color: var(--surface); }
      }

      /* Prénom mis en valeur par un dégradé de texte */
      .ee-name-accent {
        background-image: linear-gradient(100deg,
          var(--primary) 0%,
          color-mix(in srgb, var(--primary) 60%, #fff) 100%);
        -webkit-background-clip: text;
        background-clip: text;
        -webkit-text-fill-color: transparent;
        color: transparent;
      }
      @supports not ((background-clip: text) or (-webkit-background-clip: text)) {
        .ee-name-accent { color: var(--primary); }
      }

      .ee-dot-live { animation: ee-pulse 2s ease-in-out infinite; }
      @keyframes ee-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }

      @media (prefers-reduced-motion: reduce) {
        .ee-dot-live { animation: none; }
      }
    `}</style>
  );
}

// ─── Petits composants ───────────────────────────────────────────────────

const Kbd = React.memo(function Kbd({
  children, className = '',
}: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={`inline-flex items-center justify-center h-[20px] min-w-[20px] px-1.5 text-xs font-mono font-semibold rounded ${className}`}
      style={{
        color: 'var(--text-muted)',
        backgroundColor: 'color-mix(in srgb, var(--surface-soft) 60%, transparent)',
        border: '1px solid color-mix(in srgb, #fff 12%, transparent)',
      }}
    >
      {children}
    </kbd>
  );
});

const ActionCard = React.memo(function ActionCard({
  icon: Icon, title, description, shortcut, onClick, disabled = false, reduceMotion = false,
  accent = 'var(--primary)', comingSoon = false, primary = false, hero = false,
}: {
  icon: IconType;
  title: string;
  description: string;
  shortcut?: string;
  onClick?: () => void;
  disabled?: boolean;
  reduceMotion?: boolean;
  accent?: string;
  comingSoon?: boolean;
  primary?: boolean;
  hero?: boolean;
}) {
  const descId = useId();
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-describedby={descId}
      className={`ee-card ee-focus group flex items-start text-left rounded-xl disabled:opacity-45 disabled:cursor-not-allowed${primary ? ' ee-card-primary' : ''}${hero ? ' ee-card-hero gap-4 p-5' : ' gap-3 p-4'}`}
      style={{ ['--card-accent' as string]: accent }}
      whileHover={reduceMotion || disabled ? undefined : { y: -2 }}
      whileTap={reduceMotion || disabled ? undefined : { scale: 0.98 }}
      transition={{ duration: 0.15 }}
    >
      <span
        className={`ee-card-icon flex items-center justify-center rounded-lg flex-shrink-0${hero ? '' : ' w-9 h-9'}`}
        style={{
          backgroundColor: 'color-mix(in srgb, var(--card-accent) 12%, transparent)',
          border: '1px solid color-mix(in srgb, var(--card-accent) 22%, transparent)',
        }}
      >
        <Icon size={hero ? 22 : 16} style={{ color: 'var(--card-accent)' }} />
      </span>
      <span className="flex-1 min-w-0">
        <span className="flex items-center gap-2">
          <span className={`block font-semibold leading-tight ${hero ? 'text-base' : 'text-sm'}`} style={{ color: 'var(--text)' }}>
            {title}
          </span>
          {comingSoon && (
            <span
              className="inline-flex items-center h-[16px] px-1.5 rounded-full text-[10px] font-semibold uppercase tracking-wide"
              style={{ color: 'var(--text-muted)', backgroundColor: 'color-mix(in srgb, var(--surface-soft) 70%, transparent)' }}
            >
              Bientôt
            </span>
          )}
        </span>
        <span id={descId} className="block text-xs leading-snug mt-1" style={{ color: 'var(--text-muted)' }}>
          {description}
        </span>
      </span>
      {shortcut
        ? <Kbd className="hidden sm:inline-flex">{shortcut}</Kbd>
        : !disabled && (
          <ArrowRight
            size={15}
            className="ee-card-arrow hidden sm:block flex-shrink-0 mt-0.5"
            style={{ color: 'var(--card-accent)' }}
          />
        )}
    </motion.button>
  );
});

// ─── Missions interrompues ───────────────────────────────────────────────

const InterruptedMissionCard = React.memo(function InterruptedMissionCard({
  confirmation, deciding, disabled, reduceMotion = false, onReactivate, onDelete,
}: {
  confirmation: ResumeConfirmationInfo;
  deciding: 'reactivate' | 'delete' | null;
  disabled: boolean;
  reduceMotion?: boolean;
  onReactivate: () => void;
  onDelete: () => void;
}) {
  const statusText = confirmation.status === 'in_progress' ? 'en cours' : 'en attente';

  return (
    <motion.li
      layout={!reduceMotion}
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0, marginTop: 0 }}
      transition={{ duration: reduceMotion ? 0.15 : 0.25 }}
      className="ee-glass flex flex-wrap items-center gap-3 p-4 rounded-xl list-none"
    >
      <span
        className="w-9 h-9 flex items-center justify-center rounded-lg flex-shrink-0"
        style={{
          backgroundColor: 'color-mix(in srgb, var(--primary) 14%, transparent)',
          border: '1px solid color-mix(in srgb, var(--primary) 28%, transparent)',
        }}
      >
        <RotateCcw size={16} style={{ color: 'var(--primary)' }} />
      </span>

      <div className="flex-1 min-w-[180px]">
        <div className="text-sm font-semibold leading-tight truncate" style={{ color: 'var(--text)' }} title={confirmation.title}>
          {confirmation.title}
        </div>
        <div className="text-xs leading-snug mt-0.5" style={{ color: 'var(--text-muted)' }}>
          Interrompue pendant l'exécution ({statusText}). Voulez-vous la reprendre ?
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onReactivate}
          disabled={disabled}
          className="ee-btn ee-focus"
          style={{ color: 'var(--color-success)', backgroundColor: 'color-mix(in srgb, var(--color-success) 12%, transparent)' }}
          title="Reprendre la mission là où elle s'est arrêtée"
        >
          {deciding === 'reactivate' ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
          Reprendre
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={disabled}
          className="ee-btn ee-focus"
          style={{ color: 'var(--color-error)', backgroundColor: 'color-mix(in srgb, var(--color-error) 12%, transparent)' }}
          title="Supprimer définitivement la mission"
        >
          {deciding === 'delete' ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
          Supprimer
        </button>
      </div>
    </motion.li>
  );
});

const InterruptedMissionsSection = React.memo(function InterruptedMissionsSection({
  reduceMotion = false,
}: { reduceMotion?: boolean }) {
  const confirmations = useResumeConfirmations();
  const [pending, setPending] = useState<{ id: string; decision: 'reactivate' | 'delete' } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Sondage : rapide au début (cartes affichées sans attendre le WebSocket),
  // puis lent. Suspendu quand l'onglet est caché.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let attempts = 0;

    const schedule = () => {
      if (cancelled) return;
      attempts += 1;
      timer = setTimeout(poll, attempts < 10 ? 1_500 : 15_000);
    };

    const poll = () => {
      if (document.hidden) { schedule(); return; }
      fetch('/api/missions/pending-resumes')
        .then(res => (res.ok ? res.json() : { pending: [] }))
        .then((data: { pending?: Array<Omit<ResumeConfirmationInfo, 'receivedAt'>> }) => {
          if (!cancelled && Array.isArray(data.pending) && data.pending.length > 0) {
            seedResumeConfirmations(data.pending);
          }
        })
        .catch(() => { /* système de missions indisponible : normal */ })
        .finally(schedule);
    };

    poll();
    return () => { cancelled = true; clearTimeout(timer); };
  }, []);

  const decide = useCallback(async (id: string, decision: 'reactivate' | 'delete') => {
    setPending({ id, decision });
    setError(null);
    try {
      const res = await fetch(`/api/missions/${id}/resume-decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      });
      if (res.ok || res.status === 404) clearResumeConfirmation(id);
      else setError('Le serveur a refusé la demande. Réessayez dans un instant.');
    } catch (err) {
      console.error('[EmptyEditorState] Échec de décision de reprise:', err);
      setError('Impossible de joindre le serveur. Vérifiez la connexion et réessayez.');
    } finally {
      setPending(null);
    }
  }, []);

  if (confirmations.length === 0) return null;
  const plural = confirmations.length > 1;

  return (
    <section className="mb-6" aria-label="Missions interrompues">
      <div className="flex items-center gap-2 mb-2">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>
          {plural ? 'Missions interrompues' : 'Mission interrompue'}
        </h2>
        <span
          className="inline-flex items-center justify-center h-[18px] min-w-[18px] px-1.5 rounded-full text-xs font-semibold"
          style={{ backgroundColor: 'color-mix(in srgb, var(--primary) 18%, transparent)', color: 'var(--primary)' }}
        >
          {confirmations.length}
        </span>
      </div>
      <ul className="flex flex-col gap-2 p-0 m-0">
        <AnimatePresence initial={false}>
          {confirmations.map(c => (
            <InterruptedMissionCard
              key={c.missionId}
              confirmation={c}
              deciding={pending?.id === c.missionId ? pending.decision : null}
              disabled={pending?.id === c.missionId}
              reduceMotion={reduceMotion}
              onReactivate={() => decide(c.missionId, 'reactivate')}
              onDelete={() => decide(c.missionId, 'delete')}
            />
          ))}
        </AnimatePresence>
      </ul>
      {error && (
        <p role="alert" className="text-xs mt-2" style={{ color: 'var(--color-error)' }}>{error}</p>
      )}
    </section>
  );
});

// ─── Fichiers récents ────────────────────────────────────────────────────

function basename(p: string): string {
  return p.split(/[/\\]/).pop() || p;
}

function dirname(p: string): string {
  const parts = p.split(/[/\\]/);
  parts.pop();
  return parts.join('/');
}

const RecentFilesSection = React.memo(function RecentFilesSection({
  onOpenFile, reduceMotion = false,
}: { onOpenFile: (path: string) => void; reduceMotion?: boolean }) {
  const { files, remove, clear } = useRecentFiles();
  const visible = useMemo(() => files.slice(0, 6), [files]);

  if (visible.length === 0) return null;

  return (
    <section className="mb-6" aria-label="Fichiers récents">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
            Récents
          </h2>
          <span
            className="inline-flex items-center justify-center h-[16px] min-w-[16px] px-1 rounded-full text-[10px] font-semibold"
            style={{ backgroundColor: 'color-mix(in srgb, var(--primary) 18%, transparent)', color: 'var(--primary)' }}
          >
            {files.length}
          </span>
        </div>
        <button type="button" onClick={clear} className="ee-link ee-focus text-xs">
          Tout effacer
        </button>
      </div>
      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5 p-0 m-0 list-none">
        <AnimatePresence initial={false}>
          {visible.map((f) => {
            const name = basename(f.path);
            const dir = dirname(f.path);
            return (
              <motion.li
                key={f.path}
                layout={!reduceMotion}
                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0, marginTop: 0 }}
                transition={{ duration: reduceMotion ? 0.15 : 0.2 }}
                className="ee-recent group relative"
              >
                <button
                  type="button"
                  onClick={() => onOpenFile(f.path)}
                  className="ee-card ee-focus flex items-center gap-2 w-full py-1.5 px-2.5 text-left rounded-lg"
                  style={{ ['--card-accent' as string]: 'var(--primary)' }}
                  title={f.path}
                >
                  <span className="flex items-center justify-center flex-shrink-0">
                    <FileIcon filePath={f.path} size={14} />
                  </span>
                  <span className="text-[13px] font-medium leading-tight truncate" style={{ color: 'var(--text)' }}>
                    {name}
                  </span>
                  {dir && (
                    <span className="hidden lg:block text-[11px] leading-tight truncate ml-auto font-mono" style={{ color: 'var(--text-muted)' }}>
                      {dir}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => remove(f.path)}
                  aria-label={`Retirer ${name} des récents`}
                  className="ee-recent-remove ee-focus absolute top-1/2 right-1.5 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <X size={12} />
                </button>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
    </section>
  );
});

// ─── Composant principal ─────────────────────────────────────────────────

interface EmptyEditorStateProps {
  onOpenFile: (path: string) => void;
  onCreateFile: () => void;
  /** Réservé : conservé dans le contrat pour l'appelant, non utilisé par cet écran. */
  onCreateFolder: () => void;
  onShowSettings: (section?: string) => void;
  onOpenSearch?: () => void;
  onOpenChat?: () => void;
  onOpenNotebooks?: () => void;
}

export const EmptyEditorState = React.memo(function EmptyEditorState({
  onOpenFile,
  onCreateFile,
  onShowSettings,
  onOpenSearch,
  onOpenChat,
  onOpenNotebooks,
}: EmptyEditorStateProps) {
  const ws = useWorkspaceState();
  const { connected, isBusy, connect, clearTranscript, clearActivity } = useLiveAPIContext();
  const { profile } = useProfile();
  const reduceMotion = !!useReducedMotion();

  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showSystem, setShowSystem] = useState(false);

  const geminiStatus = useGeminiStatus();
  const gitInfo = useGitInfo();
  useFocusTrap(showShortcuts || showSystem);

  const aiName = profile.aiName || 'Leanna';
  const userName = profile.userName || 'Utilisateur';

  const { greeting, dateLabel } = useMemo(() => {
    const now = new Date();
    const hour = now.getHours();
    const g = hour < 5 ? 'Bonne nuit' : hour < 12 ? 'Bonjour' : hour < 18 ? 'Bon après-midi' : 'Bonsoir';
    const d = now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    return { greeting: g, dateLabel: d.charAt(0).toUpperCase() + d.slice(1) };
  }, []);

  // Une seule séquence d'entrée orchestrée (délais courts) plutôt que
  // des effets sur chaque bloc.
  const enter = useCallback((delay = 0) => (reduceMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.15, delay } }
    : { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: { ...SPRING, delay } }),
  [reduceMotion]);

  const handleConnect = useCallback(() => {
    if (!connected) {
      clearTranscript();
      clearActivity();
      connect([], 'full');
    }
    onOpenChat?.();
  }, [connected, connect, onOpenChat, clearTranscript, clearActivity]);

  const handleOpenAgents = useCallback(() => {
    window.dispatchEvent(new CustomEvent('Leanna-toggle-agents-panel'));
  }, []);

  const handleOpenMissions = useCallback(() => {
    window.dispatchEvent(new CustomEvent('Leanna-toggle-missions'));
  }, []);

  const handleOpenBrowser = useCallback(() => {
    window.dispatchEvent(new CustomEvent('Leanna-action', { detail: { type: 'open-browser' } }));
  }, []);

  // Raccourcis : ⌘/Ctrl+N, +L, +, ainsi que « ? » pour l'aide
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = !!target && (
        target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
      );

      if (!e.metaKey && !e.ctrlKey) {
        if (e.key === '?' && !typing && !showSystem) {
          e.preventDefault();
          setShowShortcuts(v => !v);
        }
        if (e.key === 'Escape') { setShowShortcuts(false); setShowSystem(false); }
        return;
      }
      const key = e.key.toLowerCase();
      if (key === 'n' && !e.shiftKey) { e.preventDefault(); onCreateFile(); }
      else if (key === ',') { e.preventDefault(); onShowSettings(); }
      else if (key === 'l') { e.preventDefault(); handleConnect(); }
      else if (key === 'p') { e.preventDefault(); onOpenSearch?.(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onCreateFile, onShowSettings, handleConnect, onOpenSearch, showSystem]);

  const statusLabel = connected ? 'Prête' : isBusy ? 'Connexion…' : 'En attente';
  const workspaceName = ws.workspace ? ws.workspace.path.split(/[/\\]/).pop() : null;
  const changedFiles = Array.isArray(gitInfo?.files) ? gitInfo!.files.length : null;

  const geminiProblem = geminiStatus === 'invalid' || geminiStatus === 'unconfigured';

  return (
    <div className="flex flex-1 flex-col overflow-y-auto relative" style={{ backgroundColor: 'var(--bg)' }}>
      <GlobalStyles />

      {/* Fond statique : halo primaire en haut */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse 80% 55% at 50% -5%, var(--primary) 0%, transparent 55%)', opacity: 0.16 }}
      />
      {/* Second halo asymétrique en bas-droite, accent froid */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 60% 50% at 105% 105%, #60a5fa 0%, transparent 55%)',
          opacity: 0.14,
        }}
      />
      {/* Grain subtil pour casser l'aspect plat des dégradés */}
      <div className="ee-grain absolute inset-0 pointer-events-none" aria-hidden="true" />

      <div className="relative z-10 flex-1 flex flex-col items-center px-4 sm:px-6 py-10 sm:py-14">
        <main className="w-full max-w-[880px] my-auto">

          {/* ── En-tête ── */}
          <motion.header className="mb-8 flex flex-wrap items-end justify-between gap-x-6 gap-y-3" {...enter(0)}>
            <div>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                {dateLabel}
              </p>
              <h1
                className="text-3xl sm:text-5xl font-semibold tracking-[-0.02em] leading-tight mt-1"
                style={{ color: 'var(--text)' }}
              >
                {greeting}, <span className="ee-name-accent">{userName}</span>
              </h1>
              <p className="text-base sm:text-lg mt-2" style={{ color: 'var(--text-secondary)' }}>
                Que souhaitez-vous faire aujourd'hui ?
              </p>
            </div>

            <div className="ee-chip" role="status" aria-live="polite">
              <span
                className={`w-1.5 h-1.5 rounded-full flex-shrink-0${connected ? ' ee-dot-live' : ''}`}
                style={{
                  backgroundColor: connected ? 'var(--color-success, var(--primary))' : 'var(--text-muted)',
                  boxShadow: connected ? '0 0 6px var(--color-success, var(--primary))' : undefined,
                }}
              />
              <span style={{ color: 'var(--text-secondary)' }}>{aiName}</span>
              <span>{statusLabel}</span>
            </div>
          </motion.header>

          {/* ── Alerte clé Gemini (visible seulement si nécessaire) ── */}
          <AnimatePresence initial={false}>
            {geminiProblem && (
              <motion.div
                role="alert"
                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
                animate={reduceMotion ? { opacity: 1 } : { opacity: 1, height: 'auto' }}
                exit={{ opacity: 0 }}
                className="mb-4 overflow-hidden"
              >
                <div
                  className="flex flex-wrap items-center gap-3 px-4 py-3 rounded-xl text-sm"
                  style={{
                    color: 'var(--text-secondary)',
                    backgroundColor: `color-mix(in srgb, ${geminiStatus === 'invalid' ? 'var(--color-error)' : 'var(--primary)'} 10%, transparent)`,
                    border: `1px solid color-mix(in srgb, ${geminiStatus === 'invalid' ? 'var(--color-error)' : 'var(--primary)'} 30%, transparent)`,
                  }}
                >
                  {geminiStatus === 'invalid'
                    ? <AlertCircle size={16} style={{ color: 'var(--color-error)' }} />
                    : <KeyRound size={16} style={{ color: 'var(--primary)' }} />}
                  <span className="flex-1 min-w-[200px]">
                    {geminiStatus === 'invalid'
                      ? 'La clé API Gemini est invalide. Remplacez-la pour utiliser l\'assistant.'
                      : 'Aucune clé API Gemini n\'est configurée. Ajoutez-en une pour utiliser l\'assistant.'}
                  </span>
                  <button
                    type="button"
                    onClick={() => onShowSettings('tokens-settings')}
                    className="ee-btn ee-focus"
                    style={{ color: 'var(--text)', backgroundColor: 'color-mix(in srgb, var(--surface-soft) 70%, transparent)' }}
                  >
                    {geminiStatus === 'invalid' ? 'Corriger la clé' : 'Ajouter une clé'}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Missions interrompues ── */}
          <InterruptedMissionsSection reduceMotion={reduceMotion} />

          {/* ── Actions rapides ── */}
          <motion.section
            aria-label="Actions rapides"
            className="flex flex-col gap-3"
            {...enter(0.12)}
          >
            <ActionCard
              icon={Sparkles}
              title={connected ? `Reprendre avec ${aiName}` : `Démarrer ${aiName}`}
              description={connected
                ? 'Session en cours : revenez à la conversation.'
                : 'Parlez, écrivez ou confiez une tâche à votre assistant.'}
              shortcut={`${MOD}+L`}
              onClick={handleConnect}
              reduceMotion={reduceMotion}
              accent="var(--primary)"
              primary
              hero
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <ActionCard
                icon={Bot} title="Agents" description="Flotte et activité"
                onClick={handleOpenAgents} reduceMotion={reduceMotion}
                accent="#60a5fa"
              />
              <ActionCard
                icon={Target} title="Missions" description="Suivi et reprises"
                onClick={handleOpenMissions} reduceMotion={reduceMotion}
                accent="#f472b6"
              />
              <ActionCard
                icon={BookOpen} title="Notebooks" description="Sources et résumés"
                onClick={onOpenNotebooks} disabled={!onOpenNotebooks} reduceMotion={reduceMotion}
                accent="#6ee7b7" comingSoon={!onOpenNotebooks}
              />
              <ActionCard
                icon={Globe} title="Navigateur" description="Navigateur intégré"
                onClick={handleOpenBrowser} reduceMotion={reduceMotion}
                accent="#a78bfa"
              />
            </div>
          </motion.section>

          {/* ── Fichiers récents ── */}
          <motion.div {...enter(0.18)} className="mt-6">
            <RecentFilesSection onOpenFile={onOpenFile} reduceMotion={reduceMotion} />
          </motion.div>

          {/* ── Pied de page ── */}
          <motion.footer
            className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 mt-10 pt-5 border-t"
            style={{ borderColor: 'color-mix(in srgb, var(--border) 50%, transparent)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.25, duration: reduceMotion ? 0.15 : 0.4 }}
          >
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm" style={{ color: 'var(--text-muted)' }}>
              {workspaceName ? (
                <span className="inline-flex items-center gap-1.5 font-mono" title={ws.workspace?.path}>
                  <FolderOpen size={13} />
                  {workspaceName}
                </span>
              ) : (
                <span>Aucun espace de travail ouvert</span>
              )}
              {gitInfo?.branch && (
                <span
                  className="inline-flex items-center gap-1.5 font-mono"
                  title={changedFiles ? `${changedFiles} fichier(s) modifié(s)` : 'Aucune modification'}
                >
                  <GitBranch size={13} />
                  {gitInfo.branch}
                  {changedFiles ? (
                    <span style={{ color: 'var(--primary)' }}>+{changedFiles}</span>
                  ) : null}
                </span>
              )}
            </div>

            <nav className="flex items-center gap-1" aria-label="Aide et système">
              <button type="button" onClick={() => setShowShortcuts(true)} className="ee-link ee-focus">
                Raccourcis <Kbd className="ml-1">?</Kbd>
              </button>
              <button type="button" onClick={() => setShowSystem(true)} className="ee-link ee-focus">
                Système
              </button>
            </nav>
          </motion.footer>
        </main>
      </div>

      <AnimatePresence>
        {showShortcuts && <ShortcutsModal onClose={() => setShowShortcuts(false)} />}
        {showSystem && (
          <SystemModal
            onClose={() => setShowSystem(false)}
            connected={connected}
            profile={profile}
            gitInfo={gitInfo}
            workspace={ws.workspace}
          />
        )}
      </AnimatePresence>
    </div>
  );
});