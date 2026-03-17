import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/hooks/useSubscription";
import {
  Check, X, Zap, Flame, Users, Briefcase, UserCheck,
  TrendingUp, BarChart2, Bell, Star, Shield, Filter, ArrowRight,
  Crown, Sparkles, Building2, Gavel, Globe2, Home, Wrench,
  ChevronRight, MessageSquare, Eye, FileText, Layers, FolderKanban,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getParticipantTypeFromProfile } from "@/lib/participantConfig";
import { usePricingConfigs } from "@/hooks/usePricingConfigs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ── Audience config ────────────────────────────────────────────────────────────

type AudienceId = "buyer" | "seller" | "investor" | "agent" | "institutional" | "developer" | "professional";

// Investor & institutional removed from Pricing — Quick Sale is invitation-only
const AUDIENCE_TABS: { id: AudienceId; label: string; mobileLabel: string; icon: React.ElementType }[] = [
  { id: "buyer",         label: "Buyer / Renter",      mobileLabel: "Buyer",       icon: Home },
  { id: "seller",        label: "Seller / Landlord",   mobileLabel: "Seller",      icon: Users },
  { id: "agent",         label: "Agent",                mobileLabel: "Agent",       icon: UserCheck },
  { id: "developer",     label: "Developer",            mobileLabel: "Dev",         icon: Building2 },
  { id: "professional",  label: "Professional",         mobileLabel: "Pro",         icon: Briefcase },
];

// ── Plan feature type ──────────────────────────────────────────────────────────
type PlanFeature = { label: string; free?: boolean | string; paid?: boolean | string; icon?: React.ElementType };

// ── Per-audience plan data ─────────────────────────────────────────────────────

// BUYER
const BUYER_FREE_LIST = [
  "Browse all listings",
  "View auction listings",
  "Save up to 3 searches",
  "Set search alerts",
  "Book viewings",
  "Send messages",
  "AI property match",
  "Neighbourhood report",
  "Mortgage calculator",
  "Auction alerts",
  "Professional directory access",
];
const BUYER_PRO: PlanFeature[] = [
  { label: "Full AI Property Valuation", icon: BarChart2, free: false, paid: true },
  { label: "Ownership Status Filters", icon: Filter, free: false, paid: true },
  { label: "Auction Round Filters", icon: Gavel, free: false, paid: true },
  { label: "Expected Yield Filters", icon: TrendingUp, free: false, paid: true },
  { label: "Priority Auction Alerts", icon: Bell, free: false, paid: "Real-time" },
  { label: "Unlimited Saved Searches", icon: Star, free: "3 max", paid: "Unlimited" },
  { label: "Comparable Sales Data", icon: BarChart2, free: false, paid: true },
];

// SELLER
const SELLER_FREE_LIST = [
  "List up to 2 properties",
  "Manage viewings",
  "Send & receive messages",
  "Basic listing dashboard",
  "Contact buyers directly",
];
const SELLER_PRO: PlanFeature[] = [
  { label: "Unlimited property listings", icon: Layers, free: "2 max", paid: "Unlimited" },
  { label: "AI listing description assist", icon: Sparkles, free: false, paid: true },
  { label: "Priority placement in search", icon: Star, free: false, paid: true },
  { label: "Listing performance analytics", icon: BarChart2, free: false, paid: true },
  { label: "Professional add-ons (valuation, legal)", icon: Briefcase, free: false, paid: true },
  { label: "Featured badge", icon: Crown, free: false, paid: true },
];

// INVESTOR
const INVESTOR_FREE_LIST = [
  "Quick Sale™ deal feed",
  "Browse auctions",
  "Save listings & price alerts",
  "Saved searches",
  "Auction alerts",
  "ROI calculator (basic)",
  "AI market summary",
];
const INVESTOR_PRO: PlanFeature[] = [
  { label: "Full AI Deal Scoring", icon: BarChart2, free: false, paid: true },
  { label: "Investor Dashboard (deal pipeline)", icon: FolderKanban, free: false, paid: true },
  { label: "Full AI Property Valuation", icon: BarChart2, free: false, paid: true },
  { label: "Due Diligence Checklist", icon: Shield, free: false, paid: true },
  { label: "Comparable Sales Data", icon: BarChart2, free: false, paid: true },
];

