import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, CreditCard, Home, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import { trackAnalyticsEvent } from "@/lib/analytics";
import { usePricingConfigs, formatPrice, PRICING_KEYS } from "@/hooks/usePricingConfigs";
import { RoleSwitchModal } from "@/components/RoleSwitchModal";
import { Button } from "@/components/ui/button";
import { classifySwitch, getPlanForParticipant } from "@/lib/rolePlanMap";
import type { ParticipantId } from "@/lib/participantConfig";
import {
  participants, DEFAULT_AVAILABILITY, colorMap,
  type OnboardingStep, type ParticipantType, type SelectedService, type DayAvailability, type RoleKey,
} from "@/lib/onboardingConfig";
import { canRestoreDraftStep, isOnboardingStep, resolveStepsFor } from "@/lib/onboardingFlow";
import { OnboardingShell as Shell } from "@/components/onboarding/OnboardingShell";
import { DoneScreen } from "@/components/onboarding/DoneScreen";
import { PickTypeStep } from "@/components/onboarding/PickTypeStep";
import { ProServicesStep } from "@/components/onboarding/ProServicesStep";
import { PickParticipantGoalStep } from "@/components/onboarding/PickParticipantGoalStep";
import { PickProTypeStep } from "@/components/onboarding/PickProTypeStep";
import { ProCategoryStep } from "@/components/onboarding/ProCategoryStep";
import { ProVerifyStep } from "@/components/onboarding/ProVerifyStep";
import { DeveloperSetupStep } from "@/components/onboarding/DeveloperSetupStep";
import { ProAvailabilityStep } from "@/components/onboarding/ProAvailabilityStep";
import { ProVideoStep } from "@/components/onboarding/ProVideoStep";
import {
  BACK_STEP_BY_STEP,
  clearRoleSwitchOperation,
  extractStripeError,
  isFirstOnboardingFor,
  isProfessionalCategory,
  markRoleSwitchOperationBegun,
  parseServiceRate,
  readRoleSwitchCtx,
  resolvePresetType,
  type RoleSwitchContext,
} from "./onboarding/onboardingHelpers";
import {
  parseMutationInput,
  professionalAvailabilityRowsSchema,
  professionalServiceRowsSchema,
  professionalVideoSettingsMutationSchema,
} from "@/lib/mutationSchemas";

type RoleSelectionValues = { role: RoleKey; participant_type: ParticipantId } & Record<string, unknown>;
type RoleSelectionResult = { ok: boolean; professionalId?: string };
type RoleSwitchBillingVerification = { hadActiveSub: boolean };
type ProfessionalOnboardingSetupBody =
  | { action: "services"; professionalId: string; services: unknown[] }
  | { action: "availability"; professionalId: string; availability: unknown[] }
  | { action: "video"; professionalId: string; videoLink: string | null; calendarNotes: string | null };

// skipcq: JS-0067 - React route component is intentionally module-scoped for React Router.
const ONBOARDING_CHECKOUT_TIMEOUT_MS = 20_000;
const ROLE_SWITCH_BEGIN_ERROR_MESSAGES: Record<string, string> = {
  active_firesale_commitment_blocks_role_switch:
    "Resolve your active Quick Sale reservation or commitment before switching.",
  accepted_open_house_offer_blocks_role_switch:
    "Resolve your accepted Open House offer before switching.",
  role_switch_audit_not_ready:
    "The billing audit is not ready. Open Billing or contact support.",
};

