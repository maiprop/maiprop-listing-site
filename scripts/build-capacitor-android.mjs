import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

const args = new Set(process.argv.slice(2));
const release = args.has("--release");
const bundled = args.has("--bundled");
const syncOnly = args.has("--sync-only");
const root = process.cwd();
const isWindows = process.platform === "win32";
const nodeBin = dirname(process.execPath);
const npmCmd = join(nodeBin, isWindows ? "npm.cmd" : "npm");
const npxCmd = join(nodeBin, isWindows ? "npx.cmd" : "npx");
const gradleCmd = join(root, "android", isWindows ? "gradlew.bat" : "gradlew");

function run(command, commandArgs, options = {}) {
  const commandLine = isWindows ? [command, ...commandArgs].map((part) => `"${part.replace(/"/g, '\\"')}"`).join(" ") : command;
  const result = spawnSync(commandLine, isWindows ? [] : commandArgs, {
    cwd: options.cwd ?? root,
    env: {
      ...process.env,
      CAPACITOR_BUNDLED_WEB: bundled ? "true" : "false",
      CAPACITOR_SERVER_URL: process.env.CAPACITOR_SERVER_URL || "https://maiprop.co",
      ...(options.env ?? {}),
    },
    stdio: "inherit",
    shell: isWindows,
  });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

if (bundled) {
  run(npmCmd, ["run", "build"]);
} else if (!existsSync(join(root, "capacitor-fallback", "index.html"))) {
  throw new Error("Missing capacitor-fallback/index.html");
}

run(npxCmd, ["cap", "sync", "android"]);

if (!syncOnly) {
  run(gradleCmd, [release ? "assembleRelease" : "assembleDebug", "--no-daemon", "--console=plain"], {
    cwd: join(root, "android"),
  });
}
