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

import { fileURLToPath, pathToFileURL } from "node:url";
import { validatePublicApiEndpoints } from "./check-production-deploy-public-api.mjs";
import { validateDeploymentVersion } from "./check-production-deploy-version.mjs";
import {
  getSiteLockCookieHeader,
  getSiteLockErrorMessage,
  getSiteLockPassword,
  getSiteLockPlaywrightCookie,
  getCloudflareAccessHeaders,
  isSiteLockHtml,
  isSiteLockPlainText,
  mergeHeaders,
} from "./check-production-deploy-site-lock.mjs";

const DEFAULT_URLS = ["https://portal.maiprop.co"];
const DEFAULT_ATTEMPTS = 8;
const DEFAULT_DELAY_MS = 10_000;
const FETCH_TIMEOUT_MS = 30_000;
const USER_AGENT = "maiprop-production-deploy-check/1.0";

const args = process.argv.slice(2);
const browserCheck =
  args.includes("--browser") ||
  ["1", "true", "yes"].includes(
    String(process.env.PRODUCTION_DEPLOY_BROWSER_CHECK ?? "").toLowerCase(),
  );
const publicApiCheck =
  args.includes("--public-api") ||
  ["1", "true", "yes"].includes(
    String(process.env.PRODUCTION_DEPLOY_PUBLIC_API_CHECK ?? "").toLowerCase(),
  );
const publicApiAllowFailOpen =
  args.includes("--public-api-allow-fail-open") ||
  ["1", "true", "yes"].includes(
    String(process.env.PRODUCTION_DEPLOY_PUBLIC_API_ALLOW_FAIL_OPEN ?? "").toLowerCase(),
  );
if (publicApiAllowFailOpen) {
  process.env.PRODUCTION_DEPLOY_PUBLIC_API_ALLOW_FAIL_OPEN = "true";
}

const urlsFromArgs = args.filter((arg) => !arg.startsWith("--"));
const urls = urlsFromArgs.length
  ? urlsFromArgs
  : process.env.PRODUCTION_DEPLOY_URLS?.split(/\s+/).filter(Boolean) ??
    DEFAULT_URLS;
const expectedDeploySha = process.env.PRODUCTION_DEPLOY_EXPECTED_SHA?.trim() ?? "";
const deployVersionPath = process.env.PRODUCTION_DEPLOY_VERSION_PATH?.trim() || "/deploy-version.json";

const attempts = Number.parseInt(
  process.env.PRODUCTION_DEPLOY_CHECK_ATTEMPTS ?? "",
  10,
) || DEFAULT_ATTEMPTS;
const delayMs = Number.parseInt(
  process.env.PRODUCTION_DEPLOY_CHECK_DELAY_MS ?? "",
  10,
) || DEFAULT_DELAY_MS;

const sleep = (ms) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

const assertOk = (condition, message) => {
  if (!condition) throw new Error(message);
};

let cachedSiteLockHeaders;
const getSiteLockHeaders = async () => {
  if (cachedSiteLockHeaders) return cachedSiteLockHeaders;
  const password = getSiteLockPassword();
  cachedSiteLockHeaders = password
    ? { cookie: await getSiteLockCookieHeader(password) }
    : {};
  return cachedSiteLockHeaders;
};

const fetchText = async (url, options = {}) => {
  const { allowHttpError = false, headers, ...requestOptions } = options;
  const siteLockHeaders = await getSiteLockHeaders();
  const cloudflareAccessHeaders = getCloudflareAccessHeaders();
  const res = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: mergeHeaders(
      { "user-agent": USER_AGENT },
      cloudflareAccessHeaders,
      siteLockHeaders,
      headers,
    ),
    ...requestOptions,
  });
  const text = await res.text();
  const siteLockResponse = isSiteLockHtml(text) || isSiteLockPlainText(text);
  if (!allowHttpError) {
    assertOk(
      res.ok,
      siteLockResponse
        ? getSiteLockErrorMessage(url)
        : `${url} returned HTTP ${res.status}: ${text.slice(0, 160)}`,
    );
  }
  return { res, text };
};

