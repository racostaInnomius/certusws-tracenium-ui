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
          manualChunks: {
            "mui-vendor": ["@mui/material", "@mui/icons-material", "@emotion/react", "@emotion/styled"],
            "grid-vendor": ["@mui/x-data-grid"],
            "charts-vendor": ["recharts"],
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
