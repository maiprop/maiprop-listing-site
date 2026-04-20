#!/usr/bin/env node
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
import { readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { readFileSync } from "node:fs";

const DIST = "dist/assets";

// Soft budgets — uncompressed size in kilobytes. A breach fails CI.
// Adjust as chunks grow; the goal is to notice surprise growth, not to chase
// a specific number.
const BUDGETS_KB = {
  // The initial entry chunk (Vite names it index-<hash>.js).
  "index": 600,
  // Manual chunks from vite.config.ts.
  "vendor-react": 180,
  "vendor-ui": 150,
  "vendor-charts": 500,
  "vendor-motion": 180,
  "vendor-icons": 250,
  // Catch-all: any other chunk — inform but don't fail unless huge.
  "*": 1500,
};

function gzipKb(path) {
  const buf = readFileSync(path);
  return Math.round((gzipSync(buf).byteLength / 1024) * 10) / 10;
}

function rawKb(path) {
  return Math.round((statSync(path).size / 1024) * 10) / 10;
}

/**
 * Match a filename like "vendor-react-abc123.js" against a budget key.
 */
function budgetKeyFor(filename) {
  const base = filename.replace(/-[a-f0-9]{6,}\.js$/i, "");
  if (BUDGETS_KB[base] !== undefined) return base;
  if (base === "index" || filename.startsWith("index-")) return "index";
  return "*";
}

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
console.log(`\n✅ All ${rows.length} chunks within budget.`);
