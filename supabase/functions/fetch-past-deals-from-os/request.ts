import { z } from "../_shared/schema.ts";
import { parseOptionalOsJsonBody } from "../fetch-os-auctions/osFilterContract.ts";

const pastDealsRequestSchema = z.object({
  listing_id: z.string().uuid(),
}).strict();

export type PastDealsRequest = z.infer<typeof pastDealsRequestSchema>;

export function parsePastDealsRequest(req: Request): Promise<PastDealsRequest> {
  return parseOptionalOsJsonBody(req, pastDealsRequestSchema);
}
