import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  User, Building2, Wrench, TrendingUp, Globe2, Home,
  Check, ArrowRight, Loader2, Shield, Phone, FileText,
  Briefcase, ChevronRight, Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────────────

type RoleKey = "individual" | "agent" | "professional";

interface ParticipantType {
  id: string;
  role: RoleKey;
  icon: React.ElementType;
  label: string;
  tagline: string;
  desc: string;
  color: string; // tailwind token class prefix
  features: string[];
  needsVerification?: boolean;
}

// ── Participant catalog ───────────────────────────────────────────────────────

const participants: ParticipantType[] = [
  {
    id: "buyer",
    role: "individual",
    icon: Home,
    label: "Home Buyer / Renter",
    tagline: "Find your perfect property",
    desc: "Searching to buy or rent a home for personal use",
    color: "blue",
    features: ["Save listings & searches", "Request viewings", "AI property match", "Price alerts"],
  },
  {
    id: "seller",
    role: "individual",
    icon: User,
    label: "Private Seller / Landlord",
    tagline: "List & manage your property",
    desc: "Sell or rent out your own property directly",
    color: "violet",
    features: ["List up to 5 properties", "Manage viewings", "AI listing assist", "Direct messaging"],
  },
  {
    id: "investor",
    role: "individual",
    icon: TrendingUp,
    label: "Private Investor",
    tagline: "Grow your portfolio",
    desc: "Buying to invest, flip, or generate rental yield",
    color: "emerald",
    features: ["ROI analytics", "Auction access", "Firesale deals", "Market intelligence"],
  },
  {
    id: "agent",
    role: "agent",
    icon: Building2,
    label: "Real Estate Agent / Agency",
    tagline: "Scale your business",
    desc: "Licensed professional listing properties for clients",
    color: "cyan",
    features: ["Unlimited listings", "CRM tools", "OS sync", "Lead management", "Agency branding"],
  },
  {
    id: "institutional",
    role: "agent",
    icon: Globe2,
    label: "Institutional / Fund",
    tagline: "Portfolio at scale",
    desc: "Investment fund, REIT, or institutional buyer",
    color: "amber",
    features: ["Bulk portfolio tools", "Off-market access", "Due diligence hub", "Dedicated support"],
  },
  {
    id: "professional",
    role: "professional",
    icon: Wrench,
    label: "Service Professional",
    tagline: "Grow your practice",
    desc: "Architect, lawyer, notary, contractor & more",
    color: "rose",
    features: ["Professional directory listing", "AI tools for your trade", "Client leads", "Verified badge"],
    needsVerification: true,
  },
  {
    id: "developer",
    role: "agent",
    icon: Briefcase,
    label: "Developer / Builder",
    tagline: "Showcase new projects",
    desc: "Real estate developer launching residential or commercial projects",
    color: "orange",
    features: ["Project showcase pages", "Pre-sale listings", "Construction updates", "Bulk inquiry management"],
  },
];

// ── Color map ─────────────────────────────────────────────────────────────────

const colorMap: Record<string, { bg: string; border: string; text: string; iconBg: string }> = {
  blue:    { bg: "bg-blue-500/10",    border: "border-blue-500/40",    text: "text-blue-400",    iconBg: "bg-blue-500/20" },
  violet:  { bg: "bg-violet-500/10",  border: "border-violet-500/40",  text: "text-violet-400",  iconBg: "bg-violet-500/20" },
  emerald: { bg: "bg-emerald-500/10", border: "border-emerald-500/40", text: "text-emerald-400", iconBg: "bg-emerald-500/20" },
  cyan:    { bg: "bg-cyan-500/10",    border: "border-cyan-500/40",    text: "text-cyan-400",    iconBg: "bg-cyan-500/20" },
  amber:   { bg: "bg-amber-500/10",   border: "border-amber-500/40",   text: "text-amber-400",   iconBg: "bg-amber-500/20" },
  rose:    { bg: "bg-rose-500/10",    border: "border-rose-500/40",    text: "text-rose-400",    iconBg: "bg-rose-500/20" },
  orange:  { bg: "bg-orange-500/10",  border: "border-orange-500/40",  text: "text-orange-400",  iconBg: "bg-orange-500/20" },
};

