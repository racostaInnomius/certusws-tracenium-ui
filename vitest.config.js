// vitest.config.js
//
// Test-only config, deliberately separate from vite.config.ts so the
// production build pipeline is never affected by test settings.
//
// - environment jsdom: the API layer touches window/sessionStorage/
//   CustomEvent, so a DOM is required even for "pure" API tests.
// - VITE_API_BASE is pinned to a fake origin that can never resolve:
//   MSW intercepts at the network level, and if a request escapes the
//   handlers it fails fast instead of hitting a real backend.
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.js"],
    include: ["src/**/*.test.{js,jsx}"],
    env: {
      VITE_API_BASE: "http://tracenium-api.test",
    },
    // MUI dialog + userEvent interaction tests (PackageDialog, DeployWizard,
    // ShellTerminal, TenantsAdministrator's invite dialogs) render heavy
    // component trees in jsdom and can take ~8-10s under full-suite load —
    // past the 5s default, causing intermittent timeouts. 15s gave headroom
    // for a while, but TenantsAdministrator.test.jsx's "invite a new member"
    // block (several findBy/waitFor calls per test, one of them a Dialog
    // mount) kept intermittently failing in CI with "Unable to find
    // role=dialog" even after asyncUtilTimeout below was raised once
    // already (2026-08-20). 20s keeps the same proportion of headroom over
    // the higher asyncUtilTimeout.
    testTimeout: 20000,

    // ⚠️ Reintentos SOLO en CI. Es la salida DESPUÉS de agotar la vía de
    // subir techos, no antes.
    //
    // `asyncUtilTimeout` ya se subió tres veces (1000 → 5000 → 8000) y las
    // tres volvió a fallar. El 2026-09-08 se probó una cuarta, escalada por
    // entorno (24000 en CI), y MEDIDA salió peor: sin ella la suite daba
    // 238/238 dos veces seguidas, y con ella 3, 1 y 0 fallos. Tiene sentido:
    // un `findBy` que no encuentra pasa de rendirse en 8s a insistir 24, la
    // suite se alarga y empuja a los demás contra su propio techo.
    //
    // Lo que hay debajo no es lentitud media —esta suite pasa entera en
    // local, con 2 y con 4 workers— sino PICOS del runner. El backend tiene
    // el mismo síndrome en una suite sin jsdom (un hook de 545ms que allí
    // supera 10s), lo que descarta que sea cosa de esta UI.
    //
    // `retry` no tapa un test malo: comprobado que uno roto de verdad sigue
    // fallando tras los 3 intentos. En local queda en 0 para que un flaky
    // nuevo se note al escribirlo, no seis meses después.
    retry: process.env.CI ? 2 : 0,

    // Deliberately far below the default (~cpus-1).
    //
    // Every worker boots its own jsdom and re-imports the whole MUI tree,
    // so workers compete for memory bandwidth and GC rather than for idle
    // cores. Adding them makes the suite *slower*, and slow enough that
    // the userEvent tests above blow their 15s timeout — which reads as a
    // dozen random test failures rather than as a capacity problem.
    //
    // Measured on this suite (12 logical cores / 6 performance):
    //
    //   workers   wall time   result
    //   4          44s        857 passed
    //   6          64s        857 passed
    //   8         102s        1 timeout
    //   ~11        164s       12 timeouts
    //
    // Monotonic in both directions, so this is a ceiling worth keeping
    // even on a bigger CI box. Raising testTimeout would have hidden the
    // failures without making anything faster.
    maxWorkers: 4,
    coverage: {
      provider: "v8",
      include: ["src/api/**"],
      reporter: ["text", "html"],
    },
  },
});
