// ESLint flat config (ESLint 9+).
//
// Introduit en Phase 0 comme filet de sécurité. Les règles demandées par le
// plan sont activées, mais calibrées pour ne pas bloquer tout de suite sur la
// dette existante :
//   - react-hooks/exhaustive-deps : warn (deps manquantes à corriger au fil de l'eau)
//   - @typescript-eslint/no-explicit-any : warn (~55 occurrences à éliminer)
//   - jsx-a11y/* : warn (accessibilité à mettre à niveau progressivement)
//   - max-lines : warn à 400 (plusieurs fichiers monolithiques à découper)
//
// À mesure que la dette est résorbée (phases 1-4), ces règles pourront passer
// en "error" pour verrouiller les acquis.

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import globals from 'globals';

/**
 * Ramène un bloc de règles à la sévérité "warn", en préservant les options
 * éventuelles (ex: ['error', { ... }] → ['warn', { ... }]).
 */
function downgradeToWarn(rules) {
  const out = {};
  for (const [name, value] of Object.entries(rules)) {
    if (Array.isArray(value)) {
      out[name] = ['warn', ...value.slice(1)];
    } else {
      out[name] = 'warn';
    }
  }
  return out;
}

export default tseslint.config(
  // Fichiers et dossiers ignorés (générés, dépendances, miroirs sandbox…).
  {
    ignores: [
      'dist/**',
      'release/**',
      'node_modules/**',
      '.Leanna/**',
      'electron/**',
      'assets/**',
      'supabase/**',
      'scripts/**',
      '**/*.d.ts',
      'vite.config.ts',
      'eslint.config.js',
    ],
  },

  // Base recommandée JS + TypeScript (sans type-checking pour rester rapide).
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Réglages transverses.
  {
    rules: {
      // TypeScript gère déjà les identifiants non définis (et mieux que
      // la règle ESLint, qui génère des faux positifs sur les types/globals).
      // Recommandation officielle de typescript-eslint.
      'no-undef': 'off',
    },
  },

  // Code applicatif front (React/TSX).
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.browser,
        ...globals.es2022,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'jsx-a11y': jsxA11y,
    },
    rules: {
      // ── Hooks ────────────────────────────────────────────────────────────
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // ── Typage ───────────────────────────────────────────────────────────
      '@typescript-eslint/no-explicit-any': 'warn',

      // ── Accessibilité ────────────────────────────────────────────────────
      // On active l'ensemble recommandé, puis on le ramène à "warn" : l'a11y
      // est de la dette à résorber (phase 4), pas un blocage immédiat.
      ...jsxA11y.flatConfigs.recommended.rules,
      ...downgradeToWarn(jsxA11y.flatConfigs.recommended.rules),

      // ── Taille des fichiers (cible du découpage) ──────────────────────────
      'max-lines': [
        'warn',
        { max: 400, skipBlankLines: true, skipComments: true },
      ],

      // Assoupli : variables préfixées par _ considérées comme intentionnelles.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  // Code serveur / Node (TS).
  {
    files: ['server/**/*.ts'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.es2022,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
);
