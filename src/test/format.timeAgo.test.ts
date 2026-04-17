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
    const iso = new Date(now.getTime() - 30_000).toISOString(); // 30s ago
    expect(formatTimeAgo(iso)).toBe("just now");
  });

  it("returns 'Xm ago' for timestamps within the last hour", () => {
    const now = new Date("2026-04-06T10:00:00Z");
    vi.setSystemTime(now);
    const iso = new Date(now.getTime() - 15 * 60_000).toISOString(); // 15m ago
    expect(formatTimeAgo(iso)).toBe("15m ago");
  });

  it("returns 'Xh ago' for timestamps within the last day", () => {
    const now = new Date("2026-04-06T10:00:00Z");
    vi.setSystemTime(now);
    const iso = new Date(now.getTime() - 3 * 3600_000).toISOString(); // 3h ago
    expect(formatTimeAgo(iso)).toBe("3h ago");
  });

  it("returns 'Xd ago' for timestamps older than a day", () => {
    const now = new Date("2026-04-06T10:00:00Z");
    vi.setSystemTime(now);
    const iso = new Date(now.getTime() - 2 * 24 * 3600_000).toISOString(); // 2 days ago
    expect(formatTimeAgo(iso)).toBe("2d ago");
  });

  it("returns '1m ago' for exactly 60 seconds ago", () => {
    const now = new Date("2026-04-06T10:01:00Z");
    vi.setSystemTime(now);
    const iso = new Date(now.getTime() - 60_000).toISOString();
    expect(formatTimeAgo(iso)).toBe("1m ago");
  });
});
