/**
 * AudioPlayer — colonne droite de l'Audio Overview (mode plein écran) :
 * en-tête + barre d'actions, lecteur TTS (progression), contrôles hors lecture,
 * et rendu du script sous forme de bulles de conversation (Alex / Sam).
 *
 * Composant présentationnel : l'état de lecture provient du hook useTtsPlayer
 * (via le parent) et les actions réseau sont des callbacks du parent.
 */

import { motion } from 'motion/react';
import {
  Loader2, Clock, Users, Square, Trash2, RefreshCw, Volume2, FileText,
} from 'lucide-react';
import type { AudioOverview } from './types.js';

interface Props {
  selectedOverview: AudioOverview;

  // État de lecture (useTtsPlayer)
  playing: boolean;
  ttsLoading: boolean;
  currentLineIndex: number;
  ttsProgress: number;
  ttsTotalLines: number;
  playbackSpeed: number;
  onPlay: () => void;
  onStop: () => void;
  onCycleSpeed: () => void;

  // Actions (parent)
  generating: boolean;
  downloading: boolean;
  onRegenerate: () => void;
  onDelete: (overviewId: string) => void;
  onSaveToSandbox: () => void;
  onDownloadScript: () => void;
  formatDuration: (seconds: number) => string;
}

export function AudioPlayer({
  selectedOverview,
  playing,
  ttsLoading,
  currentLineIndex,
  ttsProgress,
  ttsTotalLines,
  playbackSpeed,
  onPlay,
  onStop,
  onCycleSpeed,
  generating,
  downloading,
  onRegenerate,
  onDelete,
  onSaveToSandbox,
  onDownloadScript,
  formatDuration,
}: Props) {
  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar p-5 lg:p-7" style={{ borderColor: 'var(--notebook-border)' }}>
      <div className="space-y-5 max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 pb-4 border-b" style={{ borderColor: 'var(--border-base)' }}>
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center"
            style={{ backgroundColor: 'var(--accent-subtle)' }}
          >
            <Users className="w-5 h-5" style={{ color: 'var(--accent-primary)' }} />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
              {selectedOverview.title}
            </h2>
            <p className="text-xs flex items-center gap-2" style={{ color: 'var(--text-dimmed)' }}>
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {formatDuration(selectedOverview.estimatedDuration)}
              </span>
              <span>•</span>
              <span>{new Date(selectedOverview.createdAt).toLocaleDateString('fr-FR')}</span>
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            {/* Play TTS */}
            {playing ? (
              <button
                onClick={onStop}
                className="flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-semibold transition-all active:scale-95"
                style={{
                  backgroundColor: 'rgba(239, 68, 68, 0.1)',
                  color: 'var(--color-error)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                }}
                title="Arrêter la lecture"
              >
                <Square className="w-3.5 h-3.5" />
                Stop
              </button>
            ) : (
              <button
                onClick={onPlay}
                disabled={ttsLoading}
                className="flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-semibold transition-all hover:shadow-sm active:scale-95 disabled:opacity-50"
                style={{
                  backgroundColor: 'var(--color-success)20',
                  color: 'var(--color-success)',
                  border: '1px solid var(--color-success)40',
                }}
                title="Écouter le podcast (TTS)"
              >
                {ttsLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Volume2 className="w-3.5 h-3.5" />
                )}
                Écouter
              </button>
            )}
            {/* Save to Sandbox */}
            <button
              onClick={onSaveToSandbox}
              disabled={downloading}
              className="flex items-center gap-1.5 px-2.5 py-2 rounded-full text-xs font-semibold transition-all hover:shadow-sm active:scale-95 disabled:opacity-50"
              style={{
                backgroundColor: 'var(--color-warning)10',
                color: 'var(--color-warning)',
                border: '1px solid var(--color-warning)40',
              }}
              title="Enregistrer dans la sandbox"
            >
              {downloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
            </button>
            {/* Regenerate */}
            <button
              onClick={onRegenerate}
              disabled={generating}
              className="flex items-center gap-1.5 px-2.5 py-2 rounded-full text-xs font-semibold transition-all hover:shadow-sm active:scale-95 disabled:opacity-50"
              style={{
                backgroundColor: 'var(--bg-base)',
                color: 'var(--text-muted)',
                border: '1px solid var(--border-base)',
              }}
              title="Régénérer"
            >
              {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            </button>
            {/* Delete */}
            <button
              onClick={() => onDelete(selectedOverview.id)}
              className="flex items-center gap-1.5 px-2.5 py-2 rounded-full text-xs font-semibold transition-all hover:shadow-sm active:scale-95"
              style={{
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                color: 'var(--color-error)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
              }}
              title="Supprimer"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* TTS Progress bar — Enhanced player */}
        {playing && ttsTotalLines > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col gap-2 px-4 py-3 rounded-xl"
            style={{ backgroundColor: 'var(--color-success)08', border: '1px solid var(--color-success)25' }}
          >
            {/* Top row: waveform + progress */}
            <div className="flex items-center gap-3">
              {/* Mini waveform animation */}
              <div className="flex items-center gap-[2px] h-5 flex-shrink-0">
                {[0, 1, 2, 3, 4].map((i) => (
                  <motion.div
                    key={i}
                    className="w-[3px] rounded-full"
                    style={{ backgroundColor: 'var(--color-success)' }}
                    animate={{ height: ['8px', '16px', '10px', '18px', '8px'] }}
                    transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.15, ease: 'easeInOut' }}
                  />
                ))}
              </div>

              {/* Progress bar */}
              <div className="flex-1">
                <div className="w-full h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-base)' }}>
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: 'linear-gradient(90deg, var(--color-success), var(--color-success))' }}
                    animate={{ width: `${(ttsProgress / ttsTotalLines) * 100}%` }}
                    transition={{ duration: 0.3, ease: 'easeOut' }}
                  />
                </div>
              </div>

              {/* Progress count */}
              <span className="text-xs font-semibold flex-shrink-0 tabular-nums" style={{ color: 'var(--color-success)' }}>
                {ttsProgress}/{ttsTotalLines}
              </span>
            </div>

            {/* Bottom row: controls */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {/* Stop button */}
                <button
                  onClick={onStop}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-semibold transition-all active:scale-95"
                  style={{
                    backgroundColor: 'rgba(239, 68, 68, 0.08)',
                    color: 'var(--color-error)',
                    border: '1px solid rgba(239, 68, 68, 0.2)',
                  }}
                >
                  <Square className="w-3 h-3" />
                  Arrêter
                </button>

                {/* Speed button */}
                <button
                  onClick={onCycleSpeed}
                  className="px-2.5 py-1.5 rounded-full text-xs font-bold transition-all hover:bg-[var(--bg-hover)] active:scale-95"
                  style={{ color: 'var(--color-success)', border: '1px solid var(--color-success)30' }}
                  title="Changer la vitesse"
                >
                  {playbackSpeed}×
                </button>
              </div>

              {/* Estimated remaining */}
              <span className="text-xs font-medium" style={{ color: 'var(--text-dimmed)' }}>
                {ttsTotalLines - ttsProgress > 0
                  ? `~${Math.ceil((ttsTotalLines - ttsProgress) * 3)}s restants`
                  : 'Terminé'}
              </span>
            </div>
          </motion.div>
        )}

        {/* Controls bar (when not playing) */}
        {!playing && (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={onCycleSpeed}
              className="flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium border transition-all hover:bg-[var(--bg-hover)] active:scale-95"
              style={{ borderColor: 'var(--border-base)', color: 'var(--text-muted)' }}
              title="Vitesse de lecture"
            >
              ⚡ {playbackSpeed}×
            </button>
            <button
              onClick={onDownloadScript}
              className="flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium border transition-all hover:bg-[var(--bg-hover)] active:scale-95"
              style={{ borderColor: 'var(--border-base)', color: 'var(--text-muted)' }}
              title="Télécharger le script"
            >
              📥 Script .md
            </button>
            <span className="text-xs ml-auto font-medium" style={{ color: 'var(--text-dimmed)' }}>
              ~{Math.ceil(selectedOverview.script.split('\n').filter((l: string) => l.trim()).length * 3 / playbackSpeed)}s à {playbackSpeed}×
            </span>
          </div>
        )}

        {/* Script as chat bubbles */}
        <div className="space-y-4">
          {selectedOverview.script.split('\n').map((line, i) => {
            const isAlex = line.trim().startsWith('Alex:') || line.trim().startsWith('Alex :');
            const isSam = line.trim().startsWith('Sam:') || line.trim().startsWith('Sam :');

            if (isAlex || isSam) {
              const speaker = isAlex ? 'Alex' : 'Sam';
              const text = line.replace(/^(Alex|Sam)\s*:\s*/i, '');
              const isCurrentLine = playing && currentLineIndex === i;
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.02 }}
                  className={`flex gap-3 ${isSam ? 'flex-row-reverse' : ''}`}
                >
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 shadow-sm ${isCurrentLine ? 'animate-pulse' : ''}`}
                    style={{
                      backgroundColor: isAlex ? 'var(--accent-primary)20' : 'var(--color-success)20',
                      color: isAlex ? 'var(--accent-primary)' : 'var(--color-success)',
                      border: `1.5px solid ${isCurrentLine ? (isAlex ? 'var(--accent-primary)' : 'var(--color-success)') : (isAlex ? 'var(--accent-primary)40' : 'var(--color-success)40')}`,
                    }}
                  >
                    {speaker[0]}
                  </div>
                  <div className="max-w-[80%]">
                    <p className="text-xs font-semibold mb-1 px-1" style={{ color: isAlex ? 'var(--accent-primary)' : 'var(--color-success)' }}>
                      {speaker}
                    </p>
                    <div
                      className={`p-3.5 rounded-2xl text-xs leading-relaxed ${isAlex ? 'rounded-tl-md' : 'rounded-tr-md'} transition-all`}
                      style={{
                        backgroundColor: isCurrentLine ? (isAlex ? 'var(--accent-primary)10' : 'var(--color-success)10') : 'var(--bg-panel)',
                        border: `1px solid ${isCurrentLine ? (isAlex ? 'var(--accent-primary)40' : 'var(--color-success)40') : 'var(--border-base)'}`,
                        color: 'var(--text-primary)',
                      }}
                    >
                      {text}
                    </div>
                  </div>
                </motion.div>
              );
            }

            if (!line.trim()) return null;
            return (
              <p key={i} className="text-xs italic text-center py-2 px-4 rounded-lg"
                style={{ color: 'var(--text-dimmed)', backgroundColor: 'var(--bg-base)' }}>
                {line}
              </p>
            );
          })}
        </div>
      </div>
    </div>
  );
}
