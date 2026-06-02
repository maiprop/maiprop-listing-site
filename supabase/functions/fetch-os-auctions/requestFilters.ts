const OPTIONAL_FILTER_KEYS = [
  "auctionDateTo",
  "propertyCategories",
  "prefectureId",
  "propertyMunicipalityId",
  "auctionStatuses",
  "boundingBox",
] as const;

const AMOUNT_FILTER_KEYS = ["auctionAmountFrom", "auctionAmountTo"] as const;
const SORT_FILTER_KEYS = ["sortBy", "order"] as const;

function getDefaultPageSize(planCap: number): number {
  return planCap;
}

function getFiniteInteger(
  body: Record<string, unknown>,
  key: string,
  fallback: number,
): number | null {
  const raw = body[key];
  const value = raw == null ? fallback : Number(raw);
  return Number.isFinite(value) && Number.isInteger(value) ? value : null;
}

export function getValidatedPagination(
  body: Record<string, unknown>,
  planCap: number,
): { page: number; size: number } | { error: string } {
  const page = getFiniteInteger(body, "page", 0);
  if (page == null || page < 0) {
    return { error: "page must be a finite non-negative integer" };
  }

  const rawSize = body.pageSize ?? body.size;
  const size = rawSize == null
    ? getDefaultPageSize(planCap)
    : getFiniteInteger({ size: rawSize }, "size", planCap);
  if (size == null || size < 1 || size > planCap) {
    return {
      error: `pageSize must be a finite integer between 1 and ${planCap}`,
    };
  }

  return { page, size };
}

type FilterEntry = readonly [string, unknown];

function hasTruthyFilterValue([, value]: FilterEntry): boolean {
  return Boolean(value);
}

function getOptionalFilters(
  body: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    OPTIONAL_FILTER_KEYS
      .map(function getOptionalFilterEntry(key) {
        return [key, body[key]] as const;
      })
      .filter(hasTruthyFilterValue),
  );
}

function getAmountFilterEntries(body: Record<string, unknown>): FilterEntry[] {
  return AMOUNT_FILTER_KEYS.flatMap(function getAmountFilterEntry(key) {
    return body[key] == null ? [] : [[key, body[key]] as const];
  });
}

function getStringFilterEntries(
  body: Record<string, unknown>,
  keys: readonly string[],
): FilterEntry[] {
  return keys.flatMap(function getStringFilterEntry(key) {
    return typeof body[key] === "string" ? [[key, body[key]] as const] : [];
  });
}

export function buildFilterRequest(
  body: Record<string, unknown>,
): Record<string, unknown> {
  return {
    auctionDateFrom: body.auctionDateFrom ??
      new Date().toISOString().split("T")[0],
    ...getOptionalFilters(body),
    ...Object.fromEntries(getAmountFilterEntries(body)),
    ...Object.fromEntries(getStringFilterEntries(body, SORT_FILTER_KEYS)),
  };
}
