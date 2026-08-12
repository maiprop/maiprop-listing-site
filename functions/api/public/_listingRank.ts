const CATALOGUE_BLOCK_SIZE = 12;
const PRIORITY_SLOTS_PER_BLOCK = 3;
export const MAX_CATALOGUE_STREAM_OFFSET = 100_000;

const CATALOGUE_SORT_NAMES = [
  "featured",
  "newest",
  "price-asc",
  "price-desc",
  "ai-score",
  "views",
] as const;

export type CatalogueSortName = (typeof CATALOGUE_SORT_NAMES)[number];

export type CatalogueSort = {
  name: CatalogueSortName;
  field: "created_at" | "price" | "ai_score" | "views_count";
  order: string;
  keysetOperator: "gt" | "lt";
  usesOffset: boolean;
};

export type CatalogueStreamAnchor = {
  id: string;
  value: string | number | null;
  offset: number;
};

export type CatalogueCursor = {
  v: 3;
  publicationId: number;
  sort: CatalogueSortName;
  asOf: string;
  scope: string;
  slot: number;
  priorityOffset: number;
  organicOffset: number;
  priority?: CatalogueStreamAnchor;
  organic?: CatalogueStreamAnchor;
};

type CatalogueRow = {
  id: string;
  [key: string]: unknown;
};

export type CatalogueInterleaveResult<T extends CatalogueRow> = {
  data: T[];
  consumedPriority: number;
  consumedOrganic: number;
  nextSlot: number;
  lastPriority?: T;
  lastOrganic?: T;
};

const SORTS: Record<CatalogueSortName, CatalogueSort> = {
  featured: {
    name: "featured",
    field: "created_at",
    order: "created_at.desc",
    keysetOperator: "lt",
    usesOffset: false,
  },
  newest: {
    name: "newest",
    field: "created_at",
    order: "created_at.desc",
    keysetOperator: "lt",
    usesOffset: false,
  },
  "price-asc": {
    name: "price-asc",
    field: "price",
    order: "price.asc",
    keysetOperator: "gt",
    usesOffset: false,
  },
  "price-desc": {
    name: "price-desc",
    field: "price",
    order: "price.desc",
    keysetOperator: "lt",
    usesOffset: false,
  },
  "ai-score": {
    name: "ai-score",
    field: "ai_score",
    order: "ai_score.desc.nullslast",
    keysetOperator: "lt",
    usesOffset: false,
  },
  views: {
    name: "views",
    field: "views_count",
    order: "views_count.desc.nullslast",
    keysetOperator: "lt",
    usesOffset: false,
  },
};

export function resolveCatalogueSort(value: unknown): CatalogueSort {
  return typeof value === "string" && CATALOGUE_SORT_NAMES.includes(value as CatalogueSortName)
    ? SORTS[value as CatalogueSortName]
    : SORTS.featured;
}

function normalizedSlot(slot: number): number {
  if (!Number.isFinite(slot)) return 0;
  const integer = Math.trunc(slot);
  return ((integer % CATALOGUE_BLOCK_SIZE) + CATALOGUE_BLOCK_SIZE) % CATALOGUE_BLOCK_SIZE;
}

export function interleaveCatalogueStreams<T extends CatalogueRow>(
  priorityRows: readonly T[],
  organicRows: readonly T[],
  limit: number,
  startSlot: number,
): CatalogueInterleaveResult<T> {
  const data: T[] = [];
  const seen = new Set<string>();
  const boundedLimit = Math.max(0, Math.trunc(limit));
  let priorityIndex = 0;
  let organicIndex = 0;
  let lastPriority: T | undefined;
  let lastOrganic: T | undefined;

  const takePriority = (): T | undefined => {
    while (priorityIndex < priorityRows.length) {
      const row = priorityRows[priorityIndex++];
      lastPriority = row;
      if (!seen.has(row.id)) return row;
    }
    return undefined;
  };
  const takeOrganic = (): T | undefined => {
    while (organicIndex < organicRows.length) {
      const row = organicRows[organicIndex++];
      lastOrganic = row;
      if (!seen.has(row.id)) return row;
    }
    return undefined;
  };

  while (
    data.length < boundedLimit &&
    (priorityIndex < priorityRows.length || organicIndex < organicRows.length)
  ) {
    const slot = (normalizedSlot(startSlot) + data.length) % CATALOGUE_BLOCK_SIZE;
    const prioritySlot = slot < PRIORITY_SLOTS_PER_BLOCK;
    const row = prioritySlot
      ? takePriority() ?? takeOrganic()
      : takeOrganic() ?? takePriority();
    if (!row) break;
    seen.add(row.id);
    data.push(row);
  }

  return {
    data,
    consumedPriority: priorityIndex,
    consumedOrganic: organicIndex,
    nextSlot: (normalizedSlot(startSlot) + data.length) % CATALOGUE_BLOCK_SIZE,
    lastPriority,
    lastOrganic,
  };
}

