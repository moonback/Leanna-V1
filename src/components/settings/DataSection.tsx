import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trash2, Check } from 'lucide-react';
import { Section, Field } from './SettingsPrimitives.js';

// Scopes purgeables — doivent correspondre aux clés du backend (server/routes/data.ts).
const SCOPES: { id: string; label: string; hint: string }[] = [
  { id: 'conversations', label: 'Conversations', hint: 'Historique des discussions (+ messages)' },
  { id: 'memories', label: 'Mémoire long-terme', hint: 'Mémoires stockées' },
  { id: 'agents', label: 'Agents', hint: 'Tâches, orchestrations et messages d\'agents' },
  { id: 'missions', label: 'Missions', hint: 'Missions autonomes' },
  { id: 'workflows', label: 'Workflows', hint: 'Pipelines d\'actions' },
  { id: 'scheduled_tasks', label: 'Tâches planifiées', hint: 'Automatisations / cron' },
  { id: 'custom_skills', label: 'Skills personnalisés', hint: 'Skills définis par l\'utilisateur' },
  { id: 'autonomy_tasks', label: 'Tâches d\'autonomie', hint: 'File du moteur d\'autonomie' },
  { id: 'lists', label: 'Listes', hint: 'Listes utilisateur' },
];

export function DataSection() {
  const [clearing, setClearing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [result, setResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [clearingMemory, setClearingMemory] = useState(false);
  const [confirmMemory, setConfirmMemory] = useState(false);
  const [memoryResult, setMemoryResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Sélection de purge multi-scopes
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [clearingSel, setClearingSel] = useState(false);
  const [confirmSel, setConfirmSel] = useState(false);
  const [selResult, setSelResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const toggleScope = (id: string) => {
    setSelResult(null);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const allSelected = selected.size === SCOPES.length;
  const toggleAll = () => {
    setSelResult(null);
    setSelected(allSelected ? new Set() : new Set(SCOPES.map((s) => s.id)));
  };

  const handleClear = async () => {
    setClearing(true); setResult(null);
    try {
      const res = await fetch('/api/conversations/all', { method: 'DELETE' });
      const data = await res.json();
      if (data.status === 'success') setResult({ type: 'success', message: `${data.deleted} conversation(s) supprimée(s)` });
      else setResult({ type: 'error', message: data.error || 'Erreur inconnue' });
    } catch (e: any) { setResult({ type: 'error', message: e.message || 'Erreur réseau' }); }
    finally { setClearing(false); setConfirmOpen(false); }
  };

  const handleClearMemory = async () => {
    setClearingMemory(true); setMemoryResult(null);
    try {
      const res = await fetch('/api/memories/all', { method: 'DELETE' });
      const data = await res.json();
      if (data.status === 'success') setMemoryResult({ type: 'success', message: `${data.deleted} mémoire(s) supprimée(s)` });
      else setMemoryResult({ type: 'error', message: data.error || 'Erreur inconnue' });
    } catch (e: any) { setMemoryResult({ type: 'error', message: e.message || 'Erreur réseau' }); }
    finally { setClearingMemory(false); setConfirmMemory(false); }
  };

  const handleClearSelected = async () => {
    setClearingSel(true); setSelResult(null);
    try {
      const res = await fetch('/api/data/all', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scopes: Array.from(selected) }),
      });
      const data = await res.json();
      if (data.status === 'success') {
        setSelResult({ type: 'success', message: `${data.deleted} enregistrement(s) supprimé(s)` });
        setSelected(new Set());
      } else if (data.status === 'partial') {
        const failed = Object.keys(data.errors || {}).join(', ');
        setSelResult({ type: 'error', message: `Purge partielle · ${data.deleted} supprimé(s). Échecs : ${failed}` });
      } else {
        setSelResult({ type: 'error', message: data.error || 'Erreur inconnue' });
      }
    } catch (e: any) { setSelResult({ type: 'error', message: e.message || 'Erreur réseau' }); }
    finally { setClearingSel(false); setConfirmSel(false); }
  };

  return (
    <Section icon={Trash2} title="Gestion des données" description="Supprimez les données stockées dans Supabase (conversations, mémoire, agents, missions…)">
      <div className="flex flex-col gap-4">
        <Field label="Historique des conversations" hint="Supprime toutes les conversations de manière définitive.">
          {!confirmOpen ? (
            <motion.button type="button" onClick={() => setConfirmOpen(true)} whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
              className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-xs font-semibold transition-all duration-200"
              style={{ backgroundColor: 'color-mix(in srgb, var(--color-error) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--color-error) 30%, transparent)', color: 'var(--color-error)' }}>
              <Trash2 className="h-3.5 w-3.5" /> Vider l'historique des conversations
            </motion.button>
          ) : (
            <div className="rounded-xl p-4" style={{ backgroundColor: 'color-mix(in srgb, var(--color-error) 8%, var(--bg-secondary))', border: '1px solid color-mix(in srgb, var(--color-error) 25%, transparent)' }}>
              <p className="mb-3 text-xs font-medium" style={{ color: 'var(--color-error)' }}>⚠️ Toutes les conversations seront supprimées définitivement.</p>
              <div className="flex gap-2">
                <motion.button type="button" onClick={handleClear} disabled={clearing} whileTap={{ scale: 0.97 }}
                  className="flex-1 rounded-lg px-3 py-2 text-xs font-semibold text-white disabled:opacity-50" style={{ backgroundColor: 'var(--color-error)' }}>
                  {clearing ? 'Suppression…' : 'Confirmer'}
                </motion.button>
                <motion.button type="button" onClick={() => { setConfirmOpen(false); setResult(null); }} disabled={clearing} whileTap={{ scale: 0.97 }}
                  className="flex-1 rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-50"
                  style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-base)', color: 'var(--text-muted)' }}>
                  Annuler
                </motion.button>
              </div>
            </div>
          )}
        </Field>
        <AnimatePresence>
          {result && (
            <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
              className="rounded-lg px-3 py-2 text-xs font-medium"
              style={{ backgroundColor: result.type === 'success' ? 'color-mix(in srgb, var(--color-success) 10%, transparent)' : 'color-mix(in srgb, var(--color-error) 10%, transparent)', color: result.type === 'success' ? 'var(--color-success)' : 'var(--color-error)' }}>
              {result.type === 'success' ? '✓' : '✗'} {result.message}
            </motion.div>
          )}
        </AnimatePresence>

        <Field label="Mémoire long-terme" hint="Supprime toutes les mémoires stockées dans Supabase. Irréversible.">
          {!confirmMemory ? (
            <motion.button type="button" onClick={() => setConfirmMemory(true)} whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
              className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-xs font-semibold transition-all duration-200"
              style={{ backgroundColor: 'color-mix(in srgb, var(--color-warning) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--color-warning) 30%, transparent)', color: 'var(--color-warning)' }}>
              <Trash2 className="h-3.5 w-3.5" /> Vider la mémoire
            </motion.button>
          ) : (
            <div className="rounded-xl p-4" style={{ backgroundColor: 'color-mix(in srgb, var(--color-warning) 8%, var(--bg-secondary))', border: '1px solid color-mix(in srgb, var(--color-warning) 25%, transparent)' }}>
              <p className="mb-3 text-xs font-medium" style={{ color: 'var(--color-warning)' }}>⚠️ Toutes les mémoires seront supprimées définitivement.</p>
              <div className="flex gap-2">
                <motion.button type="button" onClick={handleClearMemory} disabled={clearingMemory} whileTap={{ scale: 0.97 }}
                  className="flex-1 rounded-lg px-3 py-2 text-xs font-semibold text-white disabled:opacity-50" style={{ backgroundColor: 'var(--color-warning)' }}>
                  {clearingMemory ? 'Suppression…' : 'Confirmer'}
                </motion.button>
                <motion.button type="button" onClick={() => { setConfirmMemory(false); setMemoryResult(null); }} disabled={clearingMemory} whileTap={{ scale: 0.97 }}
                  className="flex-1 rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-50"
                  style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-base)', color: 'var(--text-muted)' }}>
                  Annuler
                </motion.button>
              </div>
            </div>
          )}
        </Field>
        <AnimatePresence>
          {memoryResult && (
            <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
              className="rounded-lg px-3 py-2 text-xs font-medium"
              style={{ backgroundColor: memoryResult.type === 'success' ? 'color-mix(in srgb, var(--color-success) 10%, transparent)' : 'color-mix(in srgb, var(--color-error) 10%, transparent)', color: memoryResult.type === 'success' ? 'var(--color-success)' : 'var(--color-error)' }}>
              {memoryResult.type === 'success' ? '✓' : '✗'} {memoryResult.message}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="my-1 h-px w-full" style={{ backgroundColor: 'var(--border-base)' }} />

        <Field label="Effacement sélectif" hint="Cochez les données à effacer, puis confirmez. Chaque suppression est définitive.">
          <div className="flex flex-col gap-1.5">
            {/* Tout sélectionner */}
            <button type="button" onClick={toggleAll}
              className="mb-1 self-start text-xs font-semibold underline-offset-2 hover:underline"
              style={{ color: 'var(--text-muted)' }}>
              {allSelected ? 'Tout décocher' : 'Tout cocher'}
            </button>

            {SCOPES.map((scope) => {
              const checked = selected.has(scope.id);
              return (
                <button key={scope.id} type="button" onClick={() => toggleScope(scope.id)}
                  className="flex items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors duration-150"
                  style={{
                    backgroundColor: checked ? 'color-mix(in srgb, var(--color-error) 8%, var(--bg-input))' : 'var(--bg-input)',
                    border: `1px solid ${checked ? 'color-mix(in srgb, var(--color-error) 35%, transparent)' : 'var(--border-base)'}`,
                  }}>
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded"
                    style={{
                      backgroundColor: checked ? 'var(--color-error)' : 'transparent',
                      border: `1px solid ${checked ? 'var(--color-error)' : 'var(--border-base)'}`,
                    }}>
                    {checked && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="text-xs font-semibold" style={{ color: 'var(--text-base)' }}>{scope.label}</span>
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{scope.hint}</span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-3">
            {!confirmSel ? (
              <motion.button type="button" onClick={() => selected.size > 0 && setConfirmSel(true)} disabled={selected.size === 0}
                whileHover={selected.size > 0 ? { scale: 1.01 } : undefined} whileTap={selected.size > 0 ? { scale: 0.98 } : undefined}
                className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-xs font-semibold transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-40"
                style={{ backgroundColor: 'var(--color-error)', color: '#fff' }}>
                <Trash2 className="h-3.5 w-3.5" />
                {selected.size === 0 ? 'Sélectionnez des données à effacer' : `Effacer la sélection (${selected.size})`}
              </motion.button>
            ) : (
              <div className="rounded-xl p-4" style={{ backgroundColor: 'color-mix(in srgb, var(--color-error) 12%, var(--bg-secondary))', border: '1px solid color-mix(in srgb, var(--color-error) 40%, transparent)' }}>
                <p className="mb-3 text-xs font-medium" style={{ color: 'var(--color-error)' }}>
                  ⚠️ Suppression définitive de : {SCOPES.filter((s) => selected.has(s.id)).map((s) => s.label).join(', ')}.
                </p>
                <div className="flex gap-2">
                  <motion.button type="button" onClick={handleClearSelected} disabled={clearingSel} whileTap={{ scale: 0.97 }}
                    className="flex-1 rounded-lg px-3 py-2 text-xs font-semibold text-white disabled:opacity-50" style={{ backgroundColor: 'var(--color-error)' }}>
                    {clearingSel ? 'Suppression…' : 'Confirmer la suppression'}
                  </motion.button>
                  <motion.button type="button" onClick={() => setConfirmSel(false)} disabled={clearingSel} whileTap={{ scale: 0.97 }}
                    className="flex-1 rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-50"
                    style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-base)', color: 'var(--text-muted)' }}>
                    Annuler
                  </motion.button>
                </div>
              </div>
            )}
          </div>
        </Field>
        <AnimatePresence>
          {selResult && (
            <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
              className="rounded-lg px-3 py-2 text-xs font-medium"
              style={{ backgroundColor: selResult.type === 'success' ? 'color-mix(in srgb, var(--color-success) 10%, transparent)' : 'color-mix(in srgb, var(--color-error) 10%, transparent)', color: selResult.type === 'success' ? 'var(--color-success)' : 'var(--color-error)' }}>
              {selResult.type === 'success' ? '✓' : '✗'} {selResult.message}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Section>
  );
}
