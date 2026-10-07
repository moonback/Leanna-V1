// Setup commun aux tests Vitest (environnement jsdom).
//
// - Ajoute les matchers @testing-library/jest-dom (toBeInTheDocument, etc.).
// - Nettoie le DOM entre chaque test.
// - Fournit les polyfills jsdom manquants dont dépendent certains composants
//   (matchMedia, ResizeObserver, scrollIntoView). jsdom ne les implémente pas.

import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});

// matchMedia — utilisé par Framer Motion (useReducedMotion) et divers hooks UI.
// jsdom ne l'implémente pas (il lève "Not implemented"), donc on l'installe
// systématiquement avec un MediaQueryList complet (addEventListener inclus,
// requis par motion-dom).
// NB : fonction simple (pas un vi.fn), pour que restoreMocks/restoreAllMocks
// ne réinitialise pas son implémentation entre les tests.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  configurable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

// ResizeObserver — requis par certains composants qui mesurent leur conteneur.
if (!('ResizeObserver' in window)) {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  (window as unknown as { ResizeObserver: typeof ResizeObserverStub }).ResizeObserver =
    ResizeObserverStub;
}

// scrollIntoView — appelé pour auto-scroller la zone de chat ; absent de jsdom.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

// window.scrollTo — non implémenté par jsdom ; appelé par Framer Motion lors
// de la mesure des keyframes. Stub silencieux pour éviter le bruit en sortie.
window.scrollTo = (() => {}) as typeof window.scrollTo;
