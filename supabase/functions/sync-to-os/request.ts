import { parseJsonBody, z } from "../_shared/schema.ts";

const syncToOsRequestSchema = z.object({
  listing_id: z.string().uuid("Invalid listing_id"),
  entity_type: z.enum(["listing"]).default("listing"),
}).strict();

export type SyncToOsRequest = z.infer<typeof syncToOsRequestSchema>;

export function parseSyncToOsRequest(
  req: Request,
): Promise<SyncToOsRequest> {
  return parseJsonBody(req, syncToOsRequestSchema);
}
