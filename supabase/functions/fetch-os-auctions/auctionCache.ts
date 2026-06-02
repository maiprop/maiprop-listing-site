import {
  AUCTION_RESPONSE_CACHE_MAX_ENTRIES,
  AUCTION_RESPONSE_CACHE_TTL_MS,
} from "./constants.ts";
import type { AuctionCacheEntry, AuctionResponsePayload } from "./types.ts";

const auctionResponseCache = new Map<string, AuctionCacheEntry>();

function getSortedSerializableValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(getSortedSerializableValue);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([
          key,
          nestedValue,
        ]) => [key, getSortedSerializableValue(nestedValue)]),
    );
  }

  return value;
}

function stableJson(value: unknown): string {
  return JSON.stringify(getSortedSerializableValue(value));
}

export function getAuctionResponseCacheKey(
  page: number,
  size: number,
  planCap: number,
  sampleAcrossGreece: boolean,
  filterRequest: Record<string, unknown>,
): string {
  return stableJson({
    filterRequest,
    page,
    planCap,
    sampleAcrossGreece,
    size,
  });
}

function pruneAuctionResponseCache(now: number): void {
  for (const [key, entry] of auctionResponseCache) {
    if (entry.expiresAt <= now) auctionResponseCache.delete(key);
  }

  while (auctionResponseCache.size > AUCTION_RESPONSE_CACHE_MAX_ENTRIES) {
    const oldestKey = auctionResponseCache.keys().next().value;
    if (!oldestKey) return;
    auctionResponseCache.delete(oldestKey);
  }
}

export function clearAuctionResponseCache(): void {
  auctionResponseCache.clear();
}

export function readAuctionResponseCache(
  key: string,
  now = Date.now(),
): AuctionResponsePayload | null {
  const entry = auctionResponseCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= now) {
    auctionResponseCache.delete(key);
    return null;
  }
  return entry.payload;
}

export function writeAuctionResponseCache(
  key: string,
  payload: AuctionResponsePayload,
  now = Date.now(),
): void {
  pruneAuctionResponseCache(now);
  auctionResponseCache.set(key, {
    expiresAt: now + AUCTION_RESPONSE_CACHE_TTL_MS,
    payload,
  });
}
