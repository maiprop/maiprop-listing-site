import { AUCTION_SAMPLE_SALT } from "./constants.ts";
import type { MappedAuction } from "./types.ts";

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function getAuctionSamplingSeed(date = new Date()): string {
  return `${AUCTION_SAMPLE_SALT}:${date.toISOString().slice(0, 10)}`;
}

function getStableScore(seed: string, value: string): number {
  return hashString(`${seed}:${value}`);
}

export function getAuctionSamplePageNumbers(
  totalRows: number,
  sourcePageSize: number,
  samplePageCount: number,
  seed = getAuctionSamplingSeed(),
): number[] {
  const totalPages = Math.max(1, Math.ceil(totalRows / sourcePageSize));
  const desiredPages = Math.max(1, Math.min(samplePageCount, totalPages));
  const pages = new Set<number>();

  for (let i = 0; i < desiredPages; i += 1) {
    const bucketStart = Math.floor((i * totalPages) / desiredPages);
    const bucketEnd = Math.max(
      bucketStart,
      Math.floor(((i + 1) * totalPages) / desiredPages) - 1,
    );
    const bucketSize = Math.max(1, bucketEnd - bucketStart + 1);
    pages.add(bucketStart + (getStableScore(seed, `page:${i}`) % bucketSize));
  }

  return [...pages].sort((a, b) => a - b);
}

function getAuctionGroupKey(row: MappedAuction): string {
  return row.region || row.city || "Greece";
}

export function selectDiverseAuctionSample(
  rows: MappedAuction[],
  limit: number,
  seed = getAuctionSamplingSeed(),
): MappedAuction[] {
  const uniqueRows = new Map<string, MappedAuction>();
  for (const row of rows) uniqueRows.set(row.id, row);

  const groups = new Map<string, MappedAuction[]>();
  for (const row of uniqueRows.values()) {
    const key = getAuctionGroupKey(row);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  const orderedGroups = [...groups.entries()]
    .map(([key, groupRows]) =>
      [
        key,
        groupRows.sort((a, b) =>
          getStableScore(seed, a.id) - getStableScore(seed, b.id)
        ),
      ] as const
    )
    .sort((a, b) =>
      getStableScore(seed, `group:${a[0]}`) -
      getStableScore(seed, `group:${b[0]}`)
    );

  const selected: MappedAuction[] = [];
  let cursor = 0;
  while (
    selected.length < limit &&
    orderedGroups.some(([, group]) => cursor < group.length)
  ) {
    for (const [, group] of orderedGroups) {
      const row = group[cursor];
      if (row) selected.push(row);
      if (selected.length >= limit) break;
    }
    cursor += 1;
  }

  return selected;
}
