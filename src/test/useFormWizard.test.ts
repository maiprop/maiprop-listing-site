/**
 * Tests for the multi-step form wizard hook used by CreateListing,
 * Onboarding, and CreateNewBuildingListing. The hook is pure React state +
 * memoised callbacks, so renderHook + act covers everything.
 */
import { describe, it, expect } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useFormWizard } from "@/hooks/useFormWizard";

const STEPS = ["type", "details", "photos", "review"] as const;
type Step = (typeof STEPS)[number];

describe("useFormWizard", () => {
  it("starts on the first step by default", () => {
    const { result } = renderHook(() => useFormWizard<Step>({ steps: STEPS }));
    expect(result.current.step).toBe("type");
    expect(result.current.stepIndex).toBe(0);
    expect(result.current.totalSteps).toBe(STEPS.length);
    expect(result.current.isFirst).toBe(true);
    expect(result.current.isLast).toBe(false);
    expect(result.current.progress).toBe(0);
  });

  it("honours the `initial` option when provided", () => {
    const { result } = renderHook(() =>
      useFormWizard<Step>({ steps: STEPS, initial: "photos" }),
    );
    expect(result.current.step).toBe("photos");
    expect(result.current.stepIndex).toBe(2);
    expect(result.current.progress).toBe(67); // round(2/3 * 100)
  });

  it("falls back to step 0 when `initial` is not in the steps list", () => {
    const { result } = renderHook(() =>
      // @ts-expect-error — exercising the runtime fallback
      useFormWizard<Step>({ steps: STEPS, initial: "nope" }),
    );
    expect(result.current.step).toBe("type");
  });

  it("advances on goNext and stops at the last step", () => {
    const { result } = renderHook(() => useFormWizard<Step>({ steps: STEPS }));

    act(() => result.current.goNext());
    expect(result.current.step).toBe("details");
    expect(result.current.progress).toBe(33);

    act(() => result.current.goNext());
    act(() => result.current.goNext());
    expect(result.current.step).toBe("review");
    expect(result.current.isLast).toBe(true);
    expect(result.current.progress).toBe(100);

    // goNext past the end is a no-op
    act(() => result.current.goNext());
    expect(result.current.step).toBe("review");
  });

  it("goes back on goPrev and clamps at the first step", () => {
    const { result } = renderHook(() =>
      useFormWizard<Step>({ steps: STEPS, initial: "photos" }),
    );
    act(() => result.current.goPrev());
    expect(result.current.step).toBe("details");

    act(() => result.current.goPrev());
    expect(result.current.step).toBe("type");
    expect(result.current.isFirst).toBe(true);

    // goPrev below 0 is a no-op
    act(() => result.current.goPrev());
    expect(result.current.step).toBe("type");
  });

  it("jumps to a named step with goTo and ignores unknown step names", () => {
    const { result } = renderHook(() => useFormWizard<Step>({ steps: STEPS }));
    act(() => result.current.goTo("review"));
    expect(result.current.step).toBe("review");

    // Unknown name leaves the index untouched
    act(() => result.current.goTo("ghost" as Step));
    expect(result.current.step).toBe("review");
  });

  it("returns 100% progress for a single-step wizard so the bar isn't misleading", () => {
    const { result } = renderHook(() =>
      useFormWizard<"only">({ steps: ["only"] as const }),
    );
    expect(result.current.progress).toBe(100);
    expect(result.current.isFirst).toBe(true);
    expect(result.current.isLast).toBe(true);
  });
});
