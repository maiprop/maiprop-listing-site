import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  User, Building2, Wrench, TrendingUp, Globe2, Home,
  Check, ArrowRight, Loader2, Shield, Phone, FileText,
  Briefcase, ChevronRight, Sparkles, Video, Calendar,
  Clock, Lock, Crown, Plus, Minus, Euro,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  getServicesForCategory,
  PRICING_LABELS,
  CATEGORY_LABELS,
  type ServiceTemplate,
  type PricingModel,
} from "@/lib/professionalServiceCatalog";

// ── Types ─────────────────────────────────────────────────────────────────────

type RoleKey = "individual" | "seller_landlord" | "agent" | "professional" | "investor" | "institutional" | "developer";
type OnboardingStep =
  | "pick-type"
  | "pro-category"
  | "pro-verify"
  | "pro-services"
  | "pro-availability"
  | "pro-video"
  | "done";

interface ParticipantType {
  id: string;
  role: RoleKey;
  icon: React.ElementType;
  label: string;
  tagline: string;
  desc: string;
  color: string;
  features: string[];
  isPro?: boolean;
  section?: string;
}

interface SelectedService {
  template: ServiceTemplate;
  pricingModel: PricingModel;
  rate: string;
  videoEnabled: boolean;
}

interface DayAvailability {
  enabled: boolean;
  start: string;
  end: string;
}

// ── Participant catalog ────────────────────────────────────────────────────────

const participants: ParticipantType[] = [
  {
    id: "buyer", role: "individual", icon: Home, color: "blue",
    label: "Home Buyer / Renter", tagline: "Find your perfect property",
    desc: "Searching to buy or rent a home for personal use",
    features: [
      "Save listings & saved searches",
      "Request viewings",
      "AI property match",
      "Search & auction alerts",
      "Neighbourhood report",
      "Mortgage calculator",
    ],
    section: "Private",
  },
  {
    id: "seller", role: "seller_landlord", icon: User, color: "violet",
    label: "Private Seller / Landlord", tagline: "List & manage your property",
    desc: "Sell or rent out your own property directly",
    features: [
      "List & manage properties",
      "Manage viewing requests",
      "AI listing description assist",
      "Listing dashboard & analytics",
      "Message buyers directly",
      "Pro selling add-ons available",
    ],
    section: "Private",
  },
  {
    id: "investor", role: "investor", icon: TrendingUp, color: "emerald",
    label: "Private Investor", tagline: "Grow your portfolio",
    desc: "Buying to invest, flip, or generate rental yield",
    features: [
      "ROI calculator & deal scoring",
      "Investor dashboard (deal pipeline)",
      "Auction access & firesale deals",
      "Market intelligence reports",
      "Due diligence checklist",
      "Saved searches + price alerts",
    ],
    section: "Private",
  },
  {
    id: "agent", role: "agent", icon: Building2, color: "cyan",
    label: "Real Estate Agent / Agency", tagline: "Scale your business",
    desc: "Licensed professional listing properties for clients",
    features: [
      "Unlimited property listings",
      "CRM & contacts management",
      "OS sync integration",
      "Inquiry & lead management",
      "Analytics & performance dashboard",
      "Firesale admin pipeline",
    ],
    section: "Real estate agents",
  },
  {
    id: "institutional", role: "institutional", icon: Globe2, color: "amber",
    label: "Institutional / Fund", tagline: "Portfolio at scale",
    desc: "Investment fund, REIT, or institutional buyer",
    features: [
      "Investor dashboard & deal flow",
      "Firesale off-market deals",
      "Market intelligence reports",
      "CRM, analytics & portfolio tools",
      "Due diligence hub",
      "Priority support & onboarding",
    ],
    section: "Institutional & development",
  },
  {
    id: "professional", role: "professional", icon: Wrench, color: "rose",
    label: "Service Professional", tagline: "Grow your practice",
    desc: "Architect, lawyer, notary, contractor & more",
    features: [
      "Professional directory listing",
      "AI property & service tools",
      "Client leads & consultation requests",
      "Verified badge",
      "Service catalog with pricing",
      "Weekly availability scheduling",
    ],
    isPro: true,
    section: "Services",
  },
  {
    id: "developer", role: "developer", icon: Briefcase, color: "orange",
    label: "Developer / Builder", tagline: "Showcase new projects",
    desc: "Real estate developer launching projects",
    features: [
      "Unlimited property listings",
      "Project showcase pages",
      "Pre-sale listing management",
      "OS sync integration",
      "Bulk inquiry management",
      "Performance analytics",
    ],
    section: "Institutional & development",
  },
];

// ── Color map ──────────────────────────────────────────────────────────────────

const colorMap: Record<string, { bg: string; border: string; text: string; iconBg: string }> = {
  blue:    { bg: "bg-blue-500/10",    border: "border-blue-500/40",    text: "text-blue-400",    iconBg: "bg-blue-500/20" },
  violet:  { bg: "bg-violet-500/10",  border: "border-violet-500/40",  text: "text-violet-400",  iconBg: "bg-violet-500/20" },
  emerald: { bg: "bg-emerald-500/10", border: "border-emerald-500/40", text: "text-emerald-400", iconBg: "bg-emerald-500/20" },
  cyan:    { bg: "bg-cyan-500/10",    border: "border-cyan-500/40",    text: "text-cyan-400",    iconBg: "bg-cyan-500/20" },
  amber:   { bg: "bg-amber-500/10",   border: "border-amber-500/40",   text: "text-amber-400",   iconBg: "bg-amber-500/20" },
  rose:    { bg: "bg-rose-500/10",    border: "border-rose-500/40",    text: "text-rose-400",    iconBg: "bg-rose-500/20" },
  orange:  { bg: "bg-orange-500/10",  border: "border-orange-500/40",  text: "text-orange-400",  iconBg: "bg-orange-500/20" },
};

