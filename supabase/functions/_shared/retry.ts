/**
 * Retry with exponential backoff for idempotent operations.
 *
 * ONLY use for GET/read operations and idempotent POSTs with idempotency keys.
 * NEVER retry Stripe payment creation, email sends, or other non-idempotent
 * operations without an idempotency key.
 */

export interface RetryOptions {
  /** Maximum number of retry attempts (excluding the initial call). Default: 2. */
  maxRetries?: number;
  /** Initial backoff in ms. Default: 500. */
  initialDelayMs?: number;
  /** Backoff multiplier. Default: 2. */
  backoffMultiplier?: number;
  /** Max backoff in ms. Default: 5000. */
  maxDelayMs?: number;
  /** HTTP status codes that should trigger a retry. Default: [429, 500, 502, 503, 504]. */
  retryableStatuses?: number[];
}

const DEFAULT_RETRYABLE = [429, 500, 502, 503, 504];

/**
 * Wraps a fetch call with retry logic. Returns the first successful response
 * or the last failed response after exhausting retries.
 */
export async function fetchWithRetry(
  input: string | URL | Request,
  init?: RequestInit,
  opts?: RetryOptions,
): Promise<Response> {
  const maxRetries = opts?.maxRetries ?? 2;
  const initialDelay = opts?.initialDelayMs ?? 500;
  const multiplier = opts?.backoffMultiplier ?? 2;
  const maxDelay = opts?.maxDelayMs ?? 5000;
  const retryable = opts?.retryableStatuses ?? DEFAULT_RETRYABLE;

  let lastResponse: Response | null = null;
  let delay = initialDelay;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(input, init);
      if (!retryable.includes(response.status) || attempt === maxRetries) {
        return response;
      }
      lastResponse = response;
    } catch (err) {
      if (attempt === maxRetries) throw err;
    }

    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(delay * multiplier, maxDelay);
  }

  return lastResponse!;
}