function safeStreamOffset(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(MAX_CATALOGUE_STREAM_OFFSET, Math.max(0, Math.trunc(value)));
}

export function catalogueStreamOffsetsForOutputOffset(outputOffset: number): {
  slot: number;
  priorityOffset: number;
  organicOffset: number;
} {
  const offset = safeStreamOffset(outputOffset);
  const completeBlocks = Math.floor(offset / CATALOGUE_BLOCK_SIZE);
  const remainingSlots = offset % CATALOGUE_BLOCK_SIZE;
  const priorityOffset = completeBlocks * PRIORITY_SLOTS_PER_BLOCK +
    Math.min(remainingSlots, PRIORITY_SLOTS_PER_BLOCK);
  return {
    slot: remainingSlots,
    priorityOffset,
    organicOffset: offset - priorityOffset,
  };
}

export function catalogueStreamOffsetsForAvailableRows(
  outputOffset: number,
  availablePriorityRows: number,
  availableOrganicRows: number,
): {
  slot: number;
  priorityOffset: number;
  organicOffset: number;
} {
  const offset = safeStreamOffset(outputOffset);
  const planned = catalogueStreamOffsetsForOutputOffset(offset);
  const priorityAvailable = safeStreamOffset(availablePriorityRows);
  const organicAvailable = safeStreamOffset(availableOrganicRows);
  const priorityWasShort = priorityAvailable < planned.priorityOffset;
  const organicWasShort = organicAvailable < planned.organicOffset;
  let priorityOffset = Math.min(planned.priorityOffset, priorityAvailable);
  let organicOffset = Math.min(planned.organicOffset, organicAvailable);
  let remaining = offset - priorityOffset - organicOffset;

  if (priorityWasShort && remaining > 0) {
    const organicFallback = Math.min(remaining, organicAvailable - organicOffset);
    organicOffset += organicFallback;
    remaining -= organicFallback;
  }
  if (organicWasShort && remaining > 0) {
    const priorityFallback = Math.min(remaining, priorityAvailable - priorityOffset);
    priorityOffset += priorityFallback;
  }

  return {
    slot: (priorityOffset + organicOffset) % CATALOGUE_BLOCK_SIZE,
    priorityOffset,
    organicOffset,
  };
}

function validCursorId(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(value);
}

function validIsoTimestamp(value: unknown): value is string {
  return typeof value === "string" &&
    value.length <= 64 &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/
      .test(value) &&
    Number.isFinite(Date.parse(value));
}

function validSnapshotTime(value: unknown): value is string {
  if (!validIsoTimestamp(value)) return false;
  const snapshot = Date.parse(value);
  const now = Date.now();
  return snapshot <= now + 30_000 &&
    snapshot >= now - 45 * 60_000;
}

