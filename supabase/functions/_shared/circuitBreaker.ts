/**
 * In-memory circuit breaker for external service calls.
 *
 * States:
 *   CLOSED  — requests flow normally, failures are counted
 *   OPEN    — requests are rejected immediately (fail-fast)
 *   HALF_OPEN — one probe request is allowed; success closes, failure re-opens
 *
 * Deno Deploy runs each isolate with its own memory, so circuit state is
 * per-isolate — a regional outage will trip breakers independently per region,
 * which is the desired behaviour for edge functions.
 */

type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

interface CircuitBreakerOptions {
  /** How many consecutive failures before the circuit opens. Default: 5 */
  failureThreshold?: number;
  /** How long (ms) the circuit stays open before allowing a probe. Default: 30 000 (30s) */
  resetTimeoutMs?: number;
  /** Optional name for logging. */
  name?: string;
}

interface CircuitBreakerState {
  state: CircuitState;
  failures: number;
  lastFailureAt: number;
}

const breakers = new Map<string, CircuitBreakerState>();

function getOrCreate(key: string): CircuitBreakerState {
  let b = breakers.get(key);
  if (!b) {
    b = { state: "CLOSED", failures: 0, lastFailureAt: 0 };
    breakers.set(key, b);
  }
  return b;
}

export class CircuitOpenError extends Error {
  constructor(name: string) {
    super(`Circuit breaker "${name}" is OPEN — request rejected`);
    this.name = "CircuitOpenError";
  }
}

/**
 * Wraps an async function with circuit breaker logic.
 *
 * Usage:
 *   const cb = makeCircuitBreaker({ name: "openai", failureThreshold: 3 });
 *   const result = await cb.call(() => fetch("https://api.openai.com/..."));
 */
export function makeCircuitBreaker(opts: CircuitBreakerOptions = {}) {
  const {
    failureThreshold = 5,
    resetTimeoutMs = 30_000,
    name = "default",
  } = opts;

  const key = `cb:${name}`;

  return {
    get state(): CircuitState {
      return getOrCreate(key).state;
    },

    async call<T>(fn: () => Promise<T>): Promise<T> {
      const b = getOrCreate(key);

      if (b.state === "OPEN") {
        if (Date.now() - b.lastFailureAt >= resetTimeoutMs) {
          b.state = "HALF_OPEN";
        } else {
          throw new CircuitOpenError(name);
        }
      }

      try {
        const result = await fn();
        // Success — reset to CLOSED
        b.state = "CLOSED";
        b.failures = 0;
        return result;
      } catch (err) {
        b.failures += 1;
        b.lastFailureAt = Date.now();
        if (b.failures >= failureThreshold) {
          b.state = "OPEN";
        }
        throw err;
      }
    },

    reset(): void {
      const b = getOrCreate(key);
      b.state = "CLOSED";
      b.failures = 0;
      b.lastFailureAt = 0;
    },
  };
}
