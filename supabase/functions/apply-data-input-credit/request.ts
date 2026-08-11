import { parseJsonBody, SchemaValidationError, z } from "../_shared/schema.ts";

const MAX_REQUEST_BODY_BYTES = 16_384;

const applyDataInputCreditRequestSchema = z.object({
  data_input_id: z.string().uuid(),
}).strict();

export type ApplyDataInputCreditRequest = z.infer<
  typeof applyDataInputCreditRequestSchema
>;

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

async function readBoundedBody(req: Request): Promise<ArrayBuffer> {
  const contentLength = req.headers.get("content-length");
  const declaredLength = contentLength === null ? NaN : Number(contentLength);
  if (
    Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BODY_BYTES
  ) {
    throw payloadTooLarge();
  }

  if (!req.body) return new ArrayBuffer(0);

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      totalBytes += value.byteLength;
      if (totalBytes > MAX_REQUEST_BODY_BYTES) {
        try {
          await reader.cancel("request body too large");
        } catch {
          // Preserve the size violation if the body producer rejects cancellation.
        }
        throw payloadTooLarge();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body.buffer;
}

export async function parseApplyDataInputCreditRequest(
  req: Request,
): Promise<ApplyDataInputCreditRequest> {
  const rawBody = await readBoundedBody(req);
  const boundedRequest = new Request(req.url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: rawBody,
  });
  return await parseJsonBody(boundedRequest, applyDataInputCreditRequestSchema);
}
