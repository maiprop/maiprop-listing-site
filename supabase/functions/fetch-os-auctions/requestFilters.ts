import { z } from "../_shared/schema.ts";
import {
  OS_AUCTION_SORT_FIELDS,
  OS_AUCTION_SORT_ORDERS,
  OS_AUCTION_STATUSES,
  OS_INT64_ID_SCHEMA,
  OS_PROPERTY_CATEGORIES,
  type OsJsonBodyReadOptions,
  parseOptionalOsJsonBody,
} from "./osFilterContract.ts";

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

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(
  (value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value;
  },
  { message: "Expected a valid ISO calendar date" },
);

const propertyCategories = z.array(z.enum(OS_PROPERTY_CATEGORIES)).min(1).max(
  32,
);
const auctionStatuses = z.array(z.enum(OS_AUCTION_STATUSES)).min(1).max(32);
const nonNegativeAmount = z.number().finite().min(0).max(1_000_000_000_000);
const latitude = z.number().finite().min(-90).max(90);
const longitude = z.number().finite().min(-180).max(180);

const boundingBoxSchema = z.object({
  north: latitude,
  south: latitude,
  east: longitude,
  west: longitude,
}).strict().superRefine((box, ctx) => {
  if (box.north < box.south) {
    ctx.addIssue({
      code: "custom",
      path: ["north"],
      message: "north must be greater than or equal to south",
    });
  }
  if (box.east < box.west) {
    ctx.addIssue({
      code: "custom",
      path: ["east"],
      message: "east must be greater than or equal to west",
    });
  }
});

const auctionRequestSchema = z.object({
  page: z.number().finite().int().min(0).max(100_000).optional(),
  pageSize: z.number().finite().int().min(1).max(600).optional(),
  size: z.number().finite().int().min(1).max(600).optional(),
  sampleAcrossGreece: z.boolean().optional(),
  auctionDateFrom: isoDate.optional(),
  auctionDateTo: isoDate.optional(),
  propertyCategories: propertyCategories.optional(),
  prefectureId: OS_INT64_ID_SCHEMA.optional(),
  propertyMunicipalityId: OS_INT64_ID_SCHEMA.optional(),
  auctionStatuses: auctionStatuses.optional(),
  auctionAmountFrom: nonNegativeAmount.optional(),
  auctionAmountTo: nonNegativeAmount.optional(),
  boundingBox: boundingBoxSchema.optional(),
  sortBy: z.enum(OS_AUCTION_SORT_FIELDS).optional(),
  order: z.enum(OS_AUCTION_SORT_ORDERS).optional(),
}).strict().superRefine((body, ctx) => {
  if (
    body.pageSize !== undefined && body.size !== undefined &&
    body.pageSize !== body.size
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["size"],
      message: "size and pageSize must match when both are supplied",
    });
  }
  if (
    body.auctionDateFrom && body.auctionDateTo &&
    body.auctionDateFrom > body.auctionDateTo
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["auctionDateTo"],
      message: "auctionDateTo must be on or after auctionDateFrom",
    });
  }
  if (
    body.auctionAmountFrom !== undefined &&
    body.auctionAmountTo !== undefined &&
    body.auctionAmountFrom > body.auctionAmountTo
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["auctionAmountTo"],
      message:
        "auctionAmountTo must be greater than or equal to auctionAmountFrom",
    });
  }
});

export type AuctionRequest = z.infer<typeof auctionRequestSchema>;

export function parseAuctionRequest(
  req: Request,
  options: OsJsonBodyReadOptions = {},
): Promise<AuctionRequest> {
  return parseOptionalOsJsonBody(req, auctionRequestSchema, options);
}

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

function hasDefinedFilterValue([, value]: FilterEntry): boolean {
  return value !== undefined && value !== null;
}

function getOptionalFilters(
  body: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    OPTIONAL_FILTER_KEYS
      .map(function getOptionalFilterEntry(key) {
        return [key, body[key]] as const;
      })
      .filter(hasDefinedFilterValue),
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
