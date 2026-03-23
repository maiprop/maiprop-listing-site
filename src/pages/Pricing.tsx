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
  Loader2, Flame, Database, TrendingUp, Lock, Tag,
  Wallet, Globe, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getPricingAudienceFromProfile, type PricingAudienceId } from "@/lib/participantConfig";
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

// ── Investor tiers (standalone section) ───────────────────────────────────────

const INVESTOR_PRIVATE_FEATURES: PlanFeature[] = [
  { label: "Pre-market Quick Sale deal flow",  icon: Flame },
  { label: "Investor dashboard & pipeline",    icon: BarChart2 },
  { label: "Real-time distressed property alerts", icon: Bell },
  { label: "Court auction deal flow (OS-routed)", icon: Gavel },
  { label: "Proof-of-funds priority queue",    icon: Star },
  { label: "ROI & yield calculator",           icon: TrendingUp },
  { label: "Express interest with 1 click",    icon: Zap },
];

const INVESTOR_INSTITUTIONAL_FEATURES: PlanFeature[] = [
  { label: "Everything in Private Investor",   icon: Check },
  { label: "Priority queue position (auto-elevated)", icon: Crown },
  { label: "Bulk deal pipeline view",          icon: Layers },
  { label: "OS market intelligence reports",   icon: Database },
  { label: "Dedicated account manager",        icon: Users },
  { label: "Custom alert rules & deal matching", icon: Filter },
  { label: "API access for portfolio tools",   icon: Globe },
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
    accent: "text-orange-400", accentBg: "bg-orange-500/10", accentBorder: "border-orange-500/40",
    proOnly: true,
  },
  professional: {
    freeLabel: "Free", freePrice: "€0", freeDesc: "Join the directory & receive basic enquiries", freeCTA: "Register Free", freeHref: "/signup",
    paidLabel: "Professional Pro", monthlyPrice: 69, annualPrice: 690,
    paidDesc: "Priority leads, booking calendar, verified badge & AI tools", paidCTA: "Get Pro Plan", paidHref: "/pricing",
    freeList: PROFESSIONAL_FREE_LIST, features: PROFESSIONAL_PRO,
    accent: "text-rose-400", accentBg: "bg-rose-500/10", accentBorder: "border-rose-500/40",
  },
};

// ── Per-listing add-ons ────────────────────────────────────────────────────────

const ADDONS = [
  {
    category: "Listing Boosts",
    accent: "bg-amber-500/10 border-amber-500/30 text-amber-500",
    items: [
      { name: "Featured Listing",        price: "€39", unit: "/ 30 days", desc: "Homepage carousel + search top placement. Avg. 3× more views.", icon: Crown },
      { name: "Priority Placement",      price: "€59", unit: "/ 30 days", desc: "Pinned above all non-priority results for your area and type.", icon: Star },
      { name: "Featured + Priority",     price: "€79", unit: "/ 30 days", desc: "Both boosts together — maximum exposure at a bundled rate.", icon: Sparkles, badge: "Best value" },
      { name: "Extra Listing Slot",      price: "€12", unit: "/ listing", desc: "Add one listing beyond your plan quota.", icon: Layers },
    ],
  },
  {
    category: "AI Reports (pay-as-you-go)",
    accent: "bg-primary/10 border-primary/30 text-primary",
    items: [
      { name: "Single AI Valuation",     price: "€39", unit: "/ report", desc: "Full AI valuation with market comparison, yield estimate & confidence score.", icon: BarChart2 },
      { name: "Valuation Bundle × 5",    price: "€149", unit: "bundle",  desc: "Save 24% vs. single. Ideal for buyers comparing multiple properties.", icon: TrendingUp, badge: "Save 24%" },
      { name: "Property Report",         price: "€49", unit: "/ report", desc: "Ownership history, registered liens, legal encumbrances & cadastral data for a specific property.", icon: FileText },
      { name: "Neighbourhood Report",    price: "€19", unit: "/ report", desc: "Price trends, safety index, POIs, development projects & investment outlook.", icon: Globe },
      { name: "Neighbourhood Bundle × 3",price: "€39", unit: "bundle",  desc: "Save 31% vs. single. Insights on three areas or properties.", icon: Users, badge: "Save 31%" },
    ],
  },
  {
    category: "Professional Upgrades",
    accent: "bg-rose-500/10 border-rose-500/30 text-rose-400",
    items: [
      { name: "Featured Professional",   price: "€59", unit: "/ month", desc: "Top-of-category placement in the Professionals directory.", icon: Shield },
      { name: "Extra Priority Ad",       price: "€8",  unit: "/ ad",    desc: "Push any listing to the top of search results for its area.", icon: Bell },
    ],
  },
];

