import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
// Bundle size visualizer — run `ANALYZE=true npm run build` to generate report.html
import { visualizer } from "rollup-plugin-visualizer";

// https://vitejs.dev/config/
export default defineConfig((_env) => ({
  server: {
    host: "0.0.0.0",
    port: 8080,
    hmr: {
      // Disabled: the full-screen error overlay obscures the app during
      // development with React Query / Supabase auth errors that are
      // handled at runtime. Errors still appear in the browser console.
      overlay: false,
    },
  },
  plugins: [
    react(),
    process.env.ANALYZE === "true" && visualizer({ open: true, filename: "dist/report.html", gzipSize: true }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime"],
  },
  build: {
    rollupOptions: {
      output: {
        // Function form so ALL @radix-ui packages (~25 of them) land in a
        // single chunk. The previous static list only captured 4, leaving
        // the others to be auto-bundled into vendor-ui — pushing it well
        // over its 150 kB budget. Other small UI companions (cmdk, vaul,
        // sonner, embla-carousel, react-resizable-panels, input-otp,
        // react-day-picker) share vendor-ui-extra.
        //
        // mapbox-gl / react-map-gl are intentionally NOT matched here —
        // they're only imported by lazy-loaded routes (MapView,
        // PropertyMiniMap), so Rollup puts them in a separate lazy chunk
        // that's NOT listed in the initial HTML modulepreload (~283 kB
        // gzip saved on first load).
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("@radix-ui/")) return "vendor-radix";
          // recharts / d3 are intentionally NOT chunked here — they're only
          // imported by lazy-loaded routes (AnalyticsTab, AdminReports), so
          // Rollup places them in shared lazy auto-chunks that are NOT listed
          // in the initial HTML modulepreload. Forcing them into a named chunk
          // causes clsx (a shared dep) to be statically imported into the entry
          // bundle, adding ~106 kB gzip to every page load unnecessarily.
          if (id.includes("/lucide-react/")) return "vendor-icons";
          if (
            id.includes("/react-router") ||
            id.includes("/react-router-dom/") ||
            /\/react\/(?!.*\/node_modules\/)/.test(id) ||
            id.includes("/react-dom/") ||
            id.includes("/scheduler/")
          ) {
            return "vendor-react";
          }
          // Supabase client — large but needed everywhere; isolated chunk for
          // cache stability (changes only on SDK upgrades, not on app deploys).
          if (id.includes("/@supabase/") || id.includes("/supabase-js/")) {
            return "vendor-supabase";
          }
          // i18n — translation libraries, isolated for cache stability.
          if (id.includes("/i18next") || id.includes("/react-i18next/")) {
            return "vendor-i18n";
          }
          // Sentry — error tracking, isolated so app code changes don't bust it.
          if (id.includes("/@sentry/")) {
            return "vendor-sentry";
          }
          if (
            id.includes("/cmdk/") ||
            id.includes("/vaul/") ||
            id.includes("/sonner/") ||
            id.includes("/embla-carousel") ||
            id.includes("/react-resizable-panels/") ||
            id.includes("/input-otp/") ||
            id.includes("/react-day-picker/") ||
            id.includes("/@hello-pangea/")
          ) {
            return "vendor-ui-extra";
          }
          return undefined;
        },
      },
    },
    chunkSizeWarningLimit: 1050, // mapbox-gl lazy chunk (~276 kB gzip) and vendor-supabase are inherently large
  },
}));