const extractModuleScripts = (html) => {
  return Array.from(
    html.matchAll(
      /<script\b(?=[^>]*\btype=["']module["'])[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi,
    ),
    (match) => match[1],
  );
};

const validateHtml = (url, html) => {
  assertOk(!isSiteLockHtml(html), getSiteLockErrorMessage(url));
  assertOk(html.includes('<div id="root"></div>'), `${url} is missing #root`);

  const scripts = extractModuleScripts(html);
  assertOk(scripts.length > 0, `${url} has no module script entrypoint`);

  const sourceEntrypoints = scripts.filter((src) => /^\/?src\//.test(src));
  assertOk(
    sourceEntrypoints.length === 0,
    `${url} references source entrypoints instead of a production build: ${sourceEntrypoints.join(", ")}`,
  );

  const assetEntrypoints = scripts.filter((src) =>
    /^\/assets\/[^"']+\.js(?:\?.*)?$/.test(src),
  );
  assertOk(
    assetEntrypoints.length > 0,
    `${url} has no built Vite /assets/*.js module entrypoint`,
  );

  return assetEntrypoints[0];
};

const validateEntrypointAsset = async (baseUrl, assetPath) => {
  const assetUrl = new URL(assetPath, baseUrl).toString();
  const { res, text } = await fetchText(assetUrl, {
    headers: { accept: "text/javascript, application/javascript, */*" },
  });

  const contentType = res.headers.get("content-type") ?? "";
  assertOk(
    !/application\/octet-stream/i.test(contentType),
    `${assetUrl} is served as ${contentType}; browsers reject module scripts with this MIME type`,
  );
  assertOk(
    !/text\/html/i.test(contentType),
    `${assetUrl} is served as HTML instead of JavaScript`,
  );
  assertOk(
    /javascript|ecmascript/i.test(contentType),
    `${assetUrl} has unexpected content-type ${contentType || "<missing>"}`,
  );
  assertOk(
    !/from ["']\.\/App["'];?/.test(text),
    `${assetUrl} still looks like raw source instead of a bundled production asset`,
  );
};

const runBrowserCheck = async (url) => {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const siteLockPassword = getSiteLockPassword();
  if (siteLockPassword) {
    await context.addCookies([await getSiteLockPlaywrightCookie(url, siteLockPassword)]);
  }
  const page = await context.newPage();
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
    assertOk(response?.ok(), `${url} browser navigation returned HTTP ${response?.status()}`);

    await page.waitForFunction(
      () => (document.querySelector("#root")?.textContent ?? "").trim().length > 20,
      undefined,
      { timeout: 20_000 },
    );
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});

    const rootText = await page.locator("#root").innerText({ timeout: 5_000 });
    assertOk(rootText.trim().length > 20, `${url} rendered an empty #root`);
    assertOk(moduleFailures.length === 0, moduleFailures.join("\n"));
    assertOk(pageErrors.length === 0, `Page errors:\n${pageErrors.join("\n")}`);
  } finally {
    await browser.close();
  }
};

const checkUrl = async (url) => {
  await validateDeploymentVersion(url, {
    expectedSha: expectedDeploySha,
    versionPath: deployVersionPath,
    fetchText,
    assertOk,
  });
  const { text: html } = await fetchText(url, {
    headers: { accept: "text/html,application/xhtml+xml" },
  });
  const assetPath = validateHtml(url, html);
  await validateEntrypointAsset(url, assetPath);
  if (publicApiCheck) await validatePublicApiEndpoints(url, { fetchText });
  if (browserCheck) await runBrowserCheck(url);
  const browserSuffix = browserCheck ? " and mounts the app" : "";
  const apiSuffix = publicApiCheck
    ? publicApiAllowFailOpen
      ? " with public APIs checked or fail-open fallbacks tolerated"
      : " with public APIs online"
    : "";
  process.stdout.write(`[ok] ${url} serves built assets${browserSuffix}${apiSuffix}\n`);
};

const checkWithRetries = async (url) => {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await checkUrl(url);
      return;
    } catch (error) {
      lastError = error;
      process.stderr.write(
        `[warn] ${url} deploy check failed on attempt ${attempt}/${attempts}: ${error.message}\n`,
      );
      if (attempt < attempts) await sleep(delayMs);
    }
  }
  throw lastError;
};

const main = async () => {
  for (const url of urls) {
    await checkWithRetries(url);
  }

  process.stdout.write("All production deploy checks passed\n");
};

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(fileURLToPath(import.meta.url)).href &&
  process.argv[1].endsWith("check-production-deploy.mjs")
) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
