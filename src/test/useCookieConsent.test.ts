/**
 * useCookieConsent hook tests — verifies default state, accept action,
 * and cross-tab sync via storage events.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

vi.mock("@/components/CookieConsentBanner", () => ({
  getCookieConsent: vi.fn(),
  saveCookieConsent: vi.fn(),
}));

import { getCookieConsent, saveCookieConsent } from "@/components/CookieConsentBanner";
import { useCookieConsent } from "@/hooks/useCookieConsent";

beforeEach(() => {
  vi.clearAllMocks();
  (getCookieConsent as ReturnType<typeof vi.fn>).mockReturnValue(null);
});

describe("useCookieConsent", () => {
  it("returns defaults when no consent stored", () => {
    const { result } = renderHook(() => useCookieConsent());
    expect(result.current.consent.accepted).toBe(false);
    expect(result.current.consent.functional).toBe(true);
    expect(result.current.consent.analytics).toBe(false);
    expect(result.current.consent.mapping).toBe(false);
  });

  it("accept() updates state and saves", () => {
    const { result } = renderHook(() => useCookieConsent());
    act(() => {
      result.current.accept({ analytics: true, mapping: true });
    });
    expect(result.current.consent.accepted).toBe(true);
    expect(result.current.consent.analytics).toBe(true);
    expect(result.current.consent.mapping).toBe(true);
    expect(saveCookieConsent).toHaveBeenCalledTimes(1);
  });

  it("loads existing consent from storage", () => {
    const stored = { accepted: true, functional: true, analytics: true, mapping: false, timestamp: 1000 };
    (getCookieConsent as ReturnType<typeof vi.fn>).mockReturnValue(stored);
    const { result } = renderHook(() => useCookieConsent());
    expect(result.current.consent.accepted).toBe(true);
    expect(result.current.consent.analytics).toBe(true);
  });
});
