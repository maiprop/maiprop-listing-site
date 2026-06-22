#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { checkRlsCrudMatrix } from "./check-rls-crud-matrix.mjs";

const args = process.argv.slice(2);

function readArg(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : "";
}

function fail(message) {
  console.error(`[capture-rls-crud-matrix] ${message}`);
  process.exit(1);
}

export async function captureRlsCrudMatrix() {
  const outPath = readArg("--out");
  if (!outPath) fail("Missing --out <path>.");

  const matrix = await checkRlsCrudMatrix();
  await writeFile(outPath, `${JSON.stringify(matrix, null, 2)}\n`, "utf8");
  console.log(`[capture-rls-crud-matrix] wrote ${outPath}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  captureRlsCrudMatrix().catch((error) => fail(error instanceof Error ? error.message : String(error)));
}