const PRO_CATEGORIES = [
  { value: "real_estate_agent", label: "Real Estate Agent" },
  { value: "lawyer", label: "Lawyer" },
  { value: "notary", label: "Notary" },
  { value: "financial_advisor", label: "Financial Advisor" },
  { value: "valuer", label: "Valuer" },
  { value: "insurance_broker", label: "Insurance Broker / Insurer" },
  { value: "architect", label: "Architect" },
  { value: "civil_engineer", label: "Civil Engineer" },
  { value: "interior_designer", label: "Interior Designer" },
  { value: "urban_planning_consultant", label: "Urban Planning Consultant" },
  { value: "building_permit_consultant", label: "Building Permit Consultant" },
  { value: "contractor", label: "Contractor" },
  { value: "electrician", label: "Electrician" },
  { value: "plumber", label: "Plumber" },
  { value: "concrete_contractor", label: "Concrete Contractor" },
  { value: "steel_structure_contractor", label: "Steel Structure Contractor" },
  { value: "carpenter", label: "Carpenter" },
  { value: "tile_installer", label: "Tile Installer" },
  { value: "painter", label: "Painter" },
  { value: "drywall_installer", label: "Drywall Installer" },
  { value: "waterproofing_specialist", label: "Waterproofing Specialist" },
  { value: "insulation_contractor", label: "Insulation Contractor" },
  { value: "roofing_contractor", label: "Roofing Contractor" },
  { value: "window_aluminum_installer", label: "Window / Aluminum Installer" },
  { value: "elevator_installer", label: "Elevator Installer" },
  { value: "smart_home_installer", label: "Smart Home Systems Installer" },
  { value: "utility_certification_provider", label: "Utility & Technical Certification" },
  { value: "esg_sustainability_consultant", label: "ESG / Sustainability Consultant" },
  { value: "legalization_specialist", label: "Legalization of Illegal Structures" },
  { value: "energy_certificate_inspector", label: "Energy Certificate Inspector (ΠΕΑ)" },
  { value: "building_regulation_consultant", label: "Building Regulation Compliance" },
  { value: "fire_protection_consultant", label: "Fire Protection Consultant" },
  { value: "property_manager", label: "Property Manager" },
  { value: "facility_manager", label: "Facility Manager" },
  { value: "short_term_rental_operator", label: "Short-Term Rental Operator" },
  { value: "hotel_hospitality_operator", label: "Hotel / Hospitality Operator" },
  { value: "relocation_immigration_consultant", label: "Relocation / Immigration Consultant" },
  { value: "marketing_agency", label: "Marketing / Photographer / Media" },
  { value: "crm_listing_data_provider", label: "CRM / Listing Portal / Data Provider" },
];

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const DEFAULT_AVAILABILITY: DayAvailability[] = DAYS.map((_, i) => ({
  enabled: i >= 1 && i <= 5,
  start: "09:00",
  end: "18:00",
}));

const PRO_STEPS: OnboardingStep[] = ["pick-type", "pro-category", "pro-verify", "pro-services", "pro-availability", "pro-video", "done"];
const OTHER_STEPS: OnboardingStep[] = ["pick-type", "done"];

// ── Main component ─────────────────────────────────────────────────────────────

