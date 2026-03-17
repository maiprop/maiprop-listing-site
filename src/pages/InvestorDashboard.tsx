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
  ExternalLink, Target, Loader2, MailPlus, Briefcase
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { getParticipantTypeFromProfile } from "@/lib/participantConfig";
import { isPlatformAdmin } from "@/lib/authUtils";

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

// ─── Invitation Request Modal ───────────────────────────────────────────────────
const INVESTMENT_FOCUS_OPTIONS = [
  { value: "", label: "Select focus" },
  { value: "residential", label: "Residential" },
  { value: "commercial", label: "Commercial" },
  { value: "land", label: "Land & development" },
  { value: "mixed", label: "Mixed portfolio" },
  { value: "distressed", label: "Distressed / opportunistic" },
];

const DEAL_SIZE_OPTIONS = [
  { value: "", label: "Select range" },
  { value: "100k-500k", label: "€100k – €500k" },
  { value: "500k-2m", label: "€500k – €2M" },
  { value: "2m-5m", label: "€2M – €5M" },
  { value: "5m-15m", label: "€5M – €15M" },
  { value: "15m+", label: "€15M+" },
];

const INVESTMENT_VEHICLE_OPTIONS = [
  { value: "", label: "Select vehicle" },
  { value: "personal", label: "Personal / HNWI" },
  { value: "family_office", label: "Family office" },
  { value: "fund", label: "Fund / PE" },
  { value: "institutional", label: "Institutional" },
  { value: "developer", label: "Developer" },
];

const YEARS_EXPERIENCE_OPTIONS = [
  { value: "", label: "Select" },
  { value: "0-2", label: "0 – 2 years" },
  { value: "3-5", label: "3 – 5 years" },
  { value: "6-10", label: "6 – 10 years" },
  { value: "11-20", label: "11 – 20 years" },
  { value: "20+", label: "20+ years" },
];

const AUM_OPTIONS = [
  { value: "", label: "Select (optional)" },
  { value: "under-1m", label: "Under €1M" },
  { value: "1m-10m", label: "€1M – €10M" },
  { value: "10m-50m", label: "€10M – €50M" },
  { value: "50m-200m", label: "€50M – €200M" },
  { value: "200m+", label: "€200M+" },
];

const SOURCE_OPTIONS = [
  { value: "", label: "How did you hear about us?" },
  { value: "referral", label: "Referral" },
  { value: "search", label: "Search / online" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "event", label: "Event / conference" },
  { value: "press", label: "Press / media" },
  { value: "other", label: "Other" },
];

