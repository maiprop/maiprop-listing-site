import {
  DEVELOPER_STEPS,
  PARTICIPANT_STEPS,
  PRO_FLAT_STEPS,
  PRO_FULL_STEPS,
  PRO_SIMPLE_STEPS,
  TOP_STEPS,
  type OnboardingStep,
  type ParticipantType,
} from "@/lib/onboardingConfig";

const STEPS_BY_PARTICIPANT_ID: Readonly<Partial<Record<string, OnboardingStep[]>>> = {
  participant: PARTICIPANT_STEPS,
  buyer: PARTICIPANT_STEPS,
  seller: PARTICIPANT_STEPS,
  market_pro: PRO_SIMPLE_STEPS,
  agent: PRO_SIMPLE_STEPS,
  developer: DEVELOPER_STEPS,
  professional: PRO_FLAT_STEPS,
};

const ALL_ONBOARDING_STEPS: ReadonlySet<OnboardingStep> = new Set([
  "pick-type",
  "pick-participant-goal",
  "pick-pro-type",
  "developer-setup",
  "pro-category",
  "pro-verify",
  "pro-services",
  "pro-availability",
  "pro-video",
  "done",
]);

export const resolveStepsFor = (selected: ParticipantType | null): OnboardingStep[] => {
  if (!selected) return TOP_STEPS;
  const byId = STEPS_BY_PARTICIPANT_ID[selected.id];
  if (byId) return byId;
  return selected.isPro ? PRO_FULL_STEPS : TOP_STEPS;
};

export const isOnboardingStep = (value: unknown): value is OnboardingStep =>
  typeof value === "string" && ALL_ONBOARDING_STEPS.has(value as OnboardingStep);

export const canRestoreDraftStep = (draftStep: OnboardingStep, selectedParticipant: ParticipantType | null): boolean =>
  selectedParticipant ? resolveStepsFor(selectedParticipant).includes(draftStep) : draftStep === "pick-type";
