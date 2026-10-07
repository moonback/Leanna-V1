/**
 * GenerationProgress — barre de progression des générations actives + file
 * d'attente repliable. Composant présentationnel.
 */

import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Loader2, CheckCircle2, X, RefreshCw } from 'lucide-react';
import type { SpringTransition } from '../motionTypes.js';
import { DOC_TYPES, REPORT_TYPES, getDocTypeColor, getDocTypeLabel } from './constants.js';
import type { QueuedGeneration } from './types.js';

interface Props {
  activeGenerationIds: Set<string>;
  generationQueue: QueuedGeneration[];
  generationProgresses: Record<string, number>;
  showQueue: boolean;
  setShowQueue: (v: boolean) => void;
  onRetryTask: (taskId: string) => void;
  onCancelTask: (taskId: string) => void;
  modalSpring: SpringTransition;
}

export function GenerationProgress({
  activeGenerationIds,
  generationQueue,
  generationProgresses,
  showQueue,
  setShowQueue,
  onRetryTask,
  onCancelTask,
  modalSpring,
}: Props) {
  return (
    <div
      className="p-3 rounded-xl border"
      style={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--border-base)' }}
    >
      {/* Barre de progression pour la génération en cours */}
      {activeGenerationIds.size > 0 ? (
        <div className="notebooklm-prose max-w-none space-y-5">
          {[...activeGenerationIds].map(taskId => {
            const task = generationQueue.find(t => t.id === taskId);
            if (!task) return null;

            const color = getDocTypeColor(task.type);
            const docType = DOC_TYPES.find(t => t.key === task.type) || REPORT_TYPES.find(t => t.key === task.type);
            const Icon = docType?.icon || Sparkles;
            const progress = generationProgresses[taskId] || 0;

            return (
              <div key={taskId} className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
                     style={{ backgroundColor: `${color}15` }}>
                  <Icon className="w-3 h-3" style={{ color: color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                    {getDocTypeLabel(task.type)}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <div className="h-1.5 flex-1 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-base)' }}>
                      <motion.div
                        className="h-full rounded-full"
                        style={{ backgroundColor: color }}
                        initial={{ width: '0%' }}
                        animate={{ width: `${progress}%` }}
                        transition={{ duration: 0.3, ease: 'easeOut' }}
                      />
                    </div>
                    <span className="text-xs font-medium" style={{ color: color }}>
                      {progress}%
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
          <Sparkles className="w-3 h-3" />
          <span>Prêt à générer</span>
          {generationQueue.length > 0 && (
            <span className="ml-1">({generationQueue.filter(t => t.status === 'pending').length} en attente)</span>
          )}
        </div>
      )}

      {/* File d'attente */}
      {generationQueue.length > 0 && (
        <div className="mt-3 pt-3 border-t space-y-2" style={{ borderColor: 'var(--border-base)' }}>
          <button
            onClick={() => setShowQueue(!showQueue)}
            className="flex items-center justify-between w-full text-left"
          >
            <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-dimmed)' }}>
              File d'attente ({generationQueue.filter(t => t.status === 'pending').length})
            </span>
            <motion.span
              animate={{ rotate: showQueue ? 180 : 0 }}
              className="text-xs"
              style={{ color: 'var(--text-muted)' }}
            >
              ▼
            </motion.span>
          </button>

          <AnimatePresence>
            {showQueue && generationQueue.length > 0 && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={modalSpring}
                className="overflow-hidden space-y-1.5 pt-2"
              >
                {generationQueue.map((task, index) => {
                  const docType = DOC_TYPES.find(t => t.key === task.type) || REPORT_TYPES.find(t => t.key === task.type);
                  const Icon = docType?.icon || Sparkles;
                  const color = getDocTypeColor(task.type);

                  return (
                    <motion.div
                      key={task.id}
                      layout
                      className={`p-2 rounded-lg border transition-all ${
                        task.status === 'generating' ? 'ring-1' : ''
                      }`}
                      style={{
                        borderColor: 'var(--border-base)',
                        backgroundColor: task.status === 'generating' ? `${color}08` : 'var(--bg-base)',
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                             style={{ backgroundColor: `${color}15` }}>
                          {task.status === 'generating' ? (
                            <Loader2 className="w-2.5 h-2.5 animate-spin" style={{ color }} />
                          ) : task.status === 'completed' ? (
                            <CheckCircle2 className="w-2.5 h-2.5" style={{ color }} />
                          ) : task.status === 'error' ? (
                            <X className="w-2.5 h-2.5" style={{ color: 'var(--color-error)' }} />
                          ) : (
                            <Icon className="w-2.5 h-2.5" style={{ color }} />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                            {index === 0 && task.status === 'pending' ? 'Suivant:' : ''} {task.title}
                          </p>
                          <div className="flex items-center gap-1 mt-0.5">
                            <span className="text-xs" style={{ color: 'var(--text-dimmed)' }}>
                              Position: {index + 1}
                            </span>
                            {task.status === 'generating' && task.progress > 0 && (
                              <>
                                <span className="text-xs" style={{ color: 'var(--text-dimmed)' }}>
                                  •
                                </span>
                                <span className="text-xs font-medium" style={{ color: color }}>
                                  {task.progress}%
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                        {task.status === 'error' && (
                          <button
                            onClick={() => onRetryTask(task.id)}
                            className="p-1 rounded hover:bg-[var(--bg-hover)] transition-colors"
                            title="Réessayer"
                          >
                            <RefreshCw className="w-2.5 h-2.5" style={{ color: 'var(--color-warning)' }} />
                          </button>
                        )}
                        {index > 0 && task.status === 'pending' && (
                          <button
                            onClick={() => onCancelTask(task.id)}
                            className="p-1 rounded hover:bg-[var(--bg-hover)] transition-colors"
                            title="Annuler"
                          >
                            <X className="w-2.5 h-2.5" style={{ color: 'var(--color-error)' }} />
                          </button>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
