/**
 * One-shot migration script: adds a file-level eslint-disable for
 * @typescript-eslint/no-explicit-any to all files that currently violate the
 * rule. Run once after upgrading the rule from "warn" to "error".
 *
 * Usage: node scripts/suppress-any-legacy.mjs
 */
import { execSync } from "child_process";
import { readFileSync, writeFileSync, existsSync } from "fs";

const MARKER = "/* eslint-disable @typescript-eslint/no-explicit-any */";
const RULE = "no-explicit-any";

let lint;
try {
  lint = execSync("npm run lint 2>&1", { encoding: "utf8" });
} catch (e) {
  lint = e.stdout ?? e.message;
}
const lines = lint.split("\n");

const files = new Set();
let currentFile = null;

for (const line of lines) {
  // Windows absolute path lines start the file block
  if (/^[A-Z]:\\/.test(line) && (line.endsWith(".ts") || line.endsWith(".tsx"))) {
    currentFile = line.trim();
  } else if (currentFile && line.includes(RULE)) {
    files.add(currentFile);
  }
}

let patched = 0;
for (const f of files) {
  if (!existsSync(f)) continue;
  const content = readFileSync(f, "utf8");
  if (content.includes(MARKER)) continue;
  writeFileSync(f, MARKER + "\n" + content);
  patched++;
  console.log("  patched:", f.replace(process.cwd() + "\\", ""));
}
console.log(`\nDone — suppressed legacy 'as any' in ${patched} files.`);
console.log("These files are now tracked as type-debt. Fix them incrementally.");
