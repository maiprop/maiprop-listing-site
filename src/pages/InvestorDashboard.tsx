import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  Flame, Lock, BarChart2, TrendingUp, TrendingDown, MapPin,
  Building2, ChevronRight, Zap,
  SlidersHorizontal, Check, Clock,
  Users, DollarSign, Activity, ArrowUpRight, Phone, Mail,
  Crown, Sparkles, AlertCircle, RefreshCw,
  ChevronDown, Save, LayoutGrid,
  Calendar, Ban, ArrowUpCircle,
  SendHorizonal, ThumbsUp, ThumbsDown, MessageCircle, Trophy, X as XIcon,
  ExternalLink, Target, Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/Navbar";
import { ROICalculator } from "@/components/ROICalculator";
import { Footer } from "@/components/Footer";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { getParticipantTypeFromProfile } from "@/lib/participantConfig";

type Subscription = {
  id: string;
  user_id: string;
  tier: "private" | "institutional" | "developer";
  status: "active" | "cancelled" | "expired" | "trial";
  started_at: string;
  expires_at: string | null;
};

// Days until expiry (null = never / no expiry set)
function daysUntilExpiry(expiresAt: string | null): number | null {
  if (!expiresAt) return null;
  const diff = new Date(expiresAt).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

// ─── Subscription tiers ───────────────────────────────────────────────────────
const TIERS = [
  {
    id: "private",
    name: "Private",
    price: "€490",
    period: "/mo",
    desc: "Deal flow visibility for active allocators",
    features: [
      "Live quick sale deal feed",
      "AI valuation per deal",
      "City & type filters",
      "Weekly digest email",
      "Up to 20 deal views/mo",
    ],
    cta: "Start 7-Day Free Trial",
    highlight: false,
  },
  {
    id: "institutional",
    name: "Institutional",
    price: "€1,490",
    period: "/mo",
    desc: "Full access for family offices & funds",
    features: [
      "Everything in Private",
      "Unlimited deal access",
      "Seller contact details",
      "Priority deal alerts",
      "Portfolio analytics",
      "Dedicated deal advisor",
      "API / data export",
    ],
    cta: "Request Access",
    highlight: true,
  },
  {
    id: "developer",
    name: "Developer",
    price: "Custom",
    period: "",
    desc: "White-glove for development mandates",
    features: [
      "Everything in Institutional",
      "Co-investment pipeline",
      "Exclusive off-market mandates",
      "Legal & notary coordination",
      "Full portfolio management",
      "Dedicated relationship manager",
    ],
    cta: "Book a Call",
    highlight: false,
  },
];

// No mock deals — all data comes from the database

const CITY_BREAKDOWN_FALLBACK = [
  { city: "Athens", deals: 22, value: "€68M", pct: 49 },
  { city: "Thessaloniki", deals: 9, value: "€21M", pct: 19 },
  { city: "Other", deals: 9, value: "€18M", pct: 16 },
];

const TYPE_BREAKDOWN_FALLBACK = [
  { type: "Apartment", pct: 38, color: "bg-primary" },
  { type: "Villa", pct: 24, color: "bg-brand-gold" },
  { type: "Commercial", pct: 18, color: "bg-accent" },
  { type: "House", pct: 12, color: "bg-brand-emerald" },
  { type: "Land", pct: 8, color: "bg-destructive" },
];

const TYPE_COLORS: Record<string, string> = {
  apartment: "bg-primary",
  villa: "bg-brand-gold",
  commercial: "bg-accent",
  house: "bg-brand-emerald",
  land: "bg-destructive",
  office: "bg-primary",
};

const URGENCY_COLORS: Record<string, string> = {
  HIGH: "bg-destructive/15 text-destructive border-destructive/20",
  MEDIUM: "bg-brand-gold/15 text-brand-gold border-brand-gold/20",
  LOW: "bg-brand-emerald/15 text-brand-emerald border-brand-emerald/20",
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return "< 1h ago";
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function InvestorDashboard() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  const [activeTab] = useState<"deals">("deals");

  const participantType = getParticipantTypeFromProfile(profile);

  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [subLoading, setSubLoading] = useState(true);
  const subscribed = subscription?.status === "active" || subscription?.status === "trial";

  const isInvestorType = ["investor", "institutional"].includes(participantType);
  const isRealEstateAgent = participantType === "agent";
  const canAccessDealFlow = subscribed && isInvestorType;
  const [showGate, setShowGate] = useState(false);
  const [selectedTier, setSelectedTier] = useState<string | null>(null);

  // Expiry warning
  const daysLeft = daysUntilExpiry(subscription?.expires_at ?? null);
  const showExpiryWarning = subscribed && daysLeft !== null && daysLeft <= 7 && daysLeft >= 0;

  // Load subscription from DB
  const loadSubscription = useCallback(async () => {
    if (!user) { setSubLoading(false); return; }
    setSubLoading(true);
    const { data } = await supabase
      .from("investor_subscriptions" as any)
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();
    setSubscription(data as unknown as Subscription | null);
    setSubLoading(false);
  }, [user]);

  useEffect(() => { loadSubscription(); }, [loadSubscription]);

  // Save subscription selection to DB
  const handleSelectTier = async (tierId: string, ctaLabel: string) => {
    if (!user) {
      toast.error("Please sign in to subscribe");
      return;
    }
    if (isRealEstateAgent) {
      toast.error("This deal flow is for investors. As an agent, use the main Dashboard to manage your listings.");
      return;
    }
    const { error } = await supabase
      .from("investor_subscriptions" as any)
      .upsert({ user_id: user.id, tier: tierId, status: tierId === "developer" ? "trial" : "active" }, { onConflict: "user_id" });
    if (error) {
      toast.error("Please complete your subscription at the pricing page");
      setShowGate(false);
      navigate("/pricing/firesale-investors");
      return;
    }
    await loadSubscription();
    toast.success(`${ctaLabel} — Welcome to the deal flow!`);
    setShowGate(false);
  };

  // Deal types — inferred from real DB data
  type LiveDeal = {
    id: string; address: string; city: string; property_type: string;
    sqm: number; bedrooms: number | null; condition: string | null;
    ai_estimate: number; asking_price: number; discount_pct: number;
    status: string; created_at: string; urgency: "HIGH" | "MEDIUM" | "LOW";
    reason: string; roi_est: number;
  };

  // Deal feed state
  const [filterCity, setFilterCity] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [filterUrgency, setFilterUrgency] = useState("all");
  const [liveDeals, setLiveDeals] = useState<LiveDeal[]>([]);
  const [loading, setLoading] = useState(true);

  // Load investor feed — real DB data only
  useEffect(() => {
    const loadDeals = async () => {
      setLoading(true);
      try {
        const { data } = await supabase
          .from("firesale_requests")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(50);

        const realDeals: LiveDeal[] = (data || []).map(d => ({
          id: d.id,
          address: d.address,
          city: d.city,
          property_type: d.property_type || "apartment",
          sqm: Number(d.sqm),
          bedrooms: d.bedrooms,
          condition: d.condition,
          ai_estimate: Number(d.ai_estimate || 0),
          asking_price: Number(d.asking_price || d.ai_estimate || 0),
          discount_pct: d.ai_estimate && d.asking_price
            ? Number(((1 - Number(d.asking_price) / Number(d.ai_estimate)) * 100).toFixed(1))
            : 12,
          status: d.status,
          created_at: d.created_at,
          urgency: "MEDIUM" as const,
          reason: "Seller motivated",
          roi_est: 8.5,
        }));

        setLiveDeals(realDeals);
      } catch {
        setLiveDeals([]);
      } finally {
        setLoading(false);
      }
    };
    loadDeals();
  }, []);

  const cities = ["all", ...Array.from(new Set(liveDeals.map(d => d.city)))];
  const types = ["all", "apartment", "villa", "house", "commercial", "land", "office"];

  const filtered = liveDeals.filter(d => {
    if (filterCity !== "all" && d.city !== filterCity) return false;
    if (filterType !== "all" && d.property_type !== filterType) return false;
    if (filterUrgency !== "all" && d.urgency !== filterUrgency) return false;
    return true;
  });

  // Dynamic pipeline summary from live deals (fallback to placeholder when empty)
  const cityBreakdown = useMemo(() => {
    if (liveDeals.length === 0) return CITY_BREAKDOWN_FALLBACK;
    const byCity = liveDeals.reduce<Record<string, { count: number; value: number }>>((acc, d) => {
      const c = d.city || "Other";
      if (!acc[c]) acc[c] = { count: 0, value: 0 };
      acc[c].count += 1;
      acc[c].value += d.asking_price || 0;
      return acc;
    }, {});
    const total = liveDeals.length;
    const totalVal = liveDeals.reduce((s, d) => s + (d.asking_price || 0), 0);
    return Object.entries(byCity)
      .map(([city, { count, value }]) => ({
        city,
        deals: count,
        value: value >= 1_000_000 ? `€${(value / 1_000_000).toFixed(1)}M` : `€${(value / 1000).toFixed(0)}k`,
        pct: total ? Math.round((count / total) * 100) : 0,
      }))
      .sort((a, b) => b.deals - a.deals)
      .slice(0, 5);
  }, [liveDeals]);

  const typeBreakdown = useMemo(() => {
    if (liveDeals.length === 0) return TYPE_BREAKDOWN_FALLBACK;
    const byType = liveDeals.reduce<Record<string, number>>((acc, d) => {
      const t = (d.property_type || "other").toLowerCase();
      acc[t] = (acc[t] || 0) + 1;
      return acc;
    }, {});
    const total = liveDeals.length;
    return Object.entries(byType)
      .map(([type, count]) => ({
        type: type.charAt(0).toUpperCase() + type.slice(1),
        pct: total ? Math.round((count / total) * 100) : 0,
        color: TYPE_COLORS[type] || "bg-muted",
      }))
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 5);
  }, [liveDeals]);

  const totalValue = liveDeals.reduce((s, d) => s + (d.asking_price || 0), 0);
  const avgDiscount = liveDeals.length
    ? (liveDeals.reduce((s, d) => s + (d.discount_pct || 0), 0) / liveDeals.length).toFixed(1)
    : "0";

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-16">

        {/* ── Hero header ── */}
        <div className="relative border-b border-border overflow-hidden">
          <div className="absolute inset-0" style={{
            background: "radial-gradient(ellipse 70% 80% at 10% 50%, hsl(265 80% 60% / 0.08), transparent 60%), radial-gradient(ellipse 50% 60% at 90% 30%, hsl(183 100% 42% / 0.06), transparent 60%)"
          }} />
          <div className="container relative py-7 sm:py-10">
            <div className="flex items-start justify-between flex-wrap gap-4 sm:gap-6">
              <div>
                <div className="inline-flex items-center gap-2 bg-accent/10 border border-accent/20 text-accent px-3 py-1.5 rounded-full text-[10px] sm:text-xs font-bold uppercase tracking-widest mb-3 sm:mb-4">
                  <Crown className="w-3 h-3 sm:w-3.5 sm:h-3.5" /> Investor Deal Flow — Exclusive Access
                </div>
                <h1 className="font-display text-2xl sm:text-4xl font-black mb-2 sm:mb-3">
                  Private Quick Sale™ <br />
                  <span className="gradient-text-primary">Deal Pipeline</span>
                </h1>
                <p className="text-muted-foreground max-w-xl text-sm">
                  Off-market distressed assets, pre-foreclosures, and motivated seller properties —
                  curated for institutional buyers and family offices.
                </p>
              </div>
              <div className="flex flex-col items-end gap-3">
                <div className="flex items-center gap-2 flex-wrap justify-end">
                  <div className="flex items-center gap-1.5 text-xs bg-brand-emerald/10 border border-brand-emerald/20 text-brand-emerald px-3 py-1.5 rounded-full font-semibold">
                    <div className="w-1.5 h-1.5 rounded-full bg-brand-emerald animate-pulse" />
                    {liveDeals.length} live deals
                  </div>
                  <Link
                    to="/pricing/firesale-investors"
                    className="inline-flex items-center gap-1.5 text-xs bg-primary/10 border border-primary/20 text-primary px-3 py-1.5 rounded-full font-semibold hover:bg-primary/20 transition-colors"
                  >
                    <Target className="w-3 h-3" />
                    Plans & pricing
                  </Link>
                </div>
                {subscribed && subscription && (
                  <div className="flex items-center gap-1.5 text-xs bg-primary/10 border border-primary/20 text-primary px-3 py-1.5 rounded-full font-bold capitalize">
                    <Crown className="w-3 h-3" />
                    {subscription.tier} Plan Active
                  </div>
                )}
              </div>
            </div>

            {/* KPI bar */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 mt-5 sm:mt-8">
              {[
                { label: "Live Deals", value: String(liveDeals.length), delta: "+8 this week", icon: Flame, color: "text-destructive" },
                { label: "Total Deal Value", value: `€${(totalValue / 1_000_000).toFixed(1)}M`, delta: "In pipeline", icon: DollarSign, color: "text-primary" },
                { label: "Avg. Discount", value: `${avgDiscount}%`, delta: "vs market", icon: TrendingDown, color: "text-brand-emerald" },
                { label: "Avg. Est. ROI", value: "9.4%", delta: "p.a.", icon: TrendingUp, color: "text-brand-gold" },
              ].map(s => (
                <div key={s.label} className="glass-card rounded-xl p-3 sm:p-4 border border-border">
                  <div className="flex items-center justify-between mb-1.5 sm:mb-2">
                    <p className="text-[9px] sm:text-[10px] text-muted-foreground uppercase tracking-widest">{s.label}</p>
                    <s.icon className={`w-3 h-3 sm:w-3.5 sm:h-3.5 ${s.color}`} />
                  </div>
                  <p className={`font-display font-black text-xl sm:text-2xl ${s.color}`}>{s.value}</p>
                  <p className="text-[9px] sm:text-[10px] text-muted-foreground mt-0.5 sm:mt-1">{s.delta}</p>
                </div>
              ))}
            </div>

            {/* Tab bar — Deal Feed only; Admin at /admin */}
            <div className="flex items-center gap-1 mt-8 flex-wrap">
              <button
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                Deal Feed
              </button>
            </div>
          </div>
        </div>

        {/* ── Expiry warning banner ── */}
        {showExpiryWarning && (
          <div className="border-b border-destructive/20 bg-destructive/5">
            <div className="container py-3 flex items-center gap-3 flex-wrap">
              <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
              <p className="text-sm text-destructive font-semibold flex-1 min-w-0">
                Your <span className="capitalize">{subscription?.tier}</span> subscription expires in{" "}
                <strong>{daysLeft === 0 ? "less than 1 day" : `${daysLeft} day${daysLeft === 1 ? "" : "s"}`}</strong>.
                Renew now to keep full deal access.
              </p>
              <Button
                size="sm"
                className="bg-destructive hover:bg-destructive/90 text-destructive-foreground text-xs h-8 shrink-0"
                onClick={() => setShowGate(true)}
              >
                Renew Subscription
              </Button>
            </div>
          </div>
        )}

        <div className="container py-8">
          {/* ─────────────── DEAL FEED TAB ─────────────── */}
          {activeTab === "deals" && (
            <div className="grid lg:grid-cols-[1fr_300px] gap-8">

              {/* Main feed */}
              <div className="space-y-5">
                {/* Filters */}
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <SlidersHorizontal className="w-3.5 h-3.5" />
                    <span className="font-semibold">Filter:</span>
                  </div>
                  <select value={filterCity} onChange={e => setFilterCity(e.target.value)} className="bg-muted border border-border rounded-lg px-3 py-1.5 text-xs text-foreground outline-none focus:border-primary capitalize">
                    {cities.map(c => <option key={c} value={c} className="bg-card capitalize">{c === "all" ? "All cities" : c}</option>)}
                  </select>
                  <select value={filterType} onChange={e => setFilterType(e.target.value)} className="bg-muted border border-border rounded-lg px-3 py-1.5 text-xs text-foreground outline-none focus:border-primary capitalize">
                    {types.map(t => <option key={t} value={t} className="bg-card capitalize">{t === "all" ? "All types" : t}</option>)}
                  </select>
                  <select value={filterUrgency} onChange={e => setFilterUrgency(e.target.value)} className="bg-muted border border-border rounded-lg px-3 py-1.5 text-xs text-foreground outline-none focus:border-primary">
                    <option value="all" className="bg-card">All urgency</option>
                    <option value="HIGH" className="bg-card">🔴 High</option>
                    <option value="MEDIUM" className="bg-card">🟡 Medium</option>
                    <option value="LOW" className="bg-card">🟢 Low</option>
                  </select>
                  <span className="text-[10px] text-muted-foreground ml-auto">{filtered.length} deals found</span>
                </div>

                {loading ? (
                  <div className="flex items-center justify-center py-20">
                    <RefreshCw className="w-6 h-6 text-muted-foreground animate-spin" />
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filtered.map((deal, idx) => {
                      const isBlurred = !canAccessDealFlow && idx >= 2;
                      return (
                        <div key={deal.id} className={`relative glass-card rounded-2xl border border-border overflow-hidden transition-all duration-200 ${!isBlurred ? "hover:border-primary/30" : ""}`}>
                          {isBlurred && (
                            <div className="absolute inset-0 backdrop-blur-md bg-background/60 z-10 flex flex-col items-center justify-center gap-3">
                              <Lock className="w-6 h-6 text-muted-foreground" />
                              <p className="text-xs text-muted-foreground font-semibold">Subscribe to unlock this deal</p>
                              <Button size="sm" className="bg-gradient-primary border-0 text-primary-foreground text-xs h-8" onClick={() => setShowGate(true)}>
                                View Plans
                              </Button>
                            </div>
                          )}
                          <div className={`p-5 ${isBlurred ? "select-none pointer-events-none" : ""}`}>
                            <div className="flex items-start justify-between gap-4 flex-wrap">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-2 flex-wrap">
                                  <span className={`text-[10px] font-bold uppercase tracking-widest border px-2 py-0.5 rounded-full ${URGENCY_COLORS[deal.urgency]}`}>
                                    {deal.urgency} URGENCY
                                  </span>
                                  <span className="text-[10px] font-semibold text-muted-foreground bg-muted border border-border px-2 py-0.5 rounded-full capitalize">
                                    {deal.property_type}
                                  </span>
                                  <span className="text-[10px] text-muted-foreground">{timeAgo(deal.created_at)}</span>
                                </div>
                                <div className="flex items-center gap-1.5 mb-1">
                                  <MapPin className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                  <h3 className="font-display font-bold text-base">{deal.address}</h3>
                                </div>
                                <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                                  <span>{deal.sqm} m²</span>
                                  {deal.bedrooms && <span>{deal.bedrooms} bed</span>}
                                  <span className="capitalize">{deal.condition} condition</span>
                                  <span className="text-muted-foreground/50">•</span>
                                  <span className="italic">{deal.reason}</span>
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <div className="text-[10px] text-muted-foreground uppercase tracking-widest mb-0.5">Asking</div>
                                <div className="font-display font-black text-xl text-foreground">
                                  €{deal.asking_price.toLocaleString()}
                                </div>
                                {deal.ai_estimate > 0 && (
                                  <div className="text-[10px] text-muted-foreground mt-0.5">
                                    AI value: €{deal.ai_estimate.toLocaleString()}
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="grid grid-cols-4 gap-2 mt-4 pt-4 border-t border-border">
                              <div className="text-center">
                                <p className="font-black text-sm text-brand-emerald">−{deal.discount_pct}%</p>
                                <p className="text-[9px] text-muted-foreground uppercase tracking-wider mt-0.5">Discount</p>
                              </div>
                              <div className="text-center">
                                <p className="font-black text-sm text-brand-gold">{deal.roi_est}%</p>
                                <p className="text-[9px] text-muted-foreground uppercase tracking-wider mt-0.5">ROI Est.</p>
                              </div>
                              <div className="text-center">
                                <p className="font-black text-sm text-primary">€{Math.round(deal.asking_price / deal.sqm).toLocaleString()}</p>
                                <p className="text-[9px] text-muted-foreground uppercase tracking-wider mt-0.5">Per m²</p>
                              </div>
                              <div className="text-center">
                                <p className="font-black text-sm text-foreground">48h</p>
                                <p className="text-[9px] text-muted-foreground uppercase tracking-wider mt-0.5">Close</p>
                              </div>
                            </div>
                            {!isBlurred && (
                              <div className="flex gap-2 mt-4">
                                <Button size="sm" className="bg-gradient-primary border-0 text-primary-foreground text-xs h-8 flex-1" onClick={() => canAccessDealFlow ? toast.info("Connecting you with seller...") : setShowGate(true)}>
                                  {canAccessDealFlow ? "Contact Seller" : <><Lock className="w-3 h-3 mr-1" />Unlock Contact</>}
                                </Button>
                                <Button size="sm" variant="outline" className="border-border text-xs h-8" onClick={() => canAccessDealFlow ? toast.success("AI report downloading...") : setShowGate(true)}>
                                  <BarChart2 className="w-3 h-3 mr-1" />
                                  {canAccessDealFlow ? "AI Report" : "Report"}
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {!canAccessDealFlow && filtered.length > 2 && (
                  <div className="text-center py-6 glass-card rounded-2xl border border-dashed border-border">
                    <Lock className="w-5 h-5 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm font-semibold mb-1">{filtered.length - 2} more deals in the pipeline</p>
                    <p className="text-xs text-muted-foreground mb-4">Subscribe to see all active opportunities</p>
                    <Button className="bg-gradient-primary border-0 text-primary-foreground" onClick={() => setShowGate(true)}>
                      Unlock Full Deal Flow
                    </Button>
                  </div>
                )}
              </div>

              {/* Right sidebar analytics */}
              <div className="space-y-4 lg:sticky lg:top-24 self-start">
                <ROICalculator defaultPrice={200000} defaultSqm={80} />
                <div className="glass-card rounded-2xl border border-border p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <MapPin className="w-3.5 h-3.5 text-primary" />
                    <p className="font-display font-semibold text-sm">Deals by City</p>
                  </div>
                  <div className="space-y-2.5">
                    {cityBreakdown.map(c => (
                      <div key={c.city}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-muted-foreground">{c.city}</span>
                          <span className="font-semibold">{c.deals} · {c.value}</span>
                        </div>
                        <div className="h-1.5 bg-border rounded-full overflow-hidden">
                          <div className="h-full bg-gradient-primary rounded-full" style={{ width: `${c.pct}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="glass-card rounded-2xl border border-border p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <Building2 className="w-3.5 h-3.5 text-primary" />
                    <p className="font-display font-semibold text-sm">Deals by Type</p>
                  </div>
                  <div className="space-y-2.5">
                    {typeBreakdown.map(t => (
                      <div key={t.type} className="flex items-center gap-2.5">
                        <div className={`w-2 h-2 rounded-full shrink-0 ${t.color}`} />
                        <span className="text-xs text-muted-foreground flex-1">{t.type}</span>
                        <span className="text-xs font-bold">{t.pct}%</span>
                        <div className="w-16 h-1 bg-border rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${t.color}`} style={{ width: `${t.pct}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="glass-card rounded-2xl border border-brand-gold/20 p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <Activity className="w-3.5 h-3.5 text-brand-gold" />
                    <p className="font-display font-semibold text-sm">Market Pulse</p>
                    <div className="ml-auto w-2 h-2 rounded-full bg-brand-gold animate-pulse" />
                  </div>
                  <div className="space-y-3 text-xs">
                    {[
                      { metric: "New deals this week", value: "+8", trend: "up" },
                      { metric: "Avg. days to close", value: "3.2d", trend: "down" },
                      { metric: "Buyer demand index", value: "High", trend: "up" },
                      { metric: "Avg. asking vs AI", value: "−13.8%", trend: "up" },
                    ].map(m => (
                      <div key={m.metric} className="flex items-center justify-between">
                        <span className="text-muted-foreground">{m.metric}</span>
                        <span className={`font-bold ${m.trend === "up" ? "text-brand-emerald" : "text-primary"}`}>{m.value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {!canAccessDealFlow && (
                  <div className="glass-card rounded-2xl border border-primary/20 p-5 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-20 h-20 rounded-bl-full bg-primary/5" />
                    <div className="relative">
                      <Crown className="w-5 h-5 text-primary mb-3" />
                      {isRealEstateAgent ? (
                        <>
                          <h4 className="font-display font-bold text-sm mb-1">Deal Flow for Investors</h4>
                          <p className="text-xs text-muted-foreground mb-3 leading-relaxed">This dashboard is for investors and institutional buyers. As a real estate agent, use the main <strong>Dashboard</strong> to manage your listings. Firesale requests are managed by platform admins.</p>
                          <Button className="w-full bg-primary/10 border border-primary/30 text-primary text-xs h-9" asChild>
                            <Link to="/dashboard">Go to Dashboard</Link>
                          </Button>
                        </>
                      ) : (
                        <>
                          <h4 className="font-display font-bold text-sm mb-1">Unlock Full Access</h4>
                          <p className="text-xs text-muted-foreground mb-3 leading-relaxed">Get seller contacts, full AI reports, and real-time deal alerts.</p>
                          <Button className="w-full bg-gradient-primary border-0 text-primary-foreground text-xs h-9 mb-2" onClick={() => setShowGate(true)}>
                            View Subscription Plans
                          </Button>
                          <Link
                            to="/pricing/firesale-investors"
                            className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
                          >
                            <ExternalLink className="w-3 h-3" />
                            Full pricing page
                          </Link>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Admin features moved to /admin — see /admin */}


        {/* ── Subscription Gate / Pricing modal ── */}
        {showGate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-md p-4" onClick={() => setShowGate(false)}>
            <div className="w-full max-w-4xl" onClick={e => e.stopPropagation()}>
              <div className="text-center mb-8">
                <div className="inline-flex items-center gap-2 bg-primary/10 border border-primary/20 text-primary px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest mb-4">
                  <Sparkles className="w-3.5 h-3.5" /> Exclusive Investor Access
                </div>
                <h2 className="font-display text-3xl font-black mb-3">
                  Join the Smartest<br />
                  <span className="gradient-text-primary">Property Deal Flow</span> in Greece
                </h2>
                <p className="text-muted-foreground text-sm max-w-lg mx-auto">
                  Access off-market distressed assets before they're listed anywhere else. Trusted by 50+ family offices, funds, and HNWIs.
                </p>
              </div>
              <div className="grid md:grid-cols-3 gap-4">
                {TIERS.map(tier => (
                  <div
                    key={tier.id}
                    className={`glass-card rounded-2xl border p-6 relative cursor-pointer transition-all duration-200 ${tier.highlight ? "border-primary/40 shadow-glow-cyan" : selectedTier === tier.id ? "border-primary/30" : "border-border hover:border-border/80"}`}
                    onClick={() => setSelectedTier(tier.id)}
                  >
                    {tier.highlight && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-primary text-primary-foreground text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full">
                        Most Popular
                      </div>
                    )}
                    <div className="mb-4">
                      <p className="font-display font-black text-lg">{tier.name}</p>
                      <div className="flex items-baseline gap-0.5 mt-1">
                        <span className="font-display font-black text-3xl text-foreground">{tier.price}</span>
                        <span className="text-muted-foreground text-sm">{tier.period}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{tier.desc}</p>
                    </div>
                    <div className="space-y-2 mb-6">
                      {tier.features.map(f => (
                        <div key={f} className="flex items-start gap-2 text-xs">
                          <Check className="w-3 h-3 text-primary mt-0.5 shrink-0" />
                          <span className="text-muted-foreground">{f}</span>
                        </div>
                      ))}
                    </div>
                    <Button
                      className={`w-full text-xs h-9 ${tier.highlight ? "bg-gradient-primary border-0 text-primary-foreground" : "variant-outline border-border"}`}
                      variant={tier.highlight ? "default" : "outline"}
                      onClick={e => {
                        e.stopPropagation();
                        handleSelectTier(tier.id, tier.cta);
                      }}
                    >
                      {tier.cta}
                    </Button>
                  </div>
                ))}
              </div>
              <div className="text-center mt-6 flex flex-col items-center gap-2">
                <Link
                  to="/pricing/firesale-investors"
                  className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
                >
                  <ExternalLink className="w-3 h-3" />
                  View full pricing page
                </Link>
                <button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setShowGate(false)}>
                  Continue browsing (limited access)
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      <Footer />
    </div>
    </div>
  );
}
