import { createHash } from "node:crypto";

const cloudflareHttpMutationWorkflows = new Set([
  ".github/workflows/lock-cloudflare-pages-git-deploys.yml",
]);

const currentMainMutationWorkflowDigests = new Map([
  [
    ".github/workflows/ci.yml",
    "edf06582c2459a720aca464457570ef55bdf4141ab8db676a6d72d09c392021c",
  ],
  [
    ".github/workflows/reusable-cloudflare-production-deploy.yml",
    "d37f0a6f6adbf6938037d561056a36452736363a364b2d979bd495d700ab0c23",
  ],
]);

const mutationMethods = /^(?:POST|PUT|PATCH|DELETE)$/i;

function cloudflareApiAliases(source) {
  const aliases = new Set();
  for (const match of source.matchAll(
    /^\s*([A-Z][A-Z0-9_]*)\s*[:=]\s*["']?https:\/\/api\.cloudflare\.com\/client\/v4\b/gim,
  )) {
    aliases.add(match[1]);
  }
  return aliases;
}

function hasCloudflareApiContext(text, aliases = new Set()) {
  const referencesAlias = [...aliases].some((alias) =>
    new RegExp(
      `(?:\\$${alias}\\b|\\$\\{${alias}\\}|\\$\\{\\{\\s*env\\.${alias}\\s*\\}\\})`,
    ).test(text),
  );
  return (
    /https:\/\/api\.cloudflare\.com\/client\/v4/i.test(text) ||
    /\bCLOUDFLARE_(?:ACCOUNT|API|PAGES)[A-Z0-9_]*\b/.test(text) ||
    referencesAlias
  );
}

function logicalShellLines(source) {
  return String(source ?? "")
    .replace(/(?:\\|`)\r?\n\s*/g, " ")
    .split(/\r?\n/);
}

function curlMutationMethods(line) {
  if (!/\bcurl\b/i.test(line)) return [];
  const methods = [
    ...line.matchAll(
      /(?:--request(?:=|\s+)|-X\s*)["']?(POST|PUT|PATCH|DELETE)\b/gi,
    ),
  ].map((match) => match[1].toUpperCase());
  if (
    methods.length === 0 &&
    /--data(?:-raw|-binary)?(?:=|\s+)/i.test(line)
  ) {
    methods.push("POST");
  }
  return methods;
}

function hasFixedBootstrapProjects(source) {
  return (
    /^\s*PRODUCTION_PROJECT=["']maiprop-listing-site["']\s*$/m.test(source) &&
    /^\s*STAGING_PROJECT=["']maiprop-listing-site-staging["']\s*$/m.test(source)
  );
}

function hasAllowedBootstrapProjectTarget(line) {
  const apiBase = String.raw`(?:\$API_BASE\b|\$\{API_BASE\}|\$\{\{\s*env\.API_BASE\s*\}\})`;
  const account = String.raw`(?:\$CLOUDFLARE_ACCOUNT_ID\b|\$\{CLOUDFLARE_ACCOUNT_ID\}|\$\{\{\s*secrets\.CLOUDFLARE_ACCOUNT_ID\s*\}\})`;
  const project = String.raw`(?:\$name\b|\$\{name\})`;
  return new RegExp(
    `${apiBase}/accounts/${account}/pages/projects/${project}(?:["'\\s]|$)`,
  ).test(line);
}

function hasOnlyFixedPatchProjectCalls(source) {
  const calls = [];
  for (const line of logicalShellLines(source)) {
    if (/\bpatch_project\s*\(\)\s*\{/.test(line)) continue;
    const match = line.match(
      /\bpatch_project\s+["']?(\$(?:\{)?(?:PRODUCTION_PROJECT|STAGING_PROJECT|[A-Z][A-Z0-9_]*)(?:\})?)["']?/,
    );
    if (match) calls.push(match[1].replace(/[${}]/g, ""));
  }
  return (
    calls.length === 2 &&
    calls.includes("PRODUCTION_PROJECT") &&
    calls.includes("STAGING_PROJECT") &&
    calls.every((name) =>
      name === "PRODUCTION_PROJECT" || name === "STAGING_PROJECT"
    )
  );
}

function hasOnlyAuthorizedBootstrapMutations(source, aliases) {
  if (!hasFixedBootstrapProjects(source)) return false;

  const operations = [];
  for (const line of logicalShellLines(source)) {
    if (!hasCloudflareApiContext(line, aliases)) continue;
    if (
      /\b(?:Invoke-(?:RestMethod|WebRequest)|wget|gh\s+api)\b/i.test(line)
    ) {
      return false;
    }
    for (const method of curlMutationMethods(line)) {
      operations.push({ method, line });
    }
  }
  for (const match of source.matchAll(/\bfetch\s*\(([\s\S]{0,3000}?)\)\s*;?/gi)) {
    if (hasCloudflareApiContext(match[0], aliases)) return false;
  }

  if (operations.length !== 1) return false;
  if (
    operations[0].method !== "PATCH" ||
    !hasAllowedBootstrapProjectTarget(operations[0].line)
  ) {
    return false;
  }

  return hasOnlyFixedPatchProjectCalls(source);
}

function addMethod(methods, method) {
  if (mutationMethods.test(method ?? "")) {
    methods.add(method.toUpperCase());
  }
}

function hasLiteralFalseJob(text, jobName) {
  const lines = String(text ?? "").split(/\r?\n/);
  const jobStart = lines.findIndex(
    (line) => line === `  ${jobName}:`,
  );
  if (jobStart < 0) return false;

  const jobEnd = lines.findIndex(
    (line, index) =>
      index > jobStart && /^  [A-Za-z0-9_-]+:\s*$/.test(line),
  );
  const block = lines
    .slice(jobStart, jobEnd < 0 ? lines.length : jobEnd)
    .join("\n");
  return /^\s{4}if:\s*\$\{\{\s*false\s*\}\}\s*$/m.test(block);
}

function matchesCurrentMainMutationWorkflow(workflowPath, text) {
  const expectedDigest = currentMainMutationWorkflowDigests.get(
    String(workflowPath),
  );
  if (!expectedDigest) return false;
  const actualDigest = createHash("sha256")
    .update(String(text ?? "").replace(/\r\n?/g, "\n"))
    .digest("hex");
  return (
    actualDigest === expectedDigest &&
    hasLiteralFalseJob(text, "deploy")
  );
}

export function findCloudflareHttpMutations(text) {
  const source = String(text ?? "");
  const aliases = cloudflareApiAliases(source);
  if (!hasCloudflareApiContext(source, aliases)) return [];

  const methods = new Set();

  for (const line of logicalShellLines(source)) {
    if (!hasCloudflareApiContext(line, aliases)) continue;

    if (/\bcurl\b/i.test(line)) {
      for (const method of curlMutationMethods(line)) addMethod(methods, method);
    }

    for (const match of line.matchAll(
      /\bInvoke-(?:RestMethod|WebRequest)\b.*?-Method(?:\s+|=)["']?(POST|PUT|PATCH|DELETE)\b/gi,
    )) {
      addMethod(methods, match[1]);
    }
    for (const match of line.matchAll(
      /\bwget\b.*?--method(?:=|\s+)["']?(POST|PUT|PATCH|DELETE)\b/gi,
    )) {
      addMethod(methods, match[1]);
    }
    for (const match of line.matchAll(
      /\bgh\s+api\b.*?(?:--method|-X)(?:=|\s+)["']?(POST|PUT|PATCH|DELETE)\b/gi,
    )) {
      addMethod(methods, match[1]);
    }
  }

  for (const match of source.matchAll(/\bfetch\s*\(([\s\S]{0,3000}?)\)\s*;?/gi)) {
    const call = match[0];
    if (!hasCloudflareApiContext(call, aliases)) continue;
    const method = call.match(
      /\bmethod\s*:\s*["'](POST|PUT|PATCH|DELETE)["']/i,
    )?.[1];
    addMethod(methods, method);
  }

  return [...methods].sort();
}

export function isAuthorizedCloudflareHttpMutationWorkflow(workflowPath) {
  return cloudflareHttpMutationWorkflows.has(String(workflowPath));
}

export function cloudflareHttpMutationViolation({ workflowPath, text }) {
  const source = String(text ?? "");
  if (findCloudflareHttpMutations(source).length === 0) return null;
  if (/evidence/i.test(workflowPath)) {
    return `${workflowPath} contains Cloudflare HTTP mutation wiring in an evidence workflow`;
  }
  if (isAuthorizedCloudflareHttpMutationWorkflow(workflowPath)) {
    const aliases = cloudflareApiAliases(source);
    if (hasOnlyAuthorizedBootstrapMutations(source, aliases)) return null;
    return `${workflowPath} contains unauthorized Cloudflare HTTP mutation wiring`;
  }
  if (!isAuthorizedCloudflareHttpMutationWorkflow(workflowPath)) {
    if (matchesCurrentMainMutationWorkflow(workflowPath, text)) {
      return null;
    }
    return `${workflowPath} contains unauthorized Cloudflare HTTP mutation wiring`;
  }
  return null;
}
