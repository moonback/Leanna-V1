import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ShieldAlert, Check, X, FileText } from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════════
// InlineApproval — approbation d'édition critique, en carte INLINE dans le chat.
//
// Remplace la modale bloquante CriticalEditConfirm : la demande s'affiche dans le
// flux du chat (non bloquante), avec Accepter / Refuser / Voir le fichier et un
// compte à rebours. Écoute le même event WebSocket 'Leanna-confirm-critical-edit'
// et répond via le même contrat sendMessage({type:'confirm-response',...}).
//
// Note : le payload backend ne contient pas (encore) le diff — on affiche donc
// l'opération, le fichier et la raison, et « Voir le fichier » ouvre le fichier
// dans l'éditeur. Le jour où le backend enverra un diff, il pourra être rendu ici.
// ═══════════════════════════════════════════════════════════════════════════════

interface ConfirmRequest {
  requestId: string;
  filePath: string;
  operation: 'write' | 'modify' | 'patch' | 'delete' | 'rename';
  reason?: string;
  timeoutMs: number;
}

const OPERATION_LABELS: Record<string, string> = {
  write: 'Écriture',
  modify: 'Modification',
  patch: 'Patch',
  delete: 'Suppression',
  rename: 'Renommage',
};

interface InlineApprovalProps {
  sendMessage: (data: unknown) => void;
}

export function InlineApproval({ sendMessage }: InlineApprovalProps) {
  const [pending, setPending] = useState<ConfirmRequest | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);

  useEffect(() => {
    function handleConfirmEvent(e: CustomEvent<ConfirmRequest>) {
      setPending(e.detail);
      setTimeLeft(Math.ceil(e.detail.timeoutMs / 1000));
    }
    window.addEventListener('Leanna-confirm-critical-edit', handleConfirmEvent as EventListener);
    // Signale que l'approbation inline est active : la modale globale
    // (CriticalEditConfirm) s'efface pour éviter une double demande.
    (window as unknown as { __leannaInlineApprovalActive?: boolean }).__leannaInlineApprovalActive = true;
    return () => {
      window.removeEventListener('Leanna-confirm-critical-edit', handleConfirmEvent as EventListener);
      (window as unknown as { __leannaInlineApprovalActive?: boolean }).__leannaInlineApprovalActive = false;
    };
  }, []);

  const respond = useCallback((approved: boolean) => {
    if (!pending) return;
    sendMessage({ type: 'confirm-response', requestId: pending.requestId, approved });
    setPending(null);
  }, [pending, sendMessage]);

  // Compte à rebours — refus automatique au timeout.
  useEffect(() => {
    if (!pending || timeLeft <= 0) return;
    const interval = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) { respond(false); return 0; }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [pending, timeLeft, respond]);

  const viewFile = useCallback(() => {
    if (!pending) return;
    // Ouvre le fichier dans l'éditeur sans fermer la demande d'approbation.
    // 'Leanna-action' {type:'open-file'} est géré dans main.tsx (navigue
    // vers l'IDE puis relaie 'Leanna-open-file').
    window.dispatchEvent(new CustomEvent('Leanna-action', { detail: { type: 'open-file', path: pending.filePath } }));
  }, [pending]);

  const totalSeconds = pending ? Math.ceil(pending.timeoutMs / 1000) : 1;
  const progressPct = Math.round((timeLeft / totalSeconds) * 100);
  const urgent = timeLeft <= 10;

  return (
    <AnimatePresence>
      {pending && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          className="rounded-2xl overflow-hidden"
          style={{
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--color-warning-subtle)',
          }}
          role="alertdialog"
          aria-label="Demande d'édition critique"
        >
          {/* En-tête */}
          <div className="flex items-center gap-2.5 px-3 py-2.5" style={{ borderBottom: '1px solid var(--border-base)' }}>
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: 'var(--color-warning-subtle)' }}
            >
              <ShieldAlert size={14} style={{ color: 'var(--color-warning)' }} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                Édition d'un fichier protégé
              </p>
              <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                {OPERATION_LABELS[pending.operation] || pending.operation} · <span className="font-mono">{pending.filePath}</span>
              </p>
            </div>
            <span
              className="text-xs font-mono tabular-nums px-1.5 py-0.5 rounded flex-shrink-0"
              style={{
                color: urgent ? 'var(--color-error)' : 'var(--text-muted)',
                backgroundColor: 'var(--bg-input)',
              }}
            >
              {timeLeft}s
            </span>
          </div>

          {pending.reason && (
            <p className="px-3 py-2 text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              {pending.reason}
            </p>
          )}

          {/* Compte à rebours */}
          <div className="h-0.5 w-full" style={{ backgroundColor: 'var(--bg-input)' }}>
            <div
              className="h-full transition-[width] duration-1000 ease-linear"
              style={{ width: `${progressPct}%`, backgroundColor: urgent ? 'var(--color-error)' : 'var(--accent-primary)' }}
            />
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1.5 px-3 py-2.5">
            <button
              type="button"
              onClick={() => respond(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-opacity hover:opacity-90"
              style={{ backgroundColor: 'var(--color-warning)', color: 'var(--bg-base)' }}
            >
              <Check size={13} /> Accepter
            </button>
            <button
              type="button"
              onClick={() => respond(false)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-[var(--bg-hover)]"
              style={{ border: '1px solid var(--border-base)', color: 'var(--text-secondary)' }}
            >
              <X size={13} /> Refuser
            </button>
            <button
              type="button"
              onClick={viewFile}
              className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-[var(--bg-hover)]"
              style={{ color: 'var(--accent-primary)' }}
            >
              <FileText size={13} /> Voir le fichier
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
