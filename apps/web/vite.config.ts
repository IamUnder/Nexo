import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // PWA instalable (actividad móvil: notas, tareas, llamadas). Iconos PNG definitivos: hito 7.
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["brand/nexo-mark.svg"],
      manifest: {
        name: "Nexo",
        short_name: "Nexo",
        description: "CRM operativo modular para pymes de servicios B2B",
        lang: "es",
        theme_color: "#6D28D9",
        background_color: "#F8F7FC",
        display: "standalone",
        icons: [
          { src: "/brand/nexo-mark.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: { "/api": { target: "http://localhost:4000", changeOrigin: true } },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./src/test-setup.ts"],
  },
});
