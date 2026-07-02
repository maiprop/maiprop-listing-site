#!/usr/bin/env node
/* eslint complexity: "off" */
const { execFileSync } = require("node:child_process");
const { appendFileSync, existsSync, readFileSync } = require("node:fs");
const { join } = require("node:path");
const { loadLocalEnv } = require("./_load-local-env.cjs");

loadLocalEnv();

const root = process.cwd();
const strictMode = process.argv.includes("--strict");
const allowTransientUnavailable = process.argv.includes("--allow-transient-unavailable");
const targetPath = join(root, "src", "integrations", "supabase", "types.ts");
const projectId = process.env.STAGING_SUPABASE_PROJECT_ID ||
  process.env.SUPABASE_PROJECT_REF ||
  process.env.VITE_SUPABASE_PROJECT_ID ||
  "";

const token = process.env.SUPABASE_ACCESS_TOKEN || "";

const normalize = (text) => `${text.replace(/\r\n/g, "\n").trimEnd()}\n`;
const writeStderr = (message) => process.stderr.write(`${message}\n`);
const retryDelayMs = 2000;

const sleep = (ms) => {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
};

const errorOutput = (error) => [
  error?.stderr?.toString?.() ?? "",
  error?.stdout?.toString?.() ?? "",
  error?.message ?? "",
].filter(Boolean).join("\n");

const isTransientTypesFailure = (message) =>
  /error code:\s*(?:520|522|524|504)|connection terminated|connection timeout|i\/o timeout|timed out|timeout|econnreset|etimedout|PGRST002|Could not query the database for the schema cache/i.test(
    String(message),
  );

const appendSummary = (lines) => {
  if (!process.env.GITHUB_STEP_SUMMARY) return;
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join("\n")}\n`);
};

const localSupabasePath = () =>
  process.platform === "win32"
    ? join(root, "node_modules", ".bin", "supabase.cmd")
    : join(root, "node_modules", ".bin", "supabase");

const localSupabaseJsPath = () => join(root, "node_modules", "supabase", "dist", "supabase.js");

const findWindowsSupabase = () => {
  if (process.platform !== "win32") return null;

  try {
    return execFileSync("where.exe", ["supabase"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .sort((a, b) => {
        const aRunnable = /\.(?:cmd|exe)$/i.test(a) ? 0 : 1;
        const bRunnable = /\.(?:cmd|exe)$/i.test(b) ? 0 : 1;
        return aRunnable - bRunnable;
      })[0] ?? null;
  } catch {
    return null;
  }
};

// skipcq: JS-R1005
const supabaseCommand = () => {
  const localJs = localSupabaseJsPath();
  if (existsSync(localJs)) return { command: process.execPath, prefixArgs: [localJs], shell: false };

  const localBin = localSupabasePath();
  if (existsSync(localBin)) return { command: localBin, prefixArgs: [], shell: process.platform === "win32" };

  const windowsBin = findWindowsSupabase();
  if (windowsBin) return { command: windowsBin, prefixArgs: [], shell: process.platform === "win32" };

  return {
    command: process.platform === "win32" ? "npx.cmd" : "npx",
    prefixArgs: ["supabase"],
    shell: process.platform === "win32",
  };
};

if (!projectId || !token) {
  const missing = [
    !projectId ? "STAGING_SUPABASE_PROJECT_ID/SUPABASE_PROJECT_REF/VITE_SUPABASE_PROJECT_ID" : null,
    !token ? "SUPABASE_ACCESS_TOKEN" : null,
  ].filter(Boolean).join(", ");
  const message = `[supabase-types] skipped live freshness check; missing ${missing}`;
  if (strictMode || process.env.CI === "true") {
    writeStderr(message);
    process.exit(1);
  }
  writeStderr(message);
  process.exit(0);
}

const { command, prefixArgs, shell } = supabaseCommand();
let generated = "";
let lastTransientError = "";
for (let attempt = 1; attempt <= 2; attempt += 1) {
  try {
    generated = execFileSync(
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
        shell,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    break;
  } catch (error) {
    const detail = errorOutput(error);
    if (!isTransientTypesFailure(detail)) throw error;

    lastTransientError = detail;
    if (attempt < 2) {
      writeStderr(`[supabase-types] transient generated-types retrieval failed on attempt ${attempt}; retrying`);
      sleep(retryDelayMs);
      continue;
    }

    if (allowTransientUnavailable) {
      writeStderr("[supabase-types] generated types check was transiently unavailable; keeping committed types as release evidence.");
      writeStderr(lastTransientError);
      appendSummary([
        "## Supabase Generated Types",
        "",
        "Live generated types could not be retrieved because Supabase returned a transient timeout/error response.",
        "",
        "This does not suppress stale-type failures when live types are retrieved successfully.",
        "",
      ]);
      process.exit(0);
    }

    throw error;
  }
}

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
