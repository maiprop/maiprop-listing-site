#!/usr/bin/env node
const { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } = require("node:fs");
const { dirname, isAbsolute, join } = require("node:path");

const root = process.cwd();
const checkMode = process.argv.includes("--check");
const outArgIndex = process.argv.indexOf("--out");
const writeStdout = (message) => process.stdout.write(`${message}\n`);
const writeStderr = (message = "") => process.stderr.write(`${message}\n`);
let outPath = "";
if (outArgIndex >= 0) {
  const value = process.argv[outArgIndex + 1];
  if (!value || value.startsWith("-")) {
    writeStderr("[public-function-inventory] --out requires a non-empty output path");
    process.exit(1);
  }
  outPath = value;
}

const configPath = join(root, "supabase", "config.toml");
const functionRoot = join(root, "supabase", "functions");

const policies = {
  "ai-search": {
    status: "ready",
    caller: "signed-in browser",
    classification: "costly_ai",
    mechanisms: ["signed_in_quota", "fail_closed_quota"],
    requiredSnippets: ["enforceAiQuota(req", "recordAiCall", "failClosed: true"],
    notes: "verify_jwt is false for CORS/browser invocation, but handler requires a valid user token before provider work.",
  },
  "smart-filters": {
    status: "ready",
    caller: "signed-in browser",
    classification: "costly_ai",
    mechanisms: ["signed_in_quota", "fail_closed_quota"],
    requiredSnippets: ["enforceAiQuota(req", "recordAiCall", "failClosed: true"],
    notes: "Same quota contract as ai-search.",
  },
  "neighbourhood-report": {
    status: "ready",
    caller: "signed-in browser",
    classification: "costly_ai",
    mechanisms: ["signed_in_quota", "fail_closed_rate_limit", "bounded_payload"],
    requiredSnippets: ["enforceAiQuota(req", "recordAiCall", "failClosed: true"],
    notes: "AI neighbourhood report endpoint; handler requires an authenticated quota context before provider work.",
  },
  "property-pois": {
    status: "ready",
    caller: "signed-in browser",
    classification: "costly_ai",
    mechanisms: ["signed_in_quota", "fail_closed_rate_limit", "bounded_payload"],
    requiredSnippets: ["enforceAiQuota(req", "recordAiCall", "failClosed: true"],
    notes: "AI POI endpoint; CORS-compatible platform config is paired with handler-level quota and rate-limit gates.",
  },
  "property-valuation": {
    status: "ready",
    caller: "signed-in browser",
    classification: "costly_ai",
    mechanisms: ["signed_in_quota", "fail_closed_rate_limit", "bounded_payload"],
    requiredSnippets: ["enforceAiQuota(req", "recordAiCall", "failClosed: true"],
    notes: "AI valuation endpoint; signed-in quota enforcement runs before valuation generation.",
  },
  "sync-to-os": {
    status: "conditional",
    caller: "admin/operator",
    classification: "private_mutation_sync",
    mechanisms: ["bearer_user_auth", "admin_or_agent_authorization"],
    requiredSnippets: ["Missing or invalid Authorization header", "auth.getUser", "role"],
    notes: "High-impact sync path; must stay covered by Deno tests for missing/invalid auth.",
  },
  "receive-from-os": {
    status: "ready",
    caller: "external_os_webhook",
    classification: "webhook_mutation",
    mechanisms: ["hmac_signature", "shared_secret"],
    requiredSnippets: ["verifyHmacSignature", "x-os-signature", "MAIPROP_OS_WEBHOOK_SECRET"],
    notes: "Rejects unsigned OS webhook payloads before mutation.",
  },
  "poll-os-auctions": {
    status: "conditional",
    caller: "admin/operator or cron",
    classification: "private_mutation_sync",
    mechanisms: ["bearer_user_auth", "rate_limit"],
    requiredSnippets: ["makeRateLimiter", "Missing or invalid Authorization header", "auth.getUser"],
    notes: "Public platform JWT is disabled; handler auth and rate limit are the control plane.",
  },
  "sync-firesale-to-os": {
    status: "conditional",
    caller: "admin/operator",
    classification: "private_mutation_sync",
    mechanisms: ["bearer_user_auth", "admin_or_agent_authorization"],
    requiredSnippets: ["Missing or invalid Authorization header", "auth.getUser", "role"],
    notes: "Touches Quick Sale sync data; keep auth tests green.",
  },
  "full-sync-from-os": {
    status: "conditional",
    caller: "admin/operator or cron",
    classification: "bulk_private_sync",
    mechanisms: ["bearer_user_auth", "rate_limit"],
    requiredSnippets: ["makeRateLimiter", "Missing or invalid Authorization header", "auth.getUser"],
    notes: "Bulk sync blast radius; release review should inspect logs after deploy.",
  },
  "os-diagnose": {
    status: "ready",
    caller: "admin/operator",
    classification: "diagnostic",
    mechanisms: ["bearer_user_auth", "admin_authorization", "rate_limit", "sanitized_output"],
    requiredSnippets: ["makeRateLimiter", "auth.getUser", "Platform admin required"],
    notes: "Diagnostic output must never include upstream secrets or raw auth bodies.",
  },
  "send-saved-search-alerts": {
    status: "ready",
    caller: "cron",
    classification: "email_mutation",
    mechanisms: ["cron_secret"],
    requiredSnippets: ["CRON_SECRET", "verifyCronSecret", "Authorization"],
    notes: "Cron-only email job; browser callers must be rejected.",
  },
  "invitation-notify": {
    status: "ready",
    caller: "admin/operator",
    classification: "email_mutation",
    mechanisms: ["bearer_user_auth", "admin_authorization", "rate_limit"],
    requiredSnippets: ["makeRateLimiter", "auth.getUser", "is_platform_admin"],
    notes: "Admin-only notification sender.",
  },
  "os-sales-coordinates": {
    status: "ready",
    caller: "public browser",
    classification: "public_read_proxy",
    mechanisms: ["rate_limit", "bounded_query", "allowlisted_response_fields"],
    requiredSnippets: ["makeRateLimiter", "radius", "limit"],
    notes: "Public read endpoint; keep bounds and response allowlist intact.",
  },
  "ai-translate": {
    status: "ready",
    caller: "signed-in browser",
    classification: "costly_ai",
    mechanisms: ["bearer_user_auth", "rate_limit", "bounded_payload"],
    requiredSnippets: ["requireAuthenticatedUser(req", "MAX_TRANSLATION_KEYS", "makeRateLimiter"],
    notes: "verify_jwt is false for browser compatibility; handler requires auth.",
  },
  "stripe-webhook": {
    status: "ready",
    caller: "stripe",
    classification: "webhook_mutation",
    mechanisms: ["stripe_signature", "shared_secret"],
    requiredSnippets: ["stripe-signature", "STRIPE_WEBHOOK_SECRET", "constructEventAsync"],
    notes: "Signature verification must happen before event handling.",
  },
  "oh-registration-notify": {
    status: "ready",
    caller: "database webhook",
    classification: "email_mutation",
    mechanisms: ["shared_secret"],
    requiredSnippets: ["WEBHOOK_SECRET", "verifyWebhookSecret", "Authorization"],
    notes: "Database-triggered notification path.",
  },
  "auth-email-hook": {
    status: "ready",
    caller: "supabase_auth_hook",
    classification: "webhook_mutation",
    mechanisms: ["standard_webhook_signature", "shared_secret"],
    requiredSnippets: ["SEND_EMAIL_HOOK_SECRET", "standardwebhooks", "webhook.verify"],
    notes: "Supabase Auth send-email hook, plus secret-protected preview path.",
  },
  "streetview-proxy": {
    status: "conditional",
    caller: "public browser",
    classification: "public_proxy",
    mechanisms: ["rate_limit", "bounded_query"],
    requiredSnippets: ["makeRateLimiter", "lat", "lng"],
    notes: "Cost-control endpoint; rate limits and input bounds are required.",
  },
  "sitemap": {
    status: "ready",
    caller: "crawler/public",
    classification: "public_read",
    mechanisms: ["read_only_public_output"],
    requiredSnippets: ["sitemap"],
    notes: "SEO endpoint; no private payloads or mutations.",
  },
  "healthz": {
    status: "ready",
    caller: "public monitor/admin",
    classification: "coarse_public_health",
    mechanisms: ["coarse_public_response", "monitor_secret_for_details", "admin_for_details"],
    requiredSnippets: ["HEALTHZ_MONITOR_SECRET", "isAuthorizedAdmin", "detailed"],
    notes: "Public response is coarse; details require monitor secret or admin JWT.",
  },
  "csp-report": {
    status: "ready",
    caller: "browser_reporting_api",
    classification: "public_log_receiver",
    mechanisms: ["rate_limit", "bounded_payload", "no_private_response"],
    requiredSnippets: ["makeRateLimiter", "MAX_REPORT_BYTES", "tooManyRequestsResponse"],
    notes: "Write-only report collector with no response body.",
  },
  "fetch-os-auctions": {
    status: "ready",
    caller: "signed-in browser",
    classification: "private_read_proxy",
    mechanisms: ["bearer_user_auth", "fail_closed_rate_limit", "role_or_plan_authorization"],
    requiredSnippets: ["failClosed: true", "auth.getUser", "force_pro_access"],
    notes: "Public platform JWT is disabled; handler enforces caller eligibility.",
  },
  "record-listing-view": {
    status: "ready",
    caller: "public browser",
    classification: "public_analytics_mutation",
    mechanisms: ["rate_limit", "body_validation", "visibility_guarded_rpc"],
    requiredSnippets: ["makeRateLimiter", "record_listing_view", "listing_id"],
    notes: "RPC now guards active/public listing visibility before counting.",
  },
  "scheduled-followups": {
    status: "ready",
    caller: "cron",
    classification: "private_mutation_cron",
    mechanisms: ["cron_secret"],
    requiredSnippets: ["CRON_SECRET", "x-cron-secret"],
    notes: "Cron-only follow-up job; browser callers must be rejected.",
  },
  "process-storage-cleanup": {
    status: "ready",
    caller: "cron",
    classification: "private_mutation_cron",
    mechanisms: ["cron_secret", "service_role", "exact_object_path", "lease_token"],
    requiredSnippets: [
      "CRON_SECRET",
      "x-cron-secret",
      "claim_storage_cleanup_jobs",
      "prepare_storage_cleanup_delete",
    ],
    notes: "Cron-only exact-object compensating cleanup. Database leases and a final commitment check prevent stale workers from deleting committed listing or project media.",
  },
  "reconcile-role-switch-billing": {
    status: "ready",
    caller: "cron",
    classification: "private_mutation_cron",
    mechanisms: ["cron_secret", "service_role", "leased_rows", "bounded_retries"],
    requiredSnippets: [
      "CRON_SECRET",
      "x-cron-secret",
      "SUPABASE_SERVICE_ROLE_KEY",
      "RECONCILIATION_CLAIM_RPC",
      "MAX_RECONCILIATION_ATTEMPTS",
    ],
    notes: "Cron-only billing recovery worker with exact row leases and a bounded retry ceiling.",
  },
};

