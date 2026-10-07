/**
 * Utilitaires partagés du module notebooks.
 *
 * Centralise des helpers auparavant dupliqués dans plusieurs composants
 * (NotesPanel, NotesCanvas, NotebookList) afin d'avoir une source unique.
 */

/**
 * Durée écoulée depuis `dateStr`, en format court et compact.
 * Exemples : "3j", "5h", "12m", "now".
 *
 * Utilisé là où la place est limitée (cartes de notes, canvas).
 */
export function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (days > 0) return `${days}j`;
  if (hours > 0) return `${hours}h`;
  if (mins > 0) return `${mins}m`;
  return 'now';
}

/**
 * Durée écoulée depuis `dateStr`, en français verbeux.
 * Exemples : "il y a 3j", "il y a 5h", "il y a 12m", "à l'instant".
 *
 * Utilisé dans la liste des notebooks, où le libellé complet est lisible.
 */
export function timeAgoLong(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (days > 0) return `il y a ${days}j`;
  if (hours > 0) return `il y a ${hours}h`;
  if (mins > 0) return `il y a ${mins}m`;
  return "à l'instant";
}

/**
 * Extrait un message lisible d'une erreur inconnue (bloc `catch`), sans recourir
 * à `any`. Remplace le motif récurrent `catch (e: any) { … e.message }`.
 */
export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  return String(e);
}

/**
 * Vrai si l'erreur correspond à une annulation (AbortController) — à ignorer
 * silencieusement dans les flux SSE/TTS interrompus volontairement.
 */
export function isAbortError(e: unknown): boolean {
  return e instanceof Error && e.name === 'AbortError';
}
