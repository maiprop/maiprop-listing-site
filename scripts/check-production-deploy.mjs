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
import { fetchReleaseResource } from "./release-http.mjs";
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
const supportedOptions = new Set(["--browser", "--public-api"]);
const unsupportedOption = args.find(
  (arg) => arg.startsWith("--") && !supportedOptions.has(arg),
);
if (unsupportedOption) {
  throw new Error(`Unsupported production deploy check option: ${unsupportedOption}`);
}
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

const urlsFromArgs = args.filter((arg) => !arg.startsWith("--"));
const urls = urlsFromArgs.length
  ? urlsFromArgs
  : process.env.PRODUCTION_DEPLOY_URLS?.split(/\s+/).filter(Boolean) ??
    DEFAULT_URLS;
const expectedDeploySha = process.env.PRODUCTION_DEPLOY_EXPECTED_SHA?.trim() ?? "";
const deployVersionPath = process.env.PRODUCTION_DEPLOY_VERSION_PATH?.trim() || "/deploy-version.json";
const turnAccessToken =
  process.env.PRODUCTION_DEPLOY_TURN_ACCESS_TOKEN?.trim() ?? "";
const turnRoomId =
  process.env.PRODUCTION_DEPLOY_TURN_ROOM_ID?.trim() ?? "";
if (Boolean(turnAccessToken) !== Boolean(turnRoomId)) {
  throw new Error(
    "Authenticated TURN proof requires both PRODUCTION_DEPLOY_TURN_ACCESS_TOKEN and PRODUCTION_DEPLOY_TURN_ROOM_ID",
  );
}
const turnExpectedTtlSeconds = Number.parseInt(
  process.env.PRODUCTION_DEPLOY_TURN_EXPECTED_TTL_SECONDS ?? "21600",
  10,
);
if (
  turnAccessToken &&
  (
    !Number.isSafeInteger(turnExpectedTtlSeconds) ||
    turnExpectedTtlSeconds < 300 ||
    turnExpectedTtlSeconds > 86_400
  )
) {
  throw new Error(
    "PRODUCTION_DEPLOY_TURN_EXPECTED_TTL_SECONDS must be an integer from 300 through 86400",
  );
}
const turnKeyId =
  process.env.CLOUDFLARE_TURN_KEY_ID?.trim() ?? "";
const turnApiToken =
  process.env.CLOUDFLARE_TURN_API_TOKEN?.trim() ?? "";
if (Boolean(turnKeyId) !== Boolean(turnApiToken)) {
  throw new Error(
    "Cloudflare TURN service proof requires both CLOUDFLARE_TURN_KEY_ID and CLOUDFLARE_TURN_API_TOKEN",
  );
}
const turnServiceTtlSeconds = Number.parseInt(
  process.env.MAIPROP_TURN_TTL_SECONDS ?? "600",
  10,
);
if (
  turnKeyId &&
  (
    !Number.isSafeInteger(turnServiceTtlSeconds) ||
    turnServiceTtlSeconds < 300 ||
    turnServiceTtlSeconds > 172_800
  )
) {
  throw new Error(
    "MAIPROP_TURN_TTL_SECONDS must be an integer from 300 through 172800",
  );
}

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

export function createDeployVerificationEvidence(
  targets,
  { generatedAt = new Date().toISOString(), turnService = null } = {},
) {
  assertOk(Array.isArray(targets) && targets.length > 0, "Deploy verification produced no target evidence");
  for (const target of targets) {
    assertOk(target?.status === "passed", "Deploy verification cannot attest a failed target");
    if (target.publicApi) {
      assertOk(
        target.publicApi.status === "passed" &&
          Array.isArray(target.publicApi.endpoints) &&
          target.publicApi.endpoints.length > 0 &&
          target.publicApi.endpoints.every((endpoint) => endpoint?.status === "passed"),
        `Deploy verification cannot attest incomplete public API evidence for ${target.baseUrl}`,
      );
    }
  }
  if (turnService) {
    assertOk(
      turnService.status === "passed" &&
        turnService.httpStatus === 201 &&
        turnService.credentialsPresent === true &&
        turnService.credentialsRedacted === true &&
        turnService.turnUrlCount > 0,
      "Deploy verification cannot attest incomplete Cloudflare TURN service evidence",
    );
  }

  return {
    schemaVersion: 1,
    kind: "maiprop-deploy-verification",
    generatedAt,
    status: "passed",
    targets,
    ...(turnService ? { turnService } : {}),
  };
}

