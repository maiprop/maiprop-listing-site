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
  PRO_FULL_STEPS, PRO_FLAT_STEPS, PRO_SIMPLE_STEPS, DEVELOPER_STEPS, PARTICIPANT_STEPS, TOP_STEPS,
  type OnboardingStep, type ParticipantType, type SelectedService, type DayAvailability, type RoleKey,
} from "@/lib/onboardingConfig";
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


export default function Onboarding() {
  const navigate = useNavigate();
  const { user, profile, refreshProfile, loading: authLoading } = useAuth();

  // participant_type is the authoritative onboarding signal (set since migration 20260522100000)
  const presetType =
    profile?.participant_type && profile?.role && profile.participant_type === String(profile.role)
      ? profile.participant_type
      : null;

  const [step, setStep] = useState<OnboardingStep>("pick-type");
  const [selected, setSelected] = useState<ParticipantType | null>(null);
  const [loading, setLoading] = useState(false);

  // Auto-advance past pick-type when type already set from Signup
  useEffect(() => {
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
  ): Promise<boolean> => {
    const displayName = typeof values.display_name === "string" ? values.display_name : null;
    const city = typeof values.city === "string" ? values.city : null;
    const phone = typeof values.phone === "string" ? values.phone : null;
    const { error } = await supabase.rpc("complete_onboarding_role" as never, {
      p_role: values.role,
      p_participant_type: values.participant_type,
      p_display_name: displayName,
      p_city: city,
      p_phone: phone,
    } as never);
    if (error) {
      trackAnalyticsEvent("onboarding_error", {
        stage: "role_save",
        role: values.role,
        participant_type: values.participant_type,
      });
      toast.error("Could not save account type. Please try again.");
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
  const [switchCtx, setSwitchCtx] = useState<{ fromType: ParticipantId; hadActiveSub: boolean } | null>(null);
  const [billingModalProceed, setBillingModalProceed] = useState<(() => void) | null>(null);
  const [billingModalToType, setBillingModalToType] = useState<ParticipantId | null>(null);
  const isFirstOnboarding = !(profile?.participant_type && profile?.role && profile.participant_type === String(profile.role));
  const startedTrackedRef = useRef(false);
  const completedTrackedRef = useRef(false);

  useEffect(() => {
    if (!isFirstOnboarding || startedTrackedRef.current) return;
    startedTrackedRef.current = true;
    trackAnalyticsEvent("onboarding_started", {
      source: switchCtx ? "role_switch" : "signup",
    });
  }, [isFirstOnboarding, switchCtx]);

  useEffect(() => {
    if (step !== "done" || !selected || completedTrackedRef.current) return;
    completedTrackedRef.current = true;
    trackAnalyticsEvent("onboarding_completed", {
      participant_type: selected.id,
      source: switchCtx ? "role_switch" : "signup",
    });
  }, [step, selected, switchCtx]);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("role_switch_ctx");
      if (!raw) return;
      const ctx = JSON.parse(raw) as { fromType: ParticipantId; hadActiveSub: boolean };
      setSwitchCtx(ctx);
      sessionStorage.removeItem("role_switch_ctx");
    } catch (err: unknown) {
      logger.warn("[Onboarding] role_switch_ctx parse failed:", err instanceof Error ? err.message : err);
    }
  }, []);

  const steps: OnboardingStep[] = (() => {
    if (!selected) return TOP_STEPS;
    if (selected.id === "participant") return PARTICIPANT_STEPS;
    if (selected.id === "market_pro") return PRO_SIMPLE_STEPS;
    if (selected.id === "developer") return DEVELOPER_STEPS;
    if (selected.id === "professional") return PRO_FLAT_STEPS;
    if (selected.isPro) return PRO_FULL_STEPS;
    return TOP_STEPS;
  })();
  const stepIndex = steps.indexOf(step);
  const totalSteps = steps.length - 1;

  const DRAFT_KEY = "onboarding_draft";

  // ── Restore draft (user left mid-flow) ─────────────────────────────────────
  const draftRestoredRef = useRef(false);
  useEffect(() => {
    if (!user?.id || draftRestoredRef.current) return;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw) as { userId: string; step: OnboardingStep; selectedId?: string; proCategory?: string };
      if (draft.userId !== user.id) return;
      draftRestoredRef.current = true;
      const p = draft.selectedId ? participants.find(x => x.id === draft.selectedId) : null;
      setSelected(p ?? null);
      setStep(draft.step);
      if (draft.proCategory) setProCategory(draft.proCategory);
    } catch (err: unknown) {
      logger.warn("[Onboarding] draft restore failed:", err instanceof Error ? err.message : err);
      localStorage.removeItem(DRAFT_KEY);
    }
  }, [user?.id]);

  // ── Persist draft when step/selected changes ─────────────────────────────────
  useEffect(() => {
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
    (async () => {
      try {
        const stored = sessionStorage.getItem("signup_participant_type") || localStorage.getItem("signup_participant_type");
        if (!stored) return;
        restoredRef.current = true;
        const p = participants.find(x => x.id === stored);
        if (!p) {
          // Unknown type stored — clean up and let user pick
          sessionStorage.removeItem("signup_participant_type");
          localStorage.removeItem("signup_participant_type");
          return;
        }
        setSelected(p);
        if (p.id === "developer") {
          // Multi-step: clear storage but preserve any draft, navigate to next step
          sessionStorage.removeItem("signup_participant_type");
          localStorage.removeItem("signup_participant_type");
          setStep("developer-setup");
        } else if (p.isPro) {
          sessionStorage.removeItem("signup_participant_type");
          localStorage.removeItem("signup_participant_type");
          setStep("pro-category");
        } else if (p.nextStep) {
          sessionStorage.removeItem("signup_participant_type");
          localStorage.removeItem("signup_participant_type");
          setStep(p.nextStep);
        } else {
          // Simple type (e.g. participant): write to DB first, then clean up
          setLoading(true);
          const ok = await saveRoleSelection({
            role: p.role,
            participant_type: p.id as ParticipantId,
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
    if (isFirstOnboarding || !switchCtx) { proceed(); return; }
    const kind = classifySwitch(switchCtx.fromType, toType);
    if (kind === "same-tier") { proceed(); return; }
    // Show modal — store the proceed callback and target type
    setBillingModalToType(toType);
    setBillingModalProceed(() => proceed);
  };

  const handleBillingModalConfirm = async () => {
    if (!switchCtx || !billingModalToType) return;
    // Log the switch via edge function (service role handles Stripe + DB insert)
    try {
      await supabase.functions.invoke("log-role-switch", {
        body: {
          from_type: switchCtx.fromType,
          to_type: billingModalToType,
          switch_kind: classifySwitch(switchCtx.fromType, billingModalToType),
          had_active_sub: switchCtx.hadActiveSub,
          cancel_subscription: switchCtx.hadActiveSub,
        },
      });
    } catch (_err: unknown) { /* non-blocking — audit log failure must not block the user */ }
    const proceed = billingModalProceed;
    setBillingModalProceed(null);
    setBillingModalToType(null);
    setSwitchCtx(null); // consume context — only fire once
    proceed?.();
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
    setLoading(true);
    const p = participants.find(x => x.id === goal)!;
    setSelected(p);
    const ok = await saveRoleSelection({ role, participant_type: goal });
    if (!ok) { setLoading(false); return; }
    setLoading(false);
    setStep("done");
  };

  /** Handler for professional sub-type selection */
  const handleProSubType = async (type: "agent" | "developer" | "service_pro") => {
    if (requireAuth(type)) return;
    if (type === "service_pro") {
      const p = participants.find(x => x.id === "professional")!;
      setSelected(p);
      setStep("pro-category");
      return;
    }
    if (type === "developer") {
      const p = participants.find(x => x.id === "developer")!;
      setSelected(p);
      setStep("developer-setup");
      return;
    }
    // agent — save role and go to done
    const p = participants.find(x => x.id === type)!;
    setSelected(p);
    setLoading(true);
    const ok = await saveRoleSelection({ role: p.role, participant_type: type });
    if (!ok) { setLoading(false); return; }
    setLoading(false);
    setStep("done");
  };

  const handleDeveloperSetup = async () => {
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
    if (!proCategory) { toast.error("Please select your professional category"); return; }
    setStep("pro-verify");
  };

  const handleProVerify = async () => {
    if (requireAuth("professional")) return;
    const errs: Record<string, string> = {};
    if (!proForm.businessName.trim()) errs.businessName = "Business name is required";
    if (!proForm.phone.trim()) errs.phone = "Phone number is required";
    if (!/^\d{9}$/.test(proForm.taxId.replace(/\s/g, ""))) errs.taxId = "Enter a valid 9-digit AFM";
    if (Object.keys(errs).length) { setProErrors(errs); return; }

    setLoading(true);

    const { data: proData, error } = await supabase
      .from("professionals")
      .upsert({
        user_id: user!.id,
        title: proForm.businessName,
        category: proCategory as never,
        display_name: user!.user_metadata?.full_name || proForm.businessName,
        city: "",
        // AFM (Greek tax ID) stored in license_number when no dedicated field exists.
        // licenseNumber field takes priority if the user filled it in.
        license_number: proForm.licenseNumber || proForm.taxId || null,
      } as never, { onConflict: "user_id" })
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
      professional_id: professionalId!,
      service_key: s.template.key,
      service_name: s.template.name,
      description: s.template.description,
      category: proCategory,
      pricing_model: s.pricingModel,
      rate_amount: parseFloat(s.rate) || null,
      currency: "EUR",
      video_enabled: s.videoEnabled,
      is_premium: s.template.isPremiumFeature,
      is_active: true,
    }));
     
    const { error } = await supabase.from("professional_services").insert(rows);
    if (error) { toast.error("Could not save services. Please try again."); setLoading(false); return; }
    setLoading(false);
    setStep("pro-availability");
  };

  const handleSaveAvailability = async () => {
    if (!professionalId) { toast.error("Verification step incomplete — please go back and try again."); setStep("pro-verify"); return; }
    setLoading(true);
    const rows = availability.map((day, i) => ({ ...day, dayIndex: i })).filter(d => d.enabled).map(d => ({
      professional_id: professionalId!,
      day_of_week: d.dayIndex,
      start_time: d.start,
      end_time: d.end,
      is_active: true,
    }));
     
    if (rows.length > 0) await supabase.from("professional_availability").insert(rows);
    setLoading(false);
    setStep("pro-video");
  };

  const handleSaveVideo = async () => {
    setLoading(true);
    if (professionalId) {
      await supabase.from("professionals")
        .update({ video_link: videoLink || null, calendar_notes: calendarNotes || null } as never)
        .eq("id", professionalId);
    }
    setLoading(false);
    setStep("done");
  };

  const { data: pricingConfigs = {} } = usePricingConfigs();
  const professionalProPrice = formatPrice(pricingConfigs?.[PRICING_KEYS.professional_basic], { showUnit: true, fallback: "€49/mo" });

  const handleUpgradeToPro = async () => {
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

  const stepContent = (() => {

    // ── Pick type (top-level — flat selection across all role types) ──
    if (step === "pick-type") {
      const devParticipant = participants.find(x => x.id === "developer")!;
      const proParticipant = participants.find(x => x.id === "professional")!;
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
            if (id === "agent") { maybeBillingGate("agent", () => void handleProSubType("agent")); return; }
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
    const switchKind = switchCtx
      ? classifySwitch(switchCtx.fromType, participantId as ParticipantId)
      : null;
    const wasUpgrade = switchKind === "upgrade" && switchCtx?.hadActiveSub === true;

    const upgradedPlanName = wasUpgrade
      ? getPlanForParticipant(participantId as ParticipantId).planName
      : null;
    const upgradeSubtitle = upgradedPlanName
      ? `Your previous subscription was cancelled at period end. Visit Pricing to activate your ${upgradedPlanName}.`
      : null;

    const PARTICIPANT_ACTIONS: Record<string, {
      primary: { label: string; href: string };
      subtitle: string;
    }> = {
      buyer:         { primary: { label: "Go to Dashboard", href: "/dashboard" },          subtitle: "Your account is ready. Start exploring properties." },
      seller:        { primary: { label: "Go to Dashboard", href: "/dashboard/listings" }, subtitle: "Your account is ready. Head to your dashboard to create your first listing." },
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
        isPro={!!isPro}
        proCategory={proCategory}
        selectedServicesCount={Object.keys(selectedServices).length}
        actions={actions}
        navigate={navigate}
        onUpgradeToPro={participantId === "professional" ? handleUpgradeToPro : undefined}
        professionalProPrice={professionalProPrice}
      />
    );
  })();

  // Per-step back handler
  const onBack = step === "pick-participant-goal" ? () => setStep("pick-type")
    : step === "pick-pro-type" ? () => setStep("pick-type")
    : step === "developer-setup" ? () => setStep("pick-type")
    : step === "pro-category" ? () => setStep("pick-type")
    : step === "pro-verify" ? () => setStep("pro-category")
    : step === "pro-services" ? () => setStep("pro-verify")
    : step === "pro-availability" ? () => setStep("pro-services")
    : step === "pro-video" ? () => setStep("pro-availability")
    : undefined;

  return (
    <>
      <Shell stepIndex={stepIndex + 1} totalSteps={totalSteps} step={step} onBack={onBack}>
        {stepContent}
      </Shell>

      {/* Role-switch billing modal — only visible when switching from a paid role */}
      {billingModalProceed && billingModalToType && switchCtx && !isFirstOnboarding && (
        <RoleSwitchModal
          fromType={switchCtx.fromType}
          toType={billingModalToType}
          hasActiveSub={switchCtx.hadActiveSub}
          onConfirm={() => void handleBillingModalConfirm()}
          onCancel={handleBillingModalCancel}
        />
      )}
    </>
  );
}

