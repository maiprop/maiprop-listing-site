import { parseJsonBody, SchemaValidationError, z } from "../_shared/schema.ts";
import { AUCTION_FILTER_REQUEST_OPENAPI_SNAPSHOT } from "./auctionFilterRequest.openapi.snapshot.ts";

export const MAX_OS_FILTER_BODY_BYTES = 16_384;
export const MAX_OS_FILTER_BODY_READ_MS = 2_000;

export const OS_PROPERTY_CATEGORIES =
  AUCTION_FILTER_REQUEST_OPENAPI_SNAPSHOT.enums.propertyCategories;
export const OS_AUCTION_STATUSES =
  AUCTION_FILTER_REQUEST_OPENAPI_SNAPSHOT.enums.auctionStatuses;
export const OS_AUCTION_SORT_FIELDS =
  AUCTION_FILTER_REQUEST_OPENAPI_SNAPSHOT.enums.sortBy;
export const OS_AUCTION_SORT_ORDERS =
  AUCTION_FILTER_REQUEST_OPENAPI_SNAPSHOT.enums.order;

export const OS_INT64_ID_SCHEMA = z.number()
  .finite()
  .int()
  .min(Number.MIN_SAFE_INTEGER)
  .max(Number.MAX_SAFE_INTEGER);

export type OsJsonBodyReadOptions = {
  bodyReadTimeoutMs?: number;
};

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

function requestBodyTimedOut(): SchemaValidationError {
  return new SchemaValidationError("Request body read timed out", {
    code: "request_body_timeout",
    issues: [{
      code: "request_body_timeout",
      path: [],
      message: "Request body read timed out",
    }],
  });
}

async function cancelReader(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  reason: string,
): Promise<void> {
  let cancellationTimeoutId: number | undefined;
  try {
    await Promise.race([
      reader.cancel(reason).catch(() => undefined),
      new Promise<void>((resolve) => {
        cancellationTimeoutId = setTimeout(resolve, 25);
      }),
    ]);
  } finally {
    clearTimeout(cancellationTimeoutId);
  }
}

async function readBoundedBody(
  req: Request,
  timeoutMs: number,
): Promise<ArrayBuffer> {
  const contentLength = req.headers.get("content-length");
  const declaredLength = contentLength === null ? NaN : Number(contentLength);
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_OS_FILTER_BODY_BYTES
  ) {
    throw payloadTooLarge();
  }

  if (!req.body) return new ArrayBuffer(0);

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  let timedOut = false;
  let timeoutId: number | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => {
      timedOut = true;
      reject(requestBodyTimedOut());
    }, timeoutMs);
  });
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), deadline]);
      if (done) break;

      totalBytes += value.byteLength;
      if (totalBytes > MAX_OS_FILTER_BODY_BYTES) {
        try {
          await cancelReader(reader, "request body too large");
        } catch {
          // Preserve the size violation if the producer rejects cancellation.
        }
        throw payloadTooLarge();
      }
      chunks.push(value);
    }
  } catch (error) {
    if (timedOut) {
      try {
        await cancelReader(reader, "request body read timed out");
      } catch {
        // Preserve the deadline error if the producer rejects cancellation.
      }
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
    try {
      reader.releaseLock();
    } catch {
      // A timed-out producer may still be settling its pending read.
    }
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body.buffer;
}

export async function parseOptionalOsJsonBody<T>(
  req: Request,
  schema: z.ZodType<T>,
  options: OsJsonBodyReadOptions = {},
): Promise<T> {
  const timeoutMs = options.bodyReadTimeoutMs ?? MAX_OS_FILTER_BODY_READ_MS;
  const rawBody = await readBoundedBody(
    req,
    Number.isFinite(timeoutMs) && timeoutMs > 0
      ? timeoutMs
      : MAX_OS_FILTER_BODY_READ_MS,
  );
  const normalizedRequest = new Request(req.url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: rawBody.byteLength === 0 ? "{}" : rawBody,
  });
  return await parseJsonBody(normalizedRequest, schema);
}