const read = (path) => {
  return readFileSync(path, "utf8");
};

const parseFunctionConfig = (toml) => {
  const functions = new Map();
  let current = null;
  for (const line of toml.split(/\r?\n/)) {
    const configLine = line.replace(/\s+#.*$/, "");
    const section = configLine.match(/^\s*\[functions\.([A-Za-z0-9_-]+)\]\s*$/);
    if (section) {
      current = section[1];
      functions.set(current, { verify_jwt: null });
      continue;
    }
    if (!current) continue;
    const verify = configLine.match(/^\s*verify_jwt\s*=\s*(true|false)\s*$/);
    if (verify) functions.get(current).verify_jwt = verify[1] === "true";
  }
  return functions;
};

const hasTest = (functionName) => {
  const dir = join(functionRoot, functionName);
  return existsSync(join(dir, "index.test.ts")) ||
    existsSync(join(dir, "webhook.test.ts"));
};

const readFunctionSource = (functionName) => {
  const dir = join(functionRoot, functionName);
  if (!existsSync(dir)) return "";

  const files = [];
  const visit = (currentDir) => {
    for (const entry of readdirSync(currentDir, { withFileTypes: true })) {
      const fullPath = join(currentDir, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!entry.name.endsWith(".ts") || entry.name.endsWith(".test.ts")) continue;
      files.push(fullPath);
    }
  };

  visit(dir);
  return files.sort().map(read).join("\n");
};

const collect = () => {
  const configured = parseFunctionConfig(read(configPath));
  const publicFunctions = [...configured.entries()]
    .filter(([, config]) => config.verify_jwt === false)
    .map(([name]) => name)
    .sort();

  const entries = publicFunctions.map((name) => {
    const policy = policies[name] ?? null;
    const indexPath = join(functionRoot, name, "index.ts");
    const source = readFunctionSource(name);
    const missingSnippets = policy
      ? policy.requiredSnippets.filter((snippet) => !source.includes(snippet))
      : [];
    return {
      name,
      source: existsSync(indexPath),
      has_test: hasTest(name),
      ...policy,
      missing_required_snippets: missingSnippets,
    };
  });

  return {
    generated_at: new Date().toISOString(),
    public_function_count: publicFunctions.length,
    entries,
    unclassified: entries.filter((entry) => !entry.classification).map((entry) => entry.name),
    missing_source: entries.filter((entry) => !entry.source).map((entry) => entry.name),
    missing_required_snippets: entries
      .filter((entry) => entry.missing_required_snippets.length > 0)
      .map((entry) => ({
        name: entry.name,
        missing: entry.missing_required_snippets,
      })),
    without_tests: entries
      .filter((entry) =>
        !entry.has_test &&
        !["public_read", "coarse_public_health"].includes(entry.classification ?? "")
      )
      .map((entry) => entry.name),
  };
};

const inventory = collect();

if (outPath) {
  const fullOut = isAbsolute(outPath) ? outPath : join(root, outPath);
  mkdirSync(dirname(fullOut), { recursive: true });
  writeFileSync(fullOut, `${JSON.stringify(inventory, null, 2)}\n`);
}

writeStdout(JSON.stringify({
  public_function_count: inventory.public_function_count,
  unclassified: inventory.unclassified,
  missing_source: inventory.missing_source,
  missing_required_snippets: inventory.missing_required_snippets,
  without_tests: inventory.without_tests,
}, null, 2));

if (checkMode) {
  const failures = [
    ...inventory.unclassified.map((name) => `Public function is unclassified: ${name}`),
    ...inventory.missing_source.map((name) => `Public function has no index.ts: ${name}`),
    ...inventory.missing_required_snippets.map((item) =>
      `${item.name} is missing required protection snippet(s): ${item.missing.join(", ")}`
    ),
    ...inventory.without_tests.map((name) => `Public function lacks a local Deno test: ${name}`),
  ];

  if (failures.length > 0) {
    writeStderr();
    writeStderr("[public-function-inventory] FAIL");
    for (const failure of failures) writeStderr(`- ${failure}`);
    process.exit(1);
  }

  writeStderr();
  writeStderr("[public-function-inventory] OK");
}
