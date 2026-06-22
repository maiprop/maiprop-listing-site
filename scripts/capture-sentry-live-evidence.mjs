import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REQUIRED_ENV = ["SENTRY_AUTH_TOKEN", "SENTRY_ORG", "SENTRY_PROJECT"];
const DEFAULT_OUT = "artifacts/compliance/live-evidence/sentry-live-evidence.json";

export const validateSentryEnv = (env = process.env) => REQUIRED_ENV.filter((name) => !env[name]);

export const redactSentryText = (value) => {
  if (value === null || value === undefined) return value;
  return String(value)
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted-email]")
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[redacted-ip]");
};

const redactTags = (tags = []) => {
  const mapped = {};
  for (const tag of tags) {
    if (!tag?.key) continue;
    mapped[tag.key] = redactSentryText(tag.value ?? "");
  }
  return mapped;
};

const normalizeIssue = (issue) => ({
  id: String(issue.id ?? ""),
  shortId: String(issue.shortId ?? issue.short_id ?? ""),
  title: redactSentryText(issue.title ?? ""),
  status: String(issue.status ?? ""),
  count: Number.parseInt(issue.count ?? "0", 10) || 0,
  firstSeen: issue.firstSeen ?? issue.first_seen ?? null,
  lastSeen: issue.lastSeen ?? issue.last_seen ?? null,
  permalink: issue.permalink ?? null,
  tags: redactTags(issue.tags ?? []),
});

export async function buildSentryEvidence({
  env = process.env,
  fetchImpl = globalThis.fetch,
  now = () => new Date(),
} = {}) {
  const queriedAt = now().toISOString();
  const missingEnv = validateSentryEnv(env);
  const environment = env.SENTRY_ENVIRONMENT || "production";
  const timeRange = env.SENTRY_TIME_RANGE || "24h";
  const limit = Math.min(Number.parseInt(env.SENTRY_ISSUE_LIMIT || "20", 10) || 20, 50);

  if (missingEnv.length > 0) {
    return {
      provider: "sentry",
      status: "unconfigured",
      queriedAt,
      missingEnv,
      environment,
      timeRange,
      issueCount: 0,
      issues: [],
    };
  }

  const url = new URL(`https://sentry.io/api/0/projects/${env.SENTRY_ORG}/${env.SENTRY_PROJECT}/issues/`);
  url.searchParams.set("environment", environment);
  url.searchParams.set("statsPeriod", timeRange);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("query", env.SENTRY_QUERY || "is:unresolved");

  const response = await fetchImpl(url, {
    headers: {
      Authorization: `Bearer ${env.SENTRY_AUTH_TOKEN}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    return {
      provider: "sentry",
      status: "failed",
      queriedAt,
      environment,
      timeRange,
      httpStatus: response.status,
      issueCount: 0,
      issues: [],
    };
  }

  const issues = (await response.json()).slice(0, limit).map(normalizeIssue);
  return {
    provider: "sentry",
    status: "captured",
    queriedAt,
    environment,
    timeRange,
    issueCount: issues.length,
    issues,
  };
}

const parseArgs = (argv) => {
  const args = { out: DEFAULT_OUT, strict: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--strict") args.strict = true;
    if (arg === "--out") args.out = argv[index + 1] ?? args.out;
  }
  return args;
};

const writeJson = (path, value) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  const evidence = await buildSentryEvidence();
  writeJson(join(process.cwd(), args.out), evidence);

  if (args.strict && evidence.status !== "captured") {
    process.stderr.write(`Sentry live evidence is ${evidence.status}\n`);
    process.exitCode = 1;
    return;
  }

  process.stdout.write(`Sentry live evidence ${evidence.status}: ${args.out}\n`);
};

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(fileURLToPath(import.meta.url)).href &&
  process.argv[1].endsWith("capture-sentry-live-evidence.mjs")
) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
