import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'motion/react';
import { Database, RefreshCw, Search, X, Loader2, User2, ChevronDown } from 'lucide-react';
import { Section, Field } from './SettingsPrimitives.js';
import type { AuditEntry } from './constants.js';

export function AuditSection() {
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [auditBusy, setAuditBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const loadAuditEntries = useCallback(async () => {
    setAuditBusy(true);
    try {
      const res = await fetch('/api/audit/logs');
      if (!res.ok) throw new Error('Unable to load audit entries');
      const data = await res.json();
      if (Array.isArray(data?.entries)) setAuditEntries(data.entries as AuditEntry[]);
      else setAuditEntries([]);
    } catch { setAuditEntries([]); }
    finally { setAuditBusy(false); }
  }, []);

  useEffect(() => { loadAuditEntries(); }, [loadAuditEntries]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return auditEntries;
    return auditEntries.filter(e =>
      e.action?.toLowerCase().includes(q) ||
      e.target?.toLowerCase().includes(q) ||
      e.details?.toLowerCase().includes(q) ||
      e.actor?.toLowerCase().includes(q)
    );
  }, [auditEntries, query]);

  const toggleExpand = useCallback((i: number) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  }, []);

  const fmtDate = (ts: string) => {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return ts;
    return d.toLocaleString('fr-FR', {
      day: '2-digit', month: '2-digit', year: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  };

  return (
    <Section
      icon={Database}
      title="Journal d'audit"
      description="Suivi des opérations récentes effectuées depuis l'IDE"
      badge={`${auditEntries.length} entrée${auditEntries.length > 1 ? 's' : ''}`}
    >
      {/* Barre d'actions : recherche + rafraîchir */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex flex-1 items-center">
          <Search className="absolute left-2.5 h-3.5 w-3.5 opacity-50" style={{ color: 'var(--text-muted)' }} />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Filtrer par action, cible, acteur…"
            className="w-full rounded-xl border px-8 py-2 text-xs outline-none transition-all"
            style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-base)', color: 'var(--text-primary)' }}
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-2.5 opacity-50 hover:opacity-100"
              style={{ color: 'var(--text-muted)' }}
              aria-label="Effacer le filtre"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <button
          onClick={loadAuditEntries}
          disabled={auditBusy}
          className="flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium transition hover:opacity-80 disabled:opacity-50"
          style={{ borderColor: 'var(--border-base)', color: 'var(--text-secondary)', backgroundColor: 'var(--bg-secondary)' }}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${auditBusy ? 'animate-spin' : ''}`} />
          Rafraîchir
        </button>
      </div>

      {query.trim() && (
        <p className="text-xs" style={{ color: 'var(--text-dimmed)' }}>
          {filtered.length} résultat{filtered.length > 1 ? 's' : ''} sur {auditEntries.length}
        </p>
      )}

      <Field label="Opérations tracées">
        <div className="rounded-xl p-3 max-h-96 overflow-y-auto custom-scrollbar"
          style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-base)' }}>
          {auditBusy && (
            <div className="flex items-center gap-2 py-4 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" style={{ color: 'var(--accent-primary)' }} />
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Chargement…</span>
            </div>
          )}
          {!auditBusy && filtered.length === 0 && (
            <p className="text-xs text-center py-4" style={{ color: 'var(--text-dimmed)' }}>
              {query.trim() ? `Aucune entrée ne correspond à « ${query} ».` : 'Aucune action enregistrée.'}
            </p>
          )}
          {!auditBusy && filtered.length > 0 && (
            <ul className="space-y-1.5">
              {filtered.map((entry, index) => {
                const hasDetails = Boolean(entry.details);
                const isOpen = expanded.has(index);
                return (
                  <motion.li key={`${entry.timestamp}-${index}`}
                    initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(index * 0.02, 0.3) }}
                    className="rounded-lg p-2.5" style={{ backgroundColor: 'var(--bg-base)', border: '1px solid var(--border-base)' }}>
                    <div className="flex items-center justify-between gap-3">
                      <span className="flex items-center gap-1.5 text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                        {entry.action}
                        {entry.actor && (
                          <span className="flex items-center gap-0.5 rounded px-1 py-0.5 text-xs font-normal"
                            style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-dimmed)' }}>
                            <User2 className="h-2.5 w-2.5" />{entry.actor}
                          </span>
                        )}
                      </span>
                      <span className="text-xs font-mono flex-shrink-0" style={{ color: 'var(--text-dimmed)' }}>
                        {fmtDate(entry.timestamp)}
                      </span>
                    </div>
                    <div className="mt-0.5 text-sm truncate" style={{ color: 'var(--text-muted)' }}>{entry.target}</div>
                    {hasDetails && (
                      <>
                        <button
                          type="button"
                          onClick={() => toggleExpand(index)}
                          className="mt-1 flex items-center gap-1 text-xs font-medium transition hover:opacity-80"
                          style={{ color: 'var(--accent-primary)' }}
                        >
                          <ChevronDown className="h-3 w-3 transition-transform" style={{ transform: isOpen ? 'none' : 'rotate(-90deg)' }} />
                          {isOpen ? 'Masquer' : 'Détails'}
                        </button>
                        {isOpen && (
                          <pre
                            className="mt-1.5 overflow-x-auto whitespace-pre-wrap break-words rounded-md p-2 text-xs font-mono"
                            style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-muted)', border: '1px solid var(--border-base)' }}
                          >
                            {entry.details}
                          </pre>
                        )}
                      </>
                    )}
                  </motion.li>
                );
              })}
            </ul>
          )}
        </div>
      </Field>
    </Section>
  );
}
