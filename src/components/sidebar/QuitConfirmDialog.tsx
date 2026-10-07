/**
 * QuitConfirmDialog — Modale de confirmation pour quitter l'application Electron.
 *
 * Alignée sur le langage visuel des autres modales du projet
 * (CriticalEditConfirm, TelegramStatusModal, etc.) :
 *   - <Modal.Header> avec tuile icône statique (10×10, rounded-xl) + titre/sous-titre
 *   - Carte de détail interne rounded-xl sur --bg-secondary / --border-base
 *   - Bandeau d'alerte « badge-* » comme dans TelegramStatusModal
 *   - Icônes lucide-react, échelle typographique standard (text-xs/text-sm)
 *   - Corps en space-y-4, composant <Button> pour les actions
 */

import { Power } from 'lucide-react';
import { Modal } from '../ui/Modal.js';
import { Button } from '../ui/Button.js';

interface QuitConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function QuitConfirmDialog({ open, onClose, onConfirm }: QuitConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      tone="info"
      layer="critical"
      aria-describedby="quit-desc"
    >
      <Modal.Header>
        <div className="flex items-center gap-3">
          {/* Tuile icône — même gabarit statique que CriticalEditConfirm */}
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: 'var(--color-info-subtle)' }}
          >
            <Power className="w-5 h-5" style={{ color: 'var(--color-info)' }} />
          </div>
          <div>
            <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
              Quitter Leanna
            </h3>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Arrêt de l'Intelligence Core
            </p>
          </div>
        </div>
      </Modal.Header>

      <Modal.Body>
        <div className="space-y-4">
          {/* Carte de détail — surface neutre, comme les autres modales */}
          <div
            className="rounded-xl p-4"
            style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-base)' }}
          >
            <p id="quit-desc" className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              Les modifications non enregistrées pourraient être perdues.{' '}
              <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                Confirmer l'arrêt du système ?
              </span>
            </p>
          </div>

          
        </div>
      </Modal.Body>

      <Modal.Footer>
        {/* Annuler reçoit le focus auto (premier focusable) */}
        <Button variant="secondary" size="sm" onClick={onClose}>
          Annuler
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={onConfirm}
          iconLeft={<Power className="w-3.5 h-3.5" />}
        >
          Quitter
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
