// Quick coverage analyzer (not used in CI). Reads coverage/coverage-summary.json
// and prints (a) low-coverage essential files and (b) per-area roll-ups so we
// know where to focus next.
import fs from "node:fs";
import path from "node:path";

const summaryPath = path.resolve("coverage/coverage-summary.json");
if (!fs.existsSync(summaryPath)) {
  console.error("missing", summaryPath);
  process.exit(1);
}
const data = JSON.parse(fs.readFileSync(summaryPath, "utf8"));

const ROOT = path.resolve(".") + path.sep;
function rel(abs) {
  return abs.replace(ROOT, "").replaceAll("\\", "/");
}

const ESSENTIAL = /^src\/(contexts|hooks|lib|pages|components)\//;
function area(p) {
  const m = p.match(/^src\/([^/]+)/);
  return m ? m[1] : "other";
}

const rows = Object.entries(data)
  .filter(([k]) => k !== "total")
  .map(([k, v]) => ({
    f: rel(k),
    lines: v.lines.pct,
    branches: v.branches.pct,
    functions: v.functions.pct,
    loc: v.lines.total,
  }));

const essential = rows.filter((r) => ESSENTIAL.test(r.f));
essential.sort((a, b) => a.lines - b.lines);

console.log(`\n=== ESSENTIAL files (loc>=30) below 75% lines, lowest first ===`);
console.log("lines%  func%  loc    file");
essential
  .filter((r) => r.loc >= 30 && r.lines < 75)
  .slice(0, 50)
  .forEach((r) =>
    console.log(
      r.lines.toFixed(1).padStart(5) +
        "%  " +
        r.functions.toFixed(1).padStart(4) +
        "%  " +
        String(r.loc).padStart(5) +
        "  " +
        r.f,
    ),
  );

console.log(`\n=== Per-area roll-up (line coverage) ===`);
const byArea = {};
for (const r of rows) {
  const a = area(r.f);
  if (!byArea[a]) byArea[a] = { files: 0, loc: 0, coveredLoc: 0 };
  byArea[a].files++;
  byArea[a].loc += r.loc;
  byArea[a].coveredLoc += (r.loc * r.lines) / 100;
}
Object.entries(byArea)
  .sort()
  .forEach(([a, d]) => {
    const pct = ((100 * d.coveredLoc) / Math.max(1, d.loc)).toFixed(1);
    console.log(
      a.padEnd(14) + " files:" + String(d.files).padStart(4) +
        "  loc:" + String(d.loc).padStart(6) +
        "  lines%:" + pct.padStart(5),
    );
  });

console.log(`\n=== ESSENTIAL totals (only files in pages|components|contexts|hooks|lib) ===`);
const totLoc = essential.reduce((s, r) => s + r.loc, 0);
const totCov = essential.reduce((s, r) => s + (r.loc * r.lines) / 100, 0);
const at75 = essential.filter((r) => r.lines >= 75).length;
const above0 = essential.filter((r) => r.lines > 0).length;
console.log("Files:           ", essential.length);
console.log("Files >= 75%:    ", at75);
console.log("Files >  0%:     ", above0);
console.log("Files at 0%:     ", essential.length - above0);
console.log("Weighted lines%: ", ((100 * totCov) / Math.max(1, totLoc)).toFixed(2) + "%");
