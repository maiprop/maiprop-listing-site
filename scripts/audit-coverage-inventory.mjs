#!/usr/bin/env node
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, extname, isAbsolute, join, relative, resolve } from "node:path";

const root = process.cwd();
const outArgIndex = process.argv.indexOf("--out");
const outPath = outArgIndex >= 0 ? process.argv[outArgIndex + 1] : "docs/audit-coverage-inventory.json";
const checkMode = process.argv.includes("--check");
const coverageSummaryPath = join(root, "coverage/coverage-summary.json");

const sourceRoots = ["src/pages", "src/components", "src/hooks", "src/lib", "src/contexts", "supabase/functions"];
const testRoots = ["src/test", "e2e", "supabase/functions"];
const codeExts = new Set([".ts", ".tsx", ".js", ".mjs"]);
const runtimeAuditRoots = ["src/pages", "src/components", "src/hooks", "src/lib", "src/contexts"];
const zeroCoverageAllowlist = new Set([
  "src/hooks/listingForm.types.ts",
]);
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

function normalizeCoveragePath(file) {
  const normalized = file.replace(/\\/g, "/");
  if (!isAbsolute(file)) return normalized;
  return relative(root, resolve(file)).replace(/\\/g, "/");
}

function loadCoverageSummary() {
  if (!existsSync(coverageSummaryPath)) return null;
  const raw = JSON.parse(readFileSync(coverageSummaryPath, "utf8"));
  const files = new Map();
  for (const [file, metrics] of Object.entries(raw)) {
    if (file === "total") continue;
    files.set(normalizeCoveragePath(file), metrics);
  }
  return { total: raw.total ?? null, files };
}

const sourceFiles = sourceRoots.flatMap((dir) => walk(dir));
const testFiles = testRoots.flatMap((dir) => walk(dir))
  .filter((file) => /\.(test|spec)\.(ts|tsx|js|mjs)$/i.test(file));
const testText = testFiles.map((file) => ({ file, text: read(file).toLowerCase(), base: baseNameNoExt(file).toLowerCase() }));
const coverage = loadCoverageSummary();

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
  const coverageMetrics = coverage?.files.get(file) ?? null;
  return {
    file,
    lines: lineCount(text),
    likely_tested: hasLikelyTest(file),
    coverage: coverageMetrics ? {
      lines: coverageMetrics.lines?.pct ?? null,
      functions: coverageMetrics.functions?.pct ?? null,
      branches: coverageMetrics.branches?.pct ?? null,
      statements: coverageMetrics.statements?.pct ?? null,
      covered_lines: coverageMetrics.lines?.covered ?? null,
      total_lines: coverageMetrics.lines?.total ?? null,
    } : null,
  };
});

const runtimeSourceStats = sourceStats.filter((item) =>
  runtimeAuditRoots.some((dir) => item.file.startsWith(`${dir}/`)) &&
  !item.file.startsWith("src/components/ui/") &&
  !zeroCoverageAllowlist.has(item.file)
);

const zeroCoveredRuntimeFiles = runtimeSourceStats
  .filter((item) => (item.coverage?.total_lines ?? item.lines) >= 30)
  .filter((item) => item.coverage && (item.coverage.lines ?? 0) === 0)
  .sort((a, b) => b.lines - a.lines);

const lowCoveredRuntimeFiles = runtimeSourceStats
  .filter((item) => (item.coverage?.total_lines ?? item.lines) >= 30)
  .filter((item) => item.coverage && (item.coverage.lines ?? 0) > 0 && (item.coverage.lines ?? 0) < 75)
  .sort((a, b) => (a.coverage?.lines ?? 0) - (b.coverage?.lines ?? 0));

const inventory = {
  generated_at: new Date().toISOString(),
  totals: {
    source_files: sourceFiles.length,
    source_lines: sourceStats.reduce((sum, item) => sum + item.lines, 0),
    test_files: testFiles.length,
    routes: extractRoutes().length,
    supabase_functions: extractSupabaseFunctions().length,
    likely_tested_source_files: sourceStats.filter((item) => item.likely_tested).length,
    coverage_available: Boolean(coverage),
    coverage_lines_pct: coverage?.total?.lines?.pct ?? null,
    coverage_functions_pct: coverage?.total?.functions?.pct ?? null,
    coverage_branches_pct: coverage?.total?.branches?.pct ?? null,
    zero_covered_runtime_files: zeroCoveredRuntimeFiles.length,
  },
  by_root: filesByRoot(),
  largest_files: [...sourceStats].sort((a, b) => b.lines - a.lines).slice(0, 30),
  likely_untested_large_files: sourceStats
    .filter((item) => !item.likely_tested)
    .sort((a, b) => b.lines - a.lines)
    .slice(0, 30),
  zero_covered_runtime_files: zeroCoveredRuntimeFiles.slice(0, 50),
  low_covered_runtime_files: lowCoveredRuntimeFiles.slice(0, 50),
  routes: extractRoutes(),
  supabase_functions: extractSupabaseFunctions(),
  role_term_coverage: termCoverage(roleTerms),
  business_term_coverage: termCoverage(businessTerms),
};

function stableInventory(value) {
  return JSON.stringify({ ...value, generated_at: "<ignored>" }, null, 2);
}

const fullOut = join(root, outPath);
const shouldWrite = !checkMode || outArgIndex >= 0;
if (shouldWrite) {
  mkdirSync(join(fullOut, ".."), { recursive: true });
  writeFileSync(fullOut, `${JSON.stringify(inventory, null, 2)}\n`);
}
console.log(JSON.stringify(inventory.totals, null, 2));
console.error(shouldWrite ? `[audit-coverage-inventory] wrote ${outPath}` : "[audit-coverage-inventory] checked without writing");

if (checkMode) {
  const failures = [];
  if (!coverage) failures.push("coverage/coverage-summary.json is missing; run npm run test:coverage first");
  if (existsSync(fullOut)) {
    const committed = JSON.parse(readFileSync(fullOut, "utf8"));
    if (stableInventory(committed) !== stableInventory(inventory)) {
      failures.push(`${outPath} is stale; run npm run inventory:audit-coverage`);
    }
  } else {
    failures.push(`${outPath} is missing; run npm run inventory:audit-coverage`);
  }
  if (zeroCoveredRuntimeFiles.length > 0) {
    failures.push(
      `runtime source files with 0% line coverage: ${zeroCoveredRuntimeFiles.map((item) => item.file).join(", ")}`,
    );
  }

  if (failures.length > 0) {
    console.error(`[audit-coverage-inventory] FAIL\n- ${failures.join("\n- ")}`);
    process.exit(1);
  }

  console.error("[audit-coverage-inventory] OK");
}
