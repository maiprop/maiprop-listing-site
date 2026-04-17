import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { componentTagger } from "lovable-tagger";
// Bundle size visualizer — run `ANALYZE=true npm run build` to generate report.html
import { visualizer } from "rollup-plugin-visualizer";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "0.0.0.0",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
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
        manualChunks: {
          "vendor-react": ["react", "react-dom", "react-router-dom"],
          "vendor-ui": [
            "@radix-ui/react-dialog",
            "@radix-ui/react-dropdown-menu",
            "@radix-ui/react-tabs",
            "@radix-ui/react-tooltip",
          ],
          "vendor-charts": ["recharts"],
          "vendor-motion": ["framer-motion"],
          // Lucide icons in a shared chunk — prevents them inflating the index bundle
          "vendor-icons": ["lucide-react"],
          // mapbox-gl and react-map-gl are intentionally NOT in manualChunks —
          // they are only imported by lazy-loaded pages (MapView, PropertyMiniMap)
          // so Rollup naturally puts them in a separate lazy chunk that is NOT
          // listed in the initial HTML modulepreload, saving ~283kB gzip on first load.
        },
      },
    },
    chunkSizeWarningLimit: 1050, // mapbox-gl lazy chunk is inherently large (~275kB gzip)
  },
}));
