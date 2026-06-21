#!/usr/bin/env node

import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = process.cwd();
const distDir = resolve(repoRoot, "dist");
const outDir = resolve(repoRoot, ".tmp", "cloudflare-pages-functions");
const generatedWorkerPath = resolve(outDir, "index.js");
const generatedWorkerFallbackPath = resolve(outDir, "_worker.js");
const generatedRoutesPath = resolve(outDir, "_routes.json");
const distWorkerPath = resolve(distDir, "_worker.js");
const distRoutesPath = resolve(distDir, "_routes.json");

if (!existsSync(distDir)) {
  console.error("dist/ does not exist. Run npm run build before packaging Pages Functions.");
  process.exit(1);
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const wranglerArgs = [
  "pages",
  "functions",
  "build",
  "functions",
  "--outdir",
  relative(repoRoot, outDir),
  "--output-routes-path",
  relative(repoRoot, generatedRoutesPath),
  "--compatibility-date",
  "2026-05-19",
];

const windowsQuote = (value) => {
  if (!/[ \t"&|<>^]/.test(value)) return value;
  return `"${value.replace(/"/g, '\\"')}"`;
};

const npxArgs = ["--yes", "wrangler", ...wranglerArgs];
const result =
  process.platform === "win32"
    ? spawnSync("cmd.exe", ["/d", "/s", "/c", `npx ${npxArgs.map(windowsQuote).join(" ")}`], {
        cwd: repoRoot,
        env: process.env,
        stdio: "inherit",
      })
    : spawnSync("npx", npxArgs, {
        cwd: repoRoot,
        env: process.env,
        stdio: "inherit",
      });

if (result.error) {
  console.error(`Failed to run Wrangler Pages Functions build: ${result.error.message}`);
  process.exit(1);
}

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

const actualGeneratedWorkerPath = existsSync(generatedWorkerPath) ? generatedWorkerPath : generatedWorkerFallbackPath;
if (!existsSync(actualGeneratedWorkerPath)) {
  console.error(
    `Wrangler did not generate ${relative(repoRoot, generatedWorkerPath)} or ${relative(repoRoot, generatedWorkerFallbackPath)}.`,
  );
  process.exit(1);
}
if (!existsSync(generatedRoutesPath)) {
  writeFileSync(
    generatedRoutesPath,
    JSON.stringify({
      version: 1,
      description: "Generated fallback by scripts/build-cloudflare-pages-worker.mjs",
      include: ["/*"],
      exclude: [],
    }, null, 2),
  );
}

const worker = readFileSync(actualGeneratedWorkerPath, "utf8");
if (!worker.includes('routePath: "/api/public/listings"')) {
  console.error("Generated Pages worker is missing the /api/public/listings route.");
  process.exit(1);
}
if (!worker.includes("env.ASSETS.fetch")) {
  console.error("Generated Pages worker is missing the ASSETS fallback.");
  process.exit(1);
}

const routes = JSON.parse(readFileSync(generatedRoutesPath, "utf8"));
if (!Array.isArray(routes.include) || !routes.include.includes("/*")) {
  console.error("Generated _routes.json must include /* for the Pages worker.");
  process.exit(1);
}

copyFileSync(actualGeneratedWorkerPath, distWorkerPath);
copyFileSync(generatedRoutesPath, distRoutesPath);

console.log(`Packaged Cloudflare Pages worker: ${relative(repoRoot, distWorkerPath)}`);
console.log(`Packaged Cloudflare Pages routes: ${relative(repoRoot, distRoutesPath)}`);
