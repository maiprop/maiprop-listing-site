#!/usr/bin/env node
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, extname, join, relative } from "node:path";

const root = process.cwd();
const outArgIndex = process.argv.indexOf("--out");
const outPath = outArgIndex >= 0 ? process.argv[outArgIndex + 1] : "docs/audit-coverage-inventory.json";

const sourceRoots = ["src/pages", "src/components", "src/hooks", "src/lib", "src/contexts", "supabase/functions"];
const testRoots = ["src/test", "e2e", "supabase/functions"];
const codeExts = new Set([".ts", ".tsx", ".js", ".mjs"]);
const roleTerms = ["buyer", "seller", "landlord", "agent", "professional", "developer", "investor", "admin", "platform_admin"];
const businessTerms = [
  "pricing",
  "checkout",
  "subscription",
  "invoice",
  "stripe",
  "open_house",
  "auction",
  "firesale",
  "quick_sale",
  "pof",
  "portfolio",
  "project",
  "listing",
  "lead",
  "message",
  "viewing",
  "consultation",
  "onboarding",
  "role_switch",
  "agent_data",
];

function walk(dir, out = []) {
  const full = join(root, dir);
  if (!existsSync(full)) return out;
  for (const entry of readdirSync(full, { withFileTypes: true })) {
    const path = join(full, entry.name);
    const rel = relative(root, path).replace(/\\/g, "/");
    if (entry.isDirectory()) {
      if (["node_modules", "dist", "coverage", "playwright-report"].includes(entry.name)) continue;
      walk(rel, out);
    } else if (codeExts.has(extname(entry.name))) {
      out.push(rel);
    }
  }
  return out;
}

function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

function lineCount(text) {
  return text.split(/\r?\n/).length;
}

function baseNameNoExt(rel) {
  return basename(rel).replace(/\.(test|spec)?\.(ts|tsx|js|mjs)$/i, "").replace(/\.(ts|tsx|js|mjs)$/i, "");
}

const sourceFiles = sourceRoots.flatMap((dir) => walk(dir));
const testFiles = testRoots.flatMap((dir) => walk(dir))
  .filter((file) => /\.(test|spec)\.(ts|tsx|js|mjs)$/i.test(file));
const testText = testFiles.map((file) => ({ file, text: read(file).toLowerCase(), base: baseNameNoExt(file).toLowerCase() }));

function hasLikelyTest(sourceFile) {
  const base = baseNameNoExt(sourceFile).toLowerCase();
  const rel = sourceFile.toLowerCase();
  return testText.some((test) => test.base === base || test.text.includes(base) || test.text.includes(rel));
}

function filesByRoot() {
  return Object.fromEntries(sourceRoots.map((dir) => {
    const files = sourceFiles.filter((file) => file.startsWith(`${dir}/`));
    return [dir, {
      files: files.length,
      lines: files.reduce((sum, file) => sum + lineCount(read(file)), 0),
      likely_tested_files: files.filter(hasLikelyTest).length,
      likely_untested_files: files.filter((file) => !hasLikelyTest(file)).slice(0, 50),
    }];
  }));
}

function extractRoutes() {
  const appPath = "src/App.tsx";
  if (!existsSync(join(root, appPath))) return [];
  const text = read(appPath);
  const routes = [];
  for (const match of text.matchAll(/<Route\s+path=["']([^"']+)["'][^>]*>/g)) {
    routes.push(match[1]);
  }
  return [...new Set(routes)].sort();
}

function extractSupabaseFunctions() {
  const dir = join(root, "supabase/functions");
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("_") && entry.name !== "node_modules")
    .map((entry) => {
      const rel = `supabase/functions/${entry.name}/index.ts`;
      return {
        name: entry.name,
        has_index: existsSync(join(root, rel)),
        has_test: testFiles.some((file) => file.startsWith(`supabase/functions/${entry.name}/`)),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function termCoverage(terms) {
  return Object.fromEntries(terms.map((term) => {
    const normalized = term.toLowerCase();
    const sourceHits = sourceFiles.filter((file) => read(file).toLowerCase().includes(normalized));
    const testHits = testFiles.filter((file) => read(file).toLowerCase().includes(normalized));
    return [term, {
      source_files: sourceHits.length,
      test_files: testHits.length,
      sample_source_files: sourceHits.slice(0, 20),
      sample_test_files: testHits.slice(0, 20),
    }];
  }));
}

const sourceStats = sourceFiles.map((file) => {
  const text = read(file);
  return {
    file,
    lines: lineCount(text),
    likely_tested: hasLikelyTest(file),
  };
});

const inventory = {
  generated_at: new Date().toISOString(),
  totals: {
    source_files: sourceFiles.length,
    source_lines: sourceStats.reduce((sum, item) => sum + item.lines, 0),
    test_files: testFiles.length,
    routes: extractRoutes().length,
    supabase_functions: extractSupabaseFunctions().length,
    likely_tested_source_files: sourceStats.filter((item) => item.likely_tested).length,
  },
  by_root: filesByRoot(),
  largest_files: [...sourceStats].sort((a, b) => b.lines - a.lines).slice(0, 30),
  likely_untested_large_files: sourceStats
    .filter((item) => !item.likely_tested)
    .sort((a, b) => b.lines - a.lines)
    .slice(0, 30),
  routes: extractRoutes(),
  supabase_functions: extractSupabaseFunctions(),
  role_term_coverage: termCoverage(roleTerms),
  business_term_coverage: termCoverage(businessTerms),
};

const fullOut = join(root, outPath);
mkdirSync(join(fullOut, ".."), { recursive: true });
writeFileSync(fullOut, `${JSON.stringify(inventory, null, 2)}\n`);
console.log(JSON.stringify(inventory.totals, null, 2));
console.error(`[audit-coverage-inventory] wrote ${outPath}`);
