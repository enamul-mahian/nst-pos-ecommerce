const browserGlobals = Object.fromEntries([
  'window','document','localStorage','sessionStorage','console','setTimeout','clearTimeout','setInterval','clearInterval','alert','confirm','prompt','FormData','Blob','URL','URLSearchParams','FileReader','CustomEvent','Event','HTMLElement','Node','navigator','fetch','structuredClone','AbortController','MutationObserver','ResizeObserver','IntersectionObserver','requestAnimationFrame','cancelAnimationFrame','Image','File','crypto','location'
].map((name) => [name, 'readonly']));

import tsParser from '@typescript-eslint/parser';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default [
  { ignores: ['dist/**', 'node_modules/**', 'admin/**', 'npm-test/**', 'src/assets.zip'] },
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: { globals: browserGlobals, ecmaVersion: 'latest', sourceType: 'module', parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      'no-undef': 'error',
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { globals: browserGlobals, parser: tsParser, parserOptions: { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } } },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
];