function InvitationRequestModal({
  user,
  onClose,
  onSuccess,
}: {
  user: { id: string; email?: string } | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [email, setEmail] = useState(user?.email ?? "");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [company, setCompany] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [companyWebsite, setCompanyWebsite] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [investmentFocus, setInvestmentFocus] = useState("");
  const [dealSizeRange, setDealSizeRange] = useState("");
  const [geographicFocus, setGeographicFocus] = useState("");
  const [investmentVehicle, setInvestmentVehicle] = useState("");
  const [yearsExperience, setYearsExperience] = useState("");
  const [aumRange, setAumRange] = useState("");
  const [source, setSource] = useState("");
  const [message, setMessage] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [loading, setLoading] = useState(false);

  const inputCls = "w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors";
  const selectCls = "w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary transition-colors appearance-none";
  const textareaCls = "w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors resize-none";
  const labelCls = "block text-xs text-muted-foreground mb-1.5";
  const FormSection = ({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) => (
    <div className="glass-card rounded-xl border border-border p-5">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Icon className="w-3.5 h-3.5 text-primary" />
        </div>
        <div className="w-1 h-3.5 rounded-full bg-primary" />
        <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">{title}</p>
        <div className="flex-1 h-px bg-border" />
      </div>
      {children}
    </div>
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      toast.error("Please enter your email");
      return;
    }
    if (!fullName.trim()) {
      toast.error("Please enter your full name");
      return;
    }
    if (!termsAccepted) {
      toast.error("Please accept the terms and privacy policy");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.from("invitation_requests" as any).insert({
        email: trimmedEmail,
        full_name: fullName.trim() || null,
        phone: phone.trim() || null,
        company: company.trim() || null,
        job_title: jobTitle.trim() || null,
        company_website: companyWebsite.trim() || null,
        linkedin_url: linkedinUrl.trim() || null,
        investment_focus: investmentFocus || null,
        deal_size_range: dealSizeRange || null,
        geographic_focus: geographicFocus.trim() || null,
        investment_vehicle: investmentVehicle || null,
        years_experience: yearsExperience || null,
        aum_range: aumRange || null,
        source: source || null,
        message: message.trim() || null,
        terms_accepted: termsAccepted,
        user_id: user?.id ?? null,
      });
      if (error) throw error;
      onSuccess();
    } catch (err: unknown) {
      toast.error((err as Error)?.message ?? "Could not submit request");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-md p-4" onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[90vh] flex flex-col glass-card rounded-2xl border border-border shadow-elevated overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="shrink-0 px-6 py-5 border-b border-border bg-card/80">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <MailPlus className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="font-display text-xl font-bold">
                  Request <span className="gradient-text-primary">Quick Sale™</span> Access
                </h3>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Exclusive investor deal flow — by invitation only.
                </p>
              </div>
            </div>
            <button type="button" onClick={onClose} className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors shrink-0">
              <XIcon className="w-4 h-4" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            <FormSection icon={Users} title="Contact information">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Email address *</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" className={inputCls} required />
                </div>
                <div>
                  <label className={labelCls}>Full name *</label>
                  <input type="text" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="John Smith" className={inputCls} required />
                </div>
                <div>
                  <label className={labelCls}>Phone number</label>
                  <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+30 210 123 4567" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>LinkedIn profile</label>
                  <input type="url" value={linkedinUrl} onChange={e => setLinkedinUrl(e.target.value)} placeholder="https://linkedin.com/in/..." className={inputCls} />
                </div>
              </div>
            </FormSection>

            <FormSection icon={Briefcase} title="Professional profile">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Company / fund name *</label>
                  <input type="text" value={company} onChange={e => setCompany(e.target.value)} placeholder="Acme Capital Partners" className={inputCls} required />
                </div>
                <div>
                  <label className={labelCls}>Job title / role</label>
                  <input type="text" value={jobTitle} onChange={e => setJobTitle(e.target.value)} placeholder="Managing Partner, Investment Director" className={inputCls} />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelCls}>Company website</label>
                  <input type="url" value={companyWebsite} onChange={e => setCompanyWebsite(e.target.value)} placeholder="https://..." className={inputCls} />
                </div>
              </div>
            </FormSection>

            <FormSection icon={BarChart2} title="Investment profile">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Primary investment focus</label>
                  <select value={investmentFocus} onChange={e => setInvestmentFocus(e.target.value)} className={selectCls}>
                    {INVESTMENT_FOCUS_OPTIONS.map(o => <option key={o.value || "empty"} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Typical deal size</label>
                  <select value={dealSizeRange} onChange={e => setDealSizeRange(e.target.value)} className={selectCls}>
                    {DEAL_SIZE_OPTIONS.map(o => <option key={o.value || "empty"} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Investment vehicle</label>
                  <select value={investmentVehicle} onChange={e => setInvestmentVehicle(e.target.value)} className={selectCls}>
                    {INVESTMENT_VEHICLE_OPTIONS.map(o => <option key={o.value || "empty"} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Years of RE experience</label>
                  <select value={yearsExperience} onChange={e => setYearsExperience(e.target.value)} className={selectCls}>
                    {YEARS_EXPERIENCE_OPTIONS.map(o => <option key={o.value || "empty"} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>AUM range (optional)</label>
                  <select value={aumRange} onChange={e => setAumRange(e.target.value)} className={selectCls}>
                    {AUM_OPTIONS.map(o => <option key={o.value || "empty"} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>How did you hear about us?</label>
                  <select value={source} onChange={e => setSource(e.target.value)} className={selectCls}>
                    {SOURCE_OPTIONS.map(o => <option key={o.value || "empty"} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className={labelCls}>Geographic focus / target markets</label>
                  <input type="text" value={geographicFocus} onChange={e => setGeographicFocus(e.target.value)} placeholder="e.g. Athens, Greek mainland, Balkans, Europe" className={inputCls} />
                </div>
              </div>
            </FormSection>

            <FormSection icon={MessageCircle} title="Additional information">
              <div>
                <label className={labelCls}>Tell us about your investment strategy and why you are interested in Quick Sale™ (optional)</label>
                <textarea value={message} onChange={e => setMessage(e.target.value)} rows={4} placeholder="E.g. focus on distressed residential, value-add commercial, off-market deals, target yields..." className={textareaCls} />
              </div>
            </FormSection>

            <div className="glass-card rounded-xl border border-primary/20 bg-primary/5 p-4">
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" checked={termsAccepted} onChange={e => setTermsAccepted(e.target.checked)} className="mt-1 rounded border-border text-primary focus:ring-primary w-4 h-4" />
                <span className="text-xs text-muted-foreground">
                  I confirm that the information provided is accurate. I agree to the{" "}
                  <Link to="/privacy-policy" target="_blank" className="text-primary hover:underline">Privacy Policy</Link>
                  {" "}and{" "}
                  <Link to="/terms-of-service" target="_blank" className="text-primary hover:underline">Terms of Service</Link>
                  . I understand that Quick Sale™ access is discretionary, that being a Pro subscriber does not guarantee a position as an investor, and that mAI Prop may contact me regarding this request.
                </span>
              </label>
            </div>
          </div>

          <div className="shrink-0 px-6 py-4 border-t border-border bg-card/60 flex gap-3">
            <Button type="submit" className="flex-1 h-11 font-semibold bg-gradient-primary border-0 text-primary-foreground" disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Submit request"}
            </Button>
            <Button type="button" variant="outline" onClick={onClose} className="h-11 border-border">
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Quick Sale access is invitation-only — no tier pricing

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
  const canAccessDealFlow = isPlatformAdmin(profile) || (subscribed && isInvestorType);
  const [showGate, setShowGate] = useState(false);
  const [selectedTier, setSelectedTier] = useState<string | null>(null);
  const [showInvitationModal, setShowInvitationModal] = useState(false);

  // Invitation request pending state
  const [invitationStatus, setInvitationStatus] = useState<"none" | "pending" | "rejected">("none");

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

  // Check if user already has a pending/rejected invitation request
  useEffect(() => {
    if (!user) return;
    supabase
      .from("invitation_requests" as any)
      .select("status")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        const row = data as { status?: string } | null;
        if (row?.status === "pending") setInvitationStatus("pending");
        else if (row?.status === "rejected") setInvitationStatus("rejected");
        else setInvitationStatus("none");
      });
  }, [user]);

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

  // Load investor feed — only deals admin has published to main dashboard
  useEffect(() => {
    const loadDeals = async () => {
      setLoading(true);
      try {
        const { data } = await supabase
          .from("firesale_requests_investor_feed")
          .select("*")
          .neq("status", "pending")
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
      } catch (e) {
        setLiveDeals([]);
        toast.error("Could not load deals. Please try again.");
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
                  <button
                    type="button"
                    onClick={() => subscribed ? setShowInvitationModal(true) : navigate("/pricing")}
                    className="inline-flex items-center gap-1.5 text-xs bg-primary/10 border border-primary/20 text-primary px-3 py-1.5 rounded-full font-semibold hover:bg-primary/20 transition-colors"
                  >
                    <MailPlus className="w-3 h-3" />
                    {subscribed ? "Request invitation" : "Pro required to apply"}
                  </button>
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
          <div className="border-b border-destructive/30 bg-gradient-to-r from-destructive/10 via-destructive/5 to-transparent">
            <div className="container py-4">
              <div className="flex items-start gap-4 flex-wrap">
                {/* Icon + countdown circle */}
                <div className="relative shrink-0 w-12 h-12 flex items-center justify-center">
                  <svg className="absolute inset-0 w-12 h-12 -rotate-90" viewBox="0 0 48 48">
                    <circle cx="24" cy="24" r="20" fill="none" stroke="hsl(var(--destructive)/0.15)" strokeWidth="4" />
                    <circle
                      cx="24" cy="24" r="20"
                      fill="none"
                      stroke="hsl(var(--destructive))"
                      strokeWidth="4"
                      strokeLinecap="round"
                      strokeDasharray={`${2 * Math.PI * 20}`}
                      strokeDashoffset={`${2 * Math.PI * 20 * (1 - (daysLeft ?? 0) / 7)}`}
                      className="transition-all duration-500"
                    />
                  </svg>
                  <span className="relative font-display font-black text-xs text-destructive">{daysLeft}</span>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
                    <p className="text-sm text-destructive font-bold">
                      Your <span className="capitalize">{subscription?.tier}</span> access expires in{" "}
                      {daysLeft === 0 ? "less than 1 day" : `${daysLeft} day${daysLeft === 1 ? "" : "s"}`}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Submit a renewal request to maintain uninterrupted access to the deal pipeline.
                  </p>
                  {/* Progress bar */}
                  <div className="mt-2.5 w-full max-w-xs h-1.5 rounded-full bg-destructive/15 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-destructive transition-all duration-700"
                      style={{ width: `${((daysLeft ?? 0) / 7) * 100}%` }}
                    />
                  </div>
                </div>

                <Button
                  size="sm"
                  className="bg-destructive hover:bg-destructive/90 text-destructive-foreground text-xs h-9 px-4 shrink-0 font-semibold"
                  onClick={() => setShowInvitationModal(true)}
                >
                  Request renewal
                </Button>
              </div>
            </div>
          </div>
        )}

        <div className="container py-8">

          {/* ─────────────── REQUEST ACCESS SECTION (non-subscribed logged-in users) ─────────────── */}
          {!canAccessDealFlow && user && (
            <div className={`mb-8 relative glass-card rounded-2xl overflow-hidden ${
              invitationStatus === "pending"
                ? "border border-brand-gold/30"
                : invitationStatus === "rejected"
                ? "border border-destructive/30"
                : "border border-primary/30"
            }`}>
              {/* Background glow */}
              <div className="absolute inset-0 pointer-events-none" style={{
                background: invitationStatus === "pending"
                  ? "radial-gradient(ellipse 60% 80% at 0% 50%, hsl(var(--brand-gold)/0.06), transparent 60%)"
                  : invitationStatus === "rejected"
                  ? "radial-gradient(ellipse 60% 80% at 0% 50%, hsl(var(--destructive)/0.06), transparent 60%)"
                  : "radial-gradient(ellipse 60% 80% at 0% 50%, hsl(var(--primary)/0.06), transparent 60%), radial-gradient(ellipse 40% 60% at 100% 30%, hsl(var(--accent)/0.05), transparent 60%)"
              }} />
              <div className="relative px-6 py-7 sm:px-8 sm:py-9">
                <div className="flex flex-col lg:flex-row lg:items-center gap-6 lg:gap-10">
                  {/* Left: Invitation badge + heading */}
                  <div className="flex-1 min-w-0">
                    {invitationStatus === "pending" ? (
                      <>
                        <div className="inline-flex items-center gap-2 bg-brand-gold/10 border border-brand-gold/30 text-brand-gold px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest mb-4">
                          <Clock className="w-3 h-3" />
                          Application under review
                        </div>
                        <h2 className="font-display text-xl sm:text-2xl font-black mb-2">
                          Your Application is <span className="text-brand-gold">Pending</span>
                        </h2>
                        <p className="text-sm text-muted-foreground leading-relaxed max-w-lg">
                          We've received your request and our team is reviewing your investor profile. You'll be notified by email once a decision is made — typically within 48 hours.
                        </p>
                        <div className="flex items-center gap-2 mt-5">
                          <div className="w-2 h-2 rounded-full bg-brand-gold animate-pulse" />
                          <span className="text-xs text-muted-foreground">Application pending — we'll contact you by email</span>
                        </div>
                      </>
                    ) : invitationStatus === "rejected" ? (
                      <>
                        <div className="inline-flex items-center gap-2 bg-destructive/10 border border-destructive/30 text-destructive px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest mb-4">
                          <Ban className="w-3 h-3" />
                          Application not approved
                        </div>
                        <h2 className="font-display text-xl sm:text-2xl font-black mb-2">
                          Access <span className="text-destructive">Not Granted</span>
                        </h2>
                        <p className="text-sm text-muted-foreground leading-relaxed max-w-lg">
                          Your previous application was not approved at this time. If your circumstances have changed, you are welcome to submit a new request.
                        </p>
                      </>
                    ) : (
                      <>
                        <div className="inline-flex items-center gap-2 bg-primary/10 border border-primary/20 text-primary px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest mb-4">
                          <Lock className="w-3 h-3" />
                          Invitation-only access
                        </div>
                        <h2 className="font-display text-xl sm:text-2xl font-black mb-2">
                          Request Access to the <span className="gradient-text-primary">Deal Flow</span>
                        </h2>
                        <p className="text-sm text-muted-foreground leading-relaxed max-w-lg">
                          Quick Sale™ deal flow is exclusively available to verified investors and institutional buyers.
                          {subscribed ? (
                            "Submit your profile and our team will review your application. Being a Pro subscriber does not guarantee a position as an investor — access is by invitation only."
                          ) : (
                            "You must be a Pro subscriber (as a buyer) before you can apply for Quick Sale™ access. Upgrade on Pricing."
                          )}
                        </p>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
                          {[
                            { icon: "🔒", label: "Pro required to apply" },
                            { icon: "✅", label: "Admin-vetted" },
                            { icon: "⚡", label: "48h response" },
                            { icon: "🤝", label: "NDA protected" },
                          ].map(f => (
                            <div key={f.label} className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span className="text-base leading-none">{f.icon}</span>
                              {f.label}
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                  {/* Right: CTA or status */}
                  <div className="shrink-0 flex flex-col items-start lg:items-end gap-3 lg:min-w-[200px]">
                    {invitationStatus === "pending" ? (
                      <div className="flex flex-col items-start lg:items-end gap-2">
                        <div className="inline-flex items-center gap-2.5 bg-brand-gold/10 border border-brand-gold/30 text-brand-gold px-5 py-3 rounded-xl font-bold text-sm">
                          <Clock className="w-4 h-4 shrink-0" />
                          Application pending
                        </div>
                        <p className="text-[11px] text-muted-foreground text-right max-w-[200px]">
                          No action needed — we'll reach out once your application is reviewed.
                        </p>
                      </div>
                    ) : invitationStatus === "rejected" ? (
                      <div className="flex flex-col items-start lg:items-end gap-2">
                        <Button
                          className="bg-secondary border border-border text-foreground h-12 px-7 text-sm font-bold hover:bg-muted"
                          onClick={() => setShowInvitationModal(true)}
                        >
                          <MailPlus className="w-4 h-4 mr-2" />
                          Re-apply
                        </Button>
                        <p className="text-[11px] text-muted-foreground">
                          Submit a new application for consideration.
                        </p>
                      </div>
                    ) : subscribed ? (
                      <>
                        <Button
                          className="bg-gradient-primary border-0 text-primary-foreground h-12 px-7 text-sm font-bold shadow-elevated"
                          onClick={() => setShowInvitationModal(true)}
                        >
                          <MailPlus className="w-4 h-4 mr-2" />
                          Request an Invitation
                        </Button>
                        <p className="text-[11px] text-muted-foreground">
                          Pro required to apply. Access is invitation-only — approval not guaranteed.
                        </p>
                      </>
                    ) : (
                      <>
                        <Button
                          className="bg-secondary border border-border text-foreground h-12 px-7 text-sm font-bold hover:bg-muted"
                          asChild
                        >
                          <Link to="/pricing">
                            <ExternalLink className="w-4 h-4 mr-2" />
                            Upgrade to Pro
                          </Link>
                        </Button>
                        <p className="text-[11px] text-muted-foreground">
                          You must be a Pro subscriber (as a buyer) before you can apply.
                        </p>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

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
                      <h4 className="font-display font-bold text-sm mb-1">Quick Sale™ access is by invitation only</h4>
                      {invitationStatus === "pending" ? (
                        <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
                          Your application is <strong className="text-brand-gold">under review</strong>. We'll contact you by email within 48 hours.
                        </p>
                      ) : invitationStatus === "rejected" ? (
                        <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
                          Your previous application wasn't approved. You may re-apply below.
                        </p>
                      ) : subscribed ? (
                        <p className="text-xs text-muted-foreground mb-3 leading-relaxed">Request an invitation to join the deal flow and get seller contacts, full AI reports, and real-time deal alerts. Being Pro does not guarantee approval.</p>
                      ) : (
                        <p className="text-xs text-muted-foreground mb-3 leading-relaxed">You must have an active Pro subscription to apply. <Link to="/pricing" className="text-primary hover:underline">Renew or upgrade on Pricing</Link>.</p>
                      )}
                      {invitationStatus === "pending" ? (
                        <div className="flex items-center gap-2 text-xs text-brand-gold font-semibold">
                          <Clock className="w-3.5 h-3.5" /> Application pending — we'll be in touch
                        </div>
                      ) : invitationStatus === "rejected" ? (
                        <Button className="w-full bg-gradient-primary border-0 text-primary-foreground text-xs h-9" onClick={() => setShowInvitationModal(true)}>
                          <MailPlus className="w-3.5 h-3.5 mr-1.5" />
                          Re-apply for access
                        </Button>
                      ) : subscribed ? (
                        <Button className="w-full bg-gradient-primary border-0 text-primary-foreground text-xs h-9" onClick={() => setShowInvitationModal(true)}>
                          <MailPlus className="w-3.5 h-3.5 mr-1.5" />
                          Request invitation
                        </Button>
                      ) : (
                        <Button className="w-full bg-secondary border border-border text-foreground text-xs h-9" asChild>
                          <Link to="/pricing">
                            <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                            Renew subscription to apply
                          </Link>
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Admin features moved to /admin — see /admin */}


        {/* ── Request Invitation modal ── */}
        {showInvitationModal && (
          <InvitationRequestModal
            user={user}
            onClose={() => setShowInvitationModal(false)}
            onSuccess={() => {
              setShowInvitationModal(false);
              setInvitationStatus("pending");
              toast.success("Invitation request submitted. We'll be in touch within 48 hours.");
            }}
          />
        )}
      </div>
      <Footer />
    </div>
    </div>
  );
}
