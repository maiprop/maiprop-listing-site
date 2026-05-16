import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { invokeMock, useAuthMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  useAuthMock: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invokeMock(...args) } },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn() },
}));

import { useSmartFilters, type SmartFilterConfig } from "@/hooks/useSmartFilters";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const configFor = (label: string): SmartFilterConfig => ({
  sections: ["size"],
  features: [{ key: "has_parking", label }],
  sizeLabel: "Size",
  priceLabel: "Price",
  bedsLabel: null,
  featuresLabel: "Features",
});

describe("useSmartFilters", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    useAuthMock.mockReset();
    useAuthMock.mockReturnValue({ user: { id: "user-1" } });
  });

  it("ignores stale AI filter responses after the selected type changes", async () => {
    const first = deferred<{ data: SmartFilterConfig; error: null }>();
    const second = deferred<{ data: SmartFilterConfig; error: null }>();
    invokeMock
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);

    const { result, rerender } = renderHook(
      ({ type }) => useSmartFilters(type, "", "sale"),
      { initialProps: { type: "apartment" } },
    );

    rerender({ type: "villa" });
    second.resolve({ data: configFor("Villa parking"), error: null });

    await waitFor(() =>
      expect(result.current.config.features[0]?.label).toBe("Villa parking"),
    );

    first.resolve({ data: configFor("Apartment parking"), error: null });
    await new Promise((r) => setTimeout(r, 0));

    expect(result.current.config.features[0]?.label).toBe("Villa parking");
    expect(invokeMock).toHaveBeenCalledTimes(2);
  });
});
