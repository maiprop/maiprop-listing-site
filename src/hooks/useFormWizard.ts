import { useState, useCallback } from "react";

export interface FormWizardOptions<T extends string> {
  /** Ordered list of step identifiers */
  steps: readonly T[];
  /** Step to start on (defaults to first step) */
  initial?: T;
}

export interface FormWizardResult<T extends string> {
  /** Current step identifier */
  step: T;
  /** Zero-based index of the current step */
  stepIndex: number;
  /** Total number of steps */
  totalSteps: number;
  /** True when on the first step */
  isFirst: boolean;
  /** True when on the last step */
  isLast: boolean;
  /** Completion percentage (0–100) */
  progress: number;
  /** Advance to the next step (no-op on last step) */
  goNext: () => void;
  /** Go back to the previous step (no-op on first step) */
  goPrev: () => void;
  /** Jump directly to a named step */
  goTo: (step: T) => void;
}

/**
 * Manages multi-step wizard state.
 *
 * Replaces the duplicated step tracking logic in CreateListing, Onboarding,
 * and CreateNewBuildingListing.
 *
 * Example:
 *   const wizard = useFormWizard({ steps: ["type", "details", "photos"] });
 *   wizard.step        // "type" | "details" | "photos"
 *   wizard.progress    // 0 | 50 | 100
 *   wizard.goNext()    // advance
 *   wizard.goTo("photos") // jump
 */
export function useFormWizard<T extends string>({
  steps,
  initial,
}: FormWizardOptions<T>): FormWizardResult<T> {
  const [stepIndex, setStepIndex] = useState<number>(() => {
    if (initial == null) return 0;
    const idx = steps.indexOf(initial);
    return idx >= 0 ? idx : 0;
  });

  const goNext = useCallback(() => {
    setStepIndex(i => Math.min(i + 1, steps.length - 1));
  }, [steps.length]);

  const goPrev = useCallback(() => {
    setStepIndex(i => Math.max(i - 1, 0));
  }, []);

  const goTo = useCallback(
    (target: T) => {
      const idx = steps.indexOf(target);
      if (idx >= 0) setStepIndex(idx);
    },
    [steps],
  );

  const pct =
    steps.length <= 1
      ? 100
      : Math.round((stepIndex / (steps.length - 1)) * 100);

  return {
    step: steps[stepIndex],
    stepIndex,
    totalSteps: steps.length,
    isFirst: stepIndex === 0,
    isLast: stepIndex === steps.length - 1,
    progress: pct,
    goNext,
    goPrev,
    goTo,
  };
}
