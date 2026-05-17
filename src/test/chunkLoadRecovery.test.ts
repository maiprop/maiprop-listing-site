import { describe, expect, it, vi } from "vitest";
import { installChunkLoadRecovery, isChunkLoadError, recoverFromChunkLoadError } from "@/lib/chunkLoadRecovery";

const memoryStorage = (): Pick<Storage, "getItem" | "setItem"> => {
  const values = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    }),
  };
};

describe("chunk load recovery", () => {
  it("detects Vite dynamic import chunk failures", () => {
    expect(
      isChunkLoadError(new Error("Failed to fetch dynamically imported module: /assets/Login-old.js")),
    ).toBe(true);
    expect(isChunkLoadError(new Error("Importing a module script failed."))).toBe(true);
    expect(
      isChunkLoadError(
        new TypeError("Expected a JavaScript module script but the server responded with a MIME type of text/html"),
      ),
    ).toBe(true);
    expect(isChunkLoadError(new Error("normal render failure"))).toBe(false);
  });

  it("reloads stale chunks, throttles the same chunk briefly, and caps loops", () => {
    const reload = vi.fn();
    const storage = memoryStorage();
    const error = new Error("Failed to fetch dynamically imported module: /assets/Login-old.js");

    expect(recoverFromChunkLoadError(error, { reload, storage, now: () => 10_000 })).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);

    expect(recoverFromChunkLoadError(error, { reload, storage, now: () => 10_100 })).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);

    expect(
      recoverFromChunkLoadError(
        new Error("Failed to fetch dynamically imported module: /assets/NeighbourhoodReport-old.js"),
        { reload, storage, now: () => 10_200 },
      ),
    ).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);

    expect(
      recoverFromChunkLoadError(
        new Error("Failed to fetch dynamically imported module: /assets/PropertyMiniMap-old.js"),
        { reload, storage, now: () => 10_300 },
      ),
    ).toBe(true);
    expect(reload).toHaveBeenCalledTimes(3);

    expect(
      recoverFromChunkLoadError(
        new Error("Failed to fetch dynamically imported module: /assets/MarketInsights-old.js"),
        { reload, storage, now: () => 10_400 },
      ),
    ).toBe(false);
    expect(reload).toHaveBeenCalledTimes(3);
  });

  it("does not reload when cooldown storage cannot be written", () => {
    const reload = vi.fn();
    const storage = {
      getItem: vi.fn(() => {
        throw new Error("storage blocked");
      }),
      setItem: vi.fn(),
    };
    const error = new Error("Failed to fetch dynamically imported module: /assets/Login-old.js");

    expect(recoverFromChunkLoadError(error, { reload, storage })).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it("does not report recovery when reload throws", () => {
    const storage = memoryStorage();
    const reload = vi.fn(() => {
      throw new Error("reload blocked");
    });
    const error = new Error("Failed to fetch dynamically imported module: /assets/Login-old.js");

    expect(recoverFromChunkLoadError(error, { reload, storage })).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("does not reload for non-chunk errors", () => {
    const reload = vi.fn();
    expect(
      recoverFromChunkLoadError(new Error("Form validation failed"), { reload }),
    ).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it("installs recovery for Vite preload, promise rejection, and script error events", () => {
    const storage = memoryStorage();
    const reload = vi.fn();
    const listeners = new Map<string, EventListenerOrEventListenerObject>();
    const win = {
      sessionStorage: storage,
      location: { reload },
      addEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
        listeners.set(type, listener);
      }),
    } as unknown as Window;

    installChunkLoadRecovery(win);

    const preloadEvent = {
      payload: new Error("Failed to fetch dynamically imported module: /assets/AIAssistant-old.js"),
      preventDefault: vi.fn(),
    } as unknown as Event;
    (listeners.get("vite:preloadError") as EventListener)(preloadEvent);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(preloadEvent.preventDefault).toHaveBeenCalled();

    const rejectionEvent = {
      reason: new Error("Failed to fetch dynamically imported module: /assets/PropertyMiniMap-old.js"),
      preventDefault: vi.fn(),
    } as unknown as PromiseRejectionEvent;
    (listeners.get("unhandledrejection") as EventListener)(rejectionEvent);
    expect(reload).toHaveBeenCalledTimes(2);
    expect(rejectionEvent.preventDefault).toHaveBeenCalled();

    const errorEvent = {
      message: "Expected a JavaScript module script but the server responded with a MIME type of text/html",
      preventDefault: vi.fn(),
    } as unknown as ErrorEvent;
    (listeners.get("error") as EventListener)(errorEvent);
    expect(reload).toHaveBeenCalledTimes(3);
    expect(errorEvent.preventDefault).toHaveBeenCalled();
  });
});
