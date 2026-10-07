import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, type UserConfig } from 'vitest/config';

// Configuration Vitest dédiée au front (composants React dans src/).
// Volontairement séparée de vite.config.ts : on n'a besoin ni de Monaco ni de
// Tailwind pour les tests, et le runner serveur (node:test sur server/**) reste
// inchangé.
//
// Cast du plugin : @vitejs/plugin-react est typé contre la copie de Vite
// résolue à la racine, qui peut différer de celle embarquée par Vitest. Simple
// désaccord de types entre deux copies de Vite, sans incidence à l'exécution.
const plugins: UserConfig['plugins'] = [react() as unknown as NonNullable<UserConfig['plugins']>[number]];

export default defineConfig({
  plugins,
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // On ne teste que le front ; le serveur garde son propre runner (node:test).
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules/**', 'dist/**', '.Leanna/**', 'server/**'],
    css: false,
    restoreMocks: true,
    // La transformation/collecte à froid de la suite complète peut dépasser 5 s
    // par test sur une machine lente (surtout en parallèle). On élargit le délai
    // pour fiabiliser le run complet ; les tests eux-mêmes s'exécutent en ~1 s.
    testTimeout: 20000,
  },
});
