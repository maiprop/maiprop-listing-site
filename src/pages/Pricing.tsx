import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/hooks/useSubscription";
import {
  Check, Zap, Users, Briefcase, UserCheck,
  BarChart2, Bell, Star, Shield, Filter, ArrowRight,
  Crown, Sparkles, Building2, Gavel, Home, Layers,
  MessageSquare, Eye, FileText, FolderKanban,
  Loader2, Database,
  Wallet, Globe, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getPricingAudienceFromProfile, getParticipantTypeFromProfile, type PricingAudienceId } from "@/lib/participantConfig";
import { ROLE_PLAN_MAP } from "@/lib/rolePlanMap";
import { isPlatformAdmin } from "@/lib/authUtils";
import { usePricingConfigs } from "@/hooks/usePricingConfigs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ── Audience config ────────────────────────────────────────────────────────────

type AudienceId = PricingAudienceId;

const AUDIENCE_TABS: { id: AudienceId; label: string; mobileLabel: string; icon: React.ElementType }[] = [
  { id: "participant",   label: "Buyer / Seller",       mobileLabel: "Buyer",  icon: Home },
  { id: "agent",         label: "Agent",                mobileLabel: "Agent",  icon: UserCheck },
  { id: "developer",     label: "Developer",            mobileLabel: "Dev",    icon: Layers },
  { id: "professional",  label: "Professional",         mobileLabel: "Pro",    icon: Briefcase },
  { id: "investor",      label: "Investor",             mobileLabel: "Invest", icon: Wallet },
  { id: "institutional", label: "Institutional",        mobileLabel: "Instit", icon: Building2 },
];

// ── Plan feature type ──────────────────────────────────────────────────────────
type PlanFeature = { label: string; free?: boolean | string; paid?: boolean | string; icon?: React.ElementType };

// ── Per-audience plan data ─────────────────────────────────────────────────────

const PARTICIPANT_FREE_LIST = [
  "Browse all listings & auction database",
  "View up to 60 auction listings",
  "Save 1 search + 1 alert",
  "Book 1 viewing per month",
  "List up to 2 of your own properties",
  "Browse Open Houses & RSVP (up to 3/month)",
  "Direct messaging",
  "Professional directory (up to 5 per category)",
];
const PARTICIPANT_PRO: PlanFeature[] = [
  { label: "AI Property Valuation",      icon: BarChart2,    free: "—",          paid: "5/month · €5 each extra" },
  { label: "Neighbourhood Reports",      icon: FileText,     free: "—",          paid: "3/month · €12 each extra" },
  { label: "AI Market Insights",         icon: Zap,          free: false,        paid: true },
  { label: "Full auction filters & 600 listings", icon: Filter, free: "60 max", paid: "600 max" },
  { label: "Unlimited saved searches & alerts", icon: Bell,  free: "1 each",    paid: "Unlimited" },
  { label: "Up to 10 viewings/month",    icon: MessageSquare,free: "1/month",   paid: "10/month" },
  { label: "Up to 5 listings (sell/rent)", icon: Layers,     free: "2 max",     paid: "5 max" },
  { label: "AI listing description",     icon: Sparkles,     free: false,        paid: true },
  { label: "Featured listing badge",     icon: Crown,        free: false,        paid: "1 included" },
  { label: "Listing performance analytics", icon: BarChart2, free: false,        paid: true },
  { label: "Priority matching",          icon: Star,         free: false,        paid: true },
  { label: "Full professionals directory", icon: Users,      free: "5 per cat.", paid: "Unlimited" },
];

const AGENT_FREE_LIST = [
  "Up to 5 active listings",
  "Basic messaging & viewings (3/month)",
  "View 60 auction listings",
  "Basic profile in Professionals directory",
  "maiProp branded video room",
];
const AGENT_PRO: PlanFeature[] = [
  { label: "Unlimited active listings",  icon: Layers,       free: "5 max",     paid: "Unlimited" },
  { label: "AI Listing Assistant",       icon: Sparkles,     free: false,        paid: true },
  { label: "Full CRM & lead management", icon: Users,        free: false,        paid: true },
  { label: "Listing performance analytics", icon: BarChart2, free: "—",         paid: "Per-listing" },
  { label: "Auction alerts (unlimited)", icon: Gavel,        free: "—",         paid: "Unlimited" },
  { label: "Private owner listing alerts", icon: Bell,       free: false,        paid: true },
  { label: "Priority ads",               icon: Star,         free: false,        paid: "10 included · €8 each extra" },
  { label: "Featured directory placement", icon: Crown,      free: "Basic",      paid: "Advanced" },
  { label: "Viewings (unlimited)",        icon: MessageSquare,free: "3/month",  paid: "Unlimited" },
  { label: "Open House full management", icon: Eye,          free: "—",         paid: "Full analytics & bidding" },
  { label: "AI Valuation & Reports",     icon: FileText,     free: false,        paid: "5 valuations/month included" },
];