// AGENT
const AGENT_FREE_LIST = [
  "Up to 5 listings",
  "Send & receive messages",
  "View auction listings",
  "Basic dashboard",
];
const AGENT_PRO: PlanFeature[] = [
  { label: "Unlimited property listings", icon: Layers, free: "5 max", paid: "Unlimited" },
  { label: "AI Listing Assistant", icon: Sparkles, free: false, paid: true },
  { label: "CRM & contacts management", icon: Users, free: false, paid: true },
  { label: "Performance analytics", icon: BarChart2, free: "Basic", paid: "Advanced" },
  { label: "Auction alerts (create & manage)", icon: Gavel, free: false, paid: true },
  { label: "Projects & portfolios", icon: FolderKanban, free: false, paid: true },
  { label: "Priority listing placement", icon: Star, free: false, paid: true },
  { label: "Bulk listing tools", icon: Layers, free: false, paid: true },
];

// INSTITUTIONAL
const INSTITUTIONAL_FREE_LIST = [
  "Browse listings & auctions",
  "Quick Sale™ deal feed (basic)",
  "Send messages",
  "Saved searches",
];
const INSTITUTIONAL_PRO: PlanFeature[] = [
  { label: "Investor Dashboard & deal flow", icon: FolderKanban, free: false, paid: true },
  { label: "Unlimited listings", icon: Layers, free: false, paid: true },
  { label: "AI deal scoring & valuation", icon: BarChart2, free: false, paid: true },
  { label: "Advanced portfolio analytics", icon: TrendingUp, free: false, paid: true },
  { label: "CRM & contacts (full)", icon: Users, free: false, paid: true },
  { label: "Projects & portfolios", icon: FolderKanban, free: false, paid: true },
  { label: "Priority support & onboarding", icon: Crown, free: false, paid: true },
  { label: "Due diligence hub", icon: FileText, free: false, paid: true },
];

// DEVELOPER
const DEVELOPER_FREE_LIST = [
  "Up to 5 listings",
  "Send & receive messages",
  "Basic dashboard",
];
const DEVELOPER_PRO: PlanFeature[] = [
  { label: "Unlimited listings", icon: Layers, free: "5 max", paid: "Unlimited" },
  { label: "Project showcase pages", icon: Building2, free: false, paid: true },
  { label: "Pre-sale listing management", icon: Eye, free: false, paid: true },
  { label: "AI Listing Assistant", icon: Sparkles, free: false, paid: true },
  { label: "Bulk inquiry management", icon: MessageSquare, free: false, paid: true },
  { label: "Performance analytics", icon: BarChart2, free: "Basic", paid: "Advanced" },
  { label: "Priority listing placement", icon: Star, free: false, paid: true },
];

// PROFESSIONAL
const PROFESSIONAL_FREE_LIST = [
  "Professional directory listing",
  "Basic client lead access",
  "Consultation requests (pending)",
  "Booking via profile page",
];
const PROFESSIONAL_PRO: PlanFeature[] = [
  { label: "Priority leads (top placement)", icon: Star, free: "Basic", paid: "Priority" },
  { label: "AI service & client matching", icon: Sparkles, free: false, paid: true },
  { label: "Verified badge (expedited)", icon: Shield, free: "Pending", paid: "Expedited" },
  { label: "Booking / calendar page", icon: FolderKanban, free: false, paid: true },
  { label: "Advanced lead analytics", icon: BarChart2, free: false, paid: true },
  { label: "Branded video room", icon: Eye, free: false, paid: true },
  { label: "AI property tools (valuation, neighbourhood)", icon: BarChart2, free: false, paid: true },
  { label: "Consultation messaging suite", icon: MessageSquare, free: false, paid: true },
];

