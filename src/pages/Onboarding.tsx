import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Home } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import { APP_ORIGIN } from "@/lib/config";
import { trackAnalyticsEvent } from "@/lib/analytics";
import { usePricingConfigs, formatPrice, PRICING_KEYS } from "@/hooks/usePricingConfigs";
import { RoleSwitchModal } from "@/components/RoleSwitchModal";
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
  extractStripeError,
  isFirstOnboardingFor,
  isProfessionalCategory,
  parseServiceRate,
  readRoleSwitchCtx,
  resolvePresetType,
  type ProfessionalInsert,
  type ProfessionalUpdate,
} from "./onboarding/onboardingHelpers";

// skipcq: JS-0067 - React route component is intentionally module-scoped for React Router.
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
  }, [presetType]);


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

  const saveRoleSelection = useCallback(async (
    values: { role: RoleKey; participant_type: ParticipantId } & Record<string, unknown>
  ): Promise<boolean> => { // skipcq: JS-R1005 - Role save builds one edge-function payload from optional onboarding fields.
    const displayName = typeof values.display_name === "string" ? values.display_name : null;
    const city = typeof values.city === "string" ? values.city : null;
    const phone = typeof values.phone === "string" ? values.phone : null;
    const { error } = await supabase.functions.invoke("complete-onboarding-role", {
      body: {
        role: values.role,
        participantType: values.participant_type,
        displayName,
        city,
        phone,
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
      return false;
    }
    trackAnalyticsEvent("onboarding_role_selected", {
      role: values.role,
      participant_type: values.participant_type,
    });
    await refreshProfile();
    return true;
  }, [refreshProfile]);

  // ── Role-switch billing context ───────────────────────────────────────────────
  // Set by Dashboard SettingsSection before navigating here for a role switch.
  // Cleared after first use so it doesn't re-appear on subsequent visits.
  //
  // Lazy-initialised from sessionStorage so the value is available during the
  // first render. Without this, the on-mount `onboarding_started` analytics
  // effect (below) would always emit `source: "signup"` because effects fire
  // in declaration order — the analytics effect would run before the cleanup
  // effect that previously did the sessionStorage read. The cleanup of the
  // sessionStorage key and the stale onboarding_draft happens in a separate
  // mount effect below.
  const [switchCtx, setSwitchCtx] = useState<{ fromType: ParticipantId; hadActiveSub: boolean } | null>(() => readRoleSwitchCtx());
  // Mirrors switchCtx but is NOT cleared when the billing modal is confirmed.
  // switchCtx must be nulled in handleBillingModalConfirm to prevent the modal
  // from re-firing on subsequent step navigations, but the done screen and
  // analytics still need the original context to render the upgrade subtitle
  // and emit source: "role_switch". Use displaySwitchCtx for read-only
  // downstream consumers; use switchCtx for billing-modal gating.
  // No setter destructured: the value is initialised once from sessionStorage
  // and intentionally never overwritten so downstream readers (DoneScreen,
  // onboarding_completed analytics) keep the original context after
  // handleBillingModalConfirm clears `switchCtx`.
  const [displaySwitchCtx] = useState<{ fromType: ParticipantId; hadActiveSub: boolean } | null>(() => readRoleSwitchCtx());
  const [billingModalProceed, setBillingModalProceed] = useState<(() => void) | null>(null);
  const [billingModalToType, setBillingModalToType] = useState<ParticipantId | null>(null);
  const [billingConfirming, setBillingConfirming] = useState(false);
  const isFirstOnboarding = isFirstOnboardingFor(profile);
  const startedTrackedRef = useRef(false);
  const completedTrackedRef = useRef(false);

  useEffect(() => { // skipcq: JS-R1005 - Started analytics guards duplicate tracking and role-switch context.
    if (!isFirstOnboarding || startedTrackedRef.current) return;
    startedTrackedRef.current = true;
    trackAnalyticsEvent("onboarding_started", {
      source: switchCtx ? "role_switch" : "signup",
    });
  }, [isFirstOnboarding, switchCtx]);

  useEffect(() => { // skipcq: JS-R1005 - Completion analytics guards duplicate tracking and role-switch context.
    if (step !== "done" || !selected || completedTrackedRef.current) return;
    completedTrackedRef.current = true;
    trackAnalyticsEvent("onboarding_completed", {
      participant_type: selected.id,
      source: (displaySwitchCtx ?? switchCtx) ? "role_switch" : "signup",
    });
  }, [step, selected, switchCtx, displaySwitchCtx]);

  useEffect(() => { // skipcq: JS-R1005 - Role switch cleanup handles session and local draft state together.
    // Cleanup-only effect: switchCtx + displaySwitchCtx were already populated
    // by their useState lazy initialisers (above) so analytics + UI see the
    // role-switch context on first render. Here we only consume the
    // sessionStorage key (so subsequent visits don't keep firing the modal)
    // and drop any stale onboarding_draft from the previous role's flow.
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
  }, []);

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
    if (!user || restoredRef.current) return;
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
  }, [user, saveRoleSelection]);

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
    // switchCtx (set by SettingsSection before begin_role_switch nulls participant_type)
    // is the authoritative signal for a role switch. Don't gate on isFirstOnboarding —
    // begin_role_switch makes participant_type null, so isFirstOnboarding is true even
    // for a real switch. Gating on it here would skip the Stripe cancel + audit insert.
    if (!switchCtx) { proceed(); return; }
    const kind = classifySwitch(switchCtx.fromType, toType);
    if (kind === "same-tier") { proceed(); return; }
    // Show modal — store the proceed callback and target type
    setBillingModalToType(toType);
    setBillingModalProceed(() => proceed);
  };

  // Extracted to keep handleBillingModalConfirm's cyclomatic complexity low.
  // supabase.functions.invoke does NOT throw on non-2xx — surface failures via
  // the { error } property and the body's stripe_error field.
  const invokeLogRoleSwitch = async (
    ctx: { fromType: ParticipantId; hadActiveSub: boolean },
    toType: ParticipantId,
  ): Promise<void> => {
    try {
      const { data, error } = await supabase.functions.invoke("log-role-switch", {
        body: {
          from_type: ctx.fromType,
          to_type: toType,
          switch_kind: classifySwitch(ctx.fromType, toType),
          had_active_sub: ctx.hadActiveSub,
          cancel_subscription: ctx.hadActiveSub,
        },
      });
      if (error) {
        logger.warn("[Onboarding] log-role-switch invoke error:", error.message);
        return;
      }
      const stripeError = extractStripeError(data);
      if (stripeError) {
        toast.warning("We couldn't cancel your active subscription automatically. Please manage it from your billing settings.");
      }
    } catch (err: unknown) {
      logger.warn("[Onboarding] log-role-switch threw:", err instanceof Error ? err.message : err);
    }
  };

  // Inner body of handleBillingModalConfirm extracted into a helper so the
  // outer handler stays under DeepSource's cyclomatic-complexity threshold.
  // Audit-row failure is non-blocking; Stripe-cancellation failure surfaces
  // as a toast warning so the user can manage the sub manually.
  // Note: displaySwitchCtx is intentionally NOT cleared here. The done
  // screen + onboarding_completed analytics need to read the original
  // switch context after switchCtx has been consumed.
  const performBillingConfirm = async (
    ctx: { fromType: ParticipantId; hadActiveSub: boolean },
    toType: ParticipantId,
    proceed: (() => void) | null,
  ): Promise<void> => {
    setBillingConfirming(true);
    try {
      await invokeLogRoleSwitch(ctx, toType);
    } finally {
      setBillingConfirming(false);
    }
    setBillingModalProceed(null);
    setBillingModalToType(null);
    setSwitchCtx(null);
    if (proceed) proceed();
  };

  const handleBillingModalConfirm = async () => {
    if (!switchCtx || !billingModalToType || billingConfirming) return;
    await performBillingConfirm(switchCtx, billingModalToType, billingModalProceed);
  };

  const handleBillingModalCancel = () => {
    setBillingModalProceed(null);
    setBillingModalToType(null);
    setPendingCardId(null);
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

    const professionalPayload: ProfessionalInsert = {
      user_id: user.id,
      title: proForm.businessName,
      category: proCategory,
      display_name: user.user_metadata?.full_name || proForm.businessName,
      city: "",
      // AFM (Greek tax ID) stored in license_number when no dedicated field exists.
      // licenseNumber field takes priority if the user filled it in.
      license_number: proForm.licenseNumber || proForm.taxId || null,
    };

    const { data: proData, error } = await supabase
      .from("professionals")
      .upsert(professionalPayload, { onConflict: "user_id" })
      .select()
      .single();

    if (error) { toast.error("Could not save professional profile. Please try again."); setLoading(false); return; }
    setProfessionalId((proData as { id: string }).id);
    const ok = await saveRoleSelection({ role: "professional", participant_type: "professional", phone: proForm.phone });
    if (!ok) { setLoading(false); return; }
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

    const { error: deleteError } = await supabase
      .from("professional_services")
      .delete()
      .eq("professional_id", professionalId);
    if (deleteError) { toast.error("Could not update services. Please try again."); setLoading(false); return; }

    const { error } = await supabase.from("professional_services").insert(rows);
    if (error) { toast.error("Could not save services. Please try again."); setLoading(false); return; }
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
     
    const { error: deleteError } = await supabase
      .from("professional_availability")
      .delete()
      .eq("professional_id", professionalId);
    if (deleteError) { toast.error("Could not update availability. Please try again."); setLoading(false); return; }

    if (rows.length > 0) {
      const { error } = await supabase.from("professional_availability").insert(rows);
      if (error) { toast.error("Could not save availability. Please try again."); setLoading(false); return; }
    }
    setLoading(false);
    setStep("pro-video");
  };

  const canSaveVideoSettings = () => Boolean(user && professionalId);

  const persistVideoSettings = async (targetUserId: string, targetProfessionalId: string): Promise<boolean> => {
    const videoSettings: ProfessionalUpdate = {
      video_link: videoLink || null,
      calendar_notes: calendarNotes || null,
    };
    const { error } = await supabase.from("professionals")
      .update(videoSettings)
      .eq("id", targetProfessionalId)
      .eq("user_id", targetUserId);
    if (!error) return true;
    toast.error("Could not save video settings. Please try again.");
    return false;
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
  const professionalProPrice = formatPrice(pricingConfigs?.[PRICING_KEYS.professional_basic], { showUnit: true, fallback: "€49/mo" });

  const handleUpgradeToPro = async () => { // skipcq: JS-R1005 - Checkout launcher keeps edge-function response and toast fallback together.
    try {
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: { plan: "professional_basic", success_url: `${APP_ORIGIN}/dashboard?pro=success`, cancel_url: `${APP_ORIGIN}/pricing` },
      });
      if (error || !data?.url) throw new Error(error?.message ?? data?.error ?? "Checkout failed");
      window.location.href = data.url;
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not start checkout");
    }
  };

  // ── Step content ──────────────────────────────────────────────────────────────

  const stepContent = (() => { // skipcq: JS-R1005 - Onboarding route renders several intentionally stateful step panels.

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
    const isProOnly = getPlanForParticipant(participantId as ParticipantId).proOnly;

    // Detect upgrade-from-paid: user was on a paid plan, switched to a pricier role, and the
    // old subscription was cancelled. switchCtx is only set from the Dashboard role-switch flow.
    // Use displaySwitchCtx (preserved post-modal) so the upgrade subtitle still renders after
    // handleBillingModalConfirm clears switchCtx.
    const ctx = displaySwitchCtx ?? switchCtx;
    const switchKind = ctx
      ? classifySwitch(ctx.fromType, participantId as ParticipantId)
      : null;
    const wasUpgrade = switchKind === "upgrade" && ctx?.hadActiveSub === true;

    const upgradedPlanName = wasUpgrade
      ? getPlanForParticipant(participantId as ParticipantId).planName
      : null;
    const upgradeSubtitle = upgradedPlanName
      ? `Your previous subscription was cancelled at period end. Visit Pricing to activate your ${upgradedPlanName}.`
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
      agent:         { primary: { label: "Go to Dashboard", href: "/dashboard/listings" }, subtitle: upgradeSubtitle ?? "Your agent account is ready." },
      developer:     isProOnly
        ? { primary: { label: "Set up your subscription", href: "/pricing?tab=developer" }, subtitle: "A paid plan is required to start creating projects." }
        : { primary: { label: "Go to Dashboard", href: "/dashboard/projects" }, subtitle: upgradeSubtitle ?? "Your developer account is ready." },
      professional:  { primary: { label: "Go to Dashboard", href: "/dashboard/services" }, subtitle: upgradeSubtitle ?? "Your profile is live. We'll review and add your verified badge shortly." },
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

      {/* Role-switch billing modal — only visible when switching from a paid role */}
      {billingModalProceed && billingModalToType && switchCtx && (
        <RoleSwitchModal
          fromType={switchCtx.fromType}
          toType={billingModalToType}
          hasActiveSub={switchCtx.hadActiveSub}
          onConfirm={() => {
            handleBillingModalConfirm().catch(() => {
              toast.error("Could not continue. Please try again.");
            });
          }}
          onCancel={handleBillingModalCancel}
          confirming={billingConfirming}
        />
      )}
    </>
  );
}