function validPublicationId(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function validScope(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 1_536;
}

function validSortValue(value: unknown, sort: CatalogueSort): value is string | number | null {
  if (sort.name === "ai-score" && value === null) return true;
  if (sort.usesOffset) return value === null || (typeof value === "number" && Number.isFinite(value));
  if (sort.field === "created_at") {
    return validIsoTimestamp(value) &&
      !/[(),]/.test(value) &&
      Number.isFinite(Date.parse(value));
  }
  return typeof value === "number" && Number.isFinite(value);
}

function validAnchor(value: unknown, sort: CatalogueSort, streamOffset: number): value is CatalogueStreamAnchor {
  if (!value || typeof value !== "object") return false;
  const anchor = value as Partial<CatalogueStreamAnchor>;
  return validCursorId(anchor.id) &&
    validSortValue(anchor.value, sort) &&
    Number.isInteger(anchor.offset) &&
    Number(anchor.offset) >= 0 &&
    Number(anchor.offset) <= streamOffset;
}

function decodeBase64Url(value: string): string {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  return atob(`${base64}${padding}`);
}

function encodeBase64Url(value: string): string {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function decodeCatalogueCursor(
  encoded: string | null | undefined,
  sort: CatalogueSort,
  expectedScope?: string,
): CatalogueCursor | null {
  if (!encoded || encoded.length > 2_048 || !encoded.startsWith("v3.")) return null;
  try {
    const parsed = JSON.parse(decodeBase64Url(encoded.slice(3))) as Partial<CatalogueCursor>;
    if (
      parsed.v !== 3 ||
      !validPublicationId(parsed.publicationId) ||
      parsed.sort !== sort.name ||
      !validSnapshotTime(parsed.asOf) ||
      !validScope(parsed.scope) ||
      !Number.isInteger(parsed.slot) ||
      Number(parsed.slot) < 0 ||
      Number(parsed.slot) >= CATALOGUE_BLOCK_SIZE ||
      !Number.isInteger(parsed.priorityOffset) ||
      Number(parsed.priorityOffset) < 0 ||
      Number(parsed.priorityOffset) > MAX_CATALOGUE_STREAM_OFFSET ||
      !Number.isInteger(parsed.organicOffset) ||
      Number(parsed.organicOffset) < 0 ||
      Number(parsed.organicOffset) > MAX_CATALOGUE_STREAM_OFFSET
    ) {
      return null;
    }

    const cursor = parsed as CatalogueCursor;
    if (expectedScope !== undefined && cursor.scope !== expectedScope) return null;
    if (cursor.priority && !validAnchor(cursor.priority, sort, cursor.priorityOffset)) return null;
    if (cursor.organic && !validAnchor(cursor.organic, sort, cursor.organicOffset)) return null;
    return cursor;
  } catch {
    return null;
  }
}

function rowAnchor<T extends CatalogueRow>(
  row: T | undefined,
  sort: CatalogueSort,
  offset: number,
): CatalogueStreamAnchor | undefined {
  if (!row || !validCursorId(row.id)) return undefined;
  const value = row[sort.field];
  if (!validSortValue(value, sort)) return undefined;
  return { id: row.id, value, offset };
}

export function buildNextCatalogueCursor<T extends CatalogueRow>(
  previous: CatalogueCursor | null,
  sort: CatalogueSort,
  page: CatalogueInterleaveResult<T>,
  publicationId: number,
  asOf: string,
  scope: string,
): string {
  if (!validPublicationId(publicationId)) {
    throw new Error("Catalogue publication ID is invalid");
  }
  const base = previous?.sort === sort.name &&
      previous.publicationId === publicationId
    ? previous
    : {
        v: 3 as const,
        publicationId,
        sort: sort.name,
        asOf,
        scope,
        slot: 0,
        priorityOffset: 0,
        organicOffset: 0,
      };
  const priorityOffset = safeStreamOffset(base.priorityOffset + page.consumedPriority);
  const organicOffset = safeStreamOffset(base.organicOffset + page.consumedOrganic);
  const cursor: CatalogueCursor = {
    v: 3,
    publicationId: base.publicationId,
    sort: sort.name,
    asOf: base.asOf,
    scope: base.scope,
    slot: page.nextSlot,
    priorityOffset,
    organicOffset,
    priority: rowAnchor(page.lastPriority, sort, priorityOffset) ?? base.priority,
    organic: rowAnchor(page.lastOrganic, sort, organicOffset) ?? base.organic,
  };
  const payload = encodeBase64Url(JSON.stringify(cursor));
  return `v3.${payload}`;
}

export function canAdvanceCatalogueCursor<T extends CatalogueRow>(
  previous: CatalogueCursor | null,
  sort: CatalogueSort,
  page: CatalogueInterleaveResult<T>,
): boolean {
  if (!sort.usesOffset) return true;
  const priorityOffset = (previous?.priorityOffset ?? 0) + page.consumedPriority;
  const organicOffset = (previous?.organicOffset ?? 0) + page.consumedOrganic;
  return priorityOffset <= MAX_CATALOGUE_STREAM_OFFSET &&
    organicOffset <= MAX_CATALOGUE_STREAM_OFFSET;
}

export function applyCatalogueStreamCursor(
  params: URLSearchParams,
  sort: CatalogueSort,
  anchor?: CatalogueStreamAnchor | null,
): void {
  params.set("order", `${sort.order},id.desc`);

  if (!anchor) return;
  if (sort.name === "ai-score") {
    if (!validAnchor(anchor, sort, MAX_CATALOGUE_STREAM_OFFSET)) return;
    if (anchor.value === null) {
      params.set("ai_score", "is.null");
      params.set("id", `lt.${anchor.id}`);
      return;
    }
    params.append(
      "or",
      `(ai_score.lt.${anchor.value},and(ai_score.eq.${anchor.value},id.lt.${anchor.id}),ai_score.is.null)`,
    );
    return;
  }
  if (sort.usesOffset) {
    if (anchor.offset > 0) params.set("offset", String(safeStreamOffset(anchor.offset)));
    return;
  }
  if (!validAnchor(anchor, sort, MAX_CATALOGUE_STREAM_OFFSET)) return;

  const value = String(anchor.value);
  params.append(
    "or",
    `(${sort.field}.${sort.keysetOperator}.${value},and(${sort.field}.eq.${value},id.lt.${anchor.id}))`,
  );
}
