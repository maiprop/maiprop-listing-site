#!/usr/bin/env node
/**
 * Compress large images (e.g. thessaloniki-landmark ~2.3MB) to WebP.
 * Run: npm run compress:images
 * Requires: npm install --save-dev sharp
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const assetsDir = join(root, "src", "assets");

const TARGETS = ["thessaloniki-landmark.jpg"];

async function main() {
  let sharp;
  try {
    sharp = (await import("sharp")).default;
  } catch {
    console.log("Run: npm install --save-dev sharp");
    process.exit(1);
  }

  for (const name of TARGETS) {
    const input = join(assetsDir, name);
    const base = name.replace(/\.[^.]+$/, "");
    const output = join(assetsDir, `${base}.webp`);

    if (!existsSync(input)) {
      console.warn(`Skip (not found): ${input}`);
      continue;
    }

    const before = readFileSync(input).length;
    await sharp(input)
      .webp({ quality: 82 })
      .toFile(output);
    const after = readFileSync(output).length;
    console.log(`${name} → ${base}.webp  ${(before / 1024).toFixed(1)}KB → ${(after / 1024).toFixed(1)}KB`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
