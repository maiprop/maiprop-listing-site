import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const result = (failures) => ({ ok: failures.length === 0, failures });

const readText = (root, relativePath) => {
  const path = join(root, relativePath);
  if (!existsSync(path)) return null;
  return readFileSync(path, "utf8");
};

const readJson = (root, relativePath) => {
  const text = readText(root, relativePath);
  if (text === null) return null;
  return JSON.parse(text);
};

export function extractOpenApiPaths(openApiText) {
  return openApiText
    .split(/\r?\n/)
    .map((line) => line.match(/^  \/([A-Za-z0-9_-]+):\s*$/)?.[1])
    .filter(Boolean)
    .sort();
}

function extractSchemaBlock(openApiText, schemaName) {
  const lines = openApiText.split(/\r?\n/);
  const start = lines.findIndex((line) => line === `    ${schemaName}:`);
  if (start === -1) return null;
  const block = [lines[start]];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^    [A-Za-z0-9_-]+:\s*$/.test(line)) break;
    if (/^\S/.test(line)) break;
    block.push(line);
  }
  return block.join("\n");
}

function checkErrorSchemaContract(openApiText, failures) {
  const block = extractSchemaBlock(openApiText, "Error");
  if (!block) {
    failures.push("OpenAPI Error schema is missing");
    return;
  }
  const requiredLine = block.match(/required:\s*\[([^\]]*)\]/)?.[1] ?? "";
  const requiredFields = new Set(requiredLine.split(",").map((field) => field.trim()).filter(Boolean));
  if (!requiredFields.has("error")) {
    failures.push("OpenAPI Error schema must require error");
  }
  if (requiredFields.has("code")) {
    failures.push("OpenAPI Error schema must not require code until all Edge Functions use the standard error envelope");
  }
  if (!/\n        code:\s*\n(?:\s+.*\n)*?\s+type:\s*string/.test(block)) {
    failures.push("OpenAPI Error schema must document optional code");
  }
  if (!/\n        issues:\s*\n(?:\s+.*\n)*?\s+type:\s*array/.test(block)) {
    failures.push("OpenAPI Error schema must document issues");
  }
}

export function checkOpenApiCoverage(root = process.cwd()) {
  const failures = [];
  const inventory = readJson(root, "docs/public-edge-function-inventory.json");
  const spec = readText(root, "docs/api/edge-functions.openapi.yaml");
  const readme = readText(root, "docs/api/README.md");

  if (!inventory) failures.push("docs/public-edge-function-inventory.json is missing or invalid");
  if (spec === null) failures.push("docs/api/edge-functions.openapi.yaml is missing");
  if (readme === null) failures.push("docs/api/README.md is missing");
  if (!inventory || spec === null || readme === null) return result(failures);

  const publicFunctions = Array.isArray(inventory.entries)
    ? inventory.entries.map((entry) => entry.name).sort()
    : [];
  const documentedPaths = extractOpenApiPaths(spec);

  checkErrorSchemaContract(spec, failures);

  for (const functionName of publicFunctions) {
    if (!documentedPaths.includes(functionName)) {
      failures.push(`OpenAPI spec is missing public edge function path /${functionName}`);
    }
  }

  for (const marker of [
    "npm run check:openapi-coverage",
    "Update docs/api/edge-functions.openapi.yaml",
  ]) {
    if (!readme.includes(marker)) failures.push(`docs/api/README.md must mention ${marker}`);
  }

  return result(failures);
}

const main = () => {
  const check = checkOpenApiCoverage(process.cwd());
  if (!check.ok) {
    for (const failure of check.failures) process.stderr.write(`${failure}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write("OpenAPI public function coverage OK\n");
};

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(fileURLToPath(import.meta.url)).href &&
  process.argv[1].endsWith("check-openapi-coverage.mjs")
) {
  main();
}
