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
    // ShellTerminal) render heavy component trees in jsdom and can take ~8-10s
    // under full-suite load — past the 5s default, causing intermittent
    // timeouts. 15s gives comfortable headroom without masking real hangs.
    testTimeout: 15000,
    coverage: {
      provider: "v8",
      include: ["src/api/**"],
      reporter: ["text", "html"],
    },
  },
});
