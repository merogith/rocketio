import js from '@eslint/js';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

export default [
    {
        ignores: ['dist/**', 'node_modules/**'],
    },
    js.configs.recommended,
    {
        files: ['**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                ...globals.browser,
                ...globals.node,
            },
        },
        rules: {
            // Unused vars are a warning, not a hard error: flags dead code without
            // blocking CI. Leading-underscore names are treated as intentional.
            'no-unused-vars': ['warn', { args: 'none', varsIgnorePattern: '^_', caughtErrors: 'none' }],
            'no-empty': ['warn', { allowEmptyCatch: true }],
            // Game loops legitimately use `while (true)` with internal breaks.
            'no-constant-condition': ['error', { checkLoops: false }],
            // Dead-store detection is useful signal but not a build blocker; some
            // flagged sites are defensive initializers guarding unhandled branches.
            'no-useless-assignment': 'warn',
        },
    },
    {
        // Test files additionally run under Node + Vitest globals.
        files: ['tests/**/*.js'],
        languageOptions: {
            globals: {
                ...globals.node,
            },
        },
    },
    // Disable stylistic rules that conflict with Prettier (Prettier owns formatting).
    prettier,
];