// ── Main component ─────────────────────────────────────────────────────────────
export default function Pricing() {
  const { user, profile } = useAuth();
  const { isPro } = useSubscription();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [activeTab, setActiveTab] = useState<AudienceId>("participant");
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("monthly");
  const [hasAutoSelected, setHasAutoSelected] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  const PLAN_KEYS: Record<AudienceId, string> = {
    participant: "pro",
    agent: "agent_basic",
    developer: "developer_pro",
    professional: "professional_basic",
  };

  const handleCheckout = async () => {
    if (!user) { navigate("/signup"); return; }
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
    }
    setHasAutoSelected(true);
  }, [profile, hasAutoSelected, searchParams]);

  const { data: pricingConfigs = {} } = usePricingConfigs();
  const planKey = PLAN_KEYS[activeTab];
  const config = pricingConfigs[planKey];
  const basePlan = PLANS[activeTab];

  // Resolve displayed price from billing cycle
  const displayMonthly = billingCycle === "monthly" ? basePlan.monthlyPrice : Math.round(basePlan.annualPrice / 12);
  const displayTotal   = billingCycle === "annual"  ? basePlan.annualPrice : basePlan.monthlyPrice;
  const annualSaving   = basePlan.monthlyPrice * 12 - basePlan.annualPrice;

  const plan = config
    ? {
        ...basePlan,
        paidLabel: config.label,
        paidDesc: config.description || basePlan.paidDesc,
      }
    : basePlan;

  const participant = getPricingAudienceFromProfile(profile);
  const hasAudiencePro = isPro && activeTab === participant;

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
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 border border-emerald-500/30">2 months FREE</span>
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
            {!plan.proOnly && (
              <div className="glass-card rounded-2xl border border-border overflow-hidden flex flex-col">
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
                  <Button variant="outline" className="w-full h-11 border-border" asChild>
                    <Link to={plan.freeHref}>Get Started Free</Link>
                  </Button>
                </div>
              </div>
            )}

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
                  <span className="font-display text-4xl font-black text-foreground">€{displayMonthly}</span>
                  <span className="text-muted-foreground text-sm">/ month</span>
                </div>
                {billingCycle === "annual" ? (
                  <p className="text-xs text-emerald-600 font-semibold">€{displayTotal}/year · saves €{annualSaving} vs monthly</p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    or <button onClick={() => setBillingCycle("annual")} className="underline hover:text-foreground">€{Math.round(basePlan.annualPrice / 12)}/mo billed annually</button>
                    {" "}(save €{annualSaving}/yr)
                  </p>
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
                {hasAudiencePro ? (
                  <Button
                    variant="outline"
                    className="w-full h-11 border-emerald-500/40 text-emerald-400"
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
                <p className="text-[11px] text-muted-foreground text-center">
                  Cancel anytime · No setup fees
                </p>
              </div>
            </div>
          </div>

          {/* Agency upsell callout — shown only on agent tab */}
          {activeTab === "agent" && (
            <div className="mt-4 rounded-2xl border border-brand-purple/30 bg-brand-purple/5 p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="flex-1">
                <p className="text-sm font-bold text-brand-purple mb-0.5">Running a team or agency?</p>
                <p className="text-xs text-muted-foreground">Agency plans from <strong className="text-foreground">€249/month</strong> include multiple agent seats, a shared listing pool, agency-branded profile, and a dedicated account manager.</p>
              </div>
              <Link to="/contact" className="shrink-0">
                <Button variant="outline" size="sm" className="border-brand-purple/40 text-brand-purple hover:bg-brand-purple/10 gap-1.5">
                  Talk to sales <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              </Link>
            </div>
          )}

          <p className="text-center text-xs text-muted-foreground mt-10 max-w-xl mx-auto">
            All prices are in EUR and exclude VAT where applicable.
          </p>
        </div>

        {/* ── Investor Access — two tiers ───────────────────────────────────── */}
        <div className="border-t border-border bg-gradient-to-br from-orange-950/30 to-background py-16">
          <div className="container max-w-5xl px-4">
            <div className="text-center mb-10">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-orange-500/15 border border-orange-500/30 text-orange-400 text-xs font-bold uppercase tracking-widest mb-4">
                <Flame className="w-3.5 h-3.5" /> Investor Access
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold mb-3">Deal flow before the open market</h2>
              <p className="text-muted-foreground max-w-2xl mx-auto text-sm">
                Quick Sale deals, court auction flow, and distressed properties routed directly from <strong>maiProp OS</strong> — verified, structured, and delivered in real time. Pick the tier that matches your deal volume.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 gap-6 items-start max-w-3xl mx-auto">

              {/* Private Investor */}
              <div className="rounded-2xl border border-orange-500/30 bg-card p-6 shadow-sm flex flex-col">
                <p className="text-xs font-bold uppercase tracking-widest text-orange-400 mb-3">Private Investor</p>
                <div className="flex items-end gap-1 mb-0.5">
                  <span className="text-4xl font-bold">
                    {billingCycle === "annual" ? "€41" : "€49"}
                  </span>
                  <span className="text-muted-foreground text-sm mb-1.5">/ month</span>
                </div>
                {billingCycle === "annual"
                  ? <p className="text-xs text-emerald-600 font-semibold mb-4">€490/year · 2 months free</p>
                  : <p className="text-xs text-muted-foreground mb-4">or €490/year (save €98)</p>
                }
                <ul className="space-y-2.5 mb-6 flex-1">
                  {INVESTOR_PRIVATE_FEATURES.map((f) => (
                    <li key={f.label} className="flex items-start gap-2.5 text-sm">
                      <Check className="w-4 h-4 text-orange-400 mt-0.5 shrink-0" />
                      <span>{f.label}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  className="w-full bg-orange-500 hover:bg-orange-600 text-white gap-2"
                  onClick={() => navigate(user ? "/investor-dashboard" : "/signup?intent=investor")}
                >
                  <Flame className="w-4 h-4" /> Start Investor Access
                </Button>
              </div>

              {/* Institutional */}
              <div className="rounded-2xl border-2 border-orange-400 bg-card p-6 shadow-lg flex flex-col relative">
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="text-[10px] font-bold px-3 py-1 rounded-full bg-orange-500 text-white uppercase tracking-wide">
                    Most Powerful
                  </span>
                </div>
                <p className="text-xs font-bold uppercase tracking-widest text-orange-400 mb-3 mt-2">Institutional</p>
                <div className="flex items-end gap-1 mb-0.5">
                  <span className="text-4xl font-bold">
                    {billingCycle === "annual" ? "€166" : "€199"}
                  </span>
                  <span className="text-muted-foreground text-sm mb-1.5">/ month</span>
                </div>
                {billingCycle === "annual"
                  ? <p className="text-xs text-emerald-600 font-semibold mb-4">€1,990/year · 2 months free</p>
                  : <p className="text-xs text-muted-foreground mb-4">or €1,990/year (save €398)</p>
                }
                <ul className="space-y-2.5 mb-6 flex-1">
                  {INVESTOR_INSTITUTIONAL_FEATURES.map((f) => (
                    <li key={f.label} className="flex items-start gap-2.5 text-sm">
                      <Check className="w-4 h-4 text-orange-400 mt-0.5 shrink-0" />
                      <span>{f.label}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  className="w-full bg-gradient-to-r from-orange-500 to-orange-600 text-white gap-2 font-bold"
                  onClick={() => navigate(user ? "/investor-dashboard" : "/signup?intent=investor_institutional")}
                >
                  <Crown className="w-4 h-4" /> Get Institutional Access
                </Button>
              </div>
            </div>

            <div className="mt-6 text-center">
              <p className="text-xs text-muted-foreground">
                <strong className="text-foreground">Seller?</strong> Submitting a Quick Sale application is always free.
                The investor tiers are for buyers seeking exclusive deal flow access.
              </p>
            </div>
          </div>
        </div>

        {/* ── Per-listing add-ons & pay-as-you-go ──────────────────────────── */}
        <div className="border-t border-border py-16">
          <div className="container max-w-5xl px-4">
            <div className="text-center mb-10">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-secondary border border-border text-xs font-bold uppercase tracking-widest mb-4 text-muted-foreground">
                <Tag className="w-3.5 h-3.5" /> Add-ons & Pay-as-you-go
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold mb-3">Only pay for what you use</h2>
              <p className="text-muted-foreground text-sm max-w-xl mx-auto">
                Every plan includes a generous baseline. When you need more, add exactly what you need — no plan upgrade required.
              </p>
            </div>

            <div className="space-y-8">
              {ADDONS.map((section) => (
                <div key={section.category}>
                  <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-4">{section.category}</h3>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {section.items.map((item) => (
                      <div key={item.name} className={cn("relative rounded-xl border bg-card p-4 flex flex-col gap-2", section.accent.includes("amber") ? "border-amber-500/20" : section.accent.includes("primary") ? "border-primary/20" : "border-rose-500/20")}>
                        {item.badge && (
                          <div className="absolute -top-2.5 right-3">
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 border border-emerald-500/30">{item.badge}</span>
                          </div>
                        )}
                        <div className="flex items-start justify-between gap-2">
                          <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", section.accent.includes("amber") ? "bg-amber-500/10" : section.accent.includes("primary") ? "bg-primary/10" : "bg-rose-500/10")}>
                            <item.icon className={cn("w-4 h-4", section.accent.includes("amber") ? "text-amber-500" : section.accent.includes("primary") ? "text-primary" : "text-rose-400")} />
                          </div>
                          <div className="text-right">
                            <p className="font-display font-black text-lg leading-none">{item.price}</p>
                            <p className="text-[10px] text-muted-foreground">{item.unit}</p>
                          </div>
                        </div>
                        <p className="font-semibold text-sm">{item.name}</p>
                        <p className="text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── OS Data Products — B2B ────────────────────────────────────────── */}
        <div className="border-t border-border bg-card/40 py-16">
          <div className="container max-w-5xl px-4">
            <div className="flex flex-col lg:flex-row gap-8 items-center">
              <div className="flex-1">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold uppercase tracking-widest mb-4">
                  <Database className="w-3.5 h-3.5" /> maiProp OS Data Platform
                </div>
                <h2 className="text-2xl sm:text-3xl font-bold mb-3">Institutional & B2B data products</h2>
                <p className="text-muted-foreground text-sm mb-6 max-w-lg">
                  maiProp OS aggregates Greek property transaction data, court auction outcomes, and market trends at scale. Access it as an API or managed data feed for your organisation.
                </p>
                <div className="space-y-3">
                  {[
                    { icon: TrendingUp, title: "Market Intelligence", price: "€199/month", desc: "Greek property price index, transaction comps, trend reports by region & type." },
                    { icon: BarChart2,  title: "AVM API",             price: "€299/month", desc: "Automated valuation endpoint for mortgage lenders, advisors & RICS valuers." },
                    { icon: Gavel,      title: "Auction Intelligence", price: "€149/month", desc: "Full court auction schedule, minimum bids, and outcome database for legal professionals." },
                  ].map((p) => (
                    <div key={p.title} className="flex items-start gap-3 rounded-xl border border-border bg-card p-3.5">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                        <p.icon className="w-4 h-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-0.5">
                          <p className="font-semibold text-sm">{p.title}</p>
                          <span className="text-xs font-bold text-primary whitespace-nowrap">{p.price}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">{p.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="lg:w-64 shrink-0 text-center lg:text-left">
                <div className="rounded-2xl border border-primary/30 bg-primary/5 p-6">
                  <Lock className="w-8 h-8 text-primary mb-3 mx-auto lg:mx-0" />
                  <p className="font-bold text-sm mb-2">Enterprise &amp; custom data agreements</p>
                  <p className="text-xs text-muted-foreground mb-5">For banks, REITs, law firms, and government agencies requiring custom data schemas, SLAs, or white-label integration.</p>
                  <Link to="/contact">
                    <Button className="w-full gap-2 bg-gradient-primary border-0 text-primary-foreground">
                      <Wallet className="w-4 h-4" /> Talk to us
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Quick Sale success fee ────────────────────────────────────────── */}
        <div className="border-t border-border py-12 bg-card/20">
          <div className="container max-w-3xl px-4">
            <div className="text-center mb-6">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-secondary border border-border text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">
                <Flame className="w-3.5 h-3.5" /> Quick Sale — Success Fee
              </div>
              <h2 className="text-xl font-bold mb-2">0.5% at completion · minimum €500</h2>
              <p className="text-sm text-muted-foreground max-w-xl mx-auto">
                Submitting a Quick Sale application is always free. Our fee is strictly success-based — you pay only when the deal closes.
              </p>
            </div>
            <div className="grid sm:grid-cols-2 gap-3 text-sm">
              {[
                {
                  title: "Who pays",
                  body: "The seller. Buyers on an Investor subscription pay nothing beyond their plan. The fee is 0.5% of the gross agreed sale price, minimum €500.",
                },
                {
                  title: "When it triggers",
                  body: "Only on legal completion — exchange of contracts or equivalent transfer. Offer acceptance alone does not trigger the fee. If a deal collapses before completion, no fee is owed.",
                },
                {
                  title: "How it's collected",
                  body: "Coordinated through the notary or legal representative handling the transfer, or invoiced directly by maiProp with a 14-day payment window post-completion. Never upfront.",
                },
                {
                  title: "VAT & exclusions",
                  body: "The fee is subject to Greek VAT (24%) where applicable and invoiced separately. Deals where a pre-existing buyer–seller relationship is documented before platform engagement are excluded.",
                },
              ].map((item) => (
                <div key={item.title} className="rounded-xl border border-border bg-card p-4">
                  <p className="font-semibold text-foreground mb-1">{item.title}</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">{item.body}</p>
                </div>
              ))}
            </div>
            <p className="text-center text-[11px] text-muted-foreground mt-5">
              Full terms available in the <Link to="/terms" className="underline hover:text-foreground">Platform Terms of Service</Link>. Quick Sale fees are separate from and in addition to any subscription plan.
            </p>
          </div>
        </div>

      </div>
      <Footer />
    </div>
  );
}
