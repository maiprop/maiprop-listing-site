import { z } from "../_shared/schema.ts";
import { parseOptionalOsJsonBody } from "../fetch-os-auctions/osFilterContract.ts";

const flagAuctionRequestSchema = z.object({
  listing_id: z.string().uuid(),
  message: z.string().max(1000).optional(),
}).strict();

export type FlagAuctionRequest = z.infer<typeof flagAuctionRequestSchema>;

export function parseFlagAuctionRequest(
  req: Request,
): Promise<FlagAuctionRequest> {
  return parseOptionalOsJsonBody(req, flagAuctionRequestSchema);
}
