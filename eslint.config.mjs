// `eslint-config-next` ships native flat configs from Next 16, so there is no
// FlatCompat wrapper here — routing it through eslintrc compatibility fails to
// validate and takes the whole lint run down with it.
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'dist/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'next-env.d.ts',
      'src/generated/**',
    ],
  },
  ...nextCoreWebVitals,
  ...tseslint.configs.recommended,
  {
    // eslint-plugin-react's automatic React version detection calls an ESLint 9
    // context API that ESLint 10 removed, which throws while loading any react/*
    // rule. Declaring the version skips detection entirely.
    settings: { react: { version: '19.2' } },
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@supabase/*', 'firebase', 'firebase/*', '@vercel/*'],
              message:
                'ResellSnap AI is Railway-native. Supabase, Firebase and Vercel-only services are not permitted.',
            },
          ],
        },
      ],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    files: ['scripts/**/*.ts', 'prisma/**/*.ts', 'tests/**/*.ts', 'src/lib/logger.ts'],
    rules: { 'no-console': 'off' },
  },
);
