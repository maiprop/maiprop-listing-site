import { createHash } from "node:crypto";

const cloudflareHttpMutationWorkflows = new Set([
  ".github/workflows/lock-cloudflare-pages-git-deploys.yml",
]);

const currentMainMutationWorkflowDigests = new Map([
  [
    ".github/workflows/ci.yml",
    "b1b70d247d74deac1a56bcfefa0faf72e7806d063a0d39e277b77431b9d402e0",
  ],
  [
    ".github/workflows/reusable-cloudflare-production-deploy.yml",
    "5ec7f75c365e3f645ae77be405ae15f5e798069ba6a42df91a082f97a9dc8f8a",
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
    new RegExp(`\\$(?:\\{${alias}\\}|${alias})\\b`).test(text),
  );
  return (
    /https:\/\/api\.cloudflare\.com\/client\/v4/i.test(text) ||
    /\bCLOUDFLARE_(?:ACCOUNT|API|PAGES)[A-Z0-9_]*\b/.test(text) ||
    referencesAlias
  );
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
    .update(String(text ?? ""))
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
  const logicalShellLines = source
    .replace(/(?:\\|`)\r?\n\s*/g, " ")
    .split(/\r?\n/);

  for (const line of logicalShellLines) {
    if (!hasCloudflareApiContext(line, aliases)) continue;

    if (/\bcurl\b/i.test(line)) {
      const explicit = [
        ...line.matchAll(
          /(?:--request(?:=|\s+)|-X\s*)["']?(POST|PUT|PATCH|DELETE)\b/gi,
        ),
      ];
      for (const match of explicit) addMethod(methods, match[1]);
      if (
        explicit.length === 0 &&
        /--data(?:-raw|-binary)?(?:=|\s+)/i.test(line)
      ) {
        methods.add("POST");
      }
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
  if (findCloudflareHttpMutations(text).length === 0) return null;
  if (/evidence/i.test(workflowPath)) {
    return `${workflowPath} contains Cloudflare HTTP mutation wiring in an evidence workflow`;
  }
  if (!isAuthorizedCloudflareHttpMutationWorkflow(workflowPath)) {
    if (matchesCurrentMainMutationWorkflow(workflowPath, text)) {
      return null;
    }
    return `${workflowPath} contains unauthorized Cloudflare HTTP mutation wiring`;
  }
  return null;
}
