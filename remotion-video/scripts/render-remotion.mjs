import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition, openBrowser } from "@remotion/renderer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const outDir = path.resolve(repoRoot, "dist");
const stakeholderCompositionIds = [
  "stakeholder-buyer",
  "stakeholder-seller",
  "stakeholder-agent",
  "stakeholder-developer",
  "stakeholder-professional",
  "stakeholder-investor",
  "stakeholder-admin",
];

const arg = process.argv[2] ?? "main";
const ids =
  arg === "--all" || arg === "all"
    ? ["main", ...stakeholderCompositionIds]
    : arg === "--stakeholders" || arg === "stakeholders"
      ? stakeholderCompositionIds
      : [arg];
fs.mkdirSync(outDir, { recursive: true });

const bundled = await bundle({
  entryPoint: path.resolve(__dirname, "../src/index.ts"),
  webpackOverride: (config) => config,
});

const browserOptions = {
  chromiumOptions: {
    args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
  },
  chromeMode: "chrome-for-testing",
};

if (process.env.PUPPETEER_EXECUTABLE_PATH) {
  browserOptions.browserExecutable = process.env.PUPPETEER_EXECUTABLE_PATH;
}

const browser = await openBrowser("chrome", browserOptions);

for (const id of ids) {
  const composition = await selectComposition({
    serveUrl: bundled,
    id,
    puppeteerInstance: browser,
  });

  const outputLocation = path.resolve(outDir, `${id}.mp4`);
  console.log(`Rendering ${id} -> ${outputLocation}`);

  await renderMedia({
    composition,
    serveUrl: bundled,
    codec: "h264",
    outputLocation,
    puppeteerInstance: browser,
    muted: true,
    concurrency: 1,
  });
}

await browser.close({ silent: false });
console.log("Render complete");
