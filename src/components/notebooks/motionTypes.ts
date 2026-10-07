/**
 * Types d'animation partagés du module notebooks (design system — Phase 4).
 *
 * Centralise le vocabulaire Framer Motion passé en props entre l'orchestrateur
 * et les composants présentationnels. Remplace les casts `any` (spring,
 * tapScale, scrim*) par des types issus de `motion/react`, afin que les props
 * d'animation soient vérifiées par TypeScript sans friction au call-site.
 */

import type { Transition, TargetAndTransition } from 'motion/react';
import type { CSSProperties } from 'react';

/**
 * Transition de ressort/durée partagée (valeurs des constantes SPRING_* de
 * ./motion.ts, ou override local `{ duration }` en reduced-motion).
 */
export type SpringTransition = Transition;

/**
 * Props d'interaction tactile étalées sur un élément `motion.*`.
 * Vide (`{}`) lorsque l'utilisateur préfère un mouvement réduit.
 */
export type TapScaleProps = { whileTap?: TargetAndTransition };

/** Style inline du voile (scrim) d'une modale. */
export type ScrimStyle = CSSProperties;
