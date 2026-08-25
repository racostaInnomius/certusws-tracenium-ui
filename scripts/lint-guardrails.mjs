// scripts/lint-guardrails.mjs
//
// Falla si alguien reintroduce una violación de las guardas del sistema de
// diseño. Se ejecuta en CI; `npm run lint` sigue siendo el lint completo.
//
// POR QUÉ NO SE CABLEA `npm run lint` A SECAS: el repo arrastra 7 errores
// ajenos a las guardas (imports sin usar, dos avisos del React Compiler, un
// `Date.now` en render). Bloquear CI con ellos obligaría a limpiar deuda no
// relacionada antes de poder proteger lo que sí está a cero — y lo urgente es
// que las guardas dejen de poder morirse en silencio.
//
// Las cuatro guardas son reglas `no-restricted-syntax` (hex hardcodeado,
// literal de hex en template, BRAND local duplicado, IconButton sin
// aria-label, fontSize numérico suelto). Cuando esos 7 errores se limpien,
// esto se sustituye por `npm run lint` y este fichero se borra.
//
// Contexto de por qué existe: las guardas de color y de BRAND estuvieron
// INERTES durante meses. El config plano de ESLint reemplaza —no concatena—
// las opciones de una misma regla entre bloques, así que el último bloque
// descartaba a los anteriores. `npm run lint` pasaba con cero errores de color
// mientras había 118 hex hardcodeados. Ni siquiera se ejecutaba en CI.
import { ESLint } from "eslint";

const REGLA = "no-restricted-syntax";

const eslint = new ESLint();
const resultados = await eslint.lintFiles(["src/**/*.{js,jsx}"]);

const violaciones = resultados.flatMap((r) =>
  r.messages
    .filter((m) => m.ruleId === REGLA && m.severity === 2)
    .map((m) => ({ archivo: r.filePath.split("/src/").pop(), linea: m.line, mensaje: m.message }))
);

if (violaciones.length === 0) {
  console.log("✅ Guardas del sistema de diseño: sin violaciones.");
  process.exit(0);
}

console.error(`❌ ${violaciones.length} violación(es) de las guardas del sistema de diseño:\n`);
for (const v of violaciones) {
  console.error(`  src/${v.archivo}:${v.linea}`);
  console.error(`    ${v.mensaje}\n`);
}
console.error("Los tokens viven en src/theme/brand.js (BRAND, ROLE, NEUTRAL, TEXT, ICON).");
process.exit(1);
