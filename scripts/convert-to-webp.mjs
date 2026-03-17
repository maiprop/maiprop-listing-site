#!/usr/bin/env node
/** Converts JPG/PNG assets to WebP for smaller bundle size. Run: node scripts/convert-to-webp.mjs */
import sharp from "sharp";
import { readdirSync, existsSync } from "fs";
import { join, extname } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const assetsDir = join(__dirname, "../src/assets");
const EXTENSIONS = [".jpg", ".jpeg", ".png"];

function convertFile(filePath) {
  const ext = extname(filePath);
  if (!EXTENSIONS.includes(ext.toLowerCase())) return;
  const outPath = filePath.replace(/\.[^.]+$/, ".webp");
  if (existsSync(outPath)) {
    console.log(`Skip (exists): ${outPath}`);
    return;
  }
  return sharp(filePath)
    .webp({ quality: 85 })
    .toFile(outPath)
    .then(() => console.log(`Created: ${outPath}`))
    .catch((err) => console.error(`Failed ${filePath}:`, err.message));
}

const files = readdirSync(assetsDir, { withFileTypes: true })
  .filter((f) => f.isFile() && EXTENSIONS.some((e) => f.name.toLowerCase().endsWith(e)))
  .map((f) => join(assetsDir, f.name));

if (files.length === 0) {
  console.log("No JPG/PNG files found in src/assets");
  process.exit(0);
}

Promise.all(files.map(convertFile).filter(Boolean)).then(() => {
  console.log("Done.");
});
