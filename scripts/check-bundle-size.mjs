/**
 * Bundle size regression check.
 *
 * Run after `vite build`. Fails the process with exit code 1 if any JS chunk
 * exceeds its budget (see BUDGETS below). Intended to be a conservative guard
 * — thresholds are deliberately generous; tighten them as the product stabilises.
 *
 * Usage in CI:
 *   npm run build
 *   node scripts/check-bundle-size.mjs
 *
 * Output is a markdown table so it surfaces cleanly in GH Action summaries.
 */
import { existsSync, readdirSync, statSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { fileURLToPath, pathToFileURL } from "node:url";

const DIST = "dist/assets";
const INDEX_HTML = "dist/index.html";

// Soft budgets — uncompressed size in kilobytes. A breach fails CI.
// Adjust as chunks grow; the goal is to notice surprise growth, not to chase
// a specific number.
//
// The chunk names below must stay in sync with the manualChunks() function
// in vite.config.ts. When a new vendor chunk is introduced there, add a
// budget here in the same change so size growth is gated from day one.
export const BUDGETS_KB = {
  // The initial entry chunk (Vite names it index-<hash>.js).
  "index": 500,
  // Manual chunks from vite.config.ts. vendor-react bundles
  // react + react-dom + react-router-dom + scheduler; the floor is
  // ~182 kB raw on the current pinned versions.
  "vendor-react": 200,
  // @radix-ui packages split into stable core and overlay/menu primitive chunks.
  "vendor-radix-core": 230,
  "vendor-radix-overlays": 90,
  "vendor-supabase": 225,
  "vendor-i18n": 80,
  "lib": 140,
  // cmdk, vaul, sonner, embla-carousel, react-resizable-panels, input-otp,
  // react-day-picker, @hello-pangea — small UI companions.
  "vendor-ui-extra": 180,
  "vendor-charts": 650,
  "vendor-icons": 250,
  "vendor-mapbox": 1200,
  // Catch-all: any other chunk — inform but don't fail unless huge.
  "*": 300,
};

export const FORBIDDEN_INITIAL_PRELOAD_PATTERNS = [
  /(?:^|\/)(?:LazyRecharts|recharts|vendor-charts|BarChart|LineChart|AreaChart|PieChart|ResponsiveContainer)-[^/]+\.js$/i,
  /(?:^|\/)d3-[^/]+\.js$/i,
  /(?:^|\/)(?:mapbox-gl|react-map-gl|vendor-mapbox)-[^/]+\.js$/i,
];

export function modulePreloadHrefs(html) {
  return Array.from(html.matchAll(/<link\b(?=[^>]*\brel=["']modulepreload["'])[^>]*\bhref=["']([^"']+\.js)["'][^>]*>/gi))
    .map((match) => match[1]);
}

export function forbiddenInitialPreloads(html) {
  return modulePreloadHrefs(html).filter((href) =>
    FORBIDDEN_INITIAL_PRELOAD_PATTERNS.some((pattern) => pattern.test(href))
  );
}

/**
 * Shape of a Rollup/Vite content-hash tail. Covers:
 *   - Vite 6 lowercase-hex hashes (`a1b2c3d4`)
 *   - Vite 7 / Rollup default base64url hashes (`DiLdui5R`, `miSS4154`,
 *     `BO0id-dW` — hashes can contain `-` and `_`)
 *   - Custom `hashLength` configs up to 24 chars (arbitrary generous cap).
 */
const HASH_SHAPE_RE = /^[A-Za-z0-9_-]{6,24}$/;

/**
 * Map a filename like "vendor-react-DiLdui5R.js" to its budget key.
 *
 * A pure regex strip is unsafe because the hash alphabet `[A-Za-z0-9_-]`
 * overlaps with chunk-name characters: a greedy match against
 * `vendor-ui-C70PLUjj.js` would consume `-ui-C70PLUjj` (11 in-class chars
 * ending with `.js`) and strip back to `vendor`, losing the `vendor-ui`
 * budget. Even a bounded `{6,12}` quantifier falls into this trap when the
 * chunk name's tail segment (e.g. `ui`) is short enough to fit inside the
 * bound together with the hash.
 *
 * Instead, walk leftward from the rightmost `-` and check each candidate
 * split `(prefix, tail)` against the budgets map. Take the first split
 * where `tail` matches the hash shape AND `prefix` is either a known
 * budget key or the literal `"index"`. This correctly handles:
 *   - single-segment chunks      (`index-miSS4154.js`     → `index`)
 *   - multi-segment chunks       (`vendor-ui-C70PLUjj.js` → `vendor-ui`)
 *   - hashes that contain `-`    (`useProjects-BO0id-dW.js` → fall to `*`;
 *                                 the leftward walk rejects the `dW` tail
 *                                 (2 chars) then accepts `BO0id-dW` with
 *                                 prefix `useProjects` which isn't a
 *                                 budget key, continuing the walk and
 *                                 ultimately falling through)
 *
 * Exported for unit-test coverage in scripts/check-bundle-size.test.mjs.
 */
export function budgetKeyFor(filename, budgets = BUDGETS_KB) {
  if (!filename.endsWith(".js")) return "*";
  const stem = filename.slice(0, -3); // strip ".js"

  if (/^(mapbox-gl|react-map-gl|vendor-mapbox)(-|$)/.test(stem) && budgets["vendor-mapbox"] !== undefined) {
    return "vendor-mapbox";
  }

  if (/^(LazyRecharts|recharts|vendor-charts|BarChart|LineChart|AreaChart|PieChart|ResponsiveContainer)(-|$)|^d3-/.test(stem) && budgets["vendor-charts"] !== undefined) {
    return "vendor-charts";
  }

  // Walk left from the rightmost `-`, accepting the first split whose
  // prefix is a known budget key or "index".
  for (
    let dashIdx = stem.lastIndexOf("-");
    dashIdx > 0;
    dashIdx = stem.lastIndexOf("-", dashIdx - 1)
  ) {
    const tail = stem.slice(dashIdx + 1);
    if (!HASH_SHAPE_RE.test(tail)) continue;
    const candidate = stem.slice(0, dashIdx);
    if (budgets[candidate] !== undefined) return candidate;
    if (candidate === "index") return "index";
  }

  // No known-key split found. Preserve the original `index-...` special
  // case so unversioned prefixes still land on the index budget.
  if (filename.startsWith("index-")) return "index";
  return "*";
}

function gzipKb(path) {
  const buf = readFileSync(path);
  return Math.round((gzipSync(buf).byteLength / 1024) * 10) / 10;
}

function rawKb(path) {
  return Math.round((statSync(path).size / 1024) * 10) / 10;
}

/** Entry point — wrapped so the module can be imported by tests without
 *  triggering the filesystem scan or calling process.exit. */
function main() {
  const files = readdirSync(DIST).filter((f) => f.endsWith(".js"));
  if (files.length === 0) {
    console.error("No JS assets found in", DIST, "— run `npm run build` first.");
    process.exit(2);
  }

  let failed = 0;
  const rows = [];

  for (const f of files.sort()) {
    const path = join(DIST, f);
    const raw = rawKb(path);
    const gz = gzipKb(path);
    const key = budgetKeyFor(f);
    const budget = BUDGETS_KB[key];
    const overBudget = raw > budget;
    if (overBudget) failed++;
    rows.push({ file: f, key, rawKb: raw, gzipKb: gz, budgetKb: budget, overBudget });
  }

  // Markdown summary.
  const lines = [
    "| Chunk | Budget key | Raw (kB) | Gzip (kB) | Budget (kB) | Status |",
    "|---|---|---:|---:|---:|:---:|",
    ...rows.map(
      (r) => `| \`${r.file}\` | \`${r.key}\` | ${r.rawKb} | ${r.gzipKb} | ${r.budgetKb} | ${r.overBudget ? "❌" : "✅"} |`,
    ),
  ];
  const report = lines.join("\n");
  console.log(report);

  // If running inside GitHub Actions, append to the step summary.
  if (process.env.GITHUB_STEP_SUMMARY) {
    try {
      writeFileSync(process.env.GITHUB_STEP_SUMMARY, `\n### Bundle size\n\n${report}\n`, { flag: "a" });
    } catch (e) {
      console.warn("Could not write GITHUB_STEP_SUMMARY:", e.message);
    }
  }

  if (failed > 0) {
    console.error(`\n❌ ${failed} chunk(s) exceed budget. Either split the chunk, remove imports, or raise the budget in scripts/check-bundle-size.mjs after review.`);
    process.exit(1);
  }

  if (existsSync(INDEX_HTML)) {
    const forbiddenPreloads = forbiddenInitialPreloads(readFileSync(INDEX_HTML, "utf8"));
    if (forbiddenPreloads.length > 0) {
      console.error("\nLazy-only chart/map chunks were preloaded by dist/index.html:");
      for (const href of forbiddenPreloads) console.error(`  - ${href}`);
      console.error("Keep Recharts, d3, Mapbox, and react-map-gl behind route/component-level dynamic imports.");
      process.exit(1);
    }
  }

  console.log(`\n✅ All ${rows.length} chunks within budget.`);
}

// Only run when invoked as a script (`node scripts/check-bundle-size.mjs`),
// not when imported from a test. `import.meta.url` is the module URL;
// `process.argv[1]` is the script path the node process was launched with.
if (process.argv[1] && import.meta.url === pathToFileURL(fileURLToPath(import.meta.url)).href && process.argv[1].endsWith("check-bundle-size.mjs")) {
  main();
}