// ── Main component ────────────────────────────────────────────────────────────

export default function Onboarding() {
  const navigate = useNavigate();
  const { user, updateProfile, refreshProfile } = useAuth();

  const [step, setStep] = useState<1 | 2 | 3>(1); // 1=pick type, 2=pro verify, 3=done
  const [selected, setSelected] = useState<ParticipantType | null>(null);
  const [loading, setLoading] = useState(false);

  // Professional extra fields
  const [proForm, setProForm] = useState({ businessName: "", taxId: "", phone: "", licenseNumber: "" });
  const [proErrors, setProErrors] = useState<Record<string, string>>({});

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleSelectAndContinue = (p: ParticipantType) => {
    setSelected(p);
    if (p.needsVerification) {
      setStep(2);
    } else {
      handleFinish(p);
    }
  };

  const handleFinish = async (p?: ParticipantType) => {
    const participant = p ?? selected;
    if (!participant || !user) return;

    setLoading(true);

    // Update profile role
    await updateProfile({ role: participant.role });

    // Store participant sub-type in profile bio as metadata (lightweight)
    const bioMeta = `__type:${participant.id}`;
    await supabase.from("profiles").update({ bio: bioMeta }).eq("user_id", user.id);

    await refreshProfile();
    setLoading(false);
    setStep(3);
  };

  const handleProSubmit = async () => {
    const errs: Record<string, string> = {};
    if (!proForm.businessName.trim()) errs.businessName = "Business name is required";
    if (!proForm.phone.trim()) errs.phone = "Phone number is required";
    if (!/^\d{9}$/.test(proForm.taxId.replace(/\s/g, ""))) errs.taxId = "Enter a valid 9-digit AFM";
    if (Object.keys(errs).length) { setProErrors(errs); return; }

    setLoading(true);

    if (user) {
      await updateProfile({
        role: "professional",
        phone: proForm.phone,
        bio: `__type:professional | Business: ${proForm.businessName}${proForm.taxId ? ` | AFM: ${proForm.taxId}` : ""}${proForm.licenseNumber ? ` | License: ${proForm.licenseNumber}` : ""}`,
      });
    }
    setLoading(false);
    setStep(3);
  };

  // ── Step 1: Role Grid ─────────────────────────────────────────────────────

  if (step === 1) {
    return (
      <OnboardingShell step={1} totalSteps={2}>
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-full px-4 py-1.5 text-xs font-medium text-primary mb-4">
            <Sparkles className="w-3.5 h-3.5" /> Personalize your experience
          </div>
          <h1 className="font-display font-bold text-2xl md:text-3xl text-foreground mb-2">
            How do you use the market?
          </h1>
          <p className="text-muted-foreground text-sm max-w-sm mx-auto">
            Choose the profile that best fits you. You can always change it later in settings.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {participants.map(p => {
            const c = colorMap[p.color];
            return (
              <button
                key={p.id}
                onClick={() => handleSelectAndContinue(p)}
                disabled={loading}
                className={cn(
                  "group relative text-left rounded-2xl border p-4 transition-all duration-200",
                  "hover:scale-[1.02] hover:shadow-lg hover:shadow-black/10",
                  "bg-secondary/60 border-border hover:border-primary/40 hover:bg-secondary",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                )}
              >
                {/* Icon */}
                <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center mb-3 transition-colors", c.iconBg)}>
                  <p.icon className={cn("w-5 h-5", c.text)} />
                </div>

                {/* Label + tagline */}
                <div className="font-semibold text-sm text-foreground leading-tight">{p.label}</div>
                <div className={cn("text-xs font-medium mt-0.5 mb-2", c.text)}>{p.tagline}</div>
                <div className="text-xs text-muted-foreground leading-relaxed mb-3">{p.desc}</div>

                {/* Features */}
                <div className="space-y-1">
                  {p.features.slice(0, 3).map(f => (
                    <div key={f} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <Check className={cn("w-3 h-3 shrink-0", c.text)} />
                      {f}
                    </div>
                  ))}
                  {p.features.length > 3 && (
                    <div className="text-[11px] text-muted-foreground/60">+{p.features.length - 3} more</div>
                  )}
                </div>

                {/* Verification badge */}
                {p.needsVerification && (
                  <div className="absolute top-3 right-3 flex items-center gap-1 bg-amber-500/15 border border-amber-500/30 rounded-full px-2 py-0.5">
                    <Shield className="w-3 h-3 text-amber-400" />
                    <span className="text-[10px] text-amber-400 font-medium">Verify</span>
                  </div>
                )}

                {/* Arrow */}
                <ChevronRight className="absolute bottom-4 right-4 w-4 h-4 text-muted-foreground/40 group-hover:text-primary transition-colors" />
              </button>
            );
          })}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Not sure yet?{" "}
          <button
            className="text-primary hover:underline"
            onClick={() => handleFinish(participants[0])}
          >
            Continue as a buyer
          </button>{" "}
          and customise later.
        </p>
      </OnboardingShell>
    );
  }

  // ── Step 2: Professional Verification ────────────────────────────────────

  if (step === 2) {
    return (
      <OnboardingShell step={2} totalSteps={3} onBack={() => setStep(1)}>
        <div className="text-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/25 flex items-center justify-center mx-auto mb-4">
            <Shield className="w-7 h-7 text-rose-400" />
          </div>
          <h1 className="font-display font-bold text-2xl text-foreground mb-1">Professional Verification</h1>
          <p className="text-muted-foreground text-sm">We need a few details to verify your business identity</p>
        </div>

        <div className="bg-amber-500/8 border border-amber-500/20 rounded-xl px-4 py-3 flex items-start gap-3 mb-5">
          <Shield className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-300/90 leading-relaxed">
            Your details are used solely for business identity verification. Approval takes 24–48 hours. You'll receive a verified badge upon approval.
          </p>
        </div>

        <div className="space-y-4">
          <Field
            label="Business / Company Name"
            required
            error={proErrors.businessName}
            icon={<FileText className="w-4 h-4 text-muted-foreground" />}
          >
            <input
              type="text"
              placeholder="e.g. Papadopoulos Architecture Ltd."
              value={proForm.businessName}
              onChange={e => { setProForm(f => ({ ...f, businessName: e.target.value })); setProErrors(pe => ({ ...pe, businessName: "" })); }}
              className={cn(
                "w-full bg-secondary border rounded-xl pl-9 pr-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors",
                proErrors.businessName ? "border-destructive" : "border-border"
              )}
            />
          </Field>

          <Field
            label="Tax ID (ΑΦΜ)"
            required
            error={proErrors.taxId}
            hint="9-digit Greek tax ID, used for identity verification only"
            icon={<Shield className="w-4 h-4 text-muted-foreground" />}
          >
            <input
              type="text"
              placeholder="123456789"
              value={proForm.taxId}
              onChange={e => { setProForm(f => ({ ...f, taxId: e.target.value.replace(/\D/g, "").slice(0, 9) })); setProErrors(pe => ({ ...pe, taxId: "" })); }}
              maxLength={9}
              className={cn(
                "w-full bg-secondary border rounded-xl pl-9 pr-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors font-mono tracking-widest",
                proErrors.taxId ? "border-destructive" : "border-border"
              )}
            />
          </Field>

          <Field
            label="Phone Number"
            required
            error={proErrors.phone}
            icon={<Phone className="w-4 h-4 text-muted-foreground" />}
          >
            <input
              type="tel"
              placeholder="+30 69X XXX XXXX"
              value={proForm.phone}
              onChange={e => { setProForm(f => ({ ...f, phone: e.target.value })); setProErrors(pe => ({ ...pe, phone: "" })); }}
              className={cn(
                "w-full bg-secondary border rounded-xl pl-9 pr-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors",
                proErrors.phone ? "border-destructive" : "border-border"
              )}
            />
          </Field>

          <Field
            label="License / Registration Number"
            hint="Optional — e.g. ΤΕΕ-12345 or ΑΜΤΕ-67890"
            icon={<FileText className="w-4 h-4 text-muted-foreground" />}
          >
            <input
              type="text"
              placeholder="Optional"
              value={proForm.licenseNumber}
              onChange={e => setProForm(f => ({ ...f, licenseNumber: e.target.value }))}
              className="w-full bg-secondary border border-border rounded-xl pl-9 pr-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors"
            />
          </Field>

          <Button
            className="w-full bg-gradient-primary border-0 text-primary-foreground"
            disabled={loading}
            onClick={handleProSubmit}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Shield className="w-4 h-4 mr-2" />}
            Submit for Verification
          </Button>
        </div>
      </OnboardingShell>
    );
  }

  // ── Step 3: Done ──────────────────────────────────────────────────────────

  const selectedColor = selected ? colorMap[selected.color] : colorMap.blue;
  const SelectedIcon = selected?.icon ?? Home;

  return (
    <OnboardingShell step={selected?.needsVerification ? 3 : 2} totalSteps={selected?.needsVerification ? 3 : 2}>
      <div className="text-center py-4">
        {/* Animated checkmark */}
        <div className="relative w-20 h-20 mx-auto mb-6">
          <div className={cn("w-20 h-20 rounded-full flex items-center justify-center border-2", selectedColor.bg, selectedColor.border)}>
            <SelectedIcon className={cn("w-9 h-9", selectedColor.text)} />
          </div>
          <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-emerald-500 flex items-center justify-center border-2 border-background">
            <Check className="w-3.5 h-3.5 text-white" />
          </div>
        </div>

        <h1 className="font-display font-bold text-2xl text-foreground mb-2">
          {selected?.needsVerification ? "Application Submitted!" : "You're all set!"}
        </h1>
        <p className="text-muted-foreground text-sm mb-1">
          {selected?.needsVerification
            ? "We'll review your professional details within 24–48 hours."
            : `Welcome to maiprop as a ${selected?.label ?? "member"}.`}
        </p>

        {selected?.needsVerification && (
          <p className="text-xs text-muted-foreground mb-6">You can start exploring while we verify your account.</p>
        )}

        {/* Feature highlights */}
        <div className="bg-secondary/60 border border-border rounded-2xl p-4 text-left mb-6 mt-4 space-y-2">
          <p className="text-xs font-semibold text-foreground/70 mb-2 uppercase tracking-wide">What's unlocked for you</p>
          {selected?.features.map(f => (
            <div key={f} className="flex items-center gap-2 text-sm text-foreground/80">
              <Check className={cn("w-4 h-4 shrink-0", selectedColor.text)} />
              {f}
            </div>
          ))}
        </div>

        <Button
          className="w-full bg-gradient-primary border-0 text-primary-foreground"
          onClick={() => navigate("/dashboard")}
        >
          Go to Dashboard <ArrowRight className="w-4 h-4 ml-2" />
        </Button>

        <button
          className="w-full mt-3 text-xs text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => navigate("/")}
        >
          Explore the platform first →
        </button>
      </div>
    </OnboardingShell>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function OnboardingShell({
  children,
  step,
  totalSteps,
  onBack,
}: {
  children: React.ReactNode;
  step: number;
  totalSteps: number;
  onBack?: () => void;
}) {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-start px-4 pt-10 pb-16">
      {/* Logo */}
      <div className="mb-8 text-center">
        <span className="font-display font-bold text-2xl">mai<span className="gradient-text-cyan">prop</span></span>
      </div>

      {/* Progress pills */}
      <div className="flex items-center gap-2 mb-8">
        {Array.from({ length: totalSteps }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "h-1.5 rounded-full transition-all duration-500",
              i + 1 < step ? "bg-primary w-6" : i + 1 === step ? "bg-primary w-10" : "bg-secondary w-6"
            )}
          />
        ))}
        <span className="text-xs text-muted-foreground ml-1">{step}/{totalSteps}</span>
      </div>

      <div className="w-full max-w-2xl">
        {onBack && (
          <button
            onClick={onBack}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-4 transition-colors"
          >
            ← Back
          </button>
        )}
        {children}
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  error,
  hint,
  icon,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground block mb-1.5">
        {label} {required && <span className="text-destructive">*</span>}
      </label>
      <div className="relative">
        {icon && <span className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">{icon}</span>}
        {children}
      </div>
      {error && <p className="text-xs text-destructive mt-1 flex items-center gap-1"><span>⚠</span> {error}</p>}
      {hint && !error && <p className="text-[11px] text-muted-foreground mt-1">{hint}</p>}
    </div>
  );
}
