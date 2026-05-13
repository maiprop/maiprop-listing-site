import {
  DEVELOPER_STEPS,
  PARTICIPANT_STEPS,
  PRO_FLAT_STEPS,
  PRO_SIMPLE_STEPS,
  TOP_STEPS,
  type OnboardingStep,
  type ParticipantType,
} from "@/lib/onboardingConfig";

const STEPS_BY_PARTICIPANT_ID: Readonly<Record<string, readonly OnboardingStep[]>> = {
  participant: PARTICIPANT_STEPS,
  buyer: PARTICIPANT_STEPS,
  seller: PARTICIPANT_STEPS,
  market_pro: PRO_SIMPLE_STEPS,
  agent: PRO_SIMPLE_STEPS,
  developer: DEVELOPER_STEPS,
  professional: PRO_FLAT_STEPS,
};

const ALL_ONBOARDING_STEPS = new Set<OnboardingStep>([
  ...TOP_STEPS,
  ...PARTICIPANT_STEPS,
  ...PRO_SIMPLE_STEPS,
  ...DEVELOPER_STEPS,
  ...PRO_FLAT_STEPS,
]);

export const resolveStepsFor = (selected: ParticipantType | null): OnboardingStep[] => {
  if (!selected) return TOP_STEPS;
  return [...(STEPS_BY_PARTICIPANT_ID[selected.id] ?? TOP_STEPS)];
};

export const isOnboardingStep = (value: unknown): value is OnboardingStep => {
  return typeof value === "string" && ALL_ONBOARDING_STEPS.has(value as OnboardingStep);
};

export const canRestoreDraftStep = (selected: ParticipantType | null, step: OnboardingStep): boolean => {
  if (!selected) return step === "pick-type";
  return resolveStepsFor(selected).includes(step);
};
