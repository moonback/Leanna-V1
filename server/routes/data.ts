import { Router, Request, Response } from 'express';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { clearAllConversations } from '../skills/history.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('DataPurge');
const router = Router();

// Sentinelle "tout" : supprime toutes les lignes (id != uuid nul).
const NIL_UUID = '00000000-0000-0000-0000-000000000000';

/**
 * Scopes purgeables. Chaque scope regroupe une ou plusieurs tables Supabase.
 * - "conversations" est traité à part (clearAllConversations gère aussi
 *   conversation_messages en cascade + réinitialise la conversation active).
 * - "agents" regroupe les 3 tables agent_*. L'ordre respecte la FK
 *   (agent_tasks référence agent_orchestrations → supprimé avant).
 */
const SCOPE_TABLES: Record<string, string[]> = {
  memories: ['memories'],
  lists: ['lists'],
  missions: ['missions'],
  workflows: ['workflows'],
  scheduled_tasks: ['scheduled_tasks'],
  custom_skills: ['custom_skills'],
  autonomy_tasks: ['autonomy_tasks'],
  agents: ['agent_messages', 'agent_tasks', 'agent_orchestrations'],
};

/** Tous les scopes valides, y compris celui géré hors-Supabase-direct. */
const ALL_SCOPES = ['conversations', ...Object.keys(SCOPE_TABLES)];

async function purgeTable(supabase: SupabaseClient, table: string): Promise<number> {
  const { count } = await supabase.from(table).select('*', { count: 'exact', head: true });
  const { error } = await supabase.from(table).delete().neq('id', NIL_UUID);
  if (error) throw new Error(`${table}: ${error.message}`);
  return count || 0;
}

// DELETE /api/data/all — vide les données sélectionnées.
// Corps JSON optionnel : { scopes: string[] }. Sans corps (ou scopes vide),
// TOUT est purgé (rétro-compatibilité). OPÉRATION IRRÉVERSIBLE.
router.delete('/all', async (req: Request, res: Response) => {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ status: 'error', error: 'Supabase not configured' });
  }

  // Détermine les scopes demandés. Sans sélection → tout.
  const requested: unknown = req.body?.scopes;
  let scopes: string[];
  if (Array.isArray(requested) && requested.length > 0) {
    scopes = requested.filter((s): s is string => typeof s === 'string' && ALL_SCOPES.includes(s));
    if (scopes.length === 0) {
      return res.status(400).json({ status: 'error', error: 'Aucun scope valide fourni.' });
    }
  } else {
    scopes = [...ALL_SCOPES];
  }

  const deleted: Record<string, number> = {};
  const errors: Record<string, string> = {};

  // 1) Conversations (+ conversation_messages en cascade) via le service dédié.
  if (scopes.includes('conversations')) {
    try {
      deleted.conversations = await clearAllConversations();
    } catch (e: any) {
      errors.conversations = e.message || String(e);
    }
  }

  // 2) Autres scopes via suppression Supabase directe.
  const directScopes = scopes.filter((s) => s !== 'conversations');
  if (directScopes.length > 0) {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    for (const scope of directScopes) {
      let scopeCount = 0;
      let scopeFailed = false;
      for (const table of SCOPE_TABLES[scope]) {
        try {
          scopeCount += await purgeTable(supabase, table);
        } catch (e: any) {
          scopeFailed = true;
          errors[scope] = errors[scope] ? `${errors[scope]}; ${e.message}` : (e.message || String(e));
        }
      }
      if (!scopeFailed || scopeCount > 0) deleted[scope] = scopeCount;
    }
  }

  const total = Object.values(deleted).reduce((a, b) => a + b, 0);
  const hasErrors = Object.keys(errors).length > 0;

  if (hasErrors) {
    log.warn(`Purge partielle : ${total} ligne(s) supprimée(s), erreurs=${JSON.stringify(errors)}`);
    return res.status(207).json({ status: 'partial', deleted: total, details: deleted, errors, scopes });
  }

  log.info(`Purge terminée : ${total} ligne(s) supprimée(s) — scopes=${scopes.join(',')} — ${JSON.stringify(deleted)}`);
  return res.json({ status: 'success', deleted: total, details: deleted, scopes });
});

export default router;
