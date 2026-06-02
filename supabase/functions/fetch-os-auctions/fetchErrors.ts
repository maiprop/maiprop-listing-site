import type { OsApiFailure } from "./types.ts";

export function isOsApiFailure(err: unknown): err is OsApiFailure {
  return typeof err === "object" &&
    err !== null &&
    "kind" in err &&
    (err as { kind?: unknown }).kind === "os-api";
}

export function getFetchErrorPayload(
  err: unknown,
): { error: string; status: number } {
  return isOsApiFailure(err)
    ? { error: "Auction provider temporarily unavailable", status: 502 }
    : { error: "Unable to fetch auctions", status: 500 };
}
