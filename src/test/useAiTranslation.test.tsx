import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAiTranslation } from "@/hooks/useAiTranslation";

const mocks = vi.hoisted(() => ({
  i18n: {
    language: "fr",
    hasResourceBundle: vi.fn(() => false),
    addResourceBundle: vi.fn(),
  },
  getSession: vi.fn(),
  invoke: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ i18n: mocks.i18n }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getSession: mocks.getSession },
    functions: { invoke: mocks.invoke },
  },
}));

vi.mock("@/locales/en.json", () => ({
  default: { nav: { listings: "Listings" } },
}));

describe("useAiTranslation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mocks.i18n.language = "fr";
    mocks.i18n.hasResourceBundle.mockReturnValue(false);
  });

  it("does not call the AI translation function for anonymous visitors", async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null } });

    const { result } = renderHook(() => useAiTranslation());

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.error).toBe("Sign in to generate AI translations");
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it("invokes ai-translate for authenticated non-static locales", async () => {
    mocks.getSession.mockResolvedValue({ data: { session: { access_token: "token" } } });
    mocks.invoke.mockResolvedValue({ data: { strings: { "nav.listings": "Annonces" } }, error: null });

    const { result } = renderHook(() => useAiTranslation());

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(mocks.invoke).toHaveBeenCalledWith("ai-translate", expect.objectContaining({
      body: expect.objectContaining({ locale: "fr" }),
    }));
    expect(mocks.i18n.addResourceBundle).toHaveBeenCalledWith(
      "fr",
      "translation",
      { "nav.listings": "Annonces" },
      true,
      true,
    );
  });
});