export default function Onboarding() { // skipcq: JS-R1005 - Onboarding keeps a multi-step account setup workflow in one route shell.
  const navigate = useNavigate();
  const { user, profile, refreshProfile, loading: authLoading } = useAuth();

  // participant_type is the authoritative onboarding signal (set since migration 20260522100000)
  const presetType = resolvePresetType(profile);

  const [step, setStep] = useState<OnboardingStep>("pick-type");
  const [selected, setSelected] = useState<ParticipantType | null>(null);
  const [loading, setLoading] = useState(false);

  // Auto-advance past pick-type when type already set from Signup
  useEffect(() => { // skipcq: JS-R1005 - Auto-advance maps participant type to several onboarding branches.
    if (profile?.role_switch_in_progress_at || readRoleSwitchCtx(user?.id)) return;
    if (!presetType) return;
    const p = participants.find(x => x.id === presetType);
    if (!p) return;
    setSelected(p);
    if (p.id === "developer") {
      setStep("developer-setup");
    } else if (p.isPro) {
      setStep("pro-category");
    } else if (p.nextStep) {
      setStep(p.nextStep);
    } else {
      setStep("done");
    }
  }, [presetType, profile?.role_switch_in_progress_at, user?.id]);


  const [proCategory, setProCategory] = useState("");
  const [professionalId, setProfessionalId] = useState<string | null>(null);
  const [proForm, setProForm] = useState({ businessName: "", taxId: "", phone: "", licenseNumber: "" });
  const [proErrors, setProErrors] = useState<Record<string, string>>({});

  const [devForm, setDevForm] = useState({ companyName: "", registrationNumber: "", city: "", devType: "" });
  const [devErrors, setDevErrors] = useState<Record<string, string>>({});

  const [selectedServices, setSelectedServices] = useState<Record<string, SelectedService>>({});
  const [availability, setAvailability] = useState<DayAvailability[]>(DEFAULT_AVAILABILITY);
  const [videoLink, setVideoLink] = useState("");
  const [calendarNotes, setCalendarNotes] = useState("");
  const [pendingCardId, setPendingCardId] = useState<string | null>(null);

  const invokeRoleSelection = useCallback(async (
    values: RoleSelectionValues,
  ): Promise<RoleSelectionResult> => { // skipcq: JS-R1005 - Role save builds one edge-function payload from optional onboarding fields.
    const displayName = typeof values.display_name === "string" ? values.display_name : null;
    const city = typeof values.city === "string" ? values.city : null;
    const phone = typeof values.phone === "string" ? values.phone : null;
    const professionalProfile = values.professionalProfile &&
      typeof values.professionalProfile === "object"
      ? values.professionalProfile
      : undefined;
    const { data, error } = await supabase.functions.invoke("complete-onboarding-role", {
      body: {
        role: values.role,
        participantType: values.participant_type,
        displayName,
        city,
        phone,
        ...(professionalProfile ? { professionalProfile } : {}),
      },
    });
    if (error) {
      // Extract the RPC error code from the FunctionsHttpError response body.
      // supabase-js sets error.context to the raw Response on non-2xx replies.
      let errorCode: string | null = null;
      if ("context" in error && error.context instanceof Response) {
        try {
          const body = await (error.context as Response).json() as { error?: string };
          errorCode = body.error ?? null;
        } catch { /* ignore parse failures — fall through to generic message */ }
      }
      const ONBOARDING_ERROR_MESSAGES: Record<string, string> = {
        professional_phone_required:   "Please add your phone number before selecting the Professional account type.",
        professional_profile_required: "You need to create a Professional profile first. Visit your dashboard to set one up.",
        developer_display_name_required: "Please enter a company or display name for your developer account.",
        developer_city_required:       "Please enter your city to complete the developer account setup.",
        role_participant_mismatch:     "Account type selection was inconsistent. Please refresh and try again.",
        role_not_allowed:              "This account type is not available. Please choose another.",
        profile_not_found:             "Your profile could not be found. Please sign out and back in.",
        not_authenticated:             "Your session has expired. Please sign in again.",
        invalid_participant_type:      "Invalid account type selected. Please choose again.",
      };
      const msg = (errorCode && ONBOARDING_ERROR_MESSAGES[errorCode])
        ?? "Could not save account type. Please try again.";
      trackAnalyticsEvent("onboarding_error", {
        stage: "role_save",
        role: values.role,
        participant_type: values.participant_type,
        error_code: errorCode ?? "unknown",
      });
      toast.error(msg);
      return { ok: false };
    }
    trackAnalyticsEvent("onboarding_role_selected", {
      role: values.role,
      participant_type: values.participant_type,
    });
    await refreshProfile();
    if (user?.id) clearRoleSwitchOperation(undefined, user.id);
    const professionalId = data && typeof data === "object" &&
      typeof (data as { professionalId?: unknown }).professionalId === "string"
      ? (data as { professionalId: string }).professionalId
      : undefined;
    return { ok: true, professionalId };
  }, [refreshProfile, user?.id]);

  const saveRoleSelection = useCallback(async (
    values: RoleSelectionValues,
  ): Promise<boolean> => (await invokeRoleSelection(values)).ok, [invokeRoleSelection]);

  const saveProfessionalOnboardingSetup = useCallback(async (
    body: ProfessionalOnboardingSetupBody,
    errorMessage: string,
  ): Promise<boolean> => {
    const { error } = await supabase.functions.invoke("save-professional-onboarding", { body });
    if (!error) return true;
    toast.error(errorMessage);
    return false;
  }, []);

  // Load the role-switch context before analytics effects run.
  const [switchCtx, setSwitchCtx] = useState<RoleSwitchContext | null>(
    () => readRoleSwitchCtx(user?.id),
  );
  // Preserve the original transition after destructive work begins.
  const [displaySwitchCtx, setDisplaySwitchCtx] = useState<RoleSwitchContext | null>(
    () => readRoleSwitchCtx(user?.id),
  );
  const [roleSwitchContextReady, setRoleSwitchContextReady] = useState(
    () => !authLoading,
  );
  useEffect(() => {
    if (authLoading) return;
    const authenticatedContext = readRoleSwitchCtx(user?.id);
    if (authenticatedContext) {
      setSwitchCtx((current) => current ?? authenticatedContext);
      setDisplaySwitchCtx((current) => current ?? authenticatedContext);
    }
    setRoleSwitchContextReady(true);
  }, [authLoading, user?.id]);
  const [billingModalProceed, setBillingModalProceed] = useState<(() => void) | null>(null);
  const [billingModalToType, setBillingModalToType] = useState<ParticipantId | null>(null);
  const [billingConfirming, setBillingConfirming] = useState(false);
  const [roleSwitchFailure, setRoleSwitchFailure] = useState<string | null>(null);
  const [verifiedRoleSwitchAuditId, setVerifiedRoleSwitchAuditId] = useState<string | null>(null);
  const [serverSwitchCtx, setServerSwitchCtx] = useState<RoleSwitchContext | null>(null);
  const [serverSwitchContextLoading, setServerSwitchContextLoading] = useState(false);
  const [serverSwitchContextError, setServerSwitchContextError] = useState<string | null>(null);
  const effectiveSwitchCtx = switchCtx ?? serverSwitchCtx;

  useEffect(() => {
    if (
      authLoading || switchCtx || !user?.id ||
      !profile?.role_switch_in_progress_at || !profile.role_switch_audit_id
    ) {
      setServerSwitchContextLoading(false);
      return;
    }

    let cancelled = false;
    const auditId = profile.role_switch_audit_id;
    setServerSwitchContextLoading(true);
    setServerSwitchContextError(null);
    void (async () => {
      try {
        const { data, error } = await supabase
          .from("role_switch_history")
          .select(
            "from_type, to_type, had_active_sub, billing_outcome, billing_reconciliation_required",
          )
          .eq("id", auditId)
          .eq("user_id", user.id)
          .maybeSingle();
        if (cancelled) return;
        const participantIds: ParticipantId[] = [
          "buyer", "seller", "agent", "developer", "professional",
          "investor", "institutional",
        ];
        const fromType = data?.from_type as ParticipantId | undefined;
        const toType = data?.to_type as ParticipantId | undefined;
        if (
          error || !data || !fromType || !toType ||
          !participantIds.includes(fromType) || !participantIds.includes(toType) ||
          data.billing_reconciliation_required === true ||
          !["not_required", "succeeded", "already_pending"].includes(
            String(data.billing_outcome),
          )
        ) {
          setServerSwitchContextError(
            "This account switch could not be recovered safely. Open Billing or contact support.",
          );
          return;
        }
        const recovered: RoleSwitchContext = {
          userId: user.id,
          fromType,
          toType,
          hadActiveSub: data.had_active_sub === true,
          auditId,
          status: "begun",
        };
        setServerSwitchCtx(recovered);
        setDisplaySwitchCtx((current) => current ?? recovered);
        setVerifiedRoleSwitchAuditId(recovered.auditId);
      } catch {
        if (!cancelled) {
          setServerSwitchContextError(
            "This account switch could not be recovered safely. Open Billing or contact support.",
          );
        }
      } finally {
        if (!cancelled) setServerSwitchContextLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    authLoading,
    profile?.role_switch_audit_id,
    profile?.role_switch_in_progress_at,
    switchCtx,
    user?.id,
  ]);
  const isFirstOnboarding = isFirstOnboardingFor(profile);
  const startedTrackedRef = useRef(false);
  const completedTrackedRef = useRef(false);

  useEffect(() => { // skipcq: JS-R1005 - Started analytics guards duplicate tracking and role-switch context.
    if (!roleSwitchContextReady || !isFirstOnboarding || startedTrackedRef.current) return;
    startedTrackedRef.current = true;
    trackAnalyticsEvent("onboarding_started", {
      source: effectiveSwitchCtx || profile?.role_switch_in_progress_at
        ? "role_switch"
        : "signup",
    });
  }, [effectiveSwitchCtx, isFirstOnboarding, profile?.role_switch_in_progress_at, roleSwitchContextReady]);

  useEffect(() => { // skipcq: JS-R1005 - Completion analytics guards duplicate tracking and role-switch context.
    if (!roleSwitchContextReady || step !== "done" || !selected || completedTrackedRef.current) return;
    completedTrackedRef.current = true;
    trackAnalyticsEvent("onboarding_completed", {
      participant_type: selected.id,
      source: (displaySwitchCtx ?? effectiveSwitchCtx) ? "role_switch" : "signup",
    });
  }, [step, selected, effectiveSwitchCtx, displaySwitchCtx, roleSwitchContextReady]);

  useEffect(() => { // skipcq: JS-R1005 - Role switch cleanup handles session and local draft state together.
    // Cleanup-only effect: switchCtx + displaySwitchCtx were already populated
    // by their useState lazy initialisers (above) so analytics + UI see the
    // role-switch context on first render. Here we only consume the
    // sessionStorage key (so subsequent visits don't keep firing the modal)
    // and drop any stale onboarding_draft from the previous role's flow.
    if (authLoading) return;
    try {
      if (sessionStorage.getItem("role_switch_ctx") === null) return;
      sessionStorage.removeItem("role_switch_ctx");
      // Drop any stale draft from the previous role's onboarding. Without
      // this the draft-restore effect below would re-route the user into a
      // mid-flow step for the role they're leaving (e.g. "pro-availability")
      // before they ever pick the new typology. This effect runs before the
      // draft-restore effect because it appears earlier in source order.
      localStorage.removeItem("onboarding_draft");
      // Also clear the listing wizard draft. A buyer switching to seller may
      // inherit an old create-listing draft from a previous session, making
      // the first seller landing feel trapped in listing creation.
      localStorage.removeItem("listing_draft");
    } catch (err: unknown) {
      logger.warn("[Onboarding] role_switch_ctx cleanup failed:", err instanceof Error ? err.message : err);
    }
  }, [authLoading, user?.id]);

  const steps: OnboardingStep[] = resolveStepsFor(selected);
  const stepIndex = steps.indexOf(step);
  const displayStepIndex = Math.max(stepIndex, 0);
  const totalSteps = steps.length - 1;

  const DRAFT_KEY = "onboarding_draft";

  // ── Restore draft (user left mid-flow) ─────────────────────────────────────
  const draftRestoredRef = useRef(false);
  useEffect(() => { // skipcq: JS-R1005 - Draft restore validates ownership, step, and saved participant fields together.
    if (!user?.id || draftRestoredRef.current) return;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw) as { userId?: unknown; step?: unknown; selectedId?: unknown; proCategory?: unknown };
      if (draft.userId !== user.id) return;
      if (!isOnboardingStep(draft.step)) {
        localStorage.removeItem(DRAFT_KEY);
        return;
      }
      if (draft.step === "done") {
        localStorage.removeItem(DRAFT_KEY);
        return;
      }
      draftRestoredRef.current = true;
      const draftParticipant = typeof draft.selectedId === "string"
        ? participants.find((participant) => participant.id === draft.selectedId) ?? null
        : null;
      if (!canRestoreDraftStep(draftParticipant, draft.step)) {
        localStorage.removeItem(DRAFT_KEY);
        return;
      }
      setSelected(draftParticipant ?? null);
      setStep(draft.step);
      if (typeof draft.proCategory === "string") setProCategory(draft.proCategory);
    } catch (err: unknown) {
      logger.warn("[Onboarding] draft restore failed:", err instanceof Error ? err.message : err);
      localStorage.removeItem(DRAFT_KEY);
    }
  }, [user?.id]);

  // ── Persist draft when step/selected changes ─────────────────────────────────
  useEffect(() => { // skipcq: JS-R1005 - Draft persistence guards auth, completion, and optional category fields.
    if (!user?.id || step === "done") return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({
        userId: user.id,
        step,
        selectedId: selected?.id,
        proCategory: proCategory || undefined,
      }));
    } catch (_err: unknown) { /* ignore draft save failure */ }
  }, [user?.id, step, selected?.id, proCategory]);

  // ── Clear draft when done ────────────────────────────────────────────────────
  useEffect(() => {
    if (step === "done") localStorage.removeItem(DRAFT_KEY);
  }, [step]);

  // ── Restore participant type from Signup (Google OAuth) ──────────────────────
  const restoredRef = useRef(false);
  useEffect(() => {
    if (
      !user || restoredRef.current || effectiveSwitchCtx ||
      profile?.role_switch_in_progress_at
    ) return;
    (async () => { // skipcq: JS-R1005 - Signup participant restore handles storage, validation, and cleanup paths.
      try {
        const stored = sessionStorage.getItem("signup_participant_type") || localStorage.getItem("signup_participant_type");
        if (!stored) return;
        restoredRef.current = true;
        const storedParticipant = participants.find((participant) => participant.id === stored);
        if (!storedParticipant) {
          // Unknown type stored — clean up and let user pick
          sessionStorage.removeItem("signup_participant_type");
          localStorage.removeItem("signup_participant_type");
          return;
        }
        setSelected(storedParticipant);
        if (storedParticipant.id === "developer") {
          // Multi-step: clear storage but preserve any draft, navigate to next step
          sessionStorage.removeItem("signup_participant_type");
          localStorage.removeItem("signup_participant_type");
          setStep("developer-setup");
        } else if (storedParticipant.isPro) {
          sessionStorage.removeItem("signup_participant_type");
          localStorage.removeItem("signup_participant_type");
          setStep("pro-category");
        } else if (storedParticipant.nextStep) {
          sessionStorage.removeItem("signup_participant_type");
          localStorage.removeItem("signup_participant_type");
          setStep(storedParticipant.nextStep);
        } else {
          // Simple type (e.g. participant): write to DB first, then clean up
          setLoading(true);
          const ok = await saveRoleSelection({
            role: storedParticipant.role,
            participant_type: storedParticipant.id as ParticipantId,
          });
          setLoading(false);
          if (!ok) return;
          // Only clean up storage after confirmed DB write
          sessionStorage.removeItem("signup_participant_type");
          localStorage.removeItem("signup_participant_type");
          localStorage.removeItem(DRAFT_KEY);
          setStep("done");
        }
      } catch (err: unknown) {
        logger.warn("[Onboarding] auto-upgrade failed:", err instanceof Error ? err.message : err);
      }
    })();
  }, [effectiveSwitchCtx, profile?.role_switch_in_progress_at, saveRoleSelection, user]);

  // ── Handlers ─────────────────────────────────────────────────────────────────

  /** Block clicks while auth is loading; redirect to login if definitely unauthenticated. */
  const requireAuth = (typeId: string): boolean => {
    if (authLoading) return true; // session still resolving — do nothing
    if (user) return false;
    try { sessionStorage.setItem("signup_participant_type", typeId); } catch (_err: unknown) { /* ignore */ }
    navigate("/login", { state: { from: { pathname: "/onboarding" } } });
    return true;
  };

  /**
   * Billing gate for role switches.
   * When the user is switching from a paid role (hadActiveSub) and the new role
   * is a different pricing tier, intercept with the RoleSwitchModal before proceeding.
   * For fresh signups (no switchCtx), calls proceed() directly.
   */
  const maybeBillingGate = (toType: ParticipantId, proceed: () => void) => {
    const ctx = effectiveSwitchCtx;
    if (!ctx) {
      if (profile?.role_switch_in_progress_at) {
        toast.error("This account switch is missing its billing audit. Please contact support.");
        return;
      }
      proceed();
      return;
    }
    if (toType !== ctx.toType) {
      toast.error(`This switch is approved only for ${ctx.toType}. Cancel it to choose another type.`);
      return;
    }
    if (ctx.status === "begun" || verifiedRoleSwitchAuditId === ctx.auditId) {
      proceed();
      return;
    }
    // Show modal — store the proceed callback and target type
    setSwitchCtx(ctx);
    setBillingModalToType(toType);
    setBillingModalProceed(() => proceed);
  };

  const invokeBeginRoleSwitch = async (
    validateOnly: boolean,
    auditId?: string,
  ): Promise<boolean> => {
    const { error } = await supabase.functions.invoke("begin-role-switch", {
      body: validateOnly ? { validate_only: true } : { audit_id: auditId },
    });
    if (!error) return true;
    const message = ROLE_SWITCH_BEGIN_ERROR_MESSAGES[error.message] ??
      "The account switch could not start safely. Nothing else was changed.";
    setRoleSwitchFailure(message);
    toast.error(message);
    return false;
  };

  // Extracted to keep handleBillingModalConfirm's cyclomatic complexity low.
  // supabase.functions.invoke does NOT throw on non-2xx — surface failures via
  // the { error } property and the body's stripe_error field.
  const invokeLogRoleSwitch = async (
    ctx: RoleSwitchContext,
    toType: ParticipantId,
  ): Promise<RoleSwitchBillingVerification | null> => {
    try {
      const { data, error } = await supabase.functions.invoke("log-role-switch", {
        body: {
          operation_id: ctx.auditId,
          from_type: ctx.fromType,
          to_type: toType,
          cancel_subscription: true,
        },
      });
      if (error) {
        logger.warn("[Onboarding] log-role-switch invoke error:", error.message);
        const message = "Stripe billing could not be verified. Open Billing before retrying this switch.";
        setRoleSwitchFailure(message);
        toast.error(message);
        return null;
      }
      const stripeError = extractStripeError(data);
      if (stripeError) {
        const message = "Stripe billing could not be verified. Open Billing before retrying this switch.";
        setRoleSwitchFailure(message);
        toast.error(message);
        return null;
      }
      const responseAuditId = data && typeof data === "object"
        ? (data as { audit_id?: unknown }).audit_id
        : null;
      if (responseAuditId !== ctx.auditId) {
        logger.warn("[Onboarding] log-role-switch returned an unexpected audit id");
        toast.error("We couldn't verify the account-switch audit. Please try again.");
        setRoleSwitchFailure("The destination-bound account-switch audit could not be verified.");
        return null;
      }
      const billing = data as {
        had_active_sub?: unknown;
        billing_subscription_count?: unknown;
      };
      return {
        hadActiveSub: billing.had_active_sub === true ||
          (typeof billing.billing_subscription_count === "number" &&
            billing.billing_subscription_count > 0),
      };
    } catch (err: unknown) {
      logger.warn("[Onboarding] log-role-switch threw:", err instanceof Error ? err.message : err);
      const message = "Stripe billing could not be verified. Open Billing before retrying this switch.";
      setRoleSwitchFailure(message);
      toast.error(message);
      return null;
    }
  };

  // Inner body of handleBillingModalConfirm extracted into a helper so the
  // outer handler stays under DeepSource's cyclomatic-complexity threshold.
  // Audit intent must persist before Stripe mutation. Stripe-cancellation or
  // audit-finalization failures surface so the user can resolve the switch.
  // Note: displaySwitchCtx is intentionally NOT cleared here. The done
  // screen + onboarding_completed analytics need to read the original
  // switch context after switchCtx has been consumed.
  const performBillingConfirm = async (
    ctx: RoleSwitchContext,
    toType: ParticipantId,
    proceed: (() => void) | null,
  ): Promise<void> => {
    setBillingConfirming(true);
    setRoleSwitchFailure(null);
    let billingVerification: RoleSwitchBillingVerification | null = null;
    try {
      if (!(await invokeBeginRoleSwitch(true))) return;
      billingVerification = await invokeLogRoleSwitch(ctx, toType);
      if (!billingVerification) return;
      if (!(await invokeBeginRoleSwitch(false, ctx.auditId))) return;
      const begunContext: RoleSwitchContext = {
        ...ctx,
        hadActiveSub: billingVerification.hadActiveSub,
        status: "begun",
      };
      try {
        markRoleSwitchOperationBegun(ctx.auditId, ctx.userId);
        sessionStorage.setItem("role_switch_ctx", JSON.stringify(begunContext));
      } catch (error: unknown) {
        logger.warn("[Onboarding] role-switch browser context persistence failed", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
      await refreshProfile();
      setSwitchCtx(begunContext);
      setDisplaySwitchCtx(begunContext);
      setVerifiedRoleSwitchAuditId(ctx.auditId);
      setBillingModalProceed(null);
      setBillingModalToType(null);
      if (proceed) proceed();
    } finally {
      setBillingConfirming(false);
    }
  };

  const handleBillingModalConfirm = async () => {
    if (!effectiveSwitchCtx || !billingModalToType || billingConfirming) return;
    await performBillingConfirm(
      effectiveSwitchCtx,
      billingModalToType,
      billingModalProceed,
    );
  };

  const handleBillingModalCancel = () => {
    setBillingModalProceed(null);
    setBillingModalToType(null);
    setPendingCardId(null);
    setRoleSwitchFailure(null);
    if (effectiveSwitchCtx?.status === "prepared") {
      clearRoleSwitchOperation(effectiveSwitchCtx.auditId, effectiveSwitchCtx.userId);
      try {
        sessionStorage.removeItem("role_switch_ctx");
      } catch {
        // Durable operation cleanup above is authoritative.
      }
      setSwitchCtx(null);
      setDisplaySwitchCtx(null);
      navigate("/dashboard/settings", { replace: true });
    }
  };

  /** Handler for participant goal selection (buy/rent vs sell/let) */
  const handleParticipantGoal = async (goal: "buyer" | "seller") => {
    if (requireAuth(goal)) return;
    const role: RoleKey = goal === "seller" ? "seller" : "buyer";
    const goalParticipant = participants.find((participant) => participant.id === goal);
    if (!goalParticipant) {
      toast.error("Could not resolve that account type. Please try again.");
      return;
    }
    setLoading(true);
    setSelected(goalParticipant);
    const ok = await saveRoleSelection({ role, participant_type: goal });
    if (!ok) { setLoading(false); return; }
    setLoading(false);
    setStep("done");
  };

  const selectParticipantStep = (participantId: string, nextStep: OnboardingStep): boolean => {
    const participant = participants.find((option) => option.id === participantId);
    if (!participant) {
      toast.error("Could not resolve that account type. Please try again.");
      return false;
    }
    setSelected(participant);
    setStep(nextStep);
    return true;
  };

  const saveAgentSelection = async (type: "agent") => {
    const agentParticipant = participants.find((participant) => participant.id === type);
    if (!agentParticipant) { toast.error("Could not resolve that account type. Please try again."); return; }
    setSelected(agentParticipant);
    setLoading(true);
    const ok = await saveRoleSelection({ role: agentParticipant.role, participant_type: type });
    if (!ok) { setLoading(false); return; }
    setLoading(false);
    setStep("done");
  };

  /** Handler for professional sub-type selection */
  const handleProSubType = async (type: "agent" | "developer" | "service_pro") => {
    if (requireAuth(type)) return;
    if (type === "service_pro") { selectParticipantStep("professional", "pro-category"); return; }
    if (type === "developer") { selectParticipantStep("developer", "developer-setup"); return; }
    await saveAgentSelection(type);
  };

  const handleDeveloperSetup = async () => { // skipcq: JS-R1005 - Developer setup validates fields and saves role in one submit path.
    if (requireAuth("developer")) return;
    const errs: Record<string, string> = {};
    if (!devForm.companyName.trim()) errs.companyName = "Company name is required";
    if (!devForm.city.trim()) errs.city = "City is required";
    if (!devForm.devType) errs.devType = "Please select development type";
    if (Object.keys(errs).length) { setDevErrors(errs); return; }

    setLoading(true);
    const ok = await saveRoleSelection({
      role: "developer",
      participant_type: "developer",
      display_name: devForm.companyName,
      city: devForm.city,
      phone: "",
    });
    if (!ok) { setLoading(false); return; }
    setLoading(false);
    setStep("done");
  };

  const handleCategoryNext = () => {
    if (!isProfessionalCategory(proCategory)) { toast.error("Please select your professional category"); return; }
    setStep("pro-verify");
  };

  const handleProVerify = async () => { // skipcq: JS-R1005 - Professional verification owns validation, profile creation, and onboarding state.
    if (requireAuth("professional")) return;
    // requireAuth() above redirects to /login when there is no user, so the
    // remainder of this handler can never run with `user === null`. The
    // explicit guard satisfies the type checker without changing behaviour.
    if (!user) return;
    if (!isProfessionalCategory(proCategory)) { toast.error("Please select your professional category"); return; }
    const errs: Record<string, string> = {};
    if (!proForm.businessName.trim()) errs.businessName = "Business name is required";
    if (!proForm.phone.trim()) errs.phone = "Phone number is required";
    if (!/^\d{9}$/.test(proForm.taxId.replace(/\s/g, ""))) errs.taxId = "Enter a valid 9-digit AFM";
    if (Object.keys(errs).length) { setProErrors(errs); return; }

    setLoading(true);

    const result = await invokeRoleSelection({
      role: "professional",
      participant_type: "professional",
      phone: proForm.phone,
      professionalProfile: {
        title: proForm.businessName,
        category: proCategory,
        displayName: user.user_metadata?.full_name || proForm.businessName,
        city: "",
      // AFM (Greek tax ID) stored in license_number when no dedicated field exists.
      // licenseNumber field takes priority if the user filled it in.
        licenseNumber: proForm.licenseNumber || proForm.taxId || null,
      },
    });
    if (!result.ok) { setLoading(false); return; }
    if (!result.professionalId) {
      toast.error("Could not save professional profile. Please try again.");
      setLoading(false);
      return;
    }
    setProfessionalId(result.professionalId);
    setLoading(false);
    setStep("pro-services");
  };

  const handleSaveServices = async () => {
    if (!professionalId) { toast.error("Verification step incomplete — please go back and try again."); setStep("pro-verify"); return; }
    if (Object.keys(selectedServices).length === 0) { toast.error("Please select at least one service you offer"); return; }
    setLoading(true);
    const rows = Object.values(selectedServices).map(s => ({
      professional_id: professionalId,
      service_key: s.template.key,
      service_name: s.template.name,
      description: s.template.description,
      category: proCategory,
      pricing_model: s.pricingModel,
      rate_amount: parseServiceRate(s.rate),
      currency: "EUR",
      video_enabled: s.videoEnabled,
      is_premium: s.template.isPremiumFeature,
      is_active: true,
    }));

    const services = parseMutationInput(professionalServiceRowsSchema, rows, "professional services");
    const saved = await saveProfessionalOnboardingSetup(
      { action: "services", professionalId, services },
      "Could not save services. Please try again.",
    );
    if (!saved) { setLoading(false); return; }
    setLoading(false);
    setStep("pro-availability");
  };

  const handleSaveAvailability = async () => {
    if (!professionalId) { toast.error("Verification step incomplete — please go back and try again."); setStep("pro-verify"); return; }
    setLoading(true);
    const rows = availability.map((day, i) => ({ ...day, dayIndex: i })).filter(d => d.enabled).map(d => ({
      professional_id: professionalId,
      day_of_week: d.dayIndex,
      start_time: d.start,
      end_time: d.end,
      is_active: true,
    }));
     
    const availabilityRows = parseMutationInput(professionalAvailabilityRowsSchema, rows, "professional availability");
    const saved = await saveProfessionalOnboardingSetup(
      { action: "availability", professionalId, availability: availabilityRows },
      "Could not save availability. Please try again.",
    );
    if (!saved) { setLoading(false); return; }
    setLoading(false);
    setStep("pro-video");
  };

  const canSaveVideoSettings = () => Boolean(user && professionalId);

  const persistVideoSettings = async (targetUserId: string, targetProfessionalId: string): Promise<boolean> => {
    const videoSettings = {
      video_link: videoLink || null,
      calendar_notes: calendarNotes || null,
    };
    const payload = parseMutationInput(
      professionalVideoSettingsMutationSchema,
      { professionalId: targetProfessionalId, userId: targetUserId, ...videoSettings },
      "professional video settings",
    );
    return saveProfessionalOnboardingSetup(
      {
        action: "video",
        professionalId: payload.professionalId,
        videoLink: payload.video_link,
        calendarNotes: payload.calendar_notes,
      },
      "Could not save video settings. Please try again.",
    );
  };

  const saveVideoSettings = (): Promise<boolean> => {
    if (!canSaveVideoSettings() || !user || !professionalId) return Promise.resolve(true);
    return persistVideoSettings(user.id, professionalId);
  };

  const requireVideoSaveUser = () => {
    if (user) return true;
    toast.error("Please sign in to finish onboarding.");
    return false;
  };

  const handleSavedVideoSettings = (saved: boolean) => {
    setLoading(false);
    if (saved) setStep("done");
  };

  const runVideoSave = async () => {
    setLoading(true);
    const saved = await saveVideoSettings();
    handleSavedVideoSettings(saved);
  };

  const handleSaveVideo = () => {
    if (!requireVideoSaveUser()) {
      return;
    }
    runVideoSave().catch(() => {
      toast.error("Could not save video settings. Please try again.");
      setLoading(false);
    });
  };

  const { data: pricingConfigs = {} } = usePricingConfigs();
  const professionalProPrice = formatPrice(pricingConfigs?.[PRICING_KEYS.professional_basic], { showUnit: true, fallback: "EUR 69/mo" });

  const handleUpgradeToPro = async () => { // skipcq: JS-R1005 - Checkout launcher keeps edge-function response and toast fallback together.
    try {
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        timeout: ONBOARDING_CHECKOUT_TIMEOUT_MS,
        body: { plan: "professional_basic", billing_cycle: "monthly", success_url: "/dashboard?pro=success", cancel_url: "/pricing" },
      });
      if (error || !data?.url) throw new Error(error?.message ?? data?.error ?? "Checkout failed");
      window.location.href = data.url;
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not start checkout");
    }
  };

  // ── Step content ──────────────────────────────────────────────────────────────

  const stepContent = (() => { // skipcq: JS-R1005 - Onboarding route renders several intentionally stateful step panels.

    if (step === "pick-type" && profile?.role_switch_in_progress_at && !effectiveSwitchCtx) {
      return (
        <div className="mx-auto max-w-lg rounded-lg border border-border bg-secondary/40 p-6 text-center">
          {serverSwitchContextLoading ? (
            <>
              <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" aria-hidden="true" />
              <h1 className="mt-4 text-lg font-bold text-foreground">Recovering account switch</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Verifying the destination and billing audit before continuing.
              </p>
            </>
          ) : (
            <>
              <AlertTriangle className="mx-auto h-6 w-6 text-amber-500" aria-hidden="true" />
              <h1 className="mt-4 text-lg font-bold text-foreground">Account switch needs attention</h1>
              <p role="alert" className="mt-2 text-sm text-muted-foreground">
                {serverSwitchContextError ??
                  "The destination-bound audit could not be recovered safely. No new account type can be selected here."}
              </p>
              <Button
                type="button"
                className="mt-5 min-h-11 gap-2"
                onClick={() => navigate("/dashboard/billing")}
              >
                <CreditCard className="h-4 w-4" aria-hidden="true" />
                Open Billing
              </Button>
            </>
          )}
        </div>
      );
    }

    // ── Pick type (top-level — flat selection across all role types) ──
    if (step === "pick-type") {
      const devParticipant = participants.find(x => x.id === "developer");
      const proParticipant = participants.find(x => x.id === "professional");
      if (!devParticipant || !proParticipant) return null;
      return (
        <PickTypeStep
          pendingCardId={pendingCardId}
          onPendingChange={setPendingCardId}
          loading={loading}
          authLoading={authLoading}
          allowedParticipantIds={effectiveSwitchCtx ? [effectiveSwitchCtx.toType] : undefined}
          onDeveloperImmediate={() =>
            maybeBillingGate("developer", () => { setSelected(devParticipant); setStep("developer-setup"); })
          }
          onProfessionalImmediate={() =>
            maybeBillingGate("professional", () => { setSelected(proParticipant); setStep("pro-category"); })
          }
          onConfirm={(id) => {
            if (id === "buyer") { maybeBillingGate("buyer", () => handleParticipantGoal("buyer")); return; }
            if (id === "seller") { maybeBillingGate("seller", () => handleParticipantGoal("seller")); return; }
            if (id === "agent") { maybeBillingGate("agent", () => { handleProSubType("agent"); }); return; }
          }}
        />
      );
    }

    // ── Participant goal (buy / sell) ──
    if (step === "pick-participant-goal") {
      return (
        <PickParticipantGoalStep
          loading={loading}
          authLoading={authLoading}
          onGoal={handleParticipantGoal}
        />
      );
    }

    // ── Pro sub-type (agent / developer / service professional) ──
    if (step === "pick-pro-type") {
      return (
        <PickProTypeStep
          loading={loading}
          authLoading={authLoading}
          onSubType={handleProSubType}
        />
      );
    }

    // ── Developer setup ──
    if (step === "developer-setup") {
      return (
        <DeveloperSetupStep
          form={devForm}
          errors={devErrors}
          loading={loading}
          authLoading={authLoading}
          onFieldChange={(key, value) => {
            setDevForm(f => ({ ...f, [key]: value }));
            setDevErrors(e => ({ ...e, [key]: "" }));
          }}
          onSubmit={handleDeveloperSetup}
        />
      );
    }

    // ── Pro category ──
    if (step === "pro-category") return (
      <ProCategoryStep
        proCategory={proCategory}
        onChange={setProCategory}
        onNext={handleCategoryNext}
      />
    );

    // ── Pro verify ──
    if (step === "pro-verify") return (
      <ProVerifyStep
        proCategory={proCategory}
        form={proForm}
        errors={proErrors}
        loading={loading}
        authLoading={authLoading}
        onFieldChange={(key, value) => {
          setProForm(f => ({ ...f, [key]: value }));
          setProErrors(e => ({ ...e, [key]: "" }));
        }}
        onSubmit={handleProVerify}
      />
    );

    // ── Pro services ──
    if (step === "pro-services") return (
      <ProServicesStep
        proCategory={proCategory}
        selectedServices={selectedServices}
        onChange={setSelectedServices}
        loading={loading}
        onSave={handleSaveServices}
      />
    );

    // ── Pro availability ──
    if (step === "pro-availability") return (
      <ProAvailabilityStep
        availability={availability}
        loading={loading}
        authLoading={authLoading}
        onChange={setAvailability}
        onSave={handleSaveAvailability}
        onSkip={() => setStep("pro-video")}
      />
    );

    // ── Pro video ──
    if (step === "pro-video") return (
      <ProVideoStep
        videoLink={videoLink}
        calendarNotes={calendarNotes}
        loading={loading}
        authLoading={authLoading}
        onVideoLinkChange={setVideoLink}
        onCalendarNotesChange={setCalendarNotes}
        onSave={handleSaveVideo}
        onSkip={() => setStep("done")}
      />
    );

    // ── Done ──
    const selectedColor = selected ? colorMap[selected.color] : colorMap.emerald;
    const SelectedIcon = selected?.icon ?? Home;
    const isPro = selected?.isPro;
    const participantId = selected?.id ?? "buyer";

    // Per participant-id: primary redirect + secondary actions
    const targetPlan = getPlanForParticipant(participantId as ParticipantId);
    const isProOnly = targetPlan.proOnly;
    const pricingHref = `/pricing?audience=${targetPlan.audienceId}`;

    // Detect upgrade-from-paid: user was on a paid plan, switched to a pricier role, and the
    // old subscription was cancelled. switchCtx is only set from the Dashboard role-switch flow.
    // Use displaySwitchCtx (preserved post-modal) so the upgrade subtitle still renders after
    // handleBillingModalConfirm clears switchCtx.
    const ctx = displaySwitchCtx ?? switchCtx;
    const switchKind = ctx
      ? classifySwitch(ctx.fromType, participantId as ParticipantId)
      : null;
    const wasUpgrade = switchKind === "upgrade" && ctx?.hadActiveSub === true;
    const needsPaidSwitchCheckout =
      (wasUpgrade || switchKind === "proonly") && !targetPlan.inviteOnly;

    const upgradedPlanName = wasUpgrade
      ? targetPlan.planName
      : null;
    const upgradeSubtitle = upgradedPlanName
      ? `Your previous subscription was cancelled at period end. Activate your ${upgradedPlanName} to complete the paid upgrade.`
      : null;

    const isRoleSwitch = Boolean(ctx);
    const sellerAction = isRoleSwitch
      ? {
          primary: { label: "Go to Seller Dashboard", href: "/dashboard" },
          subtitle: "Your seller account is ready. Review your dashboard before creating a listing.",
        }
      : {
          primary: { label: "Go to Dashboard", href: "/dashboard/listings" },
          subtitle: "Your account is ready. Head to your dashboard to create your first listing.",
        };

    const PARTICIPANT_ACTIONS: Record<string, {
      primary: { label: string; href: string };
      subtitle: string;
    }> = {
      buyer:         { primary: { label: "Go to Dashboard", href: "/dashboard" },          subtitle: "Your account is ready. Start exploring properties." },
      seller:        sellerAction,
      agent:         needsPaidSwitchCheckout
        ? { primary: { label: `Activate ${targetPlan.planName}`, href: pricingHref }, subtitle: upgradeSubtitle ?? "Activate your Agent Pro plan to finish setup." }
        : { primary: { label: "Go to Dashboard", href: "/dashboard/listings" }, subtitle: upgradeSubtitle ?? "Your agent account is ready." },
      developer:     isProOnly
        ? { primary: { label: "Set up your subscription", href: pricingHref }, subtitle: "A paid plan is required to start creating projects." }
        : { primary: { label: "Go to Dashboard", href: "/dashboard/projects" }, subtitle: upgradeSubtitle ?? "Your developer account is ready." },
      professional:  needsPaidSwitchCheckout
        ? { primary: { label: `Activate ${targetPlan.planName}`, href: pricingHref }, subtitle: upgradeSubtitle ?? "Activate your Professional Pro plan to finish setup." }
        : { primary: { label: "Go to Dashboard", href: "/dashboard/services" }, subtitle: upgradeSubtitle ?? "Your profile is live. We'll review and add your verified badge shortly." },
    };

    const actions = PARTICIPANT_ACTIONS[participantId] ?? PARTICIPANT_ACTIONS.buyer;

    return (
      <DoneScreen
        selected={selected}
        selectedColor={selectedColor}
        SelectedIcon={SelectedIcon}
        isPro={Boolean(isPro)}
        proCategory={proCategory}
        selectedServicesCount={Object.keys(selectedServices).length}
        actions={actions}
        navigate={navigate}
        autoRedirect={!isRoleSwitch}
        onUpgradeToPro={participantId === "professional" ? handleUpgradeToPro : undefined}
        professionalProPrice={professionalProPrice}
      />
    );
  })();

  // Per-step back handler
  const backStepTarget = BACK_STEP_BY_STEP[step];
  const onBack = backStepTarget ? () => setStep(backStepTarget)
    : undefined;

  return (
    <>
      <Shell stepIndex={displayStepIndex + 1} totalSteps={totalSteps} step={step} onBack={onBack}>
        {stepContent}
      </Shell>

      {/* Destination-bound confirmation; no provider or profile mutation occurs before this modal. */}
      {billingModalProceed && billingModalToType && effectiveSwitchCtx && (
        <RoleSwitchModal
          fromType={effectiveSwitchCtx.fromType}
          toType={billingModalToType}
          hasActiveSub={effectiveSwitchCtx.hadActiveSub}
          onConfirm={() => {
            handleBillingModalConfirm().catch(() => {
              toast.error("Could not continue. Please try again.");
            });
          }}
          onCancel={handleBillingModalCancel}
          confirming={billingConfirming}
          pricingConfigs={pricingConfigs}
          errorMessage={roleSwitchFailure}
          onManageBilling={() => navigate("/dashboard/billing")}
        />
      )}
    </>
  );
}
