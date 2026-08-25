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

// -----------------------------------------------------------------
// Selectores de las guardas, como constantes componibles.
//
// ⚠️ POR QUÉ ESTÁN AQUÍ Y NO EN LÍNEA: en el config PLANO de ESLint, cuando
// dos bloques que coinciden con el mismo fichero definen la MISMA regla, el
// último REEMPLAZA las opciones del anterior — no las concatena. Este fichero
// llegó a tener tres bloques definiendo `no-restricted-syntax`, y el
// comentario que lo acompañaba afirmaba lo contrario ("ESLint concatenates the
// options arrays"). Consecuencia: durante todo ese tiempo el bloque del
// IconButton, que va último y cubre `src/**/*.jsx`, descartaba en silencio las
// guardas de color y de BRAND duplicado. Ambas pasaban el lint con cero
// errores porque no se estaban evaluando.
//
// La forma de componerlas es explícita: cada bloque enumera TODOS los
// selectores que le aplican. Si añades una guarda nueva, añádela a los bloques
// donde deba regir — no crees un cuarto bloque de `no-restricted-syntax`.
const HEX_SELECTORS = [
  {
    selector:
      "Literal[value=/^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?([0-9a-fA-F]{2})?$/]",
    message:
      'Hardcoded hex colors are forbidden here. Use BRAND / ROLE tokens from src/theme/brand.js. If you truly need a one-off color, disable this rule with a comment explaining why.',
  },
  {
    selector:
      "TemplateElement[value.cooked=/#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?([0-9a-fA-F]{2})?(?![0-9a-fA-F])/]",
    message:
      'Template-literal string contains a hex color. Interpolate a BRAND token from src/theme/brand.js instead.',
  },
];

const FONT_SIZE_SELECTOR = {
  // `fontSize: 12` en un objeto sx. La escala vive en TEXT / ICON
  // (src/theme/brand.js) y se derivó de los 925 usos que había sueltos: 26
  // tamaños de texto distintos, nueve de ellos fracciones nacidas de ajustar
  // a ojo. Sin esta regla vuelven solos.
  //
  // Sólo se restringe el literal NUMÉRICO: "0.9rem", "inherit" o una
  // expresión calculada pasan, porque son casos que la escala no cubre.
  // ⚠️ `raw`, NO `value`: en un literal numérico `value` es un Number y la
  // regex de esquery no casa contra él — la regla quedaría inerte, que es
  // exactamente el fallo que este fichero ya sufrió con los colores. `raw` es
  // el texto del fuente, siempre string. Verificado con un fichero de prueba.
  selector: "Property[key.name='fontSize'] > Literal[raw=/^[0-9.]+$/]",
  message:
    'fontSize numérico suelto. Usa TEXT.* para texto o ICON.* para iconos (src/theme/brand.js) — son escalas distintas: en MUI, fontSize sobre un <Icon> es su tamaño, no tipografía.',
};

const BRAND_SELECTOR = {
  selector: "VariableDeclarator[id.type='Identifier'][id.name='BRAND']",
  message:
    "Declaring a local 'BRAND' is forbidden — import it from '../theme/brand' (or the appropriate relative path). Central tokens are the single source of truth.",
};

const ICON_BUTTON_SELECTOR = {
  selector:
    "JSXOpeningElement[name.name='IconButton']:not(:has(JSXAttribute[name.name='aria-label']))",
  message:
    'Icon-only <IconButton> needs an aria-label — screen readers otherwise announce it as just "button". A Tooltip title is a description, not an accessible name.',
};

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
    // Los tests quedan fuera por lo mismo que en la regla de color: sus
    // valores son fixtures, no UI. Y hay un caso concreto que lo justifica —
    // xtermPackage.test.js configura un Terminal de xterm.js, cuyo `fontSize`
    // es de OTRO sistema de diseño (el del emulador), no del nuestro.
    ignores: ['src/theme/brand.js', '**/*.test.{js,jsx}', '**/__tests__/**'],
    rules: {
      // Note: when two overrides both set `no-restricted-syntax`,
      // ESLint concatenates the options arrays, so we need to repeat
      // the color rules here if we want them AND the BRAND rule to
      // compose. To keep things clean we only put the BRAND rule
      // here; the color rule is already applied via COLOR_SCOPED above.
      'no-restricted-syntax': ['error', BRAND_SELECTOR, ICON_BUTTON_SELECTOR, FONT_SIZE_SELECTOR],
    },
  },

  // -----------------------------------------------------------------
  // Guardrail #3: every <IconButton> needs an accessible name.
  //
  // Icon-only buttons render no text, so without `aria-label` a screen
  // reader announces them as just "button". A wrapping <Tooltip> does
  // NOT fix this — its title becomes a description, not the name.
  //
  // The codebase was swept to zero violations; this rule keeps it
  // there. For a toggle, prefer a label that reflects the current
  // state (`aria-label={open ? "Collapse" : "Expand"}`).
  //
  // Escape hatch: if a button genuinely has a visible text label
  // alongside the icon, disable this rule inline with a comment
  // explaining why.
  // -----------------------------------------------------------------
  // -----------------------------------------------------------------
  // Guarda #1 (color) — VA LA ÚLTIMA A PROPÓSITO.
  //
  // COLOR_SCOPED es un subconjunto de `src/**`, y el bloque que va después
  // gana. Si este bloque fuese antes que el de `src/**`, aquél reemplazaría
  // `no-restricted-syntax` y la guarda de color volvería a quedar inerte —
  // que es exactamente lo que pasaba. Por eso enumera también BRAND e
  // IconButton: un bloque no hereda los selectores del anterior.
  // -----------------------------------------------------------------
  {
    files: COLOR_SCOPED,
    // Los tests quedan fuera: sus colores son fixtures ("#111", "#222") que
    // existen para distinguir series en una aserción, no para pintar UI.
    // Forzarlos a tokens haría el test menos legible sin proteger nada.
    ignores: ['**/*.test.{js,jsx}', '**/__tests__/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...HEX_SELECTORS,
        BRAND_SELECTOR,
        ICON_BUTTON_SELECTOR,
        FONT_SIZE_SELECTOR,
      ],
    },
  },
]);
