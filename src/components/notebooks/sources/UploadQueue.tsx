/**
 * UploadQueue — affichage de la file d'upload (barre de progression globale +
 * statut par fichier). Composant purement présentationnel.
 */

import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import type { UploadFileStatus } from './constants.js';
import type { SpringTransition } from '../motionTypes.js';

interface Props {
  uploadQueue: UploadFileStatus[];
  uploadDone: number;
  uploadErrors: number;
  spring: SpringTransition;
}

export function UploadQueue({ uploadQueue, uploadDone, uploadErrors, spring }: Props) {
  return (
    <AnimatePresence>
      {uploadQueue.length > 0 && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={spring}
          className="overflow-hidden"
        >
          <div
            className="p-4 rounded-xl border space-y-2"
            style={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--accent-primary)' }}
          >
            <div className="flex items-center gap-2">
              {uploadDone === uploadQueue.length ? (
                <CheckCircle2 className="w-3.5 h-3.5" style={{ color: 'var(--color-success)' }} />
              ) : (
                <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: 'var(--accent-primary)' }} />
              )}
              <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                Upload {uploadDone}/{uploadQueue.length}
                {uploadErrors > 0 && <span style={{ color: 'var(--color-error)' }}> · {uploadErrors} erreur{uploadErrors > 1 ? 's' : ''}</span>}
              </p>
            </div>
            {/* Progress bar */}
            <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-base)' }}>
              <motion.div
                className="h-full rounded-full"
                style={{ backgroundColor: 'var(--accent-primary)' }}
                initial={{ width: '0%' }}
                animate={{ width: `${(uploadDone / uploadQueue.length) * 100}%` }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
              />
            </div>
            <div className="space-y-1 max-h-32 overflow-y-auto custom-scrollbar">
              {uploadQueue.map((f, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  {f.status === 'pending' && <Loader2 className="w-3 h-3 opacity-30 flex-shrink-0" />}
                  {f.status === 'uploading' && <Loader2 className="w-3 h-3 animate-spin flex-shrink-0" style={{ color: 'var(--accent-primary)' }} />}
                  {f.status === 'success' && <CheckCircle2 className="w-3 h-3 flex-shrink-0" style={{ color: 'var(--color-success)' }} />}
                  {f.status === 'error' && <XCircle className="w-3 h-3 flex-shrink-0" style={{ color: 'var(--color-error)' }} />}
                  <span className="truncate flex-1" style={{ color: f.status === 'error' ? 'var(--color-error)' : 'var(--text-primary)' }}>
                    {f.name}
                  </span>
                  {f.error && <span className="text-xs opacity-60 truncate max-w-[150px]" title={f.error}>{f.error}</span>}
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
