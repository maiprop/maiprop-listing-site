import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { formatTimeAgo } from "@/lib/format";

describe("formatTimeAgo", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 'just now' for timestamps within the last minute", () => {
    const now = new Date("2026-04-06T10:00:00Z");
    vi.setSystemTime(now);
    expect(formatTimeAgo(new Date(now.getTime() - 30_000).toISOString())).toBe("just now");
    expect(formatTimeAgo(new Date(now.getTime() - 1_000).toISOString())).toBe("just now");
    expect(formatTimeAgo(new Date(now.getTime() - 59_000).toISOString())).toBe("just now");
  });

  it("returns 'Xm ago' for timestamps within the last hour", () => {
    const now = new Date("2026-04-06T10:00:00Z");
    vi.setSystemTime(now);
    expect(formatTimeAgo(new Date(now.getTime() - 15 * 60_000).toISOString())).toBe("15m ago");
    expect(formatTimeAgo(new Date(now.getTime() - 5 * 60_000).toISOString())).toBe("5m ago");
    // Just under an hour stays in minutes territory.
    expect(formatTimeAgo(new Date(now.getTime() - 59 * 60_000).toISOString())).toBe("59m ago");
  });

  it("returns 'Xh ago' for timestamps within the last day", () => {
    const now = new Date("2026-04-06T10:00:00Z");
    vi.setSystemTime(now);
    expect(formatTimeAgo(new Date(now.getTime() - 3 * 3600_000).toISOString())).toBe("3h ago");
    expect(formatTimeAgo(new Date(now.getTime() - 1 * 3600_000).toISOString())).toBe("1h ago");
    expect(formatTimeAgo(new Date(now.getTime() - 23 * 3600_000).toISOString())).toBe("23h ago");
  });

  it("returns 'Xd ago' for timestamps older than a day", () => {
    const now = new Date("2026-04-06T10:00:00Z");
    vi.setSystemTime(now);
    expect(formatTimeAgo(new Date(now.getTime() - 2 * 24 * 3600_000).toISOString())).toBe("2d ago");
    expect(formatTimeAgo(new Date(now.getTime() - 7 * 24 * 3600_000).toISOString())).toBe("7d ago");
    expect(formatTimeAgo(new Date(now.getTime() - 30 * 24 * 3600_000).toISOString())).toBe("30d ago");
  });

  it("crosses unit boundaries cleanly at 60 seconds, 60 minutes, 24 hours", () => {
    const now = new Date("2026-04-06T10:01:00Z");
    vi.setSystemTime(now);
    // 60s → 1m
    expect(formatTimeAgo(new Date(now.getTime() - 60_000).toISOString())).toBe("1m ago");
    // 60m → 1h
    expect(formatTimeAgo(new Date(now.getTime() - 60 * 60_000).toISOString())).toBe("1h ago");
    // 24h → 1d
    expect(formatTimeAgo(new Date(now.getTime() - 24 * 3600_000).toISOString())).toBe("1d ago");
  });
});