const DEVELOPER_PRO: PlanFeature[] = [
  { label: "Unlimited project listings", icon: Layers,       free: false,        paid: true },
  { label: "New Build showcase pages",   icon: Building2,    free: false,        paid: true },
  { label: "Pre-sale & off-plan management", icon: Eye,      free: false,        paid: true },
  { label: "Construction timeline & floor plans", icon: FileText, free: false,  paid: true },
  { label: "Priority in New Builds section", icon: Star,     free: false,        paid: true },
  { label: "AI listing & description tools", icon: Sparkles, free: false,        paid: true },
  { label: "Project analytics dashboard", icon: BarChart2,   free: false,        paid: true },
  { label: "AI Neighbourhood Reports",   icon: Globe,        free: false,        paid: "3/month included" },
  { label: "Lead capture & CRM",         icon: Users,        free: false,        paid: true },
];

const PROFESSIONAL_FREE_LIST = [
  "Directory listing (basic)",
  "Receive basic enquiries",
  "Consultation request notifications",
  "Booking via profile page (manual confirm)",
];
const PROFESSIONAL_PRO: PlanFeature[] = [
  { label: "Priority placement in directory", icon: Star,    free: "Standard",  paid: "Top 3 in category" },
  { label: "AI client & service matching",    icon: Sparkles, free: false,      paid: true },
  { label: "Verified badge (expedited)",      icon: Shield,  free: "Pending",   paid: "48h" },
  { label: "Booking & availability calendar", icon: FolderKanban, free: false,  paid: true },
  { label: "Advanced lead analytics",         icon: BarChart2, free: false,     paid: true },
  { label: "Branded video consultation room", icon: Eye,     free: false,       paid: true },
  { label: "AI property tools (valuation, neighbourhood)", icon: BarChart2, free: false, paid: "3/month included" },
  { label: "Consultation messaging suite",    icon: MessageSquare, free: false, paid: true },
  { label: "CRM & client management",         icon: Users,   free: false,       paid: true },
];

const INVESTOR_FEATURES: PlanFeature[] = [
  { label: "Full deal-flow listings (off-market & distressed)", icon: Layers, free: false, paid: true },
  { label: "AI property matching & criteria alerts",            icon: Sparkles, free: false, paid: true },
  { label: "Market analytics & pricing intelligence",          icon: BarChart2, free: false, paid: true },
  { label: "Portfolio tracking dashboard",                     icon: FolderKanban, free: false, paid: true },
  { label: "Full auction database (600+ listings)",            icon: Gavel, free: "60 max", paid: "Unlimited" },
  { label: "AI Valuation & Neighbourhood Reports",             icon: FileText, free: false, paid: "5/month included" },
  { label: "Direct vendor & agent contact",                    icon: MessageSquare, free: false, paid: true },
  { label: "Due diligence pack download",                      icon: Shield, free: false, paid: true },
  { label: "Firesale & distressed asset access",               icon: Bell, free: false, paid: true },
];

const INSTITUTIONAL_FEATURES: PlanFeature[] = [
  { label: "Everything in Investor Plan",                      icon: Check, free: false, paid: true },
  { label: "Bulk deal pipeline & pipeline management",         icon: Database, free: false, paid: true },
  { label: "White-label API access (AVM + listings)",         icon: Globe, free: false, paid: true },
  { label: "Dedicated account manager",                        icon: UserCheck, free: false, paid: true },
  { label: "Custom data exports (CSV, JSON)",                  icon: FileText, free: false, paid: true },
  { label: "Multi-user / team seats",                          icon: Users, free: false, paid: true },
  { label: "Priority deal sourcing & exclusives",              icon: Star, free: false, paid: true },
  { label: "Bespoke market intelligence reports",              icon: BarChart2, free: false, paid: true },
];

