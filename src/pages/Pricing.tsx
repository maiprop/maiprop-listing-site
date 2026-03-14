import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/hooks/useSubscription";
import {
  Check, X, Lock, Zap, Flame, Users, Briefcase, UserCheck,
  TrendingUp, BarChart2, Bell, Star, Shield, Filter, ArrowRight,
  Crown, Sparkles, Building2, Gavel, MessageSquare, Eye,
  FileText, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Audience config ────────────────────────────────────────────────────────────

type AudienceId = "buyer" | "professional" | "agent" | "investor";

const AUDIENCE_TABS: { id: AudienceId; label: string; icon: React.ElementType }[] = [
  { id: "buyer", label: "Buyers & Renters", icon: Users },
  { id: "agent", label: "Agents", icon: UserCheck },
  { id: "professional", label: "Professionals", icon: Briefcase },
  { id: "investor", label: "Investors", icon: Flame },
];

// ── Plan definitions ───────────────────────────────────────────────────────────

type PlanFeature = { label: string; free?: boolean | string; paid?: boolean | string; icon?: React.ElementType };

const BUYER_FREE = [
  "Browse all listings",
  "View auctions",
  "Save up to 3 searches",
  "Book viewings",
  "Send messages",
  "AI Market summary",
  "Neighbourhood Report",
  "Mortgage calculator",
  "Auction alerts",
];

const BUYER_PRO_FEATURES: PlanFeature[] = [
  { label: "Full AI Property Valuation", icon: BarChart2, free: false, paid: true },
  { label: "Capital Growth Forecasts", icon: TrendingUp, free: false, paid: "5-year" },
  { label: "Ownership Status Filters", icon: Filter, free: false, paid: true },
  { label: "Auction Round Filters", icon: Gavel, free: false, paid: true },
  { label: "Expected Yield Filters", icon: TrendingUp, free: false, paid: true },
  { label: "Priority Auction Alerts", icon: Bell, free: false, paid: "Real-time" },
  { label: "Unlimited Saved Searches", icon: Star, free: "3", paid: "Unlimited" },
  { label: "Legal Status Check", icon: Shield, free: false, paid: true },
  { label: "Comparable Sales Data", icon: BarChart2, free: false, paid: true },
];

const AGENT_FEATURES: PlanFeature[] = [
  { label: "Property listings", free: "Up to 5", paid: "Unlimited" },
  { label: "AI Listing Assistant", free: false, paid: true },
  { label: "OS Sync integration", free: false, paid: true },
  { label: "CRM & lead management", free: false, paid: true },
  { label: "Performance analytics", free: "Basic", paid: "Advanced" },
  { label: "Priority placement", free: false, paid: true },
  { label: "Bulk listing tools", free: false, paid: true },
];

const PROFESSIONAL_FEATURES: PlanFeature[] = [
  { label: "Professional directory listing", free: true, paid: true },
  { label: "Client lead access", free: "Basic", paid: "Priority" },
  { label: "AI service matching", free: false, paid: true },
  { label: "Verified badge", free: "Pending", paid: "Expedited" },
  { label: "Booking / calendar page", free: false, paid: true },
  { label: "Advanced analytics", free: false, paid: true },
  { label: "Branded video room", free: false, paid: true },
];

const INVESTOR_FEATURES: PlanFeature[] = [
  { label: "Quick Sale™ deal feed", free: true, paid: true },
  { label: "AI deal scoring", free: false, paid: true },
  { label: "Full pipeline analytics", free: false, paid: true },
  { label: "Priority deal allocations", free: false, paid: true },
  { label: "Export & API access", free: false, paid: true },
  { label: "NDA-based off-market flow", free: "Basic", paid: "Full" },
];

// ── Pricing data ───────────────────────────────────────────────────────────────

const PLANS: Record<AudienceId, {
  freeLabel: string; freePrice: string; freeDesc: string; freeCTA: string; freeHref: string;
  paidLabel: string; paidPrice: string; paidPriceUnit: string; paidDesc: string; paidCTA: string; paidHref: string;
  features: PlanFeature[];
  freeList?: string[];
  accent: string; accentBg: string; accentBorder: string;
}> = {
  buyer: {
    freeLabel: "Free", freePrice: "€0", freeDesc: "Everything to start your search", freeCTA: "Browse Free", freeHref: "/listings",
    paidLabel: "Pro", paidPrice: "€29", paidPriceUnit: "/ month", paidDesc: "AI-powered investor intelligence", paidCTA: "Get Pro", paidHref: "/pro",
    freeList: BUYER_FREE,
    features: BUYER_PRO_FEATURES,
    accent: "text-brand-gold", accentBg: "bg-brand-gold/10", accentBorder: "border-brand-gold/40",
  },
  agent: {
    freeLabel: "Starter", freePrice: "€0", freeDesc: "List a few properties & test the platform", freeCTA: "Start Free", freeHref: "/signup",
    paidLabel: "Agency Pro", paidPrice: "€89", paidPriceUnit: "/ month", paidDesc: "Unlimited listings, CRM & OS sync", paidCTA: "Get Agency Pro", paidHref: "/pro",
    features: AGENT_FEATURES,
    accent: "text-cyan-400", accentBg: "bg-cyan-500/10", accentBorder: "border-cyan-500/40",
  },
  professional: {
    freeLabel: "Free", freePrice: "€0", freeDesc: "Join the directory & receive basic leads", freeCTA: "Register", freeHref: "/signup",
    paidLabel: "Pro Plan", paidPrice: "€39", paidPriceUnit: "/ month", paidDesc: "Priority leads, booking page & AI tools", paidCTA: "Get Pro", paidHref: "/pro",
    features: PROFESSIONAL_FEATURES,
    accent: "text-rose-400", accentBg: "bg-rose-500/10", accentBorder: "border-rose-500/40",
  },
  investor: {
    freeLabel: "Basic Access", freePrice: "Free", freeDesc: "Quick Sale™ feed with basic filters", freeCTA: "Get Basic Access", freeHref: "/investor-dashboard",
    paidLabel: "Firesale Pro", paidPrice: "€79", paidPriceUnit: "/ month", paidDesc: "Full dashboard, AI scoring & pipeline", paidCTA: "Get Firesale Pro", paidHref: "/investor-dashboard",
    features: INVESTOR_FEATURES,
    accent: "text-destructive", accentBg: "bg-destructive/10", accentBorder: "border-destructive/30",
  },
};

// ── Comparison table row ───────────────────────────────────────────────────────

function FeatureRow({ feat, idx, accentText }: { feat: PlanFeature; idx: number; accentText: string }) {
  const Icon = feat.icon;
  return (
    <div className={cn("grid grid-cols-[1fr_80px_80px] gap-0 border-b border-border last:border-0", idx % 2 === 0 ? "" : "bg-muted/20")}>
      <div className="px-5 py-3.5 flex items-center gap-2.5 text-sm text-foreground">
        {Icon && <Icon className={cn("w-3.5 h-3.5 shrink-0", accentText)} />}
        {feat.label}
      </div>
      <div className="px-3 py-3.5 text-center border-l border-border flex items-center justify-center">
        {feat.free === true
          ? <Check className="w-4 h-4 text-primary mx-auto" />
          : feat.free === false
          ? <X className="w-4 h-4 text-muted-foreground/30 mx-auto" />
          : <span className="text-xs text-muted-foreground">{feat.free}</span>}
      </div>
      <div className="px-3 py-3.5 text-center border-l border-border flex items-center justify-center">
        {feat.paid === true
          ? <Check className={cn("w-4 h-4 mx-auto", accentText)} />
          : <span className={cn("text-xs font-semibold", accentText)}>{feat.paid}</span>}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function Pricing() {
  const { user, profile } = useAuth();
  const { isPro } = useSubscription();
  const navigate = useNavigate();

  // Derive tab from profile role
  const roleTab: AudienceId = (() => {
    if (!profile) return "buyer";
    if (profile.role === "agent") return "agent";
    if (profile.role === "professional") return "professional";
    return "buyer";
  })();

  // Start with "buyer" so we never block on profile load; sync once profile arrives
  const [activeTab, setActiveTab] = useState<AudienceId>("buyer");
  const [hasAutoSelected, setHasAutoSelected] = useState(false);

  // Sync to profile role once profile is available (async auth)
  useEffect(() => {
    if (!hasAutoSelected && profile) {
      setActiveTab(roleTab);
      setHasAutoSelected(true);
    }
  }, [profile, roleTab, hasAutoSelected]);

  const plan = PLANS[activeTab];

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-16">

        {/* Hero */}
        <div className="border-b border-border bg-card/60 py-12 sm:py-16">
          <div className="container max-w-4xl text-center px-4">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold uppercase tracking-widest mb-5">
              <Zap className="w-3.5 h-3.5" /> Pricing
            </div>
            <h1 className="font-display text-3xl sm:text-5xl font-black mb-3 leading-tight">
              Plans built for <br className="hidden sm:block" />
              <span className="gradient-text-primary">every role in the market</span>
            </h1>
            <p className="text-muted-foreground text-base max-w-xl mx-auto">
              Choose your role below to see the plans that match how you use the platform.
            </p>

            {/* Audience tabs */}
            <div className="flex justify-center mt-8">
              <div className="inline-flex gap-1 bg-secondary/80 border border-border rounded-2xl p-1">
                {AUDIENCE_TABS.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => setActiveTab(id)}
                    className={cn(
                      "flex items-center gap-2 px-3 sm:px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all duration-200",
                      activeTab === id
                        ? "bg-background border border-border shadow-card text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span className="hidden sm:inline">{label}</span>
                    <span className="sm:hidden">{label.split(" ")[0]}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Pricing cards */}
        <div className="container max-w-5xl py-10 sm:py-16 px-4 pb-28 lg:pb-16">
          <div className="grid md:grid-cols-2 gap-5 items-stretch mb-14">

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
                {plan.freeList ? (
                  <ul className="space-y-3">
                    {plan.freeList.map(f => (
                      <li key={f} className="flex items-center gap-2.5 text-sm">
                        <Check className="w-4 h-4 text-primary shrink-0" />
                        <span className="text-muted-foreground">{f}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <ul className="space-y-3">
                    {plan.features.map(f => (
                      <li key={f.label} className="flex items-center gap-2.5 text-sm">
                        {f.free === false
                          ? <X className="w-4 h-4 text-muted-foreground/30 shrink-0" />
                          : <Check className="w-4 h-4 text-primary shrink-0" />}
                        <span className={f.free === false ? "text-muted-foreground/50 line-through" : "text-muted-foreground"}>{f.label}</span>
                        {typeof f.free === "string" && f.free !== "false" && (
                          <span className="text-xs text-muted-foreground ml-auto">({f.free})</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="px-6 sm:px-8 pb-6 sm:pb-8">
                <Button variant="outline" className="w-full h-11 border-border" asChild>
                  <Link to={plan.freeHref}>{plan.freeCTA}</Link>
                </Button>
              </div>
            </div>

            {/* Paid card */}
            <div className={cn("relative glass-card rounded-2xl border-2 overflow-hidden flex flex-col shadow-elevated", plan.accentBorder)}>
              {/* Popular badge */}
              <div className="absolute top-4 right-4">
                {activeTab === "buyer" && isPro ? (
                  <span className={cn("flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider bg-emerald-500 text-white")}>
                    <Crown className="w-2.5 h-2.5" /> Your Plan
                  </span>
                ) : (
                  <span className={cn("flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider", plan.accentBg, "border", plan.accentBorder, plan.accent)}>
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
                  {plan.features.map(f => {
                    const Icon = f.icon;
                    return (
                      <li key={f.label} className="flex items-start gap-3">
                        <div className={cn("w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5", plan.accentBg)}>
                          {Icon
                            ? <Icon className={cn("w-3 h-3", plan.accent)} />
                            : <Check className={cn("w-3 h-3", plan.accent)} />}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-foreground">{f.label}</p>
                          {typeof f.paid === "string" && f.paid !== "true" && (
                            <p className={cn("text-[11px] mt-0.5", plan.accent)}>{f.paid}</p>
                          )}
                        </div>
                      </li>
                    );
                  })}
                  {/* Show everything from free too */}
                  {plan.freeList && (
                    <li className="flex items-center gap-2.5 text-sm text-muted-foreground border-t border-border pt-3 mt-1">
                      <Check className="w-4 h-4 text-primary shrink-0" />
                      Everything in Free, plus all Pro features
                    </li>
                  )}
                </ul>
              </div>

              <div className="px-6 sm:px-8 pb-6 sm:pb-8 space-y-2">
                {activeTab === "buyer" && isPro ? (
                  <Button variant="outline" className="w-full h-11 border-emerald-500/40 text-emerald-400" asChild>
                    <Link to="/pro">Manage Subscription</Link>
                  </Button>
                ) : (
                  <Button
                    className={cn("w-full h-11 font-bold gap-2", "bg-gradient-primary border-0 text-primary-foreground")}
                    onClick={() => navigate(plan.paidHref)}
                  >
                    <Zap className="w-4 h-4" />
                    {user ? plan.paidCTA : "Get Started"}
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                )}
                <p className="text-[11px] text-muted-foreground text-center">
                  No commitment · Cancel anytime
                </p>
              </div>
            </div>
          </div>

          {/* Comparison table */}
          <div>
            <h2 className="font-display text-xl sm:text-2xl font-bold text-center mb-6">Compare plans</h2>
            <div className="glass-card rounded-2xl border border-border overflow-hidden">
              {/* Header */}
              <div className="grid grid-cols-[1fr_80px_80px] bg-muted/40 border-b border-border">
                <div className="px-5 py-3.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">Feature</div>
                <div className="px-3 py-3.5 text-xs font-bold uppercase tracking-wider text-muted-foreground text-center border-l border-border">{plan.freeLabel}</div>
                <div className={cn("px-3 py-3.5 text-xs font-bold uppercase tracking-wider text-center border-l border-border", plan.accent)}>{plan.paidLabel}</div>
              </div>
              {plan.features.map((feat, idx) => (
                <FeatureRow key={feat.label} feat={feat} idx={idx} accentText={plan.accent} />
              ))}
            </div>
          </div>

          {/* Cross-links */}
          <div className="mt-12 grid sm:grid-cols-3 gap-4">
            {[
              { icon: Crown, label: "mAI Prop Pro", desc: "Full AI valuation & investor tools", href: "/pro", accent: "text-brand-gold" },
              { icon: Gavel, label: "Auction Hub", desc: "Live court auctions & foreclosures", href: "/auctions", accent: "text-primary" },
              { icon: Flame, label: "Firesale Investor", desc: "Off-market Quick Sale™ deal flow", href: "/investor-dashboard", accent: "text-destructive" },
            ].map(item => (
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
            Changes to pricing are managed by the admin console and take effect immediately.
          </p>
        </div>
      </div>
      <Footer />
    </div>
  );
}
