import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

function parseVersion(raw) {
  const match = String(raw).trim().match(/^v?(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    raw: String(raw).trim(),
  };
}

function atLeast(version, major, minor, patch) {
  if (version.major !== major) return version.major > major;
  if (version.minor !== minor) return version.minor > minor;
  return version.patch >= patch;
}

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

const node = parseVersion(process.version);
const npm = parseVersion(execSync("npm --version", { encoding: "utf8" }));

if (!node || node.major !== 20 || !atLeast(node, 20, 19, 0)) {
  fail(
    `Node runtime mismatch: found ${process.version}, expected ${pkg.engines.node}. ` +
      "Run `nvm use`, `fnm use`, or use the project Dockerfile.",
  );
}

if (!npm || npm.major !== 10 || !atLeast(npm, 10, 8, 0)) {
  fail(
    `npm runtime mismatch: found ${npm?.raw ?? "unknown"}, expected ${pkg.engines.npm}. ` +
      "Use the npm bundled with Node 20.19.5 or install npm@10.8.2.",
  );
}

if (pkg.packageManager !== "npm@10.8.2") {
  fail(`packageManager drift: found ${pkg.packageManager}, expected npm@10.8.2.`);
}

if (!process.exitCode) {
  console.log(`Runtime OK: Node ${node.raw}, npm ${npm.raw}`);
}
