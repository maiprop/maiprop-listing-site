/**
 * Production pooler URL helpers for the release ceremony.
 *
 * Direct db.<ref>.supabase.co connections are IPv6-only and unreachable from
 * hosted runners, so the production database workflow resolves a Supabase
 * pooler endpoint instead. Kept as a module (not an inline heredoc) so the
 * URL building stays unit-tested and the workflow Bash stays parseable.
 */

const PROJECT_REF = "qvvicunqcrwpioqnvzxf";
const REGION_RE = /^[a-z0-9-]+$/;
const PORT_RE = /^(5432|6543)$/;

export function readApiRegion(projectJsonText) {
  let project;
  try {
    project = JSON.parse(String(projectJsonText ?? ""));
  } catch {
    throw new Error("Production project response is not valid JSON.");
  }
  const region = String(project?.region ?? "");
  if (!REGION_RE.test(region)) {
    throw new Error("Could not resolve the production Supabase region.");
  }
  return region;
}

export function buildPoolerUrl({ password, hostname, port }) {
  if (!password) throw new Error("Production database password is empty.");
  if (!/^(?:[a-z0-9-]+\.)+pooler\.supabase\.com$/.test(String(hostname ?? ""))) {
    throw new Error(`Refusing unexpected pooler hostname: ${hostname}`);
  }
  if (!PORT_RE.test(String(port ?? ""))) {
    throw new Error(`Refusing unexpected pooler port: ${port}`);
  }
  // Assign the raw password: the URL serializer percent-encodes it exactly
  // once. Pre-encoding here would double-encode and break authentication.
  const url = new URL("postgresql://postgres:postgres@example.invalid/postgres");
  url.username = `postgres.${PROJECT_REF}`;
  url.password = password;
  url.hostname = hostname;
  url.port = String(port);
  url.search = "?sslmode=require&connect_timeout=5";
  return url.toString();
}

function printUsageAndThrow() {
  throw new Error(
    "Usage: resolve-production-pooler-url.mjs region | url --host <pooler-host> --port <5432|6543>",
  );
}

async function main(argv = process.argv.slice(2)) {
  const [command, ...rest] = argv;
  if (command === "region") {
    const { readFileSync } = await import("node:fs");
    const file = process.env.PROJECT_JSON_FILE;
    if (!file) throw new Error("PROJECT_JSON_FILE is required.");
    process.stdout.write(readApiRegion(readFileSync(file, "utf8")));
    return;
  }
  if (command === "url") {
    let host;
    let port;
    for (let i = 0; i < rest.length; i += 1) {
      if (rest[i] === "--host") host = rest[i + 1];
      if (rest[i] === "--port") port = rest[i + 1];
    }
    if (!host || !port) printUsageAndThrow();
    process.stdout.write(buildPoolerUrl({
      password: process.env.DB_PASSWORD ?? "",
      hostname: host,
      port,
    }));
    return;
  }
  printUsageAndThrow();
}

const invokedAsScript = Boolean(
  process.argv[1] && process.argv[1].endsWith("resolve-production-pooler-url.mjs"),
);

if (invokedAsScript) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