// ── Pricing plan definitions ───────────────────────────────────────────────────
type PlanDef = {
  freeLabel: string; freePrice: string; freeDesc: string; freeCTA: string; freeHref: string;
  paidLabel: string;
  monthlyPrice: number; annualPrice: number;
  paidDesc: string; paidCTA: string; paidHref: string;
  features: PlanFeature[];
  freeList: string[];
  accent: string; accentBg: string; accentBorder: string;
  proOnly?: boolean;
  inviteOnly?: boolean;
};

const PLANS: Record<AudienceId, PlanDef> = {
  participant: {
    freeLabel: "Free", freePrice: "€0", freeDesc: "Search, browse & list your own property", freeCTA: "Get Started Free", freeHref: "/signup",
    paidLabel: "Pro Plan", monthlyPrice: 29, annualPrice: 290,
    paidDesc: "AI valuations, reports, pro auction filters & up to 5 listings", paidCTA: "Get Pro Plan", paidHref: "/pricing",
    freeList: PARTICIPANT_FREE_LIST, features: PARTICIPANT_PRO,
    accent: "text-brand-gold", accentBg: "bg-brand-gold/10", accentBorder: "border-brand-gold/40",
  },
  agent: {
    freeLabel: "Free", freePrice: "€0", freeDesc: "Up to 5 listings & basic tools", freeCTA: "Start Free", freeHref: "/signup",
    paidLabel: "Agent Pro", monthlyPrice: 149, annualPrice: 1490,
    paidDesc: "Unlimited listings, full CRM, analytics, AI tools & 10 priority ads", paidCTA: "Get Agent Pro", paidHref: "/pricing",
    freeList: AGENT_FREE_LIST, features: AGENT_PRO,
    accent: "text-brand-purple", accentBg: "bg-brand-purple/10", accentBorder: "border-brand-purple/40",
  },
  developer: {
    freeLabel: "—", freePrice: "—", freeDesc: "Developer plan required", freeCTA: "—", freeHref: "#",
    paidLabel: "Developer Pro", monthlyPrice: 129, annualPrice: 1290,
    paidDesc: "Unlimited projects, new build showcase, pre-sale management & priority placement", paidCTA: "Get Developer Pro", paidHref: "/pricing",
    freeList: [], features: DEVELOPER_PRO,
    accent: "text-orange-600 dark:text-orange-400", accentBg: "bg-orange-500/10", accentBorder: "border-orange-500/40",
    proOnly: true,
  },
  professional: {
    freeLabel: "Free", freePrice: "€0", freeDesc: "Join the directory & receive basic enquiries", freeCTA: "Register Free", freeHref: "/signup",
    paidLabel: "Professional Pro", monthlyPrice: 69, annualPrice: 690,
    paidDesc: "Priority leads, booking calendar, verified badge & AI tools", paidCTA: "Get Pro Plan", paidHref: "/pricing",
    freeList: PROFESSIONAL_FREE_LIST, features: PROFESSIONAL_PRO,
    accent: "text-rose-600 dark:text-rose-400", accentBg: "bg-rose-500/10", accentBorder: "border-rose-500/40",
  },
  investor: {
    freeLabel: "—", freePrice: "—", freeDesc: "Invitation-only", freeCTA: "—", freeHref: "#",
    paidLabel: "Investor Plan", monthlyPrice: 0, annualPrice: 0,
    paidDesc: "Deal-flow access, AI matching, market analytics & direct vendor contact",
    paidCTA: "Apply for Access", paidHref: "/investor-dashboard",
    freeList: [], features: INVESTOR_FEATURES,
    accent: "text-emerald-700 dark:text-emerald-400", accentBg: "bg-emerald-500/10", accentBorder: "border-emerald-500/40",
    proOnly: true, inviteOnly: true,
  },
  institutional: {
    freeLabel: "—", freePrice: "—", freeDesc: "Invitation-only", freeCTA: "—", freeHref: "#",
    paidLabel: "Institutional Plan", monthlyPrice: 0, annualPrice: 0,
    paidDesc: "Full platform access, bulk pipeline, API, dedicated manager & multi-user seats",
    paidCTA: "Talk to Sales", paidHref: "/contact",
    freeList: [], features: INSTITUTIONAL_FEATURES,
    accent: "text-sky-700 dark:text-sky-400", accentBg: "bg-sky-500/10", accentBorder: "border-sky-500/40",
    proOnly: true, inviteOnly: true,
  },
};

