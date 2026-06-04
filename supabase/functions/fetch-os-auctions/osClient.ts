import { createLogger } from "../_shared/logger.ts";
import {
  NATIONAL_SAMPLE_PAGE_COUNT,
  NATIONAL_SAMPLE_SOURCE_PAGE_SIZE,
} from "./constants.ts";
import { getAuctionSamplePageNumbers } from "./auctionSampling.ts";
import type { OsApiFailure, OsAuction, OsConfig, OsResponse } from "./types.ts";

const log = createLogger("fetch-os-auctions");

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(function abortRequest() {
    controller.abort();
  }, timeoutMs);
  try {
    // nosemgrep: javascript.lang.security.audit.detect-non-literal-url
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function getOsToken(
  baseUrl: string,
  email: string,
  password: string,
): Promise<string> {
  const res = await fetchWithTimeout(
    `${baseUrl}/auth/login`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    },
    15_000,
  );
  const json = await res.json();
  const token = json?.data?.token ?? json?.token ?? json?.accessToken;
  if (!token) {
    throw new Error(
      `OS auth failed (${res.status}): ${JSON.stringify(json).slice(0, 200)}`,
    );
  }
  return token;
}

async function fetchOsAuctionDetailsWithToken(
  osConfig: OsConfig,
  token: string,
  page: number,
  size: number,
  filterRequest: Record<string, unknown>,
): Promise<OsResponse | OsAuction[]> {
  const endpoint =
    `${osConfig.url}/api/v1/auctions/filter/details?page=${page}&pageSize=${size}`;
  log.info("fetching auctions", { page, size, filter: filterRequest });

  const auctionResponse = await fetchWithTimeout(
    endpoint,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(filterRequest),
    },
    20_000,
  );

  if (!auctionResponse.ok) {
    const detail = (await auctionResponse.text()).slice(0, 300);
    log.error("OS API error", { status: auctionResponse.status, detail });
    throw {
      kind: "os-api",
      status: auctionResponse.status,
      detail,
    } satisfies OsApiFailure;
  }

  return (await auctionResponse.json()) as OsResponse | OsAuction[];
}

export async function fetchOsAuctionDetails(
  osConfig: OsConfig,
  page: number,
  size: number,
  filterRequest: Record<string, unknown>,
): Promise<OsResponse | OsAuction[]> {
  log.info("authenticating with OS API");
  const token = await getOsToken(
    osConfig.url,
    osConfig.email,
    osConfig.password,
  );

  return await fetchOsAuctionDetailsWithToken(
    osConfig,
    token,
    page,
    size,
    filterRequest,
  );
}

export function parseOsResponse(
  json: OsResponse | OsAuction[],
): { auctions: OsAuction[]; total: number } {
  const auctions = Array.isArray(json)
    ? json
    : Array.isArray(json.data)
    ? json.data
    : [];
  const total = Array.isArray(json)
    ? auctions.length
    : (json.responseMetadata?.pagination?.totalElements ?? auctions.length);
  return { auctions, total };
}

function getNationalSampleSourcePageSize(responseSize: number): number {
  return responseSize <= 60
    ? responseSize
    : Math.max(responseSize, NATIONAL_SAMPLE_SOURCE_PAGE_SIZE);
}

export async function fetchNationalAuctionSample(
  osConfig: OsConfig,
  responseSize: number,
  filterRequest: Record<string, unknown>,
): Promise<{ auctions: OsAuction[]; total: number; sourcePages: number[] }> {
  log.info("authenticating with OS API");
  const token = await getOsToken(
    osConfig.url,
    osConfig.email,
    osConfig.password,
  );
  const sourcePageSize = getNationalSampleSourcePageSize(responseSize);
  const firstResponse = await fetchOsAuctionDetailsWithToken(
    osConfig,
    token,
    0,
    sourcePageSize,
    filterRequest,
  );
  const firstPage = parseOsResponse(firstResponse);
  const samplePages = getAuctionSamplePageNumbers(
    firstPage.total,
    sourcePageSize,
    NATIONAL_SAMPLE_PAGE_COUNT,
  );
  const remainingPages = samplePages.filter((page) => page !== 0);
  const successfulPages: OsAuction[][] = [];
  const failedPages: number[] = [];
  const pageResults = await Promise.allSettled(
    remainingPages.map((page) =>
      fetchOsAuctionDetailsWithToken(
        osConfig,
        token,
        page,
        sourcePageSize,
        filterRequest,
      )
    ),
  );

  pageResults.forEach((result, index) => {
    const page = remainingPages[index];
    if (result.status === "fulfilled") {
      successfulPages.push(parseOsResponse(result.value).auctions);
      return;
    }
    failedPages.push(page);
    log.warn("national auction sample page failed, retrying sequentially", {
      page,
      error: result.reason instanceof Error
        ? result.reason.message
        : String(result.reason),
    });
  });

  for (const page of failedPages) {
    try {
      const pageResponse = await fetchOsAuctionDetailsWithToken(
        osConfig,
        token,
        page,
        sourcePageSize,
        filterRequest,
      );
      successfulPages.push(parseOsResponse(pageResponse).auctions);
    } catch (err) {
      log.warn("national auction sample page failed", {
        page,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    auctions: [firstPage.auctions, ...successfulPages].flat(),
    total: firstPage.total,
    sourcePages: [0, ...remainingPages],
  };
}
