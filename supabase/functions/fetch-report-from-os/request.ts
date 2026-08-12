import { parseBoundedJsonBody, z } from "../_shared/schema.ts";

export const MAX_REPORT_REQUEST_BODY_BYTES = 32_768;
export const REPORT_REQUEST_BODY_TIMEOUT_MS = 2_000;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(
  (value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value;
  },
  { message: "Expected a valid ISO calendar date" },
);

const listingSnapshotSchema = z.object({
  id: z.string().uuid(),
  address: z.string().trim().max(500).nullable().optional(),
  city: z.string().trim().max(200).nullable().optional(),
  latitude: z.number().finite().min(-90).max(90).nullable().optional(),
  longitude: z.number().finite().min(-180).max(180).nullable().optional(),
  sqm: z.number().finite().min(0).max(10_000_000).nullable().optional(),
  property_type: z.string().trim().max(100).nullable().optional(),
  floor: z.number().finite().int().min(-20).max(300).nullable().optional(),
  year_built: z.number().finite().int().min(1000).max(2200).nullable()
    .optional(),
}).strict();

const reportRequestSchema = z.object({
  listing_id: z.string().uuid(),
  report_type: z.enum(["valuation", "neighbourhood"]),
  lang: z.enum(["en", "el"]).default("en"),
  since: isoDate.optional(),
  to: isoDate.optional(),
  listing: listingSnapshotSchema.optional(),
}).strict().superRefine((body, ctx) => {
  if (body.since && body.to && body.since > body.to) {
    ctx.addIssue({
      code: "custom",
      path: ["to"],
      message: "to must be on or after since",
    });
  }
  if (body.listing && body.listing.id !== body.listing_id) {
    ctx.addIssue({
      code: "custom",
      path: ["listing", "id"],
      message: "listing.id must match listing_id",
    });
  }
});

export type ReportRequest = z.infer<typeof reportRequestSchema>;

export function parseReportRequest(
  req: Request,
  options: { timeoutMs?: number } = {},
): Promise<ReportRequest> {
  return parseBoundedJsonBody(req, reportRequestSchema, {
    maxBytes: MAX_REPORT_REQUEST_BODY_BYTES,
    timeoutMs: options.timeoutMs ?? REPORT_REQUEST_BODY_TIMEOUT_MS,
  });
}
