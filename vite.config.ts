import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {

  console.log("✅ VITE CONFIG LOADED:", new Date().toISOString());

  const env = loadEnv(mode, process.cwd(), "");
  const API_BASE = env.VITE_API_BASE || "http://localhost:3000";

  console.log("✅ API_BASE:", API_BASE);

  return {
    plugins: [react()],
    build: {
      rollupOptions: {
        output: {
          // Function form (was an object) so app code can be grouped too, not
          // just npm packages.
          //
          // The problem it solves: Rollup gives every module shared by two or
          // more route chunks its own chunk. That produced 23 chunks of ≤2 KB
          // — SectionPaper, format, shape, severity, scoreBands, OnlineDot,
          // useComplianceBands… — which together weigh 19 KB and cost 23
          // separate HTTP requests. On the portal's Free-SKU Static Web App,
          // measured at ~2.8s mean per request under concurrency (worst
          // observed: 30s), that is about a minute of round-trips to deliver
          // 19 KB.
          //
          // Route-level splitting is deliberately kept: Assets (153 KB) and
          // xterm (322 KB) should not be in the first paint. This only merges
          // the shared leaf modules that were never worth a request each.
          manualChunks(id: string) {
            if (id.includes("node_modules")) {
              // Same three vendor groups as before. Matched on the module path
              // rather than the package name because the function form gets
              // ids, not package entry points.
              if (/node_modules[\\/](@mui[\\/](material|icons-material)|@emotion[\\/])/.test(id)) {
                return "mui-vendor";
              }
              if (/node_modules[\\/]@mui[\\/]x-data-grid/.test(id)) return "grid-vendor";
              if (/node_modules[\\/]recharts/.test(id)) return "charts-vendor";
              // Everything else (xterm, react, date libs…) keeps Rollup's own
              // grouping — those are already few and large.
              return undefined;
            }

            // Shared app leaves → one chunk. These are imported from many
            // routes, so they load on essentially every page anyway; paying
            // one request for all of them instead of one each is strictly
            // better.
            if (/[\\/]src[\\/](utils|hooks|theme|api)[\\/]/.test(id)) return "app-shared";
            if (/[\\/]src[\\/]components[\\/]common[\\/]/.test(id)) return "app-shared";

            // Pages and feature components keep their own chunks: that is the
            // split worth having.
            return undefined;
          },
        },
      },
    },
    server: {
      port: 5173,
      proxy: {
        "/api": {
          target: API_BASE,
          changeOrigin: true,
          secure: false,
        },
        "/auth": {
          target: API_BASE,
          changeOrigin: true,
          secure: false,
        },
        "/health": {
          target: API_BASE,
          changeOrigin: true,
          secure: false,
        },
      },
    },
  };
});
