#!/usr/bin/env node
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const AUCTION_LIVE_BASE = "5cf9ba49eafdc19d2e8746bc877f33b08bad0dae";
// Shared cache, favorites and detail components are necessary auction dependencies.
// Pricing, account roles, checkout functions and the build configuration stay live.
export const AUCTION_SOURCE_OVERLAYS = Object.freeze([
  "functions/_publicListingProjection.ts",
  "functions/api/public/_cache.ts",
  "functions/api/public/auctions.ts",
  "src/components/auctions/AuctionCard.tsx",
  "src/hooks/useAuctionListings.ts",
  "src/hooks/useAuctionsPipeline.ts",
  "src/hooks/useFavorites.ts",
  "src/hooks/useListingReport.ts",
  "src/lib/auctionActionIdentity.ts",
  "src/locales/el.json",
  "src/locales/en.json",
  "src/pages/Auctions.tsx",
  "src/pages/PropertyDetail.tsx",
]);

const digest = bytes => createHash("sha256").update(bytes).digest("hex");
// Hooks export repository-local Git variables. A caller-selected repository must
// never inherit those paths (particularly when a test creates a disposable repo).
export function auctionGitEnvironment(environment = process.env) {
  return Object.fromEntries(Object.entries(environment).filter(([name]) => !name.startsWith("GIT_")));
}
function run(repository, executable, args) {
  // Git Bash puts GNU tar first on PATH; it reads C: as a remote archive host.
  const binary = executable === "tar" && process.platform === "win32"
    ? join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe")
    : executable;
  const result = spawnSync(binary, args, { cwd: repository, env: auctionGitEnvironment(), windowsHide: true, maxBuffer: 32 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${executable} failed: ${result.stderr.toString()}`);
  return result.stdout;
}
function tree(repository, sha) {
  const records = run(repository, "git", ["ls-tree", "-rz", sha]).toString().split("\0").filter(Boolean);
  return new Map(records.map(record => {
    const match = record.match(/^(100644|100755) blob ([a-f0-9]{40})\t(.+)$/s);
    if (!match || match[3].startsWith("/") || match[3].split("/").some(part => !part || part === "..") || match[3].includes("\\")) {
      throw new Error("Source tree contains an unsupported path or file mode");
    }
    return [match[3], match[2]];
  }));
}

export function prepareAuctionSource({ repository, baseSha, sourceSha, output }) {
  for (const sha of [baseSha, sourceSha]) {
    if (!/^[a-f0-9]{40}$/.test(sha ?? "")) throw new Error("Source identity requires a full 40-character SHA");
  }
  repository = resolve(repository); output = resolve(output);
  if (existsSync(output) || existsSync(`${output}.manifest.json`)) throw new Error("Output already exists; use a fresh directory");
  const baseline = tree(repository, baseSha);
  const candidate = tree(repository, sourceSha);
  for (const path of AUCTION_SOURCE_OVERLAYS) {
    if (!candidate.has(path)) throw new Error(`Missing auction source: ${path}`);
  }
  mkdirSync(output, { recursive: true });
  const archive = join(output, "source.tar");
  run(repository, "git", ["archive", "--format=tar", `--output=${archive}`, baseSha]);
  run(repository, "tar", ["-xf", archive, "-C", output]);
  rmSync(archive);
  const expected = new Map(baseline);
  for (const path of AUCTION_SOURCE_OVERLAYS) {
    const bytes = run(repository, "git", ["show", `${sourceSha}:${path}`]);
    const target = join(output, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, bytes);
    expected.set(path, candidate.get(path));
  }
  const files = [...expected].sort(([a], [b]) => a.localeCompare(b)).map(([path, blob]) => {
    const target = join(output, path);
    let bytes = existsSync(target) ? readFileSync(target) : null;
    const gitBlob = value => value && createHash("sha1").update(`blob ${value.length}\0`).update(value).digest("hex");
    // export-subst/export-ignore may transform git archives. Recover exact blobs,
    // including ignored archive paths, rather than silently accepting that drift.
    if (gitBlob(bytes) !== blob) {
      bytes = run(repository, "git", ["cat-file", "blob", blob]);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, bytes);
    }
    const actualBlob = gitBlob(bytes);
    if (actualBlob !== blob) throw new Error(`Prepared source differs from its committed input: ${path}`);
    return { path, sha256: digest(bytes), git_blob: blob };
  });
  const manifest = {
    schema_version: 1,
    scope: "auction-only-source-preparation",
    base_sha: baseSha,
    source_sha: sourceSha,
    changed_paths: AUCTION_SOURCE_OVERLAYS.filter(path => candidate.get(path) !== baseline.get(path)).slice().sort(),
    source_sha256: digest(JSON.stringify(files)),
    files,
  };
  writeFileSync(`${output}.manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const output = process.argv[2];
  if (!output || process.argv.length !== 3) throw new Error("Usage: node scripts/prepare-auction-only-source.mjs <new-output-directory>");
  const repository = process.cwd();
  const sourceSha = run(repository, "git", ["rev-parse", "HEAD"]).toString().trim();
  const result = prepareAuctionSource({ repository, sourceSha, baseSha: AUCTION_LIVE_BASE, output });
  console.log(JSON.stringify({ base_sha: result.base_sha, source_sha: result.source_sha, changed_paths: result.changed_paths, source_sha256: result.source_sha256 }, null, 2));
}
