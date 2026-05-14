import { useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, Check, Home, Building2, Zap, MapPin, DollarSign, Image as ImageIcon, Loader2, CheckCircle } from "lucide-react";
import { useFormWizard } from "@/hooks/useFormWizard";
import { useListingForm, type WizardStep } from "@/hooks/useListingForm";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/Navbar";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { useCreateListingConnections } from "@/hooks/useCreateListingConnections";
import { useSubscription } from "@/hooks/useSubscription";
import { getParticipantTypeFromProfile } from "@/lib/participantConfig";
import { getPlanLimits } from "@/hooks/usePlanLimits";
import { useMyListings } from "@/hooks/useListings";
import { Link } from "react-router-dom";
import { isPlatformAdmin, isSellSideRole } from "@/lib/authUtils";
import { StepType } from "@/components/listings/StepType";
import { StepDetails } from "@/components/listings/StepDetails";
import { StepFeatures } from "@/components/listings/StepFeatures";
import { StepLocation } from "@/components/listings/StepLocation";
import { StepPricing } from "@/components/listings/StepPricing";
import { StepPhotos } from "@/components/listings/StepPhotos";

// ─── Wizard config ────────────────────────────────────────────────────────────

const WIZARD_STEPS = ["type", "details", "features", "location", "pricing", "photos"] as const;

