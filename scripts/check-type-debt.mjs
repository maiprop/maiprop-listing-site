import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..");
const baselinePath = resolve(repoRoot, "scripts/type-debt-baseline.json");
const shouldUpdateBaseline = process.argv.includes("--update-baseline");

const ROOTS = ["src", "functions", "supabase/functions", "remotion-video/src"];
const EXTENSIONS = new Set([".ts", ".tsx"]);
const IGNORED_SEGMENTS = new Set(["node_modules", "dist", "coverage"]);
const IGNORED_SUFFIXES = [
  ".test.ts",
  ".test.tsx",
  ".spec.ts",
  ".spec.tsx",
  `${sep}src${sep}integrations${sep}supabase${sep}types.ts`,
];

const TYPE_DEBT_PATTERNS = [
  {
    name: "no-explicit-any-disable",
    regex: /eslint-disable(?:-next-line)?\s+@typescript-eslint\/no-explicit-any/g,
  },
  {
    name: "explicit-any",
    regex: /\bas\s+any\b|:\s*any\b|<any\b|Record<[^>\n]*,\s*any>|ComponentType<any>|any\[\]/g,
  },
  {
    name: "ts-ignore",
    regex: /@ts-ignore|@ts-expect-error/g,
  },
];

function extensionOf(file) {
  const match = file.match(/\.[^.]+$/);
  return match?.[0] ?? "";
}

function shouldSkip(fullPath) {
  const parts = fullPath.split(sep);
  if (parts.some((part) => IGNORED_SEGMENTS.has(part))) return true;
  return IGNORED_SUFFIXES.some((suffix) => fullPath.endsWith(suffix));
}

function collectFiles(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const fullPath = resolve(dir, entry);
    if (shouldSkip(fullPath)) continue;
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      collectFiles(fullPath, files);
    } else if (EXTENSIONS.has(extensionOf(entry))) {
      files.push(fullPath);
    }
  }
  return files;
}

function scanFile(file) {
  const content = readFileSync(file, "utf8");
  const findings = [];
  for (const pattern of TYPE_DEBT_PATTERNS) {
    const matches = content.match(pattern.regex) ?? [];
    if (matches.length > 0) {
      findings.push({ name: pattern.name, count: matches.length });
    }
  }
  return findings;
}

function scan() {
  const files = ROOTS.flatMap((root) => collectFiles(resolve(repoRoot, root))).sort();
  const byFile = [];
  const byPattern = Object.fromEntries(TYPE_DEBT_PATTERNS.map((pattern) => [pattern.name, 0]));

  for (const file of files) {
    const findings = scanFile(file);
    if (findings.length === 0) continue;
    const total = findings.reduce((sum, finding) => sum + finding.count, 0);
    for (const finding of findings) byPattern[finding.name] += finding.count;
    byFile.push({
      file: relative(repoRoot, file).replaceAll("\\", "/"),
      total,
      findings,
    });
  }

  return {
    generated_at: new Date().toISOString(),
    total: byFile.reduce((sum, file) => sum + file.total, 0),
    by_pattern: byPattern,
    files: byFile.sort((a, b) => b.total - a.total || a.file.localeCompare(b.file)),
  };
}

const current = scan();

if (shouldUpdateBaseline) {
  writeFileSync(`${baselinePath}`, `${JSON.stringify(current, null, 2)}\n`);
  console.log(`[check-type-debt] Baseline updated: ${current.total} finding(s).`);
  process.exit(0);
}

const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
const delta = current.total - baseline.total;

console.log(`[check-type-debt] Current: ${current.total}; baseline: ${baseline.total}; delta: ${delta}`);
for (const file of current.files.slice(0, 10)) {
  const summary = file.findings.map((finding) => `${finding.name}=${finding.count}`).join(", ");
  console.log(`- ${file.file}: ${file.total} (${summary})`);
}

if (delta > 0) {
  console.error(
    `[check-type-debt] Type debt increased by ${delta}. Reduce the new debt or intentionally update ${relative(repoRoot, baselinePath)}.`,
  );
  process.exit(1);
}

if (delta < 0) {
  console.log("[check-type-debt] Type debt decreased. Update the baseline when this batch is ready.");
}
