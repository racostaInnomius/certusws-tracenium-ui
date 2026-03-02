import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
console.log("✅ VITE CONFIG LOADED:", new Date().toISOString());
export default defineConfig({
  
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
        secure: false,
      },
      "/auth": {
        target: "http://localhost:3000",
        changeOrigin: true,
        secure: false,
      },
      "/health": {
        target: "http://localhost:3000",
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
