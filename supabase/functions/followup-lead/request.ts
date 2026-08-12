import { parseJsonBody, z } from "../_shared/schema.ts";

const followupLeadRequestSchema = z.object({
  lead_id: z.string().uuid("Invalid lead_id"),
  step: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  preview_only: z.boolean().optional(),
}).strict();

export type FollowupLeadRequest = z.infer<typeof followupLeadRequestSchema>;

export function parseFollowupLeadRequest(
  req: Request,
): Promise<FollowupLeadRequest> {
  return parseJsonBody(req, followupLeadRequestSchema);
}