// ── Main component ─────────────────────────────────────────────────────────────
export default function Pricing() {
  const { user, profile, profileLoading } = useAuth();
  const { isPro, loading: subLoading, refreshSubscription } = useSubscription();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // B2B / institutional data products: shown to institutional, developer, admin, or unauthenticated
  const participantType = getParticipantTypeFromProfile(profile);
  const showB2B =
    !user ||
    participantType === "institutional" ||
    participantType === "developer" ||
    isPlatformAdmin(profile);

  const [activeTab, setActiveTab] = useState<AudienceId>("participant");
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("monthly");
  const [hasAutoSelected, setHasAutoSelected] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  const PLAN_KEYS: Record<AudienceId, string> = {
    participant:   ROLE_PLAN_MAP.participant.planKey,
    agent:         ROLE_PLAN_MAP.agent.planKey,
    developer:     ROLE_PLAN_MAP.developer.planKey,
    professional:  ROLE_PLAN_MAP.professional.planKey,
    investor:      ROLE_PLAN_MAP.investor.planKey,
    institutional: ROLE_PLAN_MAP.institutional.planKey,
  };

  const handleCheckout = async () => {
    if (!user) { navigate("/signup"); return; }
    if (PLANS[activeTab].inviteOnly) {
      navigate(activeTab === "institutional" ? "/contact" : "/investor-dashboard");
      return;
    }
    setCheckoutLoading(true);
    try {
      const planKey = PLAN_KEYS[activeTab];
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: { plan: planKey, billing_cycle: billingCycle },
      });
      if (error || !data?.url) throw new Error(error?.message ?? data?.error ?? "Checkout failed");
      window.location.href = data.url;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Could not start checkout";
      toast.error(msg);
    } finally {
      setCheckoutLoading(false);
    }
  };

  const handleManageSubscription = async () => {
    setPortalLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("customer-portal", {});
      if (error || !data?.url) throw new Error(error?.message || "Failed to open billing portal");
      window.open(data.url, "_blank");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to open billing portal";
      toast.error(msg || "Failed to open billing portal");
    } finally {
      setPortalLoading(false);
    }
  };

  useEffect(() => {
    const checkoutStatus = searchParams.get("checkout");
    if (checkoutStatus === "success") {
      toast.success("Payment successful! Your plan has been activated.");
      refreshSubscription();
    } else if (checkoutStatus === "cancelled") {
      toast.info("Checkout cancelled — no charge was made.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (hasAutoSelected) return;
    const audienceParam = searchParams.get("audience") as AudienceId | null;
    if (audienceParam && AUDIENCE_TABS.some(t => t.id === audienceParam)) {
      setActiveTab(audienceParam);
      setHasAutoSelected(true);
      return;
    }
    if (profile) {
      const pt = getPricingAudienceFromProfile(profile);
      const validTab = AUDIENCE_TABS.some(t => t.id === pt) ? pt : "participant";
      setActiveTab(validTab as AudienceId);
      setHasAutoSelected(true);
      return;
    }
    if (user && profileLoading) {
      return;
    }
    setHasAutoSelected(true);
  }, [profile, profileLoading, user, hasAutoSelected, searchParams]);

  const { data: pricingConfigs = {} } = usePricingConfigs();
  const planKey = PLAN_KEYS[activeTab];
  const config = pricingConfigs[planKey];
  const basePlan = PLANS[activeTab];

  // Prioritize database pricing values, fallback to hardcoded defaults
  const dbMonthlyPrice = config?.amount ?? basePlan.monthlyPrice;
  const dbAnnualPrice = config?.amount && config?.unit === 'monthly' 
    ? config.amount * 10  // Assume 2 months free for annual (10 months billed)
    : basePlan.annualPrice;

  // Resolve displayed price from billing cycle
  const displayMonthly = billingCycle === "monthly" ? dbMonthlyPrice : Math.round(dbAnnualPrice / 12);
  const displayTotal   = billingCycle === "annual"  ? dbAnnualPrice : dbMonthlyPrice;
  const annualSaving   = dbMonthlyPrice * 12 - dbAnnualPrice;

  const plan = config
    ? {
        ...basePlan,
        paidLabel: config.label,
        paidDesc: config.description || basePlan.paidDesc,
        monthlyPrice: dbMonthlyPrice,
        annualPrice: dbAnnualPrice,
      }
    : basePlan;

  const participant = getPricingAudienceFromProfile(profile);
  const hasAudiencePro = !subLoading && isPro && activeTab === participant;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-16">

        {/* ── Hero ──────────────────────────────────────────────────────────── */}
        <div className="border-b border-border bg-card/60 py-12 sm:py-16">
          <div className="container max-w-5xl text-center px-4">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold uppercase tracking-widest mb-5">
              <Zap className="w-3.5 h-3.5" /> Pricing
            </div>
            <h1 className="font-display text-3xl sm:text-5xl font-black mb-3 leading-tight">
              Plans built for{" "}
              <span className="gradient-text-primary">every role in the market</span>
            </h1>
            <p className="text-muted-foreground text-base max-w-xl mx-auto mb-8">
              Choose your role. Upgrade when you need more. Pay only for what you use.
            </p>

            {/* Billing toggle */}
            <div className="flex items-center justify-center gap-3 mb-6">
              <span className={cn("text-sm font-medium", billingCycle === "monthly" ? "text-foreground" : "text-muted-foreground")}>Monthly</span>
              <button
                role="switch"
                aria-checked={billingCycle === "annual"}
                aria-label="Annual billing"
                onClick={() => setBillingCycle(c => c === "monthly" ? "annual" : "monthly")}
                className={cn(
                  "relative w-12 h-6 rounded-full transition-colors duration-200 border",
                  billingCycle === "annual" ? "bg-primary border-primary" : "bg-secondary border-border"
                )}
              >
                <span className={cn(
                  "absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200",
                  billingCycle === "annual" ? "translate-x-6" : "translate-x-0.5"
                )} />
              </button>
              <span className={cn("text-sm font-medium flex items-center gap-1.5", billingCycle === "annual" ? "text-foreground" : "text-muted-foreground")}>
                Annual
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">2 months FREE</span>
              </span>
            </div>

            {/* Audience tab strip */}
            <div className="flex justify-center overflow-x-auto pb-1 -mx-4 px-4 scrollbar-hide">
              <div className="inline-flex gap-1 bg-secondary/80 border border-border rounded-2xl p-1 min-w-max">
                {AUDIENCE_TABS.map(({ id, label, mobileLabel, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => setActiveTab(id)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-200 whitespace-nowrap",
                      activeTab === id
                        ? "bg-background border border-border shadow-card text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span className="hidden md:inline">{label}</span>
                    <span className="md:hidden">{mobileLabel}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Plan cards ────────────────────────────────────────────────────── */}
        <div className="container max-w-5xl py-10 sm:py-16 px-4">
          <div className={cn(
            "grid gap-5 items-stretch mb-4",
            plan.proOnly ? "grid-cols-1 max-w-xl mx-auto" : "md:grid-cols-2"
          )}>

            {/* Free card */}
            {!plan.proOnly && (() => {
              const isCurrentFreePlan = !!user && !subLoading && !hasAudiencePro && activeTab === participant;
              return (
                <div className={cn("glass-card rounded-2xl overflow-hidden flex flex-col relative", isCurrentFreePlan ? "border-2 border-primary/40" : "border border-border")}>
                  {isCurrentFreePlan && (
                    <div className="absolute top-4 right-4">
                      <span className="flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider bg-primary/10 border border-primary/30 text-primary">
                        <Check className="w-2.5 h-2.5" /> Current Plan
                      </span>
                    </div>
                  )}
                  <div className="px-6 sm:px-8 py-6 border-b border-border">
                    <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">{plan.freeLabel}</p>
                    <div className="flex items-baseline gap-1 mb-1">
                      <span className="font-display text-4xl font-black text-foreground">{plan.freePrice}</span>
                      {plan.freePrice !== "€0" && <span className="text-muted-foreground text-sm">/ month</span>}
                    </div>
                    <p className="text-xs text-muted-foreground">{plan.freeDesc}</p>
                  </div>
                  <div className="p-6 sm:p-8 flex-1">
                    <ul className="space-y-3">
                      {plan.freeList.map((f) => (
                        <li key={f} className="flex items-center gap-2.5 text-sm">
                          <Check className="w-4 h-4 text-primary shrink-0" />
                          <span className="text-muted-foreground">{f}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="px-6 sm:px-8 pb-6 sm:pb-8">
                    {isCurrentFreePlan ? (
                      <Button variant="outline" className="w-full h-11 border-primary/30 text-primary" disabled>
                        <Check className="w-4 h-4 mr-2" /> Your Current Plan
                      </Button>
                    ) : (
                      <Button variant="outline" className="w-full h-11 border-border" asChild>
                        <Link to={plan.freeHref}>Get Started Free</Link>
                      </Button>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Paid card */}
            <div className={cn("relative glass-card rounded-2xl border-2 overflow-hidden flex flex-col shadow-elevated", plan.accentBorder)}>
              <div className="absolute top-4 right-4">
                {hasAudiencePro ? (
                  <span className="flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider bg-emerald-500 text-white">
                    <Crown className="w-2.5 h-2.5" /> Your Plan
                  </span>
                ) : (
                  <span className={cn("flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider border", plan.accentBg, plan.accentBorder, plan.accent)}>
                    <Sparkles className="w-2.5 h-2.5" /> Recommended
                  </span>
                )}
              </div>

              <div className={cn("px-6 sm:px-8 py-6 border-b border-border", plan.accentBg)}>
                <p className={cn("text-xs font-bold uppercase tracking-widest mb-2", plan.accent)}>{plan.paidLabel}</p>
                <div className="flex items-baseline gap-1 mb-1">
                  {plan.inviteOnly ? (
                    <span className="font-display text-3xl font-black text-foreground">Invitation only</span>
                  ) : (
                    <>
                      <span className="font-display text-4xl font-black text-foreground">€{displayMonthly}</span>
                      <span className="text-muted-foreground text-sm">/ month</span>
                    </>
                  )}
                </div>
                {!plan.inviteOnly && (billingCycle === "annual" ? (
                  <p className="text-xs text-emerald-700 dark:text-emerald-400 font-semibold">€{displayTotal}/year · saves €{annualSaving} vs monthly</p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    or <button onClick={() => setBillingCycle("annual")} className="underline hover:text-foreground">€{Math.round(basePlan.annualPrice / 12)}/mo billed annually</button>
                    {" "}(save €{annualSaving}/yr)
                  </p>
                ))}
                {plan.inviteOnly && (
                  <p className="text-xs text-muted-foreground">Custom pricing · a payment link is sent after your application is approved.</p>
                )}
                <p className="text-xs text-muted-foreground mt-1">{plan.paidDesc}</p>
              </div>

              <div className="p-6 sm:p-8 flex-1">
                <ul className="space-y-3.5">
                  {plan.features.map((f) => {
                    const Icon = f.icon;
                    return (
                      <li key={f.label} className="flex items-start gap-3">
                        <div className={cn("w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5", plan.accentBg)}>
                          {Icon ? <Icon className={cn("w-3 h-3", plan.accent)} /> : <Check className={cn("w-3 h-3", plan.accent)} />}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-foreground">{f.label}</p>
                          {typeof f.paid === "string" && f.paid !== "true" && (
                            <p className={cn("text-[11px] mt-0.5", plan.accent)}>{f.paid}</p>
                          )}
                          {typeof f.free === "string" && (
                            <p className="text-[11px] mt-0.5 text-muted-foreground line-through">{f.free}</p>
                          )}
                        </div>
                      </li>
                    );
                  })}
                  {!plan.proOnly && (
                    <li className="flex items-center gap-2.5 text-sm text-muted-foreground border-t border-border pt-3 mt-1">
                      <Check className="w-4 h-4 text-primary shrink-0" />
                      Everything in Free, plus all Pro features
                    </li>
                  )}
                </ul>
              </div>

              <div className="px-6 sm:px-8 pb-6 sm:pb-8 space-y-2">
                {hasAudiencePro && plan.inviteOnly ? (
                  <Button
                    variant="outline"
                    className="w-full h-11 border-emerald-500/40 text-emerald-700 dark:text-emerald-400 gap-2"
                    onClick={() => navigate("/investor-dashboard")}
                  >
                    <ArrowRight className="w-4 h-4" /> Go to Investor Dashboard
                  </Button>
                ) : hasAudiencePro ? (
                  <Button
                    variant="outline"
                    className="w-full h-11 border-emerald-500/40 text-emerald-700 dark:text-emerald-400"
                    onClick={handleManageSubscription}
                    disabled={portalLoading}
                  >
                    {portalLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    {portalLoading ? "Opening…" : "Manage Subscription"}
                  </Button>
                ) : (
                  <Button
                    className="w-full h-11 font-bold gap-2 bg-gradient-primary border-0 text-primary-foreground"
                    onClick={handleCheckout}
                    disabled={checkoutLoading}
                  >
                    {checkoutLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                    {user ? (checkoutLoading ? "Redirecting…" : plan.paidCTA) : "Get Started"}
                    {!checkoutLoading && <ArrowRight className="w-4 h-4" />}
                  </Button>
                )}
                {plan.inviteOnly ? (
                  <p className="text-[11px] text-muted-foreground text-center">
                    Invitation-based access · Pricing by arrangement
                  </p>
                ) : (
                  <p className="text-[11px] text-muted-foreground text-center">
                    Cancel anytime · No setup fees
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Agency add-on pointer — shown only on agent tab */}
          {activeTab === "agent" && (
            <div className="mt-4 rounded-2xl border border-brand-purple/30 bg-brand-purple/5 p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="flex-1">
                <p className="text-sm font-bold text-brand-purple mb-0.5">Running a team or agency?</p>
                <p className="text-xs text-muted-foreground">Stay on Agent Pro and add what you need: extra agent seats, an agency-branded profile, a dedicated account manager and white-label — all available as add-ons in your dashboard's Billing tab.</p>
              </div>
              <Link to={user ? "/dashboard?tab=billing" : "/signup?type=agent"} className="shrink-0">
                <Button variant="outline" size="sm" className="border-brand-purple/40 text-brand-purple hover:bg-brand-purple/10 gap-1.5">
                  See add-ons <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              </Link>
            </div>
          )}

          {/* Professional Premium add-on pointer — shown only on professional tab */}
          {activeTab === "professional" && (
            <div className="mt-4 rounded-2xl border border-rose-500/30 bg-rose-500/5 p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="flex-1">
                <p className="text-sm font-bold text-rose-600 dark:text-rose-400 mb-0.5">Need more than Pro?</p>
                <p className="text-xs text-muted-foreground">Stay on Professional Pro and unlock API access, the referral network and additional client seats as add-ons from your dashboard's Billing tab.</p>
              </div>
              <Link to={user ? "/dashboard?tab=billing" : "/signup?type=professional"} className="shrink-0">
                <Button variant="outline" size="sm" className="border-rose-500/40 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 gap-1.5">
                  See add-ons <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              </Link>
            </div>
          )}

          <p className="text-center text-xs text-muted-foreground mt-10 max-w-xl mx-auto">
            All prices are in EUR and exclude VAT where applicable.
          </p>
        </div>

        {/* ── maiProp OS user discount banner ── */}
        {showB2B && <div className="border-t border-border py-10">
          <div className="container max-w-4xl px-4">
            <div className="relative rounded-2xl overflow-hidden border border-primary/30 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-6 sm:p-8 flex flex-col sm:flex-row items-center gap-6">
              {/* decorative blob */}
              <div className="absolute -right-12 -top-12 w-48 h-48 rounded-full bg-primary/10 blur-3xl pointer-events-none" />

              <div className="flex-1 min-w-0 relative">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/15 border border-primary/25 text-primary text-[11px] font-bold uppercase tracking-widest mb-3">
                  <Database className="w-3 h-3" /> maiProp OS
                </div>
                <h2 className="text-xl sm:text-2xl font-bold mb-2 leading-snug">
                  Already a maiProp OS user?{" "}
                  <span className="text-primary">Get 20% off</span> your maiProp plan.
                </h2>
                <p className="text-sm text-muted-foreground max-w-md">
                  Active maiProp OS subscribers — Market Intelligence, AVM API, or Auction Intelligence — are eligible for a 20% discount on any maiProp subscription plan. Apply your OS licence key at checkout.
                </p>
              </div>

              <div className="shrink-0 flex flex-col items-center sm:items-end gap-3 relative">
                <div className="rounded-xl border border-primary/30 bg-primary/10 px-5 py-3 text-center">
                  <p className="text-3xl font-black text-primary leading-none">20%</p>
                  <p className="text-[11px] font-semibold text-muted-foreground mt-0.5 uppercase tracking-wide">discount</p>
                </div>
                <Link to="/contact">
                  <Button size="sm" className="gap-2 bg-gradient-primary border-0 text-primary-foreground">
                    <Wallet className="w-3.5 h-3.5" /> Claim your discount
                  </Button>
                </Link>
                <p className="text-[10px] text-muted-foreground text-center">
                  Not on OS yet?{" "}
                  <Link to="/contact" className="underline hover:text-foreground">Talk to sales</Link>
                </p>
              </div>
            </div>
          </div>
        </div>}

      </div>
      <Footer />
    </div>
  );
}
