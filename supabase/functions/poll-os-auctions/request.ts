import { z } from "../_shared/schema.ts";
import {
  OS_AUCTION_SORT_FIELDS,
  OS_AUCTION_SORT_ORDERS,
  OS_AUCTION_STATUSES,
  OS_INT64_ID_SCHEMA,
  OS_PROPERTY_CATEGORIES,
  parseOptionalOsJsonBody,
} from "../fetch-os-auctions/osFilterContract.ts";

const MAX_PAGE_SIZE = 600;
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

const pollRequestSchema = z.object({
  page: z.number().finite().int().min(0).max(100_000).optional(),
  pageSize: z.number().finite().int().min(1).max(MAX_PAGE_SIZE).optional(),
  size: z.number().finite().int().min(1).max(MAX_PAGE_SIZE).optional(),
  sampleAcrossGreece: z.boolean().optional(),
  source: z.literal("daily-canonical-pool").optional(),
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

export type PollOsAuctionsRequest = z.infer<typeof pollRequestSchema>;

export function parsePollOsAuctionsRequest(
  req: Request,
  options: { bodyReadTimeoutMs?: number } = {},
): Promise<PollOsAuctionsRequest> {
  return parseOptionalOsJsonBody(req, pollRequestSchema, options).catch(
    (error: unknown) => {
      if (error instanceof Error && "code" in error && "status" in error) {
        if (error.code === "request_body_timeout") error.status = 408;
        if (error.code === "payload_too_large") error.status = 413;
      }
      throw error;
    },
  );
}
