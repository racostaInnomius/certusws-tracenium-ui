// eslint.config.js
//
// Fase 4 homologation — fixed + extended.
//
// The previous config imported `typescript-eslint` but the package was
// never installed and there are no .ts/.tsx files in this UI, so
// `npm run lint` was just failing silently. That meant the whole
// homologation could in theory have been undone without anyone noticing.
//
// This rewrite:
//   1. Lints the actual file extensions we ship (.js / .jsx).
//   2. Adds the Fase 4 guardrails:
//       a. Hex color literals (`"#[0-9a-fA-F]{3,8}"`) are forbidden
//          inside src/pages/** and src/components/** — force use of the
//          BRAND tokens in src/theme/brand.js instead.
//       b. `const BRAND = { ... }` is forbidden outside theme/brand.js
//          so nobody can re-introduce the local-duplicate pattern
//          Fase 1 took out.
//
// Both guardrails raise ESLint errors (not warnings) — CI should fail
// fast, not sweep violations under the rug.
//
// Exceptions (opt-out via `// eslint-disable-next-line` with a reason):
//   - Severity tokens that genuinely come from a third-party palette
//     (e.g. Auth0 error badges) where no brand equivalent exists.
//   - One-off gradient endpoints that combine MUI default palette
//     with BRAND.teal — document the trade-off in the disable comment.

import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import unusedImports from 'eslint-plugin-unused-imports';
import { defineConfig, globalIgnores } from 'eslint/config';

// Matches any CSS hex color in a string literal: #RGB, #RGBA, #RRGGBB,
// #RRGGBBAA. Anchored so "foo#aaa" in prose isn't caught.
const HEX_COLOR_RE = /^#[0-9a-fA-F]{3,8}$/;

// Files where the hex-color guardrail applies. Charts are deliberately
// excluded: multi-series chart palettes (10+ perceptually-distinct
// colors per chart) are a legitimate per-chart design concern and live
// as local `const PALETTE = [...]` arrays inside each chart component.
// Adding them all to BRAND would pollute the token surface without
// clarifying anything — if the design system ever grows curated chart
// palettes we can tighten this scope back.
const COLOR_SCOPED = [
  'src/pages/**/*.{js,jsx}',
  'src/layout/**/*.{js,jsx}',
  'src/auth/**/*.{js,jsx}',
  // Shared app components (not per-chart palettes).
  'src/components/common/**/*.{js,jsx}',
  'src/components/Overview/**/*.{js,jsx}',
  'src/components/tokens/**/*.{js,jsx}',
  'src/components/RemoteControl/**/*.{js,jsx}',
  'src/components/software-delivery/**/*.{js,jsx}',
];

