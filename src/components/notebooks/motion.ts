/**
 * Constantes de ressort (spring) partagées du module notebooks.
 *
 * Centralise les transitions Framer Motion auparavant redéfinies dans chaque
 * composant. Les variantes distinctes sont conservées telles quelles pour ne
 * pas modifier le ressenti d'animation existant.
 */

/**
 * Ressort par défaut : critically damped, aucun rebond.
 * Pour tout ce qui n'est pas déclenché par un geste physique
 * (menus, entrée de message, apparition de panneaux).
 */
export const SPRING_UI = { type: 'spring' as const, bounce: 0, duration: 0.3 };

/**
 * Variante de SPRING_UI un peu plus lente, utilisée dans SourcePanel.
 */
export const SPRING_UI_SLOW = { type: 'spring' as const, bounce: 0, duration: 0.35 };

/**
 * Léger rebond, réservé aux moments "momentum" (message qui vient d'arriver,
 * bouton d'action flottant qui apparaît).
 */
export const SPRING_MOMENTUM = { type: 'spring' as const, bounce: 0.18, duration: 0.3 };

/**
 * Variante de SPRING_MOMENTUM avec un rebond légèrement plus prononcé,
 * utilisée dans le chat.
 */
export const SPRING_MOMENTUM_CHAT = { type: 'spring' as const, bounce: 0.2, duration: 0.3 };

/**
 * Ressort rapide, sans rebond, pour les micro-interactions réactives.
 */
export const SPRING_SNAPPY = { type: 'spring' as const, bounce: 0, duration: 0.22 };

/**
 * Ressort des modales (sans rebond). Alias de SPRING_UI, exposé séparément
 * pour l'intention sémantique côté modales.
 */
export const SPRING_MODAL = SPRING_UI;
