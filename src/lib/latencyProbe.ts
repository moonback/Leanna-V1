/**
 * latencyProbe.ts
 *
 * Module léger de chronométrage de la chaîne audio Gemini Live.
 * Découpe la mesure globale (VAD onset → premier audio lu) en 5 étapes
 * précises pour identifier le composant responsable des délais observés.
 *
 * Étapes instrumentées :
 *   A  vadSilence    Fin de capture audio (VAD détecte silence long)
 *   B  wsSend        Envoi du dernier chunk audio au serveur via WS
 *   C  — (serveur)   Réception côté serveur → sendRealtimeInput    [log Node]
 *   D  — (serveur)   Premier onmessage Gemini avec audio            [log Node]
 *   E  audioPlay     Premier chunk schedulé pour lecture effective
 *
 * Utilisation :
 *   import { probe, flushProbe } from '../lib/latencyProbe';
 *
 *   probe('vadSilence');   // marque l'étape A
 *   probe('wsSend');       // marque l'étape B
 *   probe('audioPlay');    // marque l'étape E → flush automatique
 */

export type ProbeStep = 'vadSilence' | 'wsSend' | 'audioPlay';

interface ProbeEntry {
  step: ProbeStep;
  t: number; // performance.now()
}

// Une seule session de mesure à la fois (une utterance = un jeu de sondes).
let session: ProbeEntry[] = [];
// Séquence attendue pour garantir qu'on ne mélange pas deux utterances
const STEP_ORDER: ProbeStep[] = ['vadSilence', 'wsSend', 'audioPlay'];

/**
 * Enregistre un point de passage dans la chaîne.
 * Si l'étape 'audioPlay' est marquée, `flushProbe` est appelé automatiquement.
 *
 * L'étape 'wsSend' est spéciale : elle est mise à jour à chaque appel pour
 * capturer le timestamp du DERNIER chunk audio envoyé (fin d'utterance réelle).
 */
export function probe(step: ProbeStep): void {
  const t = performance.now();

  // Réinitialiser si une nouvelle utterance commence avant que la précédente
  // ne soit terminée (ex. interruption, barge-in).
  // Exception : si wsSend est déjà enregistré, c'est que la sonde B a déjà
  // capturé le dernier chunk de cette utterance. Dans ce cas vadSilence arrive
  // après (le VAD détecte le silence post-parole) et NE réinitialise PAS —
  // on veut conserver wsSend comme point de départ du rapport.
  if (step === 'vadSilence') {
    const hasWsSend = session.some(e => e.step === 'wsSend');
    if (!hasWsSend) {
      session = [];
    }
    // Dans tous les cas on enregistre vadSilence (ou on l'écrase si déjà là)
    const existing = session.findIndex(e => e.step === 'vadSilence');
    if (existing >= 0) {
      session[existing].t = t;
    } else {
      session.push({ t, step });
    }
    return;
  }

  // wsSend : écraser systématiquement pour capturer le dernier chunk envoyé
  if (step === 'wsSend') {
    const existing = session.findIndex(e => e.step === 'wsSend');
    if (existing >= 0) {
      session[existing].t = t;
    } else {
      session.push({ t, step });
    }
    return;
  }

  // Autres étapes : ignorer les doublons (une seule mesure par utterance)
  if (session.some(e => e.step === step)) return;

  session.push({ t, step });

  if (step === 'audioPlay') {
    flushProbe();
  }
}

/**
 * Produit le rapport de latence par étape et le logue sur la console.
 * Appelé automatiquement à l'étape E, ou manuellement en cas de timeout.
 *
 * @returns L'objet de rapport, ou null si moins de 2 étapes ont été enregistrées.
 */
export function flushProbe(): LatencyReport | null {
  if (session.length < 2) {
    session = [];
    return null;
  }

  // Trier selon STEP_ORDER pour un rapport cohérent même si les étapes
  // arrivent dans un ordre légèrement différent (ex. B avant A en edge case)
  const sorted = [...session].sort(
    (a, b) => STEP_ORDER.indexOf(a.step) - STEP_ORDER.indexOf(b.step),
  );

  const first = sorted[0].t;
  const report: LatencyReport = {
    total: 0,
    steps: {} as LatencyReport['steps'],
  };

  for (let i = 0; i < sorted.length; i++) {
    const label = sorted[i].step;
    report.steps[label] = {
      tAbs: sorted[i].t,
      tFromStart: Math.round(sorted[i].t - first),
      tFromPrev: i === 0 ? 0 : Math.round(sorted[i].t - sorted[i - 1].t),
    };
  }

  const last = sorted[sorted.length - 1];
  report.total = Math.round(last.t - first);

  // ── Log structuré ──────────────────────────────────────────────────────
  const lines = STEP_ORDER
    .filter(s => report.steps[s])
    .map(s => {
      const e = report.steps[s];
      if (!e) return '';
      const arrow = e.tFromPrev > 0 ? ` (+${e.tFromPrev}ms)` : '';
      return `  ${s.padEnd(12)} ${e.tFromStart}ms${arrow}`;
    })
    .filter(Boolean);

  console.group(
    `%c[LatencyProbe] Total ${report.total}ms`,
    'color:#4ade80;font-weight:bold',
  );
  lines.forEach(l => console.log(l));
  console.groupEnd();

  // Émettre un événement DOM pour que l'UI puisse consommer le rapport
  // sans couplage direct (le badge latence n'a pas à importer ce module).
  try {
    window.dispatchEvent(
      new CustomEvent<LatencyReport>('Leanna-latency-report', { detail: report }),
    );
  } catch { /* pas de window en SSR / test node */ }

  session = [];
  return report;
}

/**
 * Réinitialise la session courante sans émettre de rapport.
 * À appeler lors d'une interruption (barge-in) ou d'un reset de connexion.
 */
export function resetProbe(): void {
  session = [];
}

// ── Types exportés ────────────────────────────────────────────────────────────

export interface LatencyReport {
  /** Durée totale de la première étape enregistrée à la dernière (ms) */
  total: number;
  steps: Partial<Record<ProbeStep, {
    /** performance.now() absolu */
    tAbs: number;
    /** ms depuis la première étape de la session */
    tFromStart: number;
    /** ms depuis l'étape précédente */
    tFromPrev: number;
  }>>;
}
