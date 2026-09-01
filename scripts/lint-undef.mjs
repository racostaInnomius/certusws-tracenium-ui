// scripts/lint-undef.mjs
//
// Falla si algún componente JSX se usa sin estar definido.
//
// POR QUÉ UNA COMPROBACIÓN PROPIA Y NO `npm run lint`. El repo arrastra
// errores de lint ajenos a esto (13 el 2026-09-01), así que bloquear el
// CI con el lint completo obligaría a limpiar deuda no relacionada antes
// de poder proteger nada. Esto aísla UNA regla que ya está a cero y la
// deja a cero.
//
// POR QUÉ ESA REGLA Y NO OTRA. `react/jsx-no-undef` es la única cuyo
// incumplimiento es una PÁGINA EN BLANCO EN PRODUCCIÓN. En JSX un
// componente sin importar es una variable libre: no rompe el parseo ni el
// bundle, revienta al renderizar. Medido el 2026-09-01: la pestaña Trust
// anchors llevaba desde su commit sin cargar porque usaba <Button> y
// cuatro componentes de <Dialog> sin importarlos; `npm run build` pasaba,
// `npm test` pasaba, y ESLint lo veía pero el CI no lo ejecutaba.
//
// No sustituye a montar la pestaña en un test —eso cubre mucho más—,
// pero es barato y coge el caso entero de una vez.
//
// ⚠️ `--rule` en la línea de comandos AÑADE la regla a la configuración
// existente en lugar de aislarla, así que un `eslint --rule ...` habría
// seguido fallando por los otros 13 errores. De ahí el filtro explícito.

import { ESLint } from "eslint";

const REGLA = "react/jsx-no-undef";

const eslint = new ESLint();
const resultados = await eslint.lintFiles(["src"]);

const fallos = resultados.flatMap((r) =>
  r.messages
    .filter((m) => m.ruleId === REGLA)
    .map((m) => ({ file: r.filePath, line: m.line, message: m.message }))
);

if (fallos.length === 0) {
  console.log("✅ Sin componentes JSX usados sin definir.");
  process.exit(0);
}

console.error(`\n❌ ${fallos.length} componente(s) JSX usados sin definir.\n`);
console.error("Se usan en JSX pero no están importados ni declaradas. El build");
console.error("pasa igual y la página revienta al renderizar.\n");
for (const f of fallos) {
  console.error(`  ${f.file.replace(process.cwd() + "/", "")}:${f.line}`);
  console.error(`    ${f.message}`);
}
console.error("");
process.exit(1);
