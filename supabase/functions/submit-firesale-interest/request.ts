import { parseJsonBody, SchemaValidationError, z } from "../_shared/schema.ts";
import { MAX_FIRE_SALE_AMOUNT_EUR } from "../_shared/firesale.ts";

export const MAX_SUBMIT_FIRESALE_BODY_BYTES = 16_384;

const submitFiresaleInterestRequestSchema = z.object({
  dealId: z.string().uuid("Invalid dealId"),
  message: z.string().trim().max(1000, "Invalid message").nullable().optional(),
  proofAmount: z.number()
    .finite("Invalid proofAmount")
    .min(0, "Invalid proofAmount")
    .max(MAX_FIRE_SALE_AMOUNT_EUR, "Invalid proofAmount")
    .nullable()
    .optional(),
  proofOfFundsUrl: z.string()
    .trim()
    .max(512, "Invalid proofOfFundsUrl")
    .nullable()
    .optional(),
}).strict();

export type SubmitFiresaleInterestRequest = z.infer<
  typeof submitFiresaleInterestRequestSchema
>;

export function parseSubmitFiresaleInterestRequest(
  req: Request,
): Promise<SubmitFiresaleInterestRequest> {
  return parseLimitedJsonBody(req);
}

function payloadTooLarge(): SchemaValidationError {
  return new SchemaValidationError("Request body too large", {
    code: "payload_too_large",
    issues: [{
      code: "payload_too_large",
      path: [],
      message: "Request body too large",
    }],
  });
}

async function parseLimitedJsonBody(
  req: Request,
): Promise<SubmitFiresaleInterestRequest> {
  const declaredLength = Number(req.headers.get("content-length"));
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_SUBMIT_FIRESALE_BODY_BYTES
  ) {
    throw payloadTooLarge();
  }

  if (!req.body) {
    return parseJsonBody(req, submitFiresaleInterestRequestSchema);
  }

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_SUBMIT_FIRESALE_BODY_BYTES) {
      await reader.cancel();
      throw payloadTooLarge();
    }
    chunks.push(value);
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  const boundedRequest = new Request(req.url, {
    method: req.method,
    headers: req.headers,
    body,
  });
  return parseJsonBody(boundedRequest, submitFiresaleInterestRequestSchema);
}
