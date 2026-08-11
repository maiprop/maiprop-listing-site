import { parseJsonBody, z } from "../_shared/schema.ts";

const syncFiresaleToOsRequestSchema = z.object({
  firesale_id: z.string().uuid("Invalid firesale_id"),
}).strict();

export type SyncFiresaleToOsRequest = z.infer<
  typeof syncFiresaleToOsRequestSchema
>;

export function parseSyncFiresaleToOsRequest(
  req: Request,
): Promise<SyncFiresaleToOsRequest> {
  return parseJsonBody(req, syncFiresaleToOsRequestSchema);
}