// ── Dashboard modules per role ─────────────────────────────────────────────────
type ModuleRow = { module: string; desc: string };
const MODULES: Record<AudienceId, ModuleRow[]> = {
  buyer: [
    { module: "Overview", desc: "Dashboard home" },
    { module: "Saved Listings", desc: "Favourited properties" },
    { module: "Saved Searches", desc: "Search filters + alerts" },
    { module: "Messages", desc: "Conversations" },
    { module: "Viewings", desc: "Viewing requests" },
    { module: "Auction Alerts", desc: "Court auction notifications" },
    { module: "Profile", desc: "Your public profile" },
    { module: "Settings", desc: "Account settings" },
  ],
  seller: [
    { module: "Overview", desc: "Dashboard home" },
    { module: "Listings", desc: "Create, edit & manage listings" },
    { module: "Saved Listings", desc: "Favourited properties" },
    { module: "Messages", desc: "Buyer conversations" },
    { module: "Viewings", desc: "Viewing requests" },
    { module: "Profile", desc: "Your public profile" },
    { module: "Settings", desc: "Account settings" },
  ],
  investor: [
    { module: "Overview", desc: "Dashboard home" },
    { module: "Deal Flow", desc: "Link to Investor Dashboard" },
    { module: "Saved Listings", desc: "Saved properties + price alerts" },
    { module: "Saved Searches", desc: "Saved search filters" },
    { module: "Messages", desc: "Conversations" },
    { module: "Viewings", desc: "Viewing requests" },
    { module: "Auction Alerts", desc: "Court auction notifications" },
    { module: "Profile", desc: "Your public profile" },
    { module: "Settings", desc: "Account settings" },
  ],
  agent: [
    { module: "Overview", desc: "Dashboard home" },
    { module: "Listings", desc: "All managed listings" },
    { module: "Analytics", desc: "Listing & lead analytics" },
    { module: "Saved Listings", desc: "Favourited properties" },
    { module: "Saved Searches", desc: "Search filters" },
    { module: "Messages", desc: "Conversations" },
    { module: "Viewings", desc: "Viewing requests" },
    { module: "Auction Alerts", desc: "Court auction notifications" },
    { module: "Contacts CRM", desc: "Lead & client management" },
    { module: "Profile", desc: "Your public profile" },
    { module: "Settings", desc: "Account settings" },
  ],
  institutional: [
    { module: "Overview", desc: "Dashboard home" },
    { module: "Deal Flow", desc: "Link to Investor Dashboard" },
    { module: "Listings", desc: "All managed listings" },
    { module: "Analytics", desc: "Portfolio analytics" },
    { module: "Saved Listings", desc: "Favourited properties" },
    { module: "Saved Searches", desc: "Search filters" },
    { module: "Messages", desc: "Conversations" },
    { module: "Viewings", desc: "Viewing requests" },
    { module: "Auction Alerts", desc: "Court auction notifications" },
    { module: "Contacts CRM", desc: "Lead & client management" },
    { module: "Profile", desc: "Your public profile" },
    { module: "Settings", desc: "Account settings" },
  ],
  developer: [
    { module: "Overview", desc: "Dashboard home" },
    { module: "Listings", desc: "All managed listings" },
    { module: "Analytics", desc: "Listing & lead analytics" },
    { module: "Saved Listings", desc: "Favourited properties" },
    { module: "Saved Searches", desc: "Search filters" },
    { module: "Messages", desc: "Conversations" },
    { module: "Viewings", desc: "Viewing requests" },
    { module: "Contacts CRM", desc: "Inquiry management" },
    { module: "Projects", desc: "Project showcase pages" },
    { module: "Portfolios", desc: "Portfolio management" },
    { module: "Profile", desc: "Your public profile" },
    { module: "Settings", desc: "Account settings" },
  ],
  professional: [
    { module: "Overview", desc: "Dashboard home" },
    { module: "Services", desc: "Service catalog, rates & availability" },
    { module: "Leads", desc: "Consultation requests & leads" },
    { module: "Messages", desc: "Client conversations" },
    { module: "Viewings", desc: "Viewing requests" },
    { module: "Profile", desc: "Your public professional profile" },
    { module: "Settings", desc: "Account settings" },
  ],
};