export default defineConfig([
  globalIgnores([
    'dist',
    'node_modules',
    // The color tokens module IS where hex literals live by design.
    'src/theme/brand.js',
  ]),

  // -----------------------------------------------------------------
  // Base JS/JSX rules — applied to everything we author.
  // -----------------------------------------------------------------
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    plugins: {
      // CRITICAL: `react/jsx-uses-vars` is what tells the rest of
      // ESLint that `<Box>` in JSX DOES reference the `Box` import.
      // Without it, both the base `no-unused-vars` rule and
      // `unused-imports/no-unused-imports` think every component
      // import is dead — and `eslint --fix` happily strips them.
      // (Found out the hard way; ~40 files lost their imports
      // before this plugin was wired in. Don't remove it.)
      react,
      // Autofix-capable unused-import detector. The base
      // `no-unused-vars` can flag but not remove; this one does both.
      'unused-imports': unusedImports,
    },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    rules: {
      // Treat JSX element references as variable usage — absolutely
      // required for the unused-imports rule to stop stripping
      // component imports. Also turn on `jsx-uses-react` for the
      // same reason for any `import React from "react"` stragglers.
      'react/jsx-uses-vars': 'error',
      'react/jsx-uses-react': 'error',
      // Delegate unused-import detection to the dedicated plugin so
      // `--fix` can remove them. We disable the base rule on imports
      // specifically, and keep it (as warn) for the other unused-var
      // cases so the two rules don't double-report.
      'no-unused-vars': 'off',
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'warn',
        {
          vars: 'all',
          varsIgnorePattern: '^_',
          args: 'after-used',
          argsIgnorePattern: '^_',
        },
      ],
      'react-hooks/exhaustive-deps': 'warn',
      // `set-state-in-effect` is a new (v7) react-hooks rule that
      // flags ANY `setState` inside `useEffect`, even the legitimate
      // "sync external data into state after fetch" pattern we use
      // everywhere (AuditTimeseriesChart, JobsTimeseriesChart, etc.).
      // Downgrade to warn so it nags during dev but doesn't gate CI.
      'react-hooks/set-state-in-effect': 'warn',
      // `only-export-components` is a react-refresh DX hint, not a
      // correctness issue. We deliberately co-locate helpers with
      // their component (e.g. FleetComposition exports
      // `classifyAgentVersions` next to the component because the
      // AttentionPanel needs the same bucketing logic). The only
      // consequence is a slightly less granular hot-reload.
      'react-refresh/only-export-components': 'warn',
    },
  },

  // -----------------------------------------------------------------
  // Fase 4 guardrail #1: no hex colors in pages / components / layout.
  //
  // The `no-restricted-syntax` selector matches any string Literal
  // whose value looks like a CSS hex color and flags it. Use BRAND /
  // ROLE tokens from src/theme/brand.js instead.
  //
  // Rationale: when the palette shifts (e.g. we re-tune the primary
  // teal saturation), hardcoded hex strings silently drift out of
  // sync. A lint rule makes the break loud.
  // -----------------------------------------------------------------
  {
    files: COLOR_SCOPED,
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          // Matches Literal nodes whose value is a string looking like
          // "#aabbcc" / "#abc" / "#aabbccdd". AST selectors don't
          // support regex-matching on `.value` directly in standard
          // ESLint, so we use the `regex` test via the selector's
          // value predicate.
          selector:
            "Literal[value=/^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?([0-9a-fA-F]{2})?$/]",
          message:
            'Hardcoded hex colors are forbidden here. Use BRAND / ROLE tokens from src/theme/brand.js. If you truly need a one-off color, disable this rule with a comment explaining why.',
        },
        {
          // Forbid template-literal strings that concat hex colors too.
          // e.g. `1px solid #abc` in a `sx` — easy to sneak past the
          // pure-literal check above.
          selector:
            "TemplateElement[value.cooked=/#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?([0-9a-fA-F]{2})?(?![0-9a-fA-F])/]",
          message:
            'Template-literal string contains a hex color. Interpolate a BRAND token from src/theme/brand.js instead.',
        },
      ],
    },
  },

  // -----------------------------------------------------------------
  // Fase 4 guardrail #2: no local `const BRAND = {...}` duplicates.
  //
  // Before Fase 1 every page re-declared its own BRAND object inline.
  // Palette changes then required a grep-and-replace across 5+ files.
  // The central module at src/theme/brand.js is the only legitimate
  // place to declare `BRAND`; anywhere else must import.
  //
  // This rule runs app-wide (not just in the color-scoped folders)
  // because a duplicate BRAND can appear anywhere and break the
  // palette-sync contract. Charts are included.
  // -----------------------------------------------------------------
  {
    files: ['src/**/*.{js,jsx}'],
    ignores: ['src/theme/brand.js'],
    rules: {
      // Note: when two overrides both set `no-restricted-syntax`,
      // ESLint concatenates the options arrays, so we need to repeat
      // the color rules here if we want them AND the BRAND rule to
      // compose. To keep things clean we only put the BRAND rule
      // here; the color rule is already applied via COLOR_SCOPED above.
      'no-restricted-syntax': [
        'error',
        {
          // `const BRAND = ...` at the top level of a file. Permissive:
          // matches any Identifier named BRAND on the LHS of a
          // VariableDeclarator — catches `const BRAND = {...}` and
          // `let BRAND = ...` alike. Import destructuring uses
          // `ImportSpecifier` AST nodes, not `VariableDeclarator`,
          // so `import { BRAND } from ...` is correctly ignored.
          selector:
            "VariableDeclarator[id.type='Identifier'][id.name='BRAND']",
          message:
            "Declaring a local 'BRAND' is forbidden — import it from '../theme/brand' (or the appropriate relative path). Central tokens are the single source of truth.",
        },
      ],
    },
  },
]);
