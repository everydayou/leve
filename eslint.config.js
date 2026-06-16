import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
  // Design-system guardrail: keep app UI on the semantic token layer.
  // Forbid raw Tailwind default text sizes (use the --text-* type scale:
  // text-caption/subhead/body/headline/title/display…) and hardcoded
  // hex/rgb colors (use semantic color tokens). Scoped to src/ui, minus the
  // dev-only styleguide which intentionally demos raw values.
  {
    files: ['src/ui/**/*.{ts,tsx}'],
    ignores: ['src/ui/screens/StyleguideScreen.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value=/\\btext-(xs|sm|base|lg|xl|[2-9]xl)\\b/]',
          message: 'Use the design-system type scale (text-caption/subhead/body/headline/title/display…) instead of raw Tailwind text sizes.',
        },
        {
          selector: 'TemplateElement[value.cooked=/\\btext-(xs|sm|base|lg|xl|[2-9]xl)\\b/]',
          message: 'Use the design-system type scale (text-caption/subhead/body/headline/title/display…) instead of raw Tailwind text sizes.',
        },
        {
          selector: 'Literal[value=/#[0-9a-fA-F]{3,8}\\b|\\brgba?\\(/]',
          message: 'Use semantic color tokens (bg-surface, text-content, border-border-subtle…) instead of hardcoded hex/rgb colors.',
        },
        {
          selector: 'TemplateElement[value.cooked=/#[0-9a-fA-F]{3,8}\\b|\\brgba?\\(/]',
          message: 'Use semantic color tokens (bg-surface, text-content, border-border-subtle…) instead of hardcoded hex/rgb colors.',
        },
      ],
    },
  },
])
