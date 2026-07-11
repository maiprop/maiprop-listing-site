import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DeferredDetailPanel } from "@/components/DeferredDetailPanel";

describe("DeferredDetailPanel", () => {
  it("waits to render expensive content until the panel approaches the viewport", () => {
    const originalIntersectionObserver = window.IntersectionObserver;
    let callback: IntersectionObserverCallback | undefined;
    const observe = vi.fn();
    const MockIntersectionObserver = class {
      constructor(nextCallback: IntersectionObserverCallback) {
        callback = nextCallback;
      }

      observe = observe;
      disconnect = vi.fn();
      unobserve = vi.fn();
      takeRecords = vi.fn(() => []);
      root = null;
      rootMargin = "0px";
      thresholds = [0];
    };
    window.IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver;

    try {
      render(
        <DeferredDetailPanel placeholder={<div data-testid="placeholder" />}>
          <div data-testid="expensive-panel" />
        </DeferredDetailPanel>,
      );

      expect(screen.getByTestId("placeholder")).toBeInTheDocument();
      expect(screen.queryByTestId("expensive-panel")).not.toBeInTheDocument();
      expect(observe).toHaveBeenCalledTimes(1);

      act(() => callback?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver));
      expect(screen.getByTestId("expensive-panel")).toBeInTheDocument();
    } finally {
      window.IntersectionObserver = originalIntersectionObserver;
    }
  });
});
