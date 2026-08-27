const cloudflareHttpMutationWorkflows = new Set([
  ".github/workflows/lock-cloudflare-pages-git-deploys.yml",
  ".github/workflows/provision-cloudflare-pages-runtime.yml",
  ".github/workflows/reusable-cloudflare-production-deploy.yml",
  ".github/workflows/stage-release.yml",
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

function hasAllowedRuntimeProvisionTarget(line) {
  const apiBase = String.raw`(?:\$API_BASE\b|\$\{API_BASE\})`;
  const account = String.raw`(?:\$TARGET_ACCOUNT_ID\b|\$\{TARGET_ACCOUNT_ID\})`;
  const project = String.raw`(?:\$TARGET_PROJECT\b|\$\{TARGET_PROJECT\})`;
  return new RegExp(
    `${apiBase}/accounts/${account}/pages/projects/${project}(?:["'\\s]|$)`,
  ).test(line);
}

function hasOnlyAuthorizedRuntimeProvisionMutation(source, aliases) {
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

  return (
    operations.length === 1 &&
    operations[0].method === "PATCH" &&
    hasAllowedRuntimeProvisionTarget(operations[0].line) &&
    source.includes("PROVISION_STAGING_PAGES_RUNTIME") &&
    source.includes("PROVISION_PRODUCTION_PAGES_RUNTIME") &&
    source.includes("vars.STAGING_RELEASE_ENABLED == 'true'") &&
    source.includes("vars.PRODUCTION_RELEASE_ENABLED == 'true'") &&
    source.includes("PRODUCTION_RELEASE_APPROVERS") &&
    source.includes("PRODUCTION_RELEASE_DEPLOYERS") &&
    source.includes("build-cloudflare-pages-runtime-patch.mjs") &&
    source.includes("validate-cloudflare-pages-staging-posture.mjs")
  );
}

function addMethod(methods, method) {
  if (mutationMethods.test(method ?? "")) {
    methods.add(method.toUpperCase());
  }
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
  const methods = findCloudflareHttpMutations(source);
  if (methods.length === 0) return null;
  if (/evidence/i.test(workflowPath)) {
    return `${workflowPath} contains Cloudflare HTTP mutation wiring in an evidence workflow`;
  }
  if (workflowPath === ".github/workflows/lock-cloudflare-pages-git-deploys.yml") {
    const aliases = cloudflareApiAliases(source);
    if (hasOnlyAuthorizedBootstrapMutations(source, aliases)) return null;
    return `${workflowPath} contains unauthorized Cloudflare HTTP mutation wiring`;
  }
  if (
    workflowPath ===
    ".github/workflows/provision-cloudflare-pages-runtime.yml"
  ) {
    const aliases = cloudflareApiAliases(source);
    if (hasOnlyAuthorizedRuntimeProvisionMutation(source, aliases)) return null;
    return `${workflowPath} contains unauthorized Cloudflare HTTP mutation wiring`;
  }
  if (workflowPath === ".github/workflows/stage-release.yml") {
    const controlled =
      methods.join("\n") === "POST" &&
      source.includes("workflow_run:") &&
      source.includes("node scripts/wait-for-staging-release-gates.mjs") &&
      source.includes("github-staging-lease") &&
      source.includes("release-artifact-binding.json") &&
      source.includes("/rollback");
    if (controlled) return null;
  }
  if (
    workflowPath ===
    ".github/workflows/reusable-cloudflare-production-deploy.yml"
  ) {
    const controlled =
      methods.join("\n") === "POST" &&
      source.includes("workflow_call:") &&
      source.includes("github-staging-lease") &&
      source.includes("mutation-lease") &&
      source.includes("release-artifact-binding.json") &&
      source.includes("/rollback");
    if (controlled) return null;
  }
  return `${workflowPath} contains unauthorized Cloudflare HTTP mutation wiring`;
}
