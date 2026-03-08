import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Flame, Lock, BarChart2, TrendingUp, TrendingDown, MapPin, Euro,
  Building2, Star, Eye, EyeOff, Shield, ChevronRight, Zap,
  Download, Filter, Search, SlidersHorizontal, Check, Clock,
  Users, DollarSign, Activity, ArrowUpRight, Phone, Mail,
  Crown, Sparkles, AlertCircle, RefreshCw, Settings, Pencil,
  ChevronDown, FileText, Save, X, LayoutGrid, ShieldCheck
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

// ─── Subscription tiers ───────────────────────────────────────────────────────
const TIERS = [
  {
    id: "analyst",
    name: "Analyst",
    price: "€490",
    period: "/mo",
    desc: "Deal flow visibility for active allocators",
    features: [
      "Live firesale deal feed",
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
      "Everything in Analyst",
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
    id: "sovereign",
    name: "Sovereign",
    price: "Custom",
    period: "",
    desc: "White-glove for mandates €10M+",
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

const MOCK_DEALS = [
  { id: "m1", address: "Kolonaki, Athens", city: "Athens", property_type: "apartment", sqm: 145, bedrooms: 3, condition: "good", ai_estimate: 480000, asking_price: 420000, discount_pct: 12.5, status: "pending", created_at: new Date(Date.now() - 2 * 3600000).toISOString(), urgency: "HIGH", reason: "Divorce settlement", roi_est: 8.4 },
  { id: "m2", address: "Glyfada Waterfront", city: "Athens", property_type: "villa", sqm: 320, bedrooms: 5, condition: "excellent", ai_estimate: 1_850_000, asking_price: 1_620_000, discount_pct: 12.4, status: "pending", created_at: new Date(Date.now() - 6 * 3600000).toISOString(), urgency: "MEDIUM", reason: "Relocation abroad", roi_est: 6.1 },
  { id: "m3", address: "Thessaloniki Centre", city: "Thessaloniki", property_type: "commercial", sqm: 280, bedrooms: null, condition: "fair", ai_estimate: 620_000, asking_price: 520_000, discount_pct: 16.1, status: "pending", created_at: new Date(Date.now() - 18 * 3600000).toISOString(), urgency: "HIGH", reason: "Debt restructuring", roi_est: 11.2 },
  { id: "m4", address: "Mykonos Town", city: "Mykonos", property_type: "house", sqm: 180, bedrooms: 4, condition: "good", ai_estimate: 2_100_000, asking_price: 1_850_000, discount_pct: 11.9, status: "pending", created_at: new Date(Date.now() - 32 * 3600000).toISOString(), urgency: "LOW", reason: "Estate liquidation", roi_est: 7.8 },
  { id: "m5", address: "Piraeus Marina District", city: "Piraeus", property_type: "apartment", sqm: 90, bedrooms: 2, condition: "needs-work", ai_estimate: 195_000, asking_price: 155_000, discount_pct: 20.5, status: "pending", created_at: new Date(Date.now() - 48 * 3600000).toISOString(), urgency: "HIGH", reason: "Urgent financial need", roi_est: 13.4 },
  { id: "m6", address: "Heraklion, Crete", city: "Heraklion", property_type: "land", sqm: 2400, bedrooms: null, condition: "excellent", ai_estimate: 890_000, asking_price: 760_000, discount_pct: 14.6, status: "pending", created_at: new Date(Date.now() - 72 * 3600000).toISOString(), urgency: "MEDIUM", reason: "Developer exit", roi_est: 9.3 },
];

const CITY_BREAKDOWN = [
  { city: "Athens", deals: 22, value: "€68M", pct: 49 },
  { city: "Thessaloniki", deals: 9, value: "€21M", pct: 19 },
  { city: "Mykonos/Santorini", deals: 7, value: "€31M", pct: 22 },
  { city: "Other Greece", deals: 9, value: "€18M", pct: 16 },
];

const TYPE_BREAKDOWN = [
  { type: "Apartment", pct: 38, color: "bg-primary" },
  { type: "Villa", pct: 24, color: "bg-brand-gold" },
  { type: "Commercial", pct: 18, color: "bg-accent" },
  { type: "House", pct: 12, color: "bg-brand-emerald" },
  { type: "Land", pct: 8, color: "bg-destructive" },
];

const URGENCY_COLORS: Record<string, string> = {
  HIGH: "bg-destructive/15 text-destructive border-destructive/20",
  MEDIUM: "bg-brand-gold/15 text-brand-gold border-brand-gold/20",
  LOW: "bg-brand-emerald/15 text-brand-emerald border-brand-emerald/20",
};

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending:     { label: "Pending",     color: "bg-brand-gold/15 text-brand-gold border-brand-gold/20" },
  reviewed:    { label: "Reviewed",    color: "bg-primary/15 text-primary border-primary/20" },
  offer_sent:  { label: "Offer Sent",  color: "bg-accent/15 text-accent border-accent/20" },
  closed:      { label: "Closed",      color: "bg-brand-emerald/15 text-brand-emerald border-brand-emerald/20" },
};

const STATUS_FLOW = ["pending", "reviewed", "offer_sent", "closed"] as const;

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return "< 1h ago";
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ─── Admin Deal Row ────────────────────────────────────────────────────────────
type AdminDeal = {
  id: string;
  address: string;
  city: string;
  property_type: string | null;
  sqm: number;
  bedrooms: number | null;
  condition: string;
  ai_estimate: number | null;
  asking_price: number | null;
  offer_price: number | null;
  status: string;
  contact_email: string;
  contact_phone: string | null;
  notes: string | null;
  admin_notes: string | null;
  created_at: string;
};

function AdminDealRow({ deal, onUpdate }: { deal: AdminDeal; onUpdate: (id: string, status: string, notes: string) => Promise<void> }) {
  const [expanded, setExpanded] = useState(false);
  const [editNotes, setEditNotes] = useState(deal.admin_notes || "");
  const [saving, setSaving] = useState(false);

  const statusCfg = STATUS_CONFIG[deal.status] || STATUS_CONFIG.pending;

  const handleSave = async () => {
    setSaving(true);
    await onUpdate(deal.id, deal.status, editNotes);
    setSaving(false);
  };

  const handleStatusChange = async (newStatus: string) => {
    setSaving(true);
    await onUpdate(deal.id, newStatus, editNotes);
    setSaving(false);
  };

  return (
    <div className="glass-card rounded-xl border border-border overflow-hidden">
      {/* Main row */}
      <button
        className="w-full text-left p-4 flex items-center gap-4 hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`text-[10px] font-bold uppercase tracking-widest border px-2 py-0.5 rounded-full ${statusCfg.color}`}>
              {statusCfg.label}
            </span>
            <span className="text-[10px] font-semibold text-muted-foreground bg-muted border border-border px-2 py-0.5 rounded-full capitalize">
              {deal.property_type || "property"}
            </span>
            <span className="text-[10px] text-muted-foreground">{timeAgo(deal.created_at)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <MapPin className="w-3 h-3 text-muted-foreground shrink-0" />
            <span className="font-semibold text-sm truncate">{deal.address}, {deal.city}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{deal.sqm} m² {deal.bedrooms ? `· ${deal.bedrooms} bed` : ""} · {deal.condition}</p>
        </div>
        <div className="text-right shrink-0 hidden sm:block">
          <p className="text-[10px] text-muted-foreground">Asking</p>
          <p className="font-display font-black text-base">€{(deal.asking_price || 0).toLocaleString()}</p>
          {deal.ai_estimate && (
            <p className="text-[10px] text-muted-foreground">AI: €{deal.ai_estimate.toLocaleString()}</p>
          )}
        </div>
        <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>

      {/* Expanded panel */}
      {expanded && (
        <div className="border-t border-border p-4 space-y-4 bg-muted/20">
          {/* Contact + deal data */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Contact Info</p>
              <div className="flex items-center gap-2 text-xs">
                <Mail className="w-3 h-3 text-muted-foreground" />
                <a href={`mailto:${deal.contact_email}`} className="text-primary hover:underline">{deal.contact_email}</a>
              </div>
              {deal.contact_phone && (
                <div className="flex items-center gap-2 text-xs">
                  <Phone className="w-3 h-3 text-muted-foreground" />
                  <a href={`tel:${deal.contact_phone}`} className="text-primary hover:underline">{deal.contact_phone}</a>
                </div>
              )}
              {deal.notes && (
                <div className="mt-2 p-2 bg-muted rounded-lg text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">Seller notes: </span>{deal.notes}
                </div>
              )}
            </div>
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Deal Metrics</p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-muted rounded-lg p-2">
                  <p className="text-muted-foreground">Asking Price</p>
                  <p className="font-bold">€{(deal.asking_price || 0).toLocaleString()}</p>
                </div>
                <div className="bg-muted rounded-lg p-2">
                  <p className="text-muted-foreground">AI Estimate</p>
                  <p className="font-bold text-brand-emerald">€{(deal.ai_estimate || 0).toLocaleString()}</p>
                </div>
                {deal.offer_price && (
                  <div className="bg-muted rounded-lg p-2 col-span-2">
                    <p className="text-muted-foreground">Offer Price</p>
                    <p className="font-bold text-primary">€{deal.offer_price.toLocaleString()}</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Status pipeline */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Update Status</p>
            <div className="flex items-center gap-2 flex-wrap">
              {STATUS_FLOW.map((s, i) => {
                const cfg = STATUS_CONFIG[s];
                const isCurrent = deal.status === s;
                return (
                  <button
                    key={s}
                    onClick={() => handleStatusChange(s)}
                    disabled={saving}
                    className={`text-[10px] font-bold uppercase tracking-widest border px-3 py-1.5 rounded-full transition-all ${
                      isCurrent ? cfg.color + " ring-2 ring-offset-1 ring-offset-background" : "text-muted-foreground border-border hover:border-primary/40"
                    }`}
                  >
                    {cfg.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Admin notes */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Internal Notes</p>
            <textarea
              value={editNotes}
              onChange={e => setEditNotes(e.target.value)}
              placeholder="Add internal notes, offer details, next steps..."
              rows={3}
              className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-primary resize-none"
            />
            <div className="flex justify-end mt-2">
              <Button
                size="sm"
                className="bg-gradient-primary border-0 text-primary-foreground text-xs h-8 gap-1.5"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                Save Notes
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function InvestorDashboard() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  const isAdmin = profile?.role === "agent";
  const [activeTab, setActiveTab] = useState<"deals" | "admin">("deals");

  // Subscription state
  const [subscribed] = useState(false);
  const [showGate, setShowGate] = useState(!subscribed);
  const [selectedTier, setSelectedTier] = useState<string | null>(null);

  // Deal feed state
  const [filterCity, setFilterCity] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [filterUrgency, setFilterUrgency] = useState("all");
  const [liveDeals, setLiveDeals] = useState<typeof MOCK_DEALS>([]);
  const [loading, setLoading] = useState(true);

  // Admin state
  const [adminDeals, setAdminDeals] = useState<AdminDeal[]>([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminFilter, setAdminFilter] = useState("all");

  // Load investor feed (own + mock)
  useEffect(() => {
    const loadDeals = async () => {
      setLoading(true);
      try {
        const { data } = await supabase
          .from("firesale_requests")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(50);

        const realDeals = (data || []).map(d => ({
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

        setLiveDeals([...realDeals, ...MOCK_DEALS]);
      } catch {
        setLiveDeals(MOCK_DEALS);
      } finally {
        setLoading(false);
      }
    };
    loadDeals();
  }, []);

  // Load admin deals (all requests)
  const loadAdminDeals = async () => {
    setAdminLoading(true);
    try {
      const { data, error } = await supabase
        .from("firesale_requests")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setAdminDeals((data || []) as AdminDeal[]);
    } catch (e) {
      toast.error("Could not load all requests. Make sure you have admin access.");
    } finally {
      setAdminLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === "admin" && isAdmin) {
      loadAdminDeals();
    }
  }, [activeTab, isAdmin]);

  const handleAdminUpdate = async (id: string, status: string, admin_notes: string) => {
    const { error } = await supabase
      .from("firesale_requests")
      .update({ status, admin_notes } as any)
      .eq("id", id);

    if (error) {
      toast.error("Failed to update deal");
      return;
    }
    setAdminDeals(prev => prev.map(d => d.id === id ? { ...d, status, admin_notes } : d));
    toast.success("Deal updated");
  };

  const cities = ["all", ...Array.from(new Set(liveDeals.map(d => d.city)))];
  const types = ["all", "apartment", "villa", "house", "commercial", "land", "office"];

  const filtered = liveDeals.filter(d => {
    if (filterCity !== "all" && d.city !== filterCity) return false;
    if (filterType !== "all" && d.property_type !== filterType) return false;
    if (filterUrgency !== "all" && d.urgency !== filterUrgency) return false;
    return true;
  });

  const filteredAdmin = adminDeals.filter(d => adminFilter === "all" || d.status === adminFilter);

  const totalValue = liveDeals.reduce((s, d) => s + (d.asking_price || 0), 0);
  const avgDiscount = liveDeals.length
    ? (liveDeals.reduce((s, d) => s + (d.discount_pct || 0), 0) / liveDeals.length).toFixed(1)
    : "0";

  // Admin pipeline totals
  const adminStats = {
    total: adminDeals.length,
    pending: adminDeals.filter(d => d.status === "pending").length,
    reviewed: adminDeals.filter(d => d.status === "reviewed").length,
    offer_sent: adminDeals.filter(d => d.status === "offer_sent").length,
    closed: adminDeals.filter(d => d.status === "closed").length,
    totalValue: adminDeals.reduce((s, d) => s + Number(d.asking_price || 0), 0),
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-16">

        {/* ── Hero header ── */}
        <div className="relative border-b border-border overflow-hidden">
          <div className="absolute inset-0" style={{
            background: "radial-gradient(ellipse 70% 80% at 10% 50%, hsl(265 80% 60% / 0.08), transparent 60%), radial-gradient(ellipse 50% 60% at 90% 30%, hsl(183 100% 42% / 0.06), transparent 60%)"
          }} />
          <div className="container relative py-10">
            <div className="flex items-start justify-between flex-wrap gap-6">
              <div>
                <div className="inline-flex items-center gap-2 bg-accent/10 border border-accent/20 text-accent px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest mb-4">
                  <Crown className="w-3.5 h-3.5" /> Investor Deal Flow — Exclusive Access
                </div>
                <h1 className="font-display text-4xl font-black mb-3">
                  Private Firesale™ <br />
                  <span className="gradient-text-primary">Deal Pipeline</span>
                </h1>
                <p className="text-muted-foreground max-w-xl text-sm">
                  Off-market distressed assets, pre-foreclosures, and motivated seller properties —
                  curated for institutional buyers and family offices.
                </p>
              </div>
              <div className="flex flex-col items-end gap-3">
                <div className="flex items-center gap-1.5 text-xs bg-brand-emerald/10 border border-brand-emerald/20 text-brand-emerald px-3 py-1.5 rounded-full font-semibold">
                  <div className="w-1.5 h-1.5 rounded-full bg-brand-emerald animate-pulse" />
                  {liveDeals.length} live deals
                </div>
                <Button
                  className="bg-gradient-primary border-0 text-primary-foreground gap-2"
                  onClick={() => navigate("/firesale")}
                >
                  <Flame className="w-4 h-4" />
                  Submit a Property
                </Button>
              </div>
            </div>

            {/* KPI bar */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-8">
              {[
                { label: "Live Deals", value: String(liveDeals.length), delta: "+8 this week", icon: Flame, color: "text-destructive" },
                { label: "Total Deal Value", value: `€${(totalValue / 1_000_000).toFixed(1)}M`, delta: "In pipeline", icon: DollarSign, color: "text-primary" },
                { label: "Avg. Discount", value: `${avgDiscount}%`, delta: "vs market", icon: TrendingDown, color: "text-brand-emerald" },
                { label: "Avg. Est. ROI", value: "9.4%", delta: "p.a.", icon: TrendingUp, color: "text-brand-gold" },
              ].map(s => (
                <div key={s.label} className="glass-card rounded-xl p-4 border border-border">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest">{s.label}</p>
                    <s.icon className={`w-3.5 h-3.5 ${s.color}`} />
                  </div>
                  <p className={`font-display font-black text-2xl ${s.color}`}>{s.value}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">{s.delta}</p>
                </div>
              ))}
            </div>

            {/* Tab bar */}
            <div className="flex items-center gap-1 mt-8">
              <button
                onClick={() => setActiveTab("deals")}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === "deals" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                Deal Feed
              </button>
              {isAdmin && (
                <button
                  onClick={() => setActiveTab("admin")}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === "admin" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`}
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Admin Pipeline
                  {adminDeals.length > 0 && <span className="text-[10px] bg-destructive text-destructive-foreground rounded-full px-1.5 py-0.5 font-bold">{adminStats.pending}</span>}
                </button>
              )}
            </div>
          </div>
        </div>

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
                      const isBlurred = !subscribed && idx >= 2;
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
                                <Button size="sm" className="bg-gradient-primary border-0 text-primary-foreground text-xs h-8 flex-1" onClick={() => subscribed ? toast.info("Connecting you with seller...") : setShowGate(true)}>
                                  {subscribed ? "Contact Seller" : <><Lock className="w-3 h-3 mr-1" />Unlock Contact</>}
                                </Button>
                                <Button size="sm" variant="outline" className="border-border text-xs h-8" onClick={() => subscribed ? toast.success("AI report downloading...") : setShowGate(true)}>
                                  <BarChart2 className="w-3 h-3 mr-1" />
                                  {subscribed ? "AI Report" : "Report"}
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {!subscribed && filtered.length > 2 && (
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
                <div className="glass-card rounded-2xl border border-border p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <MapPin className="w-3.5 h-3.5 text-primary" />
                    <p className="font-display font-semibold text-sm">Deals by City</p>
                  </div>
                  <div className="space-y-2.5">
                    {CITY_BREAKDOWN.map(c => (
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
                    {TYPE_BREAKDOWN.map(t => (
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

                {!subscribed && (
                  <div className="glass-card rounded-2xl border border-primary/20 p-5 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-20 h-20 rounded-bl-full bg-primary/5" />
                    <div className="relative">
                      <Crown className="w-5 h-5 text-primary mb-3" />
                      <h4 className="font-display font-bold text-sm mb-1">Unlock Full Access</h4>
                      <p className="text-xs text-muted-foreground mb-3 leading-relaxed">Get seller contacts, full AI reports, and real-time deal alerts.</p>
                      <Button className="w-full bg-gradient-primary border-0 text-primary-foreground text-xs h-9" onClick={() => setShowGate(true)}>
                        View Subscription Plans
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ─────────────── ADMIN PIPELINE TAB ─────────────── */}
          {activeTab === "admin" && isAdmin && (
            <div className="space-y-6">
              {/* Admin KPI strip */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {[
                  { label: "Total Requests", value: adminStats.total, color: "text-foreground" },
                  { label: "Pending", value: adminStats.pending, color: "text-brand-gold" },
                  { label: "Reviewed", value: adminStats.reviewed, color: "text-primary" },
                  { label: "Offer Sent", value: adminStats.offer_sent, color: "text-accent" },
                  { label: "Closed", value: adminStats.closed, color: "text-brand-emerald" },
                ].map(s => (
                  <div key={s.label} className="glass-card rounded-xl border border-border p-4">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">{s.label}</p>
                    <p className={`font-display font-black text-2xl ${s.color}`}>{s.value}</p>
                  </div>
                ))}
              </div>

              {/* Total pipeline value */}
              <div className="glass-card rounded-xl border border-border p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Total Pipeline Value (Asking)</p>
                  <p className="font-display font-black text-2xl text-primary">€{(adminStats.totalValue / 1_000_000).toFixed(2)}M</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" className="border-border text-xs h-8 gap-1.5" onClick={loadAdminDeals}>
                    <RefreshCw className="w-3 h-3" /> Refresh
                  </Button>
                </div>
              </div>

              {/* Status filter */}
              <div className="flex items-center gap-2 flex-wrap">
                {["all", "pending", "reviewed", "offer_sent", "closed"].map(s => (
                  <button
                    key={s}
                    onClick={() => setAdminFilter(s)}
                    className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-all capitalize ${
                      adminFilter === s
                        ? s === "all"
                          ? "bg-primary text-primary-foreground border-primary"
                          : STATUS_CONFIG[s]?.color + " ring-1 ring-offset-1 ring-offset-background"
                        : "text-muted-foreground border-border hover:border-primary/40"
                    }`}
                  >
                    {s === "all" ? `All (${adminStats.total})` : `${STATUS_CONFIG[s]?.label} (${adminDeals.filter(d => d.status === s).length})`}
                  </button>
                ))}
              </div>

              {/* Deal list */}
              {adminLoading ? (
                <div className="flex items-center justify-center py-20">
                  <RefreshCw className="w-6 h-6 text-muted-foreground animate-spin" />
                </div>
              ) : filteredAdmin.length === 0 ? (
                <div className="text-center py-20">
                  <FileText className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">No requests found for this filter.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredAdmin.map(deal => (
                    <AdminDealRow key={deal.id} deal={deal} onUpdate={handleAdminUpdate} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Guard for non-admins trying admin tab */}
          {activeTab === "admin" && !isAdmin && (
            <div className="text-center py-24">
              <ShieldCheck className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="font-display font-bold text-xl mb-2">Admin Access Required</p>
              <p className="text-sm text-muted-foreground">This section is only available to platform admins.</p>
            </div>
          )}
        </div>

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
                        toast.success(`${tier.cta} — Our team will contact you shortly.`);
                        setShowGate(false);
                      }}
                    >
                      {tier.cta}
                    </Button>
                  </div>
                ))}
              </div>
              <div className="text-center mt-6">
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
  );
}
