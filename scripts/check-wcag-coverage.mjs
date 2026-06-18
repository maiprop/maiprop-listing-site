#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const result = (failures, summary = {}) => ({ ok: failures.length === 0, failures, summary });

const readText = (root, relativePath) => {
  const path = join(root, relativePath);
  if (!existsSync(path)) return null;
  return readFileSync(path, "utf8");
};

const extractArrayCount = (text, constName) => {
  const match = text.match(new RegExp(`const\\s+${constName}\\s*=\\s*\\[([\\s\\S]*?)\\]`, "m"));
  if (!match) return 0;
  return [...match[1].matchAll(/["']\/[^"']*["']/g)].length;
};

export function checkWcagCoverage(root = process.cwd()) {
  const failures = [];
  const accessibilitySpec = readText(root, "e2e/accessibility.spec.ts");
  const lighthouseConfig = readText(root, ".lighthouserc.json");
  const lighthouseDoc = readText(root, "docs/LIGHTHOUSE_CI_SETUP.md");

  if (accessibilitySpec === null) {
    return result(["e2e/accessibility.spec.ts is missing"], { axeRoutes: 0 });
  }

  const axeRoutes = extractArrayCount(accessibilitySpec, "AXE_SCAN_ROUTES");
  const landmarkRoutes = extractArrayCount(accessibilitySpec, "LANDMARK_ROUTES");
  if (axeRoutes < 10) failures.push("AXE_SCAN_ROUTES must cover at least 10 public critical routes");
  if (landmarkRoutes < 8) failures.push("LANDMARK_ROUTES must cover at least 8 public routes");

  for (const marker of ["wcag2a", "wcag2aa", "serious", "critical", "skip-to-content"]) {
    if (!accessibilitySpec.includes(marker)) failures.push(`accessibility spec must include ${marker}`);
  }

  if (lighthouseConfig === null) {
    failures.push(".lighthouserc.json is missing");
  } else {
    for (const marker of ["categories:accessibility", "\"minScore\": 0.90", "\"cumulative-layout-shift\""]) {
      if (!lighthouseConfig.includes(marker)) failures.push(`Lighthouse config must include ${marker}`);
    }
  }

  if (lighthouseDoc === null || !lighthouseDoc.includes("categories:accessibility")) {
    failures.push("docs/LIGHTHOUSE_CI_SETUP.md must document accessibility thresholds");
  }

  return result(failures, { axeRoutes, landmarkRoutes });
}

const main = () => {
  const check = checkWcagCoverage(process.cwd());
  if (!check.ok) {
    for (const failure of check.failures) process.stderr.write(`${failure}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write("WCAG coverage evidence OK\n");
};

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(fileURLToPath(import.meta.url)).href &&
  process.argv[1].endsWith("check-wcag-coverage.mjs")
) {
  main();
}