const steps = [
  { id: "type" as WizardStep, label: "Type", icon: Home },
  { id: "details" as WizardStep, label: "Details", icon: Building2 },
  { id: "features" as WizardStep, label: "Features", icon: Zap },
  { id: "location" as WizardStep, label: "Location", icon: MapPin },
  { id: "pricing" as WizardStep, label: "Pricing", icon: DollarSign },
  { id: "photos" as WizardStep, label: "Photos", icon: ImageIcon },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function CreateListing() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const participantType = getParticipantTypeFromProfile(profile);
  const canCreateListing = isSellSideRole(profile) || isPlatformAdmin(profile);
  const canCreatePreSale = profile?.role === "developer" || isPlatformAdmin(profile);

  const redirectedRef = useRef(false);
  useEffect(() => {
    if (!user || !profile || canCreateListing || redirectedRef.current) return;
    redirectedRef.current = true;
    toast.error("Creating listings is for sellers, agents, institutions, and developers. Switch your participant type in Settings.");
    navigate("/dashboard/settings", { replace: true });
  }, [user, profile, canCreateListing, navigate]);

  const { step, stepIndex, isFirst, isLast, goNext, goPrev, goTo } = useFormWizard({ steps: WIZARD_STEPS });
  const connections = useCreateListingConnections();
  const { isPro } = useSubscription();
  const { data: myListings = [] } = useMyListings();
  const listingLimit = getPlanLimits(participantType, isPro ? "pro" : "free").listings;

  const {
    form, errors, setErrors, submitting,
    draftBanner,
    aiDescLoading, aiPriceLoading, aiPriceSuggestion,
    images, coverImageId, setCoverImageId,
    set, toggle,
    checkDraft, handleSaveDraft, handleRestoreDraft, handleDiscardDraft,
    handleFilesSelected, handleDrop, handleReorder, handleRemove,
    handleAiDescription, handleAiPrice,
    validateStep, handleSubmit,
    completionPct,
  } = useListingForm({ allowPreSale: canCreatePreSale });

  useEffect(() => {
    if (!canCreatePreSale && form.is_pre_sale) {
      set("is_pre_sale", false);
      set("construction_status", "");
    }
  }, [canCreatePreSale, form.is_pre_sale, set]);

  // Field refs for scroll-to-error
  const fieldRefs = useRef<Record<string, HTMLElement | null>>({});
  const setFieldRef = (key: string) => (el: HTMLElement | null) => { fieldRefs.current[key] = el; };
  const scrollToField = (key: string) => {
    const el = fieldRefs.current[key];
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  // Check for saved draft on mount
  useEffect(() => { checkDraft(); }, [checkDraft]);

  const handleNext = () => {
    const newErrors = validateStep(step);
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      const firstKey = Object.keys(newErrors)[0];
      toast.error(newErrors[firstKey]);
      setTimeout(() => scrollToField(firstKey), 50);
      return;
    }
    setErrors({});
    goNext();
  };

  // Guard: listing count limit reached
  if (user && profile && canCreateListing && listingLimit !== null && myListings.length >= listingLimit) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center space-y-5">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
            <Building2 className="w-8 h-8 text-primary" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold mb-2">Listing Limit Reached</h1>
            <p className="text-muted-foreground text-sm">
              You have reached the {listingLimit}-listing limit on your current plan ({isPro ? "Pro" : "Free"}).
              Upgrade to add more listings.
            </p>
          </div>
          <div className="flex gap-3 justify-center">
            <Button asChild>
              <Link to="/pricing">Upgrade Plan</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/dashboard">Back to Dashboard</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Guard: redirect non-eligible users
  if (user && profile && !canCreateListing) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">Redirecting…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-16">

        {/* Auto-saved indicator */}
        {draftBanner === "autosaved" && (
          <div className="bg-emerald-50 border-b border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-800">
            <div className="container py-1.5 flex items-center gap-2">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span className="text-xs text-emerald-700 dark:text-emerald-300">Draft auto-saved</span>
            </div>
          </div>
        )}

        {/* Draft restore banner */}
        {draftBanner === "visible" && (
          <div className="bg-amber-50 border-b border-amber-200 dark:bg-amber-900/20 dark:border-amber-800">
            <div className="container py-2.5 flex items-center justify-between gap-3">
              <span className="text-sm text-amber-800 dark:text-amber-200">You have a saved draft</span>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={handleRestoreDraft} className="text-xs font-semibold text-amber-800 dark:text-amber-200 underline hover:no-underline">Restore</button>
                <span className="text-amber-400">·</span>
                <button onClick={handleDiscardDraft} className="text-xs text-amber-600 dark:text-amber-400 hover:underline">Discard</button>
              </div>
            </div>
          </div>
        )}

        {/* Header + progress bar */}
        <div className="border-b border-border bg-card py-5">
          <div className="container">
            <div className="flex items-center justify-between mb-1">
              <h1 className="font-display text-2xl font-bold">Create New Listing</h1>
              <span className="text-sm font-semibold tabular-nums text-primary">{completionPct}%</span>
            </div>
            <p className="text-muted-foreground text-xs mb-3">
              Step {stepIndex + 1} of {steps.length} — {steps[stepIndex].label}
            </p>
            <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all duration-500 ease-out" style={{ width: `${completionPct}%` }} />
            </div>
          </div>
        </div>

        <div className="container py-8 max-w-3xl">
          {/* Step nav */}
          <div className="flex items-center gap-1 mb-8 overflow-x-auto pb-2">
            {steps.map((s, i) => (
              <div key={s.id} className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => stepIndex > i && goTo(s.id)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                    step === s.id
                      ? "bg-primary text-primary-foreground"
                      : stepIndex > i
                      ? "bg-primary/20 text-primary cursor-pointer hover:bg-primary/30"
                      : "bg-secondary text-muted-foreground"
                  }`}
                >
                  {stepIndex > i ? <Check className="w-3 h-3" /> : <s.icon className="w-3 h-3" />}
                  {s.label}
                </button>
                {i < steps.length - 1 && <div className={`w-4 h-0.5 ${stepIndex > i ? "bg-primary" : "bg-border"}`} />}
              </div>
            ))}
          </div>

          <div className="glass-card rounded-2xl p-6 md:p-8">
            {step === "type" && <StepType form={form} set={set} toggle={toggle} showPreSaleOption={canCreatePreSale} />}
            {step === "details" && (
              <StepDetails
                form={form}
                set={set}
                errors={errors}
                setFieldRef={setFieldRef}
                aiDescLoading={aiDescLoading}
                handleAiDescription={handleAiDescription}
              />
            )}
            {step === "features" && <StepFeatures form={form} toggle={toggle} />}
            {step === "location" && (
              <StepLocation
                form={form}
                set={set}
                errors={errors}
                setFieldRef={setFieldRef}
                connections={connections}
                stepActive={step === "location"}
              />
            )}
            {step === "pricing" && (
              <StepPricing
                form={form}
                set={set}
                toggle={toggle}
                errors={errors}
                setFieldRef={setFieldRef}
                aiPriceLoading={aiPriceLoading}
                aiPriceSuggestion={aiPriceSuggestion}
                handleAiPrice={handleAiPrice}
                participantType={participantType}
                isPro={isPro}
              />
            )}
            {step === "photos" && (
              <StepPhotos
                images={images}
                coverImageId={coverImageId}
                onFilesSelected={handleFilesSelected}
                onDrop={handleDrop}
                onReorder={handleReorder}
                onRemove={handleRemove}
                onSetCover={setCoverImageId}
              />
            )}

            {/* Navigation */}
            <div className="flex items-center justify-between mt-8 pt-6 border-t border-border">
              <Button variant="outline" onClick={() => isFirst ? navigate("/dashboard") : goPrev()} className="gap-2">
                <ChevronLeft className="w-4 h-4" />
                {isFirst ? "Cancel" : "Back"}
              </Button>
              {!isLast ? (
                <Button onClick={handleNext} className="bg-gradient-primary border-0 text-primary-foreground gap-2">
                  Next <ChevronRight className="w-4 h-4" />
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      handleSaveDraft();
                      navigate("/dashboard");
                    }}
                    disabled={submitting}
                  >
                    Save Draft
                  </Button>
                  <Button className="bg-gradient-primary border-0 text-primary-foreground" onClick={() => handleSubmit(false)} disabled={submitting}>
                    {submitting ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Publishing...</> : "Publish Listing"}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
