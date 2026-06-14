import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { fromMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

import { useSubmitContactForm } from "@/hooks/useContactSubmissions";

const wrapper = () => {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
};

beforeEach(() => {
  fromMock.mockReset();
});

describe("useSubmitContactForm", () => {
  it("inserts schema-valid contact submissions", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    fromMock.mockReturnValue({ insert });
    const { result } = renderHook(() => useSubmitContactForm(), { wrapper: wrapper() });

    await act(async () => {
      await result.current.mutateAsync({
        type: "contact",
        name: "Maria Owner",
        email: "maria@example.com",
        company: "MaiProp",
        message: "Please contact me about enterprise access.",
      });
    });

    expect(fromMock).toHaveBeenCalledWith("contact_submissions");
    expect(insert).toHaveBeenCalledWith({
      type: "contact",
      name: "Maria Owner",
      email: "maria@example.com",
      company: "MaiProp",
      message: "Please contact me about enterprise access.",
    });
  });

  it("rejects malformed public contact submissions before inserting", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    fromMock.mockReturnValue({ insert });
    const { result } = renderHook(() => useSubmitContactForm(), { wrapper: wrapper() });

    await expect(
      result.current.mutateAsync({
        type: "contact",
        name: "",
        email: "not email",
        company: "",
        message: "",
      }),
    ).rejects.toThrow(/Invalid contact submission/i);

    expect(insert).not.toHaveBeenCalled();
  });
});
