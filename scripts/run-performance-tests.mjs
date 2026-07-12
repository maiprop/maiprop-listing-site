import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const DEFAULT_SUPABASE_URL = "https://abcdefghijklmnopqrst.supabase.co";
const DEFAULT_SUPABASE_KEY = "sb_publishable_e2e_placeholder_not_real_000000000000";

export function buildPerformanceEnvironment(source = process.env) {
  const publishableKey =
    source.VITE_SUPABASE_PUBLISHABLE_KEY ??
    source.VITE_SUPABASE_ANON_KEY ??
    DEFAULT_SUPABASE_KEY;

  return {
    ...source,
    MAIPROP_RUNNING_PERF_GATE: "1",
    VITE_SUPABASE_URL:
      source.VITE_SUPABASE_URL ?? source.VITE_SUPABASE_PROJECT_URL ?? DEFAULT_SUPABASE_URL,
    VITE_SUPABASE_PUBLISHABLE_KEY: publishableKey,
    VITE_SUPABASE_ANON_KEY: source.VITE_SUPABASE_ANON_KEY ?? publishableKey,
  };
}

function runNodeCli(cliPath, args, env) {
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

export function runPerformanceTests(source = process.env) {
  const env = buildPerformanceEnvironment(source);
  const npmCli = source.npm_execpath;
  if (!npmCli) throw new Error("npm_execpath is required; run this command through npm run test:perf.");

  const buildStatus = runNodeCli(npmCli, ["run", "build"], env);
  if (buildStatus !== 0) return buildStatus;

  return runNodeCli(
    npmCli,
    [
      "exec",
      "--",
      "playwright",
      "test",
      "e2e/performance-gates.spec.ts",
      "e2e/query-budget-gates.spec.ts",
      "--project=chromium",
    ],
    env,
  );
}

const entrypoint = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === entrypoint) {
  process.exitCode = runPerformanceTests();
}