// ── Pricing plan definitions ───────────────────────────────────────────────────
const PLANS: Record<AudienceId, {
  freeLabel: string; freePrice: string; freeDesc: string; freeCTA: string; freeHref: string;
  paidLabel: string; paidPrice: string; paidPriceUnit: string; paidDesc: string; paidCTA: string; paidHref: string;
  features: PlanFeature[];
  freeList: string[];
  accent: string; accentBg: string; accentBorder: string;
}> = {
  buyer: {
    freeLabel: "Free", freePrice: "€0", freeDesc: "Everything to start your search", freeCTA: "Browse Free", freeHref: "/listings",
    paidLabel: "mAI Prop Pro", paidPrice: "€29", paidPriceUnit: "/ month", paidDesc: "AI-powered investor intelligence", paidCTA: "Get Pro", paidHref: "/pricing",
    freeList: BUYER_FREE_LIST, features: BUYER_PRO,
    accent: "text-brand-gold", accentBg: "bg-brand-gold/10", accentBorder: "border-brand-gold/40",
  },
  seller: {
    freeLabel: "Free", freePrice: "€0", freeDesc: "List your property and manage viewings", freeCTA: "List a Property", freeHref: "/listings/new",
    paidLabel: "Seller Pro", paidPrice: "€19", paidPriceUnit: "/ month", paidDesc: "Unlimited listings, AI assist & analytics", paidCTA: "Get Seller Pro", paidHref: "/pricing",
    freeList: SELLER_FREE_LIST, features: SELLER_PRO,
    accent: "text-violet-400", accentBg: "bg-violet-500/10", accentBorder: "border-violet-500/40",
  },
  investor: {
    freeLabel: "Basic Access", freePrice: "Free", freeDesc: "Quick Sale™ feed + basic auction access", freeCTA: "Get Basic Access", freeHref: "/investor-dashboard",
    paidLabel: "Investor Pro", paidPrice: "€79", paidPriceUnit: "/ month", paidDesc: "Full deal pipeline, AI scoring & intelligence", paidCTA: "Get Investor Pro", paidHref: "/investor-dashboard",
    freeList: INVESTOR_FREE_LIST, features: INVESTOR_PRO,
    accent: "text-destructive", accentBg: "bg-destructive/10", accentBorder: "border-destructive/30",
  },
  agent: {
    freeLabel: "Starter", freePrice: "€0", freeDesc: "List a few properties & test the platform", freeCTA: "Start Free", freeHref: "/signup",
    paidLabel: "Agency Pro", paidPrice: "€89", paidPriceUnit: "/ month", paidDesc: "Unlimited listings, CRM & analytics", paidCTA: "Get Agency Pro", paidHref: "/pricing",
    freeList: AGENT_FREE_LIST, features: AGENT_PRO,
    accent: "text-brand-purple", accentBg: "bg-brand-purple/10", accentBorder: "border-brand-purple/40",
  },
  institutional: {
    freeLabel: "Basic", freePrice: "Free", freeDesc: "Browse listings and explore the platform", freeCTA: "Register Free", freeHref: "/signup",
    paidLabel: "Institutional Pro", paidPrice: "€149", paidPriceUnit: "/ month", paidDesc: "Full deal flow, portfolio tools & priority support", paidCTA: "Get Institutional Pro", paidHref: "/pricing",
    freeList: INSTITUTIONAL_FREE_LIST, features: INSTITUTIONAL_PRO,
    accent: "text-amber-400", accentBg: "bg-amber-500/10", accentBorder: "border-amber-500/40",
  },
  developer: {
    freeLabel: "Starter", freePrice: "€0", freeDesc: "List projects and manage inquiries", freeCTA: "Start Free", freeHref: "/signup",
    paidLabel: "Developer Pro", paidPrice: "€89", paidPriceUnit: "/ month", paidDesc: "Unlimited listings, project showcases & analytics", paidCTA: "Get Developer Pro", paidHref: "/pricing",
    freeList: DEVELOPER_FREE_LIST, features: DEVELOPER_PRO,
    accent: "text-orange-400", accentBg: "bg-orange-500/10", accentBorder: "border-orange-500/40",
  },
  professional: {
    freeLabel: "Free", freePrice: "€0", freeDesc: "Join the directory & receive basic leads", freeCTA: "Register Free", freeHref: "/signup",
    paidLabel: "Pro Plan", paidPrice: "€49", paidPriceUnit: "/ month", paidDesc: "Priority leads, booking page & AI tools", paidCTA: "Get Pro Plan", paidHref: "/pricing",
    freeList: PROFESSIONAL_FREE_LIST, features: PROFESSIONAL_PRO,
    accent: "text-rose-400", accentBg: "bg-rose-500/10", accentBorder: "border-rose-500/40",
  },
};


