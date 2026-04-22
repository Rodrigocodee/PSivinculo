import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
      },
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;

          if (
            id.includes("/react/") ||
            id.includes("\\react\\") ||
            id.includes("react-dom") ||
            id.includes("scheduler")
          ) {
            return "react-vendor";
          }

          if (id.includes("react-router-dom")) {
            return "router";
          }

          if (id.includes("@supabase") || id.includes("@tanstack")) {
            return "data-access";
          }

          if (id.includes("recharts")) {
            return "charts-core";
          }

          if (id.includes("victory-vendor")) {
            return "charts-vendor";
          }

          if (id.includes("d3-")) {
            return "charts-d3";
          }

          if (
            id.includes("@radix-ui") ||
            id.includes("lucide-react") ||
            id.includes("sonner") ||
            id.includes("cmdk") ||
            id.includes("vaul") ||
            id.includes("embla-carousel-react") ||
            id.includes("react-day-picker")
          ) {
            return "ui-kit";
          }

          if (
            id.includes("react-hook-form") ||
            id.includes("@hookform") ||
            id.includes("zod")
          ) {
            return "forms";
          }
        },
      },
    },
  },
}));
