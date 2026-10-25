import { describe, expect, it, vi } from "vitest";
import {
  parsePollArgs,
  waitForAuctionPool,
} from "./wait-for-staging-auction-pool.mjs";

const okResponse = (body) => ({
  ok: true,
  status: 200,
  json: async () => body,
});

describe("wait-for-staging-auction-pool", () => {
  it("requires a valid deployment base URL", () => {
    expect(() => parsePollArgs([])).toThrow("base URL is required");
    expect(() => parsePollArgs(["not-a-url"])).toThrow("Invalid staged deployment base URL");
    expect(parsePollArgs(["https://1488fe64.example.pages.dev/"]).baseUrl)
      .toBe("https://1488fe64.example.pages.dev");
  });

  it("rejects unknown or invalid options", () => {
    expect(() => parsePollArgs(["https://x.example/", "--bogus=1"])).toThrow("Unknown option");
    expect(() => parsePollArgs(["https://x.example/", "--timeout-ms=0"])).toThrow("Invalid timeout-ms");
  });

  it("resolves as soon as the pool serves rows", async () => {
    const fetchImpl = vi.fn(async () => okResponse({ data: [{ id: "a" }], total: 1 }));

    const result = await waitForAuctionPool({
      baseUrl: "https://1488fe64.example.pages.dev",
      fetchImpl,
      sleepImpl: vi.fn(),
    });

    expect(result).toMatchObject({ status: "ready", attempts: 1, auctionRows: 1 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0]).toBe(
      "https://1488fe64.example.pages.dev/api/public/auctions?limit=60",
    );
  });

  it("retries empty pools and transient failures until rows appear", async () => {
    const fetchImpl = vi.fn()
      .mockImplementationOnce(async () => okResponse({ data: [], total: 0 }))
      .mockImplementationOnce(async () => ({ ok: false, status: 503 }))
      .mockImplementationOnce(async () => { throw new Error("boom"); })
      .mockImplementationOnce(async () => okResponse({ data: [{ id: "a" }, { id: "b" }], total: 2 }));
    const sleeps = [];
    let now = 0;

    const result = await waitForAuctionPool({
      baseUrl: "https://1488fe64.example.pages.dev",
      timeoutMs: 60_000,
      intervalMs: 5_000,
      fetchImpl,
      sleepImpl: async (ms) => { sleeps.push(ms); now += ms; },
      nowImpl: () => now,
    });

    expect(result).toMatchObject({ status: "ready", attempts: 4, auctionRows: 2 });
    expect(sleeps).toEqual([5_000, 5_000, 5_000]);
  });

  it("times out when the pool stays empty", async () => {
    const fetchImpl = vi.fn(async () => okResponse({ data: [], total: 0 }));
    let now = 0;

    await expect(waitForAuctionPool({
      baseUrl: "https://1488fe64.example.pages.dev",
      timeoutMs: 25_000,
      intervalMs: 10_000,
      fetchImpl,
      sleepImpl: async (ms) => { now += ms; },
      nowImpl: () => now,
    })).rejects.toThrow("showed no rows within 25000ms");
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
});
