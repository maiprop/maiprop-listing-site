import { z } from "../_shared/schema.ts";
import { parseOptionalOsJsonBody } from "../fetch-os-auctions/osFilterContract.ts";

const auctionEnrichmentRequestSchema = z.object({
  listing_id: z.string().uuid(),
}).strict();

export type AuctionEnrichmentRequest = z.infer<
  typeof auctionEnrichmentRequestSchema
>;

export function parseAuctionEnrichmentRequest(
  req: Request,
): Promise<AuctionEnrichmentRequest> {
  return parseOptionalOsJsonBody(req, auctionEnrichmentRequestSchema);
}