export async function verifyCloudflareTurnCredentials({
  keyId,
  apiToken,
  ttlSeconds = 600,
  fetchImpl = fetchReleaseResource,
}) {
  assertOk(
    typeof keyId === "string" && keyId.trim().length > 0 &&
      typeof apiToken === "string" && apiToken.trim().length > 0,
    "Cloudflare TURN key id and API token are required",
  );
  assertOk(
    Number.isSafeInteger(ttlSeconds) &&
      ttlSeconds >= 300 &&
      ttlSeconds <= 172_800,
    "Cloudflare TURN credential TTL must be an integer from 300 through 172800",
  );

  let response;
  try {
    response = await fetchImpl(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId.trim())}/credentials/generate-ice-servers`,
      {
        method: "POST",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: {
          Authorization: `Bearer ${apiToken.trim()}`,
          "Content-Type": "application/json",
          "user-agent": USER_AGENT,
        },
        body: JSON.stringify({ ttl: ttlSeconds }),
      },
    );
  } catch {
    throw new Error("Cloudflare TURN credential generation request failed");
  }
  assertOk(
    response?.status === 201,
    `Cloudflare TURN credential generation returned HTTP ${response?.status ?? "unknown"}`,
  );

  let payload;
  try {
    payload = JSON.parse(await response.text());
  } catch {
    throw new Error("Cloudflare TURN credential generation returned invalid JSON");
  }
  const iceServers = Array.isArray(payload?.iceServers)
    ? payload.iceServers
    : [];
  const urls = iceServers.flatMap((server) =>
    Array.isArray(server?.urls)
      ? server.urls
      : typeof server?.urls === "string"
        ? [server.urls]
        : []
  );
  const turnUrls = urls.filter((url) => /^turns?:/i.test(url));
  const credentialServer = iceServers.find((server) =>
    typeof server?.username === "string" && server.username.length > 0 &&
      typeof server?.credential === "string" && server.credential.length > 0
  );
  assertOk(
    iceServers.length > 0 && turnUrls.length > 0 && credentialServer,
    "Cloudflare TURN credential generation returned incomplete ICE credentials",
  );

  return {
    status: "passed",
    httpStatus: response.status,
    authentication: "bearer",
    ttlSeconds,
    iceServerCount: iceServers.length,
    turnUrlCount: turnUrls.length,
    credentialsPresent: true,
    credentialsRedacted: true,
  };
}

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
  const {
    allowHttpError = false,
    headers,
    timeoutMs = FETCH_TIMEOUT_MS,
    ...requestOptions
  } = options;
  const siteLockHeaders = await getSiteLockHeaders();
  const cloudflareAccessHeaders = getCloudflareAccessHeaders();
  const res = await fetchReleaseResource(url, {
    signal: AbortSignal.timeout(timeoutMs),
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

export const validateHtml = (url, html) => {
  assertOk(!isSiteLockHtml(html), getSiteLockErrorMessage(url));
  // The app shell renders a static boot splash inside #root (see index.html), so
  // accept any #root element instead of requiring an empty one. The --browser
  // check separately proves React mounts content into it.
  assertOk(html.includes('<div id="root">'), `${url} is missing #root`);

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
  const publicApi = publicApiCheck
     ? await validatePublicApiEndpoints(url, {
         fetchText,
         operationalProof: true,
         turnCredentialProof: turnAccessToken
           ? {
               accessToken: turnAccessToken,
               roomId: turnRoomId,
               expectedTtlSeconds: turnExpectedTtlSeconds,
             }
           : undefined,
       })
    : null;
  if (browserCheck) await runBrowserCheck(url);
  const browserSuffix = browserCheck ? " and mounts the app" : "";
  const apiSuffix = publicApiCheck ? " with public APIs online" : "";
  process.stderr.write(`[ok] ${url} serves built assets${browserSuffix}${apiSuffix}\n`);

  return {
    baseUrl: new URL(url).toString(),
    status: "passed",
    deploymentVersion: "passed",
    builtAssets: "passed",
    entrypointAsset: new URL(assetPath, url).toString(),
    browser: browserCheck ? "passed" : "not-requested",
    publicApi,
  };
};

const checkWithRetries = async (url) => {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await checkUrl(url);
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
  const turnService = turnKeyId
    ? await verifyCloudflareTurnCredentials({
        keyId: turnKeyId,
        apiToken: turnApiToken,
        ttlSeconds: turnServiceTtlSeconds,
      })
    : null;
  const targets = [];
  for (const url of urls) {
    targets.push(await checkWithRetries(url));
  }

  const evidence = createDeployVerificationEvidence(targets, { turnService });
  process.stdout.write(`${JSON.stringify(evidence)}\n`);
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
