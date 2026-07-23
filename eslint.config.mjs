// @ts-check
// ESLint 플랫 config (ESLint 10 + typescript-eslint 8).
// - TS 파일: 타입 정보 기반(type-checked) 권장 + 스타일 규칙
// - JS/설정 파일: 타입 기반 규칙 해제
// - Prettier와 충돌하는 포매팅 규칙은 eslint-config-prettier로 마지막에 비활성화
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  // 전역 무시 대상
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.next/**',
      '**/out/**',
      '**/coverage/**',
    ],
  },

  // 기본 JavaScript 권장 규칙
  js.configs.recommended,

  // TypeScript — 타입 정보 기반 규칙 (TS 파일에만 적용)
  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    extends: [...tseslint.configs.recommendedTypeChecked, ...tseslint.configs.stylisticTypeChecked],
    languageOptions: {
      parserOptions: {
        // 각 파일에 맞는 tsconfig를 자동 탐색 (typescript-eslint 권장 방식)
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
    },
  },

  // JS/설정 파일 — 타입 기반 규칙 해제
  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: {
      globals: { ...globals.node },
    },
  },

  // Prettier와 충돌하는 규칙 비활성화 (반드시 마지막)
  eslintConfigPrettier,
);
