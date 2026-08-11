export class ProviderResponseTooLargeError extends Error {
  readonly code = "provider_response_too_large";
  readonly maxBytes: number;

  constructor(maxBytes: number) {
    super(`Provider response exceeded ${maxBytes} bytes`);
    this.name = "ProviderResponseTooLargeError";
    this.maxBytes = maxBytes;
  }
}

export type BufferedProviderFetchOptions = {
  timeoutMs: number;
  maxResponseBytes: number;
  timeoutMessage?: string;
};

function cancelWithoutBlocking(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  reason: string,
): void {
  try {
    void reader.cancel(reason).catch(() => undefined);
  } catch {
    // Preserve the provider boundary error if cancellation fails synchronously.
  }
}

export async function fetchBufferedProviderResponse(
  url: string,
  init: RequestInit,
  options: BufferedProviderFetchOptions,
): Promise<Response> {
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 1) {
    throw new Error("Invalid provider deadline");
  }
  if (
    !Number.isFinite(options.maxResponseBytes) ||
    options.maxResponseBytes < 1
  ) {
    throw new Error("Invalid provider response byte ceiling");
  }

  const timeoutMessage = options.timeoutMessage ?? "Provider request timed out";
  const controller = new AbortController();
  let timedOut = false;
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
      reject(new DOMException(timeoutMessage, "AbortError"));
    }, options.timeoutMs);
  });

  try {
    const response = await Promise.race([
      fetch(url, { ...init, signal: controller.signal }),
      deadline,
    ]);
    if (!response.body) return response;

    reader = response.body.getReader();
    const declaredLength = Number(response.headers.get("content-length"));
    if (
      Number.isFinite(declaredLength) &&
      declaredLength > options.maxResponseBytes
    ) {
      cancelWithoutBlocking(reader, "provider response too large");
      controller.abort();
      throw new ProviderResponseTooLargeError(options.maxResponseBytes);
    }

    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    while (true) {
      const { done, value } = await Promise.race([reader.read(), deadline]);
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > options.maxResponseBytes) {
        cancelWithoutBlocking(reader, "provider response too large");
        controller.abort();
        throw new ProviderResponseTooLargeError(options.maxResponseBytes);
      }
      chunks.push(value);
    }

    const bufferedBody = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      bufferedBody.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return new Response(totalBytes === 0 ? null : bufferedBody, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  } catch (error: unknown) {
    if (timedOut) {
      if (reader) cancelWithoutBlocking(reader, timeoutMessage);
      throw new DOMException(timeoutMessage, "AbortError");
    }
    throw error;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    if (reader) {
      try {
        reader.releaseLock();
      } catch {
        // A non-cooperative producer may retain its pending read.
      }
    }
  }
}
