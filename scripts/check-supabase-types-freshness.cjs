#!/usr/bin/env node
const { execFileSync } = require("node:child_process");
const { existsSync, readFileSync } = require("node:fs");
const { join } = require("node:path");

const root = process.cwd();
const strictMode = process.argv.includes("--strict");
const targetPath = join(root, "src", "integrations", "supabase", "types.ts");
const projectId = process.env.STAGING_SUPABASE_PROJECT_ID ||
  process.env.SUPABASE_PROJECT_REF ||
  process.env.VITE_SUPABASE_PROJECT_ID ||
  "";

const token = process.env.SUPABASE_ACCESS_TOKEN || "";

const normalize = (text) => `${text.replace(/\r\n/g, "\n").trimEnd()}\n`;
const writeStderr = (message) => process.stderr.write(`${message}\n`);

const supabaseCommand = () => { // skipcq: JS-R1005 - Windows/Linux Supabase CLI resolution needs a few explicit fallbacks.
  const localBin = process.platform === "win32"
    ? join(root, "node_modules", "supabase", "bin", "supabase.exe")
    : join(root, "node_modules", ".bin", "supabase");
  if (existsSync(localBin)) return { command: localBin, prefixArgs: [] };

  if (process.platform === "win32") {
    try {
      const found = execFileSync("where.exe", ["supabase"], {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      })
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find(Boolean);
      if (found) return { command: found, prefixArgs: [] };
    } catch {
      // Fall through to npx below.
    }
  }

  return {
    command: process.platform === "win32" ? "npx.cmd" : "npx",
    prefixArgs: ["supabase"],
  };
};

if (!projectId || !token) {
  const missing = [
    !projectId ? "STAGING_SUPABASE_PROJECT_ID/SUPABASE_PROJECT_REF/VITE_SUPABASE_PROJECT_ID" : null,
    !token ? "SUPABASE_ACCESS_TOKEN" : null,
  ].filter(Boolean).join(", ");
  const message = `[supabase-types] skipped live freshness check; missing ${missing}`;
  if (strictMode) {
    writeStderr(message);
    process.exit(1);
  }
  writeStderr(message);
  process.exit(0);
}

const { command, prefixArgs } = supabaseCommand();
const generated = execFileSync(
  command,
  [
    ...prefixArgs,
    "gen",
    "types",
    "--lang=typescript",
    "--project-id",
    projectId,
    "--schema",
    "public",
  ],
  {
    cwd: root,
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  },
);

const current = readFileSync(targetPath, "utf8");
if (normalize(current) !== normalize(generated)) {
  writeStderr(
    "[supabase-types] src/integrations/supabase/types.ts is stale for the configured Supabase project. Run:",
  );
  writeStderr(
    `  npx supabase gen types --lang=typescript --project-id ${projectId} --schema public > src/integrations/supabase/types.ts`,
  );
  process.exit(1);
}

writeStderr("[supabase-types] generated types match configured Supabase schema");
