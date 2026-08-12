import { z } from "../_shared/schema.ts";
import {
  OS_AUCTION_STATUSES,
  OS_INT64_ID_SCHEMA,
  OS_PROPERTY_CATEGORIES,
  parseOptionalOsJsonBody,
} from "../fetch-os-auctions/osFilterContract.ts";

const MAX_PAGE_SIZE = 500;
const MAX_PAGE_COUNT = 500;
const positiveInteger = (maximum: number) =>
  z.number().finite().int().min(1).max(maximum);

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

const fullSyncRequestSchema = z.object({
  pageSize: positiveInteger(MAX_PAGE_SIZE).optional(),
  size: positiveInteger(MAX_PAGE_SIZE).optional(),
  maxPages: positiveInteger(MAX_PAGE_COUNT).optional(),
  startPage: z.number().finite().int().min(0).max(100_000).optional(),
  replaceAll: z.boolean().optional(),
  replace_all: z.boolean().optional(),
  auctionDateFrom: isoDate.optional(),
  auctionDateTo: isoDate.optional(),
  propertyCategories: propertyCategories.optional(),
  prefectureId: OS_INT64_ID_SCHEMA.optional(),
  propertyMunicipalityId: OS_INT64_ID_SCHEMA.optional(),
  auctionStatuses: auctionStatuses.optional(),
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
    body.replaceAll !== undefined && body.replace_all !== undefined &&
    body.replaceAll !== body.replace_all
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["replace_all"],
      message: "replace_all and replaceAll must match when both are supplied",
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
});

export type FullSyncRequest = z.infer<typeof fullSyncRequestSchema>;

export async function parseFullSyncRequest(
  req: Request,
  options: { bodyReadTimeoutMs?: number } = {},
): Promise<FullSyncRequest> {
  try {
    return await parseOptionalOsJsonBody(req, fullSyncRequestSchema, options);
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && "status" in error) {
      if (error.code === "request_body_timeout") error.status = 408;
      if (error.code === "payload_too_large") error.status = 413;
    }
    throw error;
  }
}
