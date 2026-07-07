/**
 * ESLint flat config — lint uniquement, le déploiement reste sans build.
 * Périmètre : js/ (carte legacy) et src/ (SPA).
 * supabase/functions/ est du TypeScript Deno — hors périmètre.
 */
import js from '@eslint/js';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    files: ['js/**/*.js', 'src/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        L: 'readonly', // Leaflet (CDN)
      },
    },
    rules: {
      // Le code utilise des catch vides volontaires (fallback local/offline)
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
    },
  },
  {
    files: ['**/*.test.js'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
];