export default function Onboarding() {
  const navigate = useNavigate();
  const { user, profile, updateProfile, refreshProfile } = useAuth();

  // If bio already has __type: set (e.g. from signup role picker), skip straight to done
  const presetType = profile?.bio?.match(/^__type:(\w+)/)?.[1] ?? null;

  const [step, setStep] = useState<OnboardingStep>("pick-type");
  const [selected, setSelected] = useState<ParticipantType | null>(null);
  const [loading, setLoading] = useState(false);

  // Auto-advance past pick-type when type already set
  useEffect(() => {
    if (!presetType) return;
    const p = participants.find(x => x.id === presetType);
    if (!p) return;
    setSelected(p);
    if (p.isPro) {
      setStep("pro-category");
    } else {
      setStep("done");
    }
  }, [presetType]);

  const [proCategory, setProCategory] = useState("");
  const [professionalId, setProfessionalId] = useState<string | null>(null);
  const [proForm, setProForm] = useState({ businessName: "", taxId: "", phone: "", licenseNumber: "" });
  const [proErrors, setProErrors] = useState<Record<string, string>>({});

  const [selectedServices, setSelectedServices] = useState<Record<string, SelectedService>>({});
  const [availability, setAvailability] = useState<DayAvailability[]>(DEFAULT_AVAILABILITY);
  const [videoLink, setVideoLink] = useState("");
  const [calendarNotes, setCalendarNotes] = useState("");

  const steps = selected?.isPro ? PRO_STEPS : OTHER_STEPS;
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
    } catch (_) { localStorage.removeItem(DRAFT_KEY); }
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
    } catch (_) {}
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
        sessionStorage.removeItem("signup_participant_type");
        localStorage.removeItem("signup_participant_type");
        localStorage.removeItem(DRAFT_KEY);
        restoredRef.current = true;
        const p = participants.find(x => x.id === stored);
        if (!p) return;
        setSelected(p);
        if (p.isPro) {
          setStep("pro-category");
        } else {
          setLoading(true);
          await updateProfile({ role: p.role });
          await supabase.from("profiles").update({ bio: `__type:${p.id}` }).eq("user_id", user.id);
          await refreshProfile();
          setLoading(false);
          setStep("done");
        }
      } catch (_) {}
    })();
  }, [user, updateProfile, refreshProfile]);

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const handleSelectNonPro = async (p: ParticipantType) => {
    setSelected(p);
    if (p.isPro) { setStep("pro-category"); return; }
    setLoading(true);
    await updateProfile({ role: p.role });
    await supabase.from("profiles").update({ bio: `__type:${p.id}` }).eq("user_id", user!.id);
    await refreshProfile();
    setLoading(false);
    setStep("done");
  };

  const handleCategoryNext = () => {
    if (!proCategory) { toast.error("Please select your professional category"); return; }
    setStep("pro-verify");
  };

  const handleProVerify = async () => {
    const errs: Record<string, string> = {};
    if (!proForm.businessName.trim()) errs.businessName = "Business name is required";
    if (!proForm.phone.trim()) errs.phone = "Phone number is required";
    if (!/^\d{9}$/.test(proForm.taxId.replace(/\s/g, ""))) errs.taxId = "Enter a valid 9-digit AFM";
    if (Object.keys(errs).length) { setProErrors(errs); return; }

    setLoading(true);
    await updateProfile({ role: "professional", phone: proForm.phone });

    const { data: proData, error } = await supabase
      .from("professionals")
      .insert({
        user_id: user!.id,
        title: proForm.businessName,
        category: proCategory as any,
        display_name: user!.user_metadata?.full_name || proForm.businessName,
        city: "",
        license_number: proForm.licenseNumber || null,
        bio: `__type:professional | AFM: ${proForm.taxId}`,
      } as any)
      .select()
      .single();

    if (error) { toast.error("Could not save professional profile. Please try again."); setLoading(false); return; }
    setProfessionalId((proData as any).id);
    await supabase.from("profiles").update({ bio: `__type:professional` }).eq("user_id", user!.id);
    await refreshProfile();
    setLoading(false);
    setStep("pro-services");
  };

  const toggleService = (svc: ServiceTemplate) => {
    setSelectedServices(prev => {
      if (prev[svc.key]) { const next = { ...prev }; delete next[svc.key]; return next; }
      return { ...prev, [svc.key]: { template: svc, pricingModel: svc.defaultPricing, rate: String(svc.suggestedRate), videoEnabled: svc.videoAvailable } };
    });
  };

  const updateServicePricing = (key: string, field: "pricingModel" | "rate" | "videoEnabled", value: any) => {
    setSelectedServices(prev => ({ ...prev, [key]: { ...prev[key], [field]: value } }));
  };

  const handleSaveServices = async () => {
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
    const { error } = await supabase.from("professional_services" as any).insert(rows);
    if (error) { toast.error("Could not save services. Please try again."); setLoading(false); return; }
    setLoading(false);
    setStep("pro-availability");
  };

  const handleSaveAvailability = async () => {
    setLoading(true);
    const rows = availability.map((day, i) => ({ ...day, dayIndex: i })).filter(d => d.enabled).map(d => ({
      professional_id: professionalId!,
      day_of_week: d.dayIndex,
      start_time: d.start,
      end_time: d.end,
      is_active: true,
    }));
    if (rows.length > 0) await supabase.from("professional_availability" as any).insert(rows);
    setLoading(false);
    setStep("pro-video");
  };

  const handleSaveVideo = async () => {
    setLoading(true);
    if (professionalId) {
      await supabase.from("professionals")
        .update({ video_link: videoLink || null, calendar_notes: calendarNotes || null } as any)
        .eq("id", professionalId);
    }
    setLoading(false);
    setStep("done");
  };

  const handleUpgradeToPro = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: { plan: "professional_basic", success_url: `${window.location.origin}/dashboard?pro=success`, cancel_url: `${window.location.origin}/pricing` },
      });
      if (error || !data?.url) throw new Error(error?.message ?? data?.error ?? "Checkout failed");
      window.location.href = data.url;
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not start checkout");
    }
  };

  // ── Step content ──────────────────────────────────────────────────────────────

  const stepContent = (() => {

    // ── Pick type ──
    if (step === "pick-type") return (
      <div>
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-full px-4 py-1.5 text-xs font-medium text-primary mb-4">
            <Sparkles className="w-3.5 h-3.5" /> Personalise your experience
          </div>
          <h1 className="font-display font-bold text-2xl md:text-3xl text-foreground mb-2">How do you use the market?</h1>
          <p className="text-muted-foreground text-sm max-w-sm mx-auto">Choose your profile. You can always update it in settings.</p>
        </div>
        <div className="space-y-6">
          {(["Private", "Real estate agents", "Institutional & development", "Services"] as const).map(section => {
            const sectionParticipants = participants.filter(p => p.section === section);
            if (sectionParticipants.length === 0) return null;
            return (
              <div key={section}>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">{section}</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {sectionParticipants.map(p => {
                    const c = colorMap[p.color];
                    return (
                      <button
                        key={p.id}
                        onClick={() => handleSelectNonPro(p)}
                        disabled={loading}
                        className={cn(
                          "group relative text-left rounded-2xl border p-4 transition-all duration-200",
                          "hover:scale-[1.02] hover:shadow-lg hover:shadow-black/10",
                          "bg-secondary/60 border-border hover:border-primary/40 hover:bg-secondary",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        )}
                      >
                        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center mb-3", c.iconBg)}>
                          <p.icon className={cn("w-5 h-5", c.text)} />
                        </div>
                        <div className="font-semibold text-sm text-foreground leading-tight">{p.label}</div>
                        <div className={cn("text-xs font-medium mt-0.5 mb-2", c.text)}>{p.tagline}</div>
                        <div className="text-xs text-muted-foreground leading-relaxed mb-3">{p.desc}</div>
                        <div className="space-y-1">
                          {p.features.slice(0, 3).map(f => (
                            <div key={f} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                              <Check className={cn("w-3 h-3 shrink-0", c.text)} /> {f}
                            </div>
                          ))}
                        </div>
                        {p.isPro && (
                          <div className="absolute top-3 right-3 flex items-center gap-1 bg-amber-500/15 border border-amber-500/30 rounded-full px-2 py-0.5">
                            <Shield className="w-3 h-3 text-amber-400" />
                            <span className="text-[10px] text-amber-400 font-medium">Verify</span>
                          </div>
                        )}
                        <ChevronRight className="absolute bottom-4 right-4 w-4 h-4 text-muted-foreground/40 group-hover:text-primary transition-colors" />
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-center text-xs text-muted-foreground mt-6">
          Not sure yet?{" "}
          <button className="text-primary hover:underline" onClick={() => handleSelectNonPro(participants[0])}>Continue as a buyer</button>{" "}
          and customise later.
        </p>
      </div>
    );

    // ── Pro category ──
    if (step === "pro-category") return (
      <div>
        <div className="text-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/25 flex items-center justify-center mx-auto mb-4">
            <Wrench className="w-7 h-7 text-rose-400" />
          </div>
          <h1 className="font-display font-bold text-2xl text-foreground mb-1">What's your discipline?</h1>
          <p className="text-muted-foreground text-sm">Select the category that best describes your practice</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-6">
          {PRO_CATEGORIES.map(cat => (
            <button
              key={cat.value}
              onClick={() => setProCategory(cat.value)}
              className={cn(
                "p-3 rounded-xl border text-sm font-medium text-left transition-all",
                proCategory === cat.value
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border bg-secondary/60 text-muted-foreground hover:border-border/80 hover:text-foreground"
              )}
            >
              {proCategory === cat.value && <Check className="w-3.5 h-3.5 text-primary inline mr-1.5" />}
              {cat.label}
            </button>
          ))}
        </div>
        <Button className="w-full bg-gradient-primary border-0 text-primary-foreground" onClick={handleCategoryNext}>
          Continue <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    );

    // ── Pro verify ──
    if (step === "pro-verify") return (
      <div>
        <div className="text-center mb-5">
          <h1 className="font-display font-bold text-2xl text-foreground mb-1">Business Verification</h1>
          <p className="text-muted-foreground text-sm">As a {CATEGORY_LABELS[proCategory] ?? "professional"}, we need to verify your identity</p>
        </div>
        <div className="bg-amber-500/8 border border-amber-500/20 rounded-xl px-4 py-3 flex items-start gap-3 mb-5">
          <Shield className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-300/90">Details used only for verification. Approval takes 24–48h. You'll receive a verified badge upon approval.</p>
        </div>
        <div className="space-y-4">
          <ProField label="Business / Company Name" required error={proErrors.businessName} icon={<FileText className="w-4 h-4 text-muted-foreground" />}>
            <input type="text" placeholder="e.g. Papadopoulos Architecture Ltd." value={proForm.businessName}
              onChange={e => { setProForm(f => ({ ...f, businessName: e.target.value })); setProErrors(pe => ({ ...pe, businessName: "" })); }}
              className={cn("w-full bg-secondary border rounded-xl pl-9 pr-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors", proErrors.businessName ? "border-destructive" : "border-border")} />
          </ProField>
          <ProField label="Tax ID (ΑΦΜ)" required hint="9-digit Greek tax ID" error={proErrors.taxId} icon={<Shield className="w-4 h-4 text-muted-foreground" />}>
            <input type="text" placeholder="123456789" value={proForm.taxId}
              onChange={e => { setProForm(f => ({ ...f, taxId: e.target.value.replace(/\D/g, "").slice(0, 9) })); setProErrors(pe => ({ ...pe, taxId: "" })); }}
              maxLength={9}
              className={cn("w-full bg-secondary border rounded-xl pl-9 pr-3 py-2.5 text-sm text-foreground font-mono tracking-widest outline-none focus:border-primary transition-colors", proErrors.taxId ? "border-destructive" : "border-border")} />
          </ProField>
          <ProField label="Phone Number" required error={proErrors.phone} icon={<Phone className="w-4 h-4 text-muted-foreground" />}>
            <input type="tel" placeholder="+30 69X XXX XXXX" value={proForm.phone}
              onChange={e => { setProForm(f => ({ ...f, phone: e.target.value })); setProErrors(pe => ({ ...pe, phone: "" })); }}
              className={cn("w-full bg-secondary border rounded-xl pl-9 pr-3 py-2.5 text-sm text-foreground outline-none focus:border-primary transition-colors", proErrors.phone ? "border-destructive" : "border-border")} />
          </ProField>
          <ProField label="License / Registration Number" hint="Optional — e.g. ΤΕΕ-12345" icon={<FileText className="w-4 h-4 text-muted-foreground" />}>
            <input type="text" placeholder="Optional" value={proForm.licenseNumber}
              onChange={e => setProForm(f => ({ ...f, licenseNumber: e.target.value }))}
              className="w-full bg-secondary border border-border rounded-xl pl-9 pr-3 py-2.5 text-sm text-foreground outline-none focus:border-primary transition-colors" />
          </ProField>
          <Button className="w-full bg-gradient-primary border-0 text-primary-foreground" disabled={loading} onClick={handleProVerify}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Shield className="w-4 h-4 mr-2" />}
            Verify & Continue
          </Button>
        </div>
      </div>
    );

    // ── Pro services ──
    if (step === "pro-services") {
      const catalog = getServicesForCategory(proCategory);
      const selectedCount = Object.keys(selectedServices).length;
      const allSelected = selectedCount === catalog.length;

      const selectAll = () => {
        const next: Record<string, SelectedService> = {};
        catalog.forEach(svc => {
          next[svc.key] = { template: svc, pricingModel: svc.defaultPricing, rate: String(svc.suggestedRate), videoEnabled: svc.videoAvailable };
        });
        setSelectedServices(next);
      };

      const deselectAll = () => setSelectedServices({});

      return (
        <div>
          <div className="text-center mb-5">
            <h1 className="font-display font-bold text-2xl text-foreground mb-1">Your Services</h1>
            <p className="text-muted-foreground text-sm">
              Select the services you offer as a <span className="font-medium text-foreground">{CATEGORY_LABELS[proCategory]}</span>.
              Set your pricing model and rate for each.
            </p>
          </div>
          <div className="flex items-center justify-between mb-4">
            <div className="text-xs text-primary font-medium flex items-center gap-1.5">
              {selectedCount > 0 && <><Check className="w-3.5 h-3.5" />{selectedCount} of {catalog.length} selected</>}
              {selectedCount === 0 && <span className="text-muted-foreground">None selected yet</span>}
            </div>
            <button
              onClick={allSelected ? deselectAll : selectAll}
              className="text-xs font-medium text-primary hover:text-primary/80 border border-primary/30 hover:border-primary/60 rounded-full px-3 py-1 transition-all"
            >
              {allSelected ? "Deselect All" : "Select All"}
            </button>
          </div>
          <div className="space-y-3 mb-6">
            {catalog.map(svc => {
              const active = !!selectedServices[svc.key];
              const sel = selectedServices[svc.key];
              return (
                <div key={svc.key} className={cn("rounded-2xl border transition-all duration-200 overflow-hidden", active ? "border-primary/50 bg-primary/5" : "border-border bg-secondary/40")}>
                  <div className="flex items-start gap-3 p-4 cursor-pointer" onClick={() => toggleService(svc)}>
                    <div className={cn("mt-0.5 w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors", active ? "bg-primary border-primary" : "border-border bg-background")}>
                      {active && <Check className="w-3 h-3 text-primary-foreground" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm text-foreground">{svc.name}</span>
                        {svc.isPremiumFeature && (
                          <span className="inline-flex items-center gap-1 bg-amber-500/15 border border-amber-500/30 rounded-full px-2 py-0.5 text-[10px] text-amber-400 font-medium">
                            <Crown className="w-2.5 h-2.5" /> Pro
                          </span>
                        )}
                        {svc.videoAvailable && (
                          <span className="inline-flex items-center gap-1 bg-cyan-500/10 border border-cyan-500/20 rounded-full px-2 py-0.5 text-[10px] text-cyan-400">
                            <Video className="w-2.5 h-2.5" /> Video
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{svc.description}</p>
                      {!active && (
                        <div className="flex items-center gap-3 mt-1.5 text-[11px] text-muted-foreground/70">
                          <span className="flex items-center gap-1"><Euro className="w-3 h-3" />Suggested: €{svc.suggestedRate.toLocaleString()} / {PRICING_LABELS[svc.defaultPricing]}</span>
                          {svc.estimatedHours && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />~{svc.estimatedHours}h</span>}
                        </div>
                      )}
                    </div>
                    <div className={cn("shrink-0 mt-0.5 transition-transform", active ? "rotate-45" : "")}>
                      {active ? <Minus className="w-4 h-4 text-muted-foreground" /> : <Plus className="w-4 h-4 text-muted-foreground" />}
                    </div>
                  </div>
                  {active && sel && (
                    <div className="px-4 pb-4 border-t border-primary/15 pt-3 space-y-3">
                      <div>
                        <label className="text-xs font-medium text-muted-foreground block mb-2">Pricing Model</label>
                        <div className="flex gap-2">
                          {(["hourly", "daily", "fixed"] as PricingModel[]).map(pm => (
                            <button key={pm} onClick={() => updateServicePricing(svc.key, "pricingModel", pm)}
                              className={cn("flex-1 py-1.5 rounded-lg text-xs font-medium border transition-all", sel.pricingModel === pm ? "border-primary bg-primary/10 text-foreground" : "border-border bg-secondary text-muted-foreground hover:border-primary/40")}>
                              {PRICING_LABELS[pm]}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex-1">
                          <label className="text-xs font-medium text-muted-foreground block mb-1.5">
                            Your Rate (€){sel.pricingModel === "hourly" ? " / hour" : sel.pricingModel === "daily" ? " / day" : " fixed"}
                          </label>
                          <div className="relative">
                            <Euro className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                            <input type="number" min={0} value={sel.rate} onChange={e => updateServicePricing(svc.key, "rate", e.target.value)}
                              className="w-full bg-background border border-border rounded-xl pl-8 pr-3 py-2 text-sm text-foreground outline-none focus:border-primary transition-colors" />
                          </div>
                        </div>
                        {svc.estimatedHours && <div className="text-xs text-muted-foreground pt-5">~{svc.estimatedHours}h typical</div>}
                      </div>
                      {svc.videoAvailable && (
                        <label className="flex items-center gap-3 cursor-pointer">
                          <div onClick={() => { if (svc.isPremiumFeature && !sel.videoEnabled) { toast("Video consultations require the Pro plan", { icon: "🔒" }); return; } updateServicePricing(svc.key, "videoEnabled", !sel.videoEnabled); }}
                            className={cn("w-9 h-5 rounded-full border relative transition-colors cursor-pointer", sel.videoEnabled ? "bg-primary border-primary" : "bg-secondary border-border")}>
                            <div className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-background shadow transition-transform", sel.videoEnabled ? "translate-x-4" : "translate-x-0.5")} />
                          </div>
                          <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                            <Video className="w-3.5 h-3.5 text-cyan-400" />Available via video consultation
                            {svc.isPremiumFeature && <Lock className="w-3 h-3 text-amber-400" />}
                          </span>
                        </label>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <Button className="w-full bg-gradient-primary border-0 text-primary-foreground" disabled={loading || selectedCount === 0} onClick={handleSaveServices}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Save {selectedCount > 0 ? `${selectedCount} Service${selectedCount > 1 ? "s" : ""}` : "Services"} & Continue
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      );
    }

    // ── Pro availability ──
    if (step === "pro-availability") return (
      <div>
        <div className="text-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center mx-auto mb-4">
            <Calendar className="w-7 h-7 text-emerald-400" />
          </div>
          <h1 className="font-display font-bold text-2xl text-foreground mb-1">Your Availability</h1>
          <p className="text-muted-foreground text-sm">Set when you're available for client appointments</p>
        </div>
        <div className="space-y-2 mb-6">
          {DAYS.map((day, i) => {
            const d = availability[i];
            return (
              <div key={day} className={cn("rounded-xl border p-3 transition-all", d.enabled ? "border-primary/40 bg-primary/5" : "border-border bg-secondary/40")}>
                <div className="flex items-center gap-3">
                  <div onClick={() => setAvailability(prev => prev.map((v, idx) => idx === i ? { ...v, enabled: !v.enabled } : v))}
                    className={cn("w-9 h-5 rounded-full border relative transition-colors cursor-pointer shrink-0", d.enabled ? "bg-primary border-primary" : "bg-secondary border-border")}>
                    <div className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-background shadow transition-transform", d.enabled ? "translate-x-4" : "translate-x-0.5")} />
                  </div>
                  <span className={cn("text-sm font-semibold w-8 shrink-0", d.enabled ? "text-foreground" : "text-muted-foreground")}>{day}</span>
                  {d.enabled ? (
                    <div className="flex items-center gap-2 flex-1">
                      <input type="time" value={d.start} onChange={e => setAvailability(prev => prev.map((v, idx) => idx === i ? { ...v, start: e.target.value } : v))}
                        className="bg-background border border-border rounded-lg px-2 py-1 text-xs text-foreground outline-none focus:border-primary transition-colors" />
                      <span className="text-xs text-muted-foreground">to</span>
                      <input type="time" value={d.end} onChange={e => setAvailability(prev => prev.map((v, idx) => idx === i ? { ...v, end: e.target.value } : v))}
                        className="bg-background border border-border rounded-lg px-2 py-1 text-xs text-foreground outline-none focus:border-primary transition-colors" />
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">Not available</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <Button className="w-full bg-gradient-primary border-0 text-primary-foreground" disabled={loading} onClick={handleSaveAvailability}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          Save Availability & Continue <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
        <button className="w-full mt-3 text-xs text-muted-foreground hover:text-foreground transition-colors" onClick={() => setStep("pro-video")}>
          Skip for now →
        </button>
      </div>
    );

    // ── Pro video ──
    if (step === "pro-video") return (
      <div>
        <div className="text-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-cyan-500/10 border border-cyan-500/25 flex items-center justify-center mx-auto mb-4">
            <Video className="w-7 h-7 text-cyan-400" />
          </div>
          <h1 className="font-display font-bold text-2xl text-foreground mb-1">Video Consultations</h1>
          <p className="text-muted-foreground text-sm">Add your meeting link so clients can book video calls with you</p>
        </div>
        <div className="space-y-4 mb-6">
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1.5">Meeting Link</label>
            <div className="relative">
              <Video className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input type="url" placeholder="https://meet.google.com/xxx or https://zoom.us/j/..."
                value={videoLink} onChange={e => setVideoLink(e.target.value)}
                className="w-full bg-secondary border border-border rounded-xl pl-9 pr-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors" />
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">Supports Google Meet, Zoom, Teams, Whereby, and any video link</p>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1.5">Booking Notes (optional)</label>
            <textarea rows={2} placeholder="e.g. 'Please bring property documents to the call'"
              value={calendarNotes} onChange={e => setCalendarNotes(e.target.value)}
              className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors resize-none" />
          </div>
        </div>
        <div className="bg-amber-500/8 border border-amber-500/25 rounded-2xl p-4 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Crown className="w-4 h-4 text-amber-400" />
            <span className="text-sm font-semibold text-foreground">maiprop Pro Plan</span>
            <span className="ml-auto text-xs text-amber-400 font-medium border border-amber-500/30 rounded-full px-2 py-0.5">Coming Soon</span>
          </div>
          <div className="space-y-2 mb-3">
            {["Priority placement in directory", "Calendly-style booking page", "AI lead matching", "Advanced analytics", "Branded video room"].map(f => (
              <div key={f} className="flex items-center gap-2 text-xs text-muted-foreground">
                <Lock className="w-3 h-3 text-amber-400 shrink-0" /> {f}
              </div>
            ))}
          </div>
          <Button variant="outline" size="sm" className="w-full border-amber-500/30 text-amber-400 hover:bg-amber-500/10 hover:text-amber-300">
            <Crown className="w-3.5 h-3.5 mr-1.5" /> Notify me when Pro launches
          </Button>
        </div>
        <Button className="w-full bg-gradient-primary border-0 text-primary-foreground" disabled={loading} onClick={handleSaveVideo}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          Finish Setup <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
        <button className="w-full mt-3 text-xs text-muted-foreground hover:text-foreground transition-colors" onClick={() => handleSaveVideo()}>
          Skip for now →
        </button>
      </div>
    );

    // ── Done ──
    const selectedColor = selected ? colorMap[selected.color] : colorMap.emerald;
    const SelectedIcon = selected?.icon ?? Home;
    const isPro = selected?.isPro;
    const participantId = selected?.id ?? "buyer";

    // Per participant-id: primary redirect + secondary actions
    const PARTICIPANT_ACTIONS: Record<string, {
      primary: { label: string; href: string };
      secondary: { label: string; href: string }[];
      subtitle: string;
    }> = {
      buyer:         { primary: { label: "Browse Listings",       href: "/listings" },           secondary: [{ label: "View Auctions", href: "/auctions" }, { label: "Go to Dashboard", href: "/dashboard" }], subtitle: "Find your perfect property." },
      seller:        { primary: { label: "List My Property",       href: "/listings/new" },        secondary: [{ label: "Browse Market",  href: "/listings" }, { label: "Go to Dashboard", href: "/dashboard" }], subtitle: "Start with your first listing." },
      investor:      { primary: { label: "Investor Dashboard",     href: "/investor-dashboard" },  secondary: [{ label: "Browse Auctions", href: "/auctions" }, { label: "Firesale Deals", href: "/firesale" }],  subtitle: "Your deal pipeline is ready." },
      agent:         { primary: { label: "Create First Listing",   href: "/listings/new" },        secondary: [{ label: "Browse Listings", href: "/listings" }, { label: "Go to Dashboard", href: "/dashboard" }], subtitle: "Start listing properties for your clients." },
      institutional: { primary: { label: "Investor Dashboard",     href: "/investor-dashboard" },  secondary: [{ label: "Browse Listings", href: "/listings" }, { label: "Go to Dashboard", href: "/dashboard" }], subtitle: "Manage your portfolio and deal flow." },
      developer:     { primary: { label: "Create First Listing",   href: "/listings/new" },        secondary: [{ label: "Browse Listings", href: "/listings" }, { label: "Go to Dashboard", href: "/dashboard" }], subtitle: "Showcase your projects to buyers." },
      professional:  { primary: { label: "View My Profile",        href: "/professionals" },       secondary: [{ label: "Explore Dashboard", href: "/dashboard" }], subtitle: "Your profile is live in the directory." },
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
      />
    );
  })();

  // Per-step back handler
  const onBack = step === "pro-category" ? () => setStep("pick-type")
    : step === "pro-verify" ? () => setStep("pro-category")
    : step === "pro-services" ? () => setStep("pro-verify")
    : step === "pro-availability" ? () => setStep("pro-services")
    : step === "pro-video" ? () => setStep("pro-availability")
    : undefined;

  return (
    <Shell stepIndex={stepIndex + 1} totalSteps={totalSteps} step={step} onBack={onBack}>
      {stepContent}
    </Shell>
  );
}

// ── Shell — single instance, animates children on step change ─────────────────

function Shell({
  children,
  stepIndex,
  totalSteps,
  onBack,
  step,
}: {
  children: React.ReactNode;
  stepIndex: number;
  totalSteps: number;
  step: OnboardingStep;
  onBack?: () => void;
}) {
  const prevStepRef = useRef<OnboardingStep | null>(null);
  const prevIndexRef = useRef(stepIndex);
  const [displayedChildren, setDisplayedChildren] = useState(children);
  const [animClass, setAnimClass] = useState("opacity-100 translate-x-0");
  const [isTransitioning, setIsTransitioning] = useState(false);

  useEffect(() => {
    // First render — just record, no animation
    if (prevStepRef.current === null) {
      prevStepRef.current = step;
      prevIndexRef.current = stepIndex;
      return;
    }
    if (prevStepRef.current === step) return;

    const forward = stepIndex >= prevIndexRef.current;
    prevStepRef.current = step;
    prevIndexRef.current = stepIndex;

    setIsTransitioning(true);
    // 1. Exit current content
    setAnimClass(forward ? "opacity-0 -translate-x-6" : "opacity-0 translate-x-6");

    const t = setTimeout(() => {
      // 2. Swap content and set entry start position
      setDisplayedChildren(children);
      setAnimClass(forward ? "opacity-0 translate-x-6" : "opacity-0 -translate-x-6");

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          // 3. Animate in
          setAnimClass("opacity-100 translate-x-0");
          setIsTransitioning(false);
        });
      });
    }, 170);

    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // Keep children in sync while not transitioning
  useEffect(() => {
    if (!isTransitioning) setDisplayedChildren(children);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [children, isTransitioning]);

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-start px-4 pt-10 pb-16 overflow-x-hidden">
      {/* Logo */}
      <div className="mb-6 text-center shrink-0">
        <span className="font-display font-bold text-2xl">mai<span className="gradient-text-cyan">prop</span></span>
      </div>

      {/* Progress pills */}
      {totalSteps > 1 && (
        <div className="flex items-center gap-1.5 mb-8 shrink-0">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div
              key={i}
              className={cn(
                "h-1.5 rounded-full transition-all duration-500",
                i + 1 < stepIndex ? "bg-primary w-5" :
                i + 1 === stepIndex ? "bg-primary w-10" : "bg-muted w-5"
              )}
            />
          ))}
          <span className="text-xs text-muted-foreground ml-1">{Math.min(stepIndex, totalSteps)}/{totalSteps}</span>
        </div>
      )}

      {/* Always max-w-2xl — avoids jarring width jump between narrow and wide steps */}
      <div className="w-full max-w-2xl">
        {onBack && (
          <button onClick={onBack} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-4 transition-colors">
            ← Back
          </button>
        )}

        {/* Animated step content */}
        <div className={cn("transition-all duration-[200ms] ease-out will-change-transform", animClass)}>
          {displayedChildren}
        </div>
      </div>
    </div>
  );
}

// ── Field helper ──────────────────────────────────────────────────────────────

function ProField({ label, required, error, hint, icon, children }: {
  label: string; required?: boolean; error?: string; hint?: string; icon?: React.ReactNode; children: React.ReactNode;
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
      {error && <p className="text-xs text-destructive mt-1">⚠ {error}</p>}
      {hint && !error && <p className="text-[11px] text-muted-foreground mt-1">{hint}</p>}
    </div>
  );
}

// ── Done screen — extracted so it can use hooks at the top level ───────────────

function DoneScreen({
  selected,
  selectedColor,
  SelectedIcon,
  isPro,
  proCategory,
  selectedServicesCount,
  actions,
  navigate,
  onUpgradeToPro,
}: {
  selected: ParticipantType | null;
  selectedColor: { bg: string; border: string; text: string; iconBg: string };
  SelectedIcon: React.ElementType;
  isPro: boolean;
  proCategory: string;
  selectedServicesCount: number;
  actions: { primary: { label: string; href: string }; secondary: { label: string; href: string }[]; subtitle: string };
  navigate: (href: string) => void;
  onUpgradeToPro?: () => Promise<void>;
}) {
  const [countdown, setCountdown] = useState(4);
  const [redirectCancelled, setRedirectCancelled] = useState(false);

  useEffect(() => {
    if (redirectCancelled) return;
    if (countdown <= 0) { navigate(actions.primary.href); return; }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown, redirectCancelled, actions.primary.href, navigate]);

  return (
    <div className="text-center py-4">
      <div className="relative w-20 h-20 mx-auto mb-5">
        <div className={cn("w-20 h-20 rounded-full flex items-center justify-center border-2", selectedColor.bg, selectedColor.border)}>
          <SelectedIcon className={cn("w-9 h-9", selectedColor.text)} />
        </div>
        <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-emerald-500 flex items-center justify-center border-2 border-background">
          <Check className="w-3.5 h-3.5 text-white" />
        </div>
      </div>

      <h1 className="font-display font-bold text-2xl text-foreground mb-1.5">
        {isPro ? "Profile Created!" : "You're all set!"}
      </h1>
      <p className="text-muted-foreground text-sm mb-1">{actions.subtitle}</p>
      {isPro && <p className="text-xs text-muted-foreground mb-2">We'll review your details within 24–48 hours and add your verified badge.</p>}

      {/* Features unlocked */}
      <div className="bg-secondary/60 border border-border rounded-2xl p-4 text-left mb-5 mt-4 space-y-1.5">
        <p className="text-[11px] font-semibold text-muted-foreground mb-2 uppercase tracking-wide">What's unlocked</p>
        {(selected?.features ?? []).map(f => (
          <div key={f} className="flex items-center gap-2 text-sm text-foreground/80">
            <Check className={cn("w-3.5 h-3.5 shrink-0", selectedColor.text)} /> {f}
          </div>
        ))}
        {isPro && (
          <>
            <div className="flex items-center gap-2 text-sm text-foreground/80">
              <Check className="w-3.5 h-3.5 shrink-0 text-rose-400" />{selectedServicesCount} services configured
            </div>
            <div className="flex items-center gap-2 text-sm text-foreground/80">
              <Check className="w-3.5 h-3.5 shrink-0 text-rose-400" />Availability schedule set
            </div>
          </>
        )}
      </div>

      {/* Primary CTA with countdown ring */}
      <Button
        className="w-full bg-gradient-primary border-0 text-primary-foreground mb-2 relative overflow-hidden"
        onClick={() => { setRedirectCancelled(true); navigate(actions.primary.href); }}
      >
        <ArrowRight className="w-4 h-4 mr-2" />
        {actions.primary.label}
        {!redirectCancelled && countdown > 0 && (
          <span className="ml-auto text-[11px] opacity-70 font-normal tabular-nums">
            {countdown}s
          </span>
        )}
      </Button>

      {/* Countdown cancel hint */}
      {!redirectCancelled && countdown > 0 && (
        <p className="text-[11px] text-muted-foreground mb-3">
          Redirecting in {countdown}s ·{" "}
          <button
            className="underline hover:text-foreground transition-colors"
            onClick={() => setRedirectCancelled(true)}
          >
            Stay here
          </button>
        </p>
      )}

      {/* Upgrade to Pro — charge equivalent when professional upgrades */}
      {onUpgradeToPro && (
        <Button
          className="w-full mb-2 border-2 border-rose-500/40 bg-rose-500/10 text-rose-600 hover:bg-rose-500/20"
          onClick={() => { setRedirectCancelled(true); onUpgradeToPro(); }}
        >
          <Crown className="w-4 h-4 mr-2" />
          Upgrade to Pro — €49/mo
        </Button>
      )}

      {/* Secondary actions */}
      <div className="space-y-2 mt-1">
        {actions.secondary.map(a => (
          <Button
            key={a.href}
            variant="outline"
            className="w-full border-border bg-secondary text-foreground hover:bg-secondary/80"
            onClick={() => { setRedirectCancelled(true); navigate(a.href); }}
          >
            {a.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

