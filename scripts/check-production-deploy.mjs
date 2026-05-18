#!/usr/bin/env node

/**
 * Production deploy smoke check.
 *
 * This catches the Cloudflare Pages failure mode where the custom domain serves
 * the repository root/index.html instead of the built Vite dist output. A plain
 * HTTP 200 is not enough: the HTML must reference built /assets/*.js files, the
 * entry asset must be served as JavaScript, and the browser check must prove
 * React mounted into #root.
 */

const DEFAULT_URLS = ["https://portal.maiprop.co"];
const DEFAULT_ATTEMPTS = 8;
const DEFAULT_DELAY_MS = 10_000;
const USER_AGENT = "maiprop-production-deploy-check/1.0";

const args = process.argv.slice(2);
const browserCheck =
  args.includes("--browser") ||
  ["1", "true", "yes"].includes(
    String(process.env.PRODUCTION_DEPLOY_BROWSER_CHECK ?? "").toLowerCase(),
  );

const urlsFromArgs = args.filter((arg) => !arg.startsWith("--"));
const urls = urlsFromArgs.length
  ? urlsFromArgs
  : process.env.PRODUCTION_DEPLOY_URLS?.split(/\s+/).filter(Boolean) ??
    DEFAULT_URLS;

const attempts = Number.parseInt(
  process.env.PRODUCTION_DEPLOY_CHECK_ATTEMPTS ?? "",
  10,
) || DEFAULT_ATTEMPTS;
const delayMs = Number.parseInt(
  process.env.PRODUCTION_DEPLOY_CHECK_DELAY_MS ?? "",
  10,
) || DEFAULT_DELAY_MS;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function fetchText(url, options = {}) {
  const res = await fetch(url, {
    redirect: "follow",
    headers: {
      "user-agent": USER_AGENT,
      ...(options.headers ?? {}),
    },
    ...options,
  });
  const text = await res.text();
  assert(res.ok, `${url} returned HTTP ${res.status}: ${text.slice(0, 160)}`);
  return { res, text };
}

function extractModuleScripts(html) {
  return Array.from(
    html.matchAll(
      /<script\b(?=[^>]*\btype=["']module["'])[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi,
    ),
    (match) => match[1],
  );
}

function validateHtml(url, html) {
  assert(html.includes('<div id="root"></div>'), `${url} is missing #root`);

  const scripts = extractModuleScripts(html);
  assert(scripts.length > 0, `${url} has no module script entrypoint`);

  const sourceEntrypoints = scripts.filter((src) => /^\/?src\//.test(src));
  assert(
    sourceEntrypoints.length === 0,
    `${url} references source entrypoints instead of a production build: ${sourceEntrypoints.join(", ")}`,
  );

  const assetEntrypoints = scripts.filter((src) =>
    /^\/assets\/[^"']+\.js(?:\?.*)?$/.test(src),
  );
  assert(
    assetEntrypoints.length > 0,
    `${url} has no built Vite /assets/*.js module entrypoint`,
  );

  return assetEntrypoints[0];
}

async function validateEntrypointAsset(baseUrl, assetPath) {
  const assetUrl = new URL(assetPath, baseUrl).toString();
  const { res, text } = await fetchText(assetUrl, {
    headers: { accept: "text/javascript, application/javascript, */*" },
  });

  const contentType = res.headers.get("content-type") ?? "";
  assert(
    !/application\/octet-stream/i.test(contentType),
    `${assetUrl} is served as ${contentType}; browsers reject module scripts with this MIME type`,
  );
  assert(
    !/text\/html/i.test(contentType),
    `${assetUrl} is served as HTML instead of JavaScript`,
  );
  assert(
    /javascript|ecmascript/i.test(contentType),
    `${assetUrl} has unexpected content-type ${contentType || "<missing>"}`,
  );
  assert(
    !/from ["']\.\/App["'];?/.test(text),
    `${assetUrl} still looks like raw source instead of a bundled production asset`,
  );
}

async function runBrowserCheck(url) {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const moduleFailures = [];
  const pageErrors = [];

  page.on("console", (msg) => {
    const text = msg.text();
    if (/Failed to load module script|MIME type|Strict MIME type/i.test(text)) {
      moduleFailures.push(text);
    }
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  try {
    const response = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    assert(response?.ok(), `${url} browser navigation returned HTTP ${response?.status()}`);

    await page.waitForFunction(
      () => (document.querySelector("#root")?.textContent ?? "").trim().length > 20,
      undefined,
      { timeout: 20_000 },
    );
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});

    const rootText = await page.locator("#root").innerText({ timeout: 5_000 });
    assert(rootText.trim().length > 20, `${url} rendered an empty #root`);
    assert(moduleFailures.length === 0, moduleFailures.join("\n"));
    assert(pageErrors.length === 0, `Page errors:\n${pageErrors.join("\n")}`);
  } finally {
    await browser.close();
  }
}

async function checkUrl(url) {
  const { text: html } = await fetchText(url, {
    headers: { accept: "text/html,application/xhtml+xml" },
  });
  const assetPath = validateHtml(url, html);
  await validateEntrypointAsset(url, assetPath);
  if (browserCheck) await runBrowserCheck(url);
  const browserSuffix = browserCheck ? " and mounts the app" : "";
  console.log(`[ok] ${url} serves built assets${browserSuffix}`);
}

async function checkWithRetries(url) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await checkUrl(url);
      return;
    } catch (error) {
      lastError = error;
      console.warn(
        `[warn] ${url} deploy check failed on attempt ${attempt}/${attempts}: ${error.message}`,
      );
      if (attempt < attempts) await sleep(delayMs);
    }
  }
  throw lastError;
}

async function main() {
  for (const url of urls) {
    await checkWithRetries(url);
  }

  console.log("All production deploy checks passed");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