// ── Module table ───────────────────────────────────────────────────────────────
function ModuleTable({ audience, accent }: { audience: AudienceId; accent: string }) {
  const rows = MODULES[audience];
  return (
    <div className="mt-10 glass-card rounded-2xl border border-border overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center gap-2">
        <Layers className={cn("w-4 h-4", accent)} />
        <h3 className="text-sm font-bold text-foreground">Dashboard Modules</h3>
        <span className="ml-auto text-xs text-muted-foreground">{rows.length} modules included</span>
      </div>
      <div className="divide-y divide-border">
        {rows.map((r, i) => (
          <div key={r.module} className={cn("grid grid-cols-[1fr_2fr] gap-0", i % 2 === 1 ? "bg-muted/20" : "")}>
            <div className="px-5 py-3 text-sm font-semibold text-foreground flex items-center gap-2">
              <Check className={cn("w-3.5 h-3.5 shrink-0", accent)} />
              {r.module}
            </div>
            <div className="px-5 py-3 text-xs text-muted-foreground border-l border-border flex items-center">{r.desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function Pricing() {
  const { user, profile } = useAuth();
  const { isPro } = useSubscription();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<AudienceId>("buyer");
  const [hasAutoSelected, setHasAutoSelected] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  const PLAN_KEYS: Record<AudienceId, string> = {
    buyer: "pro",
    seller: "seller_pro",
    investor: "investor_private",
    agent: "agent_basic",
    institutional: "investor_institutional",
    developer: "agent_basic",
    professional: "professional_basic",
  };

  const handleCheckout = async () => {
    if (!user) {
      navigate("/signup");
      return;
    }
    setCheckoutLoading(true);
    try {
      const planKey = PLAN_KEYS[activeTab];
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: { plan: planKey },
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
    if (!hasAutoSelected && profile) {
      const pt = getParticipantTypeFromProfile(profile);
      // Investor/institutional are invitation-only; no pricing tab — fall back to buyer
      const tab = pt === "investor" || pt === "institutional" ? "buyer" : pt;
      const validTab = AUDIENCE_TABS.some(t => t.id === tab) ? tab : "buyer";
      setActiveTab(validTab as AudienceId);
      setHasAutoSelected(true);
    }
  }, [profile, hasAutoSelected]);

  const { data: pricingConfigs = {} } = usePricingConfigs();
  const planKey = PLAN_KEYS[activeTab];
  const config = pricingConfigs[planKey];
  const basePlan = PLANS[activeTab];
  const plan = config
    ? {
        ...basePlan,
        paidLabel: config.label,
        paidPrice: config.amount === 0 ? "Free" : `€${config.amount}`,
        paidPriceUnit: config.unit === "monthly" ? "/ month" : config.unit === "yearly" ? "/ year" : "",
        paidDesc: config.description || basePlan.paidDesc,
      }
    : basePlan;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-16">

        {/* Hero */}
        <div className="border-b border-border bg-card/60 py-12 sm:py-16">
          <div className="container max-w-5xl text-center px-4">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold uppercase tracking-widest mb-5">
              <Zap className="w-3.5 h-3.5" /> Pricing
            </div>
            <h1 className="font-display text-3xl sm:text-5xl font-black mb-3 leading-tight">
              Plans built for <br className="hidden sm:block" />
              <span className="gradient-text-primary">every role in the market</span>
            </h1>
            <p className="text-muted-foreground text-base max-w-xl mx-auto">
              Choose your role to see the plan and modules that match how you use the platform.
            </p>

            {/* Audience tab strip — scrollable on mobile */}
            <div className="flex justify-center mt-8 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-hide">
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

        {/* Pricing cards */}
        <div className="container max-w-5xl py-10 sm:py-16 px-4 pb-28 lg:pb-16">
          <div className="grid md:grid-cols-2 gap-5 items-stretch mb-4">

            {/* Free card */}
            <div className="glass-card rounded-2xl border border-border overflow-hidden flex flex-col">
              <div className="px-6 sm:px-8 py-6 border-b border-border">
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">{plan.freeLabel}</p>
                <div className="flex items-baseline gap-1 mb-1">
                  <span className="font-display text-4xl font-black text-foreground">{plan.freePrice}</span>
                  {plan.freePrice !== "Free" && <span className="text-muted-foreground text-sm">/ month</span>}
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
                  <Link to={plan.freeHref}>{plan.freeCTA}</Link>
                </Button>
              </div>
            </div>

            {/* Paid card */}
            <div className={cn("relative glass-card rounded-2xl border-2 overflow-hidden flex flex-col shadow-elevated", plan.accentBorder)}>
              <div className="absolute top-4 right-4">
                {activeTab === "buyer" && isPro ? (
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
                  <span className="font-display text-4xl font-black text-foreground">{plan.paidPrice}</span>
                  <span className="text-muted-foreground text-sm">{plan.paidPriceUnit}</span>
                </div>
                <p className="text-xs text-muted-foreground">{plan.paidDesc}</p>
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
                  <li className="flex items-center gap-2.5 text-sm text-muted-foreground border-t border-border pt-3 mt-1">
                    <Check className="w-4 h-4 text-primary shrink-0" />
                    Everything in {plan.freeLabel}, plus all Pro features
                  </li>
                </ul>
              </div>

              <div className="px-6 sm:px-8 pb-6 sm:pb-8 space-y-2">
                {activeTab === "buyer" && isPro ? (
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
                  No commitment · Cancel anytime
                </p>
              </div>
            </div>
          </div>

          {/* Module table */}
          <ModuleTable audience={activeTab} accent={plan.accent} />

          {/* Cross-links */}
          <div className="mt-12 grid sm:grid-cols-3 gap-4">
            {[
              { icon: Crown, label: "mAI Prop Pro", desc: "Full AI valuation & investor tools", href: "/pricing", accent: "text-brand-gold" },
              { icon: Gavel, label: "Auction Hub", desc: "Live court auctions & foreclosures", href: "/auctions", accent: "text-primary" },
              { icon: Flame, label: "Quick Sale™ Deal Flow", desc: "By invitation only — request access", href: "/investor-dashboard", accent: "text-destructive" },
            ].map((item) => (
              <Link
                key={item.href}
                to={item.href}
                className="glass-card rounded-xl border border-border p-4 flex items-center gap-3 hover:border-primary/30 transition-colors group"
              >
                <div className={cn("w-9 h-9 rounded-xl bg-secondary flex items-center justify-center shrink-0", item.accent)}>
                  <item.icon className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{item.label}</p>
                  <p className="text-xs text-muted-foreground truncate">{item.desc}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-primary ml-auto shrink-0 transition-colors" />
              </Link>
            ))}
          </div>

          <p className="text-center text-xs text-muted-foreground mt-10 max-w-xl mx-auto">
            All prices are in EUR and exclude VAT where applicable. Final billing may vary by agreement.
          </p>
        </div>
      </div>
      <Footer />
    </div>
  );
}
