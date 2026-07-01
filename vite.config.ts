import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
// Bundle size visualizer — run `ANALYZE=true npm run build` to generate report.html
import { visualizer } from "rollup-plugin-visualizer";
import { createLocalPublicApiResponse } from "./scripts/local-public-api-fixtures.mjs";

type PublicApiMiddlewareReq = {
  method?: string;
  url?: string;
};

type PublicApiMiddlewareRes = {
  statusCode: number;
  setHeader(name: string, value: string): void;
  end(body?: string): void;
};

type PublicApiMiddlewareNext = () => void;

function getPublicApiProxyTarget(mode: string): string | undefined {
  const env = loadEnv(mode, process.cwd(), "");
  const target =
    process.env.VITE_PUBLIC_API_ORIGIN ||
    env.VITE_PUBLIC_API_ORIGIN;
  if (!target) return undefined;
  try {
    const url = new URL(target);
    if (!/^https?:$/.test(url.protocol)) return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
}

function sendLocalPublicApiResponse(
  req: PublicApiMiddlewareReq,
  res: PublicApiMiddlewareRes,
  next: PublicApiMiddlewareNext,
): void {
  if (!req.url?.startsWith("/api/public")) {
    next();
    return;
  }

  const response = createLocalPublicApiResponse(
    new URL(req.url, "http://localhost"),
    req.method ?? "GET",
  );
  res.statusCode = response.status;
  response.headers.forEach((value, name) => res.setHeader(name, value));

  if ((req.method ?? "GET").toUpperCase() === "HEAD") {
    res.end();
    return;
  }

  response.text()
    .then((body) => res.end(body))
    .catch(() => {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ error: "Local public API fixture failed" }));
    });
}

function localPublicApiFixturesPlugin() {
  return {
    name: "maiprop-local-public-api-fixtures",
    configureServer(server) {
      server.middlewares.use(sendLocalPublicApiResponse);
    },
    configurePreviewServer(server) {
      server.middlewares.use(sendLocalPublicApiResponse);
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const publicApiProxyTarget = getPublicApiProxyTarget(mode);
  return {
  server: {
    host: "0.0.0.0",
    port: 8080,
    hmr: {
      // Disabled: the full-screen error overlay obscures the app during
      // development with React Query / Supabase auth errors that are
      // handled at runtime. Errors still appear in the browser console.
      overlay: false,
    },
    proxy: publicApiProxyTarget
      ? {
          "/api/public": {
            target: publicApiProxyTarget,
            changeOrigin: true,
            secure: true,
          },
        }
      : undefined,
  },
  plugins: [
    react(),
    !publicApiProxyTarget && localPublicApiFixturesPlugin(),
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
        // Function form so @radix-ui packages land in stable UI chunks.
        // Core primitives and overlay/menu primitives are separated because
        // Vite 8/Rolldown pushes the full Radix graph above the single-chunk
        // budget. Other small UI companions (cmdk, vaul, sonner,
        // embla-carousel, react-resizable-panels, input-otp, react-day-picker)
        // share vendor-ui-extra.
        //
        // mapbox-gl / react-map-gl are intentionally NOT matched here —
        // they're only imported by lazy-loaded routes (MapView,
        // PropertyMiniMap), so Rollup puts them in a separate lazy chunk
        // that's NOT listed in the initial HTML modulepreload (~283 kB
        // gzip saved on first load).
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("@radix-ui/")) {
            if (
              [
                "@radix-ui/react-alert-dialog",
                "@radix-ui/react-context-menu",
                "@radix-ui/react-dialog",
                "@radix-ui/react-dropdown-menu",
                "@radix-ui/react-hover-card",
                "@radix-ui/react-menubar",
                "@radix-ui/react-navigation-menu",
                "@radix-ui/react-popover",
                "@radix-ui/react-select",
                "@radix-ui/react-toast",
                "@radix-ui/react-tooltip",
                "@radix-ui/react-dismissable-layer",
                "@radix-ui/react-focus-guards",
                "@radix-ui/react-focus-scope",
                "@radix-ui/react-popper",
                "@radix-ui/react-roving-focus",
              ].some((pkg) => id.includes(pkg))
            ) {
              return "vendor-radix-overlays";
            }
            return "vendor-radix-core";
          }
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
};
});
