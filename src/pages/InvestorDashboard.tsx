import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  BarChart2,
  CheckCircle2,
  Crown,
  FileCheck,
  Flame,
  Loader2,
  Lock,
  MapPin,
  RefreshCw,
  SlidersHorizontal,
  Upload,
  X as XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { supabase } from "@/integrations/supabase/client";
import { profileRoleSwitchInProgress, useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { isPlatformAdmin } from "@/lib/authUtils";
import { formatPrice, formatTimeAgo } from "@/lib/format";
import {
  hasPriorityProof,
  isActiveReservation,
  type FiresaleInterestEntry,
  useExpressInterest,
  useMyFiresaleInterests,
} from "@/hooks/useFiresaleInterest";
import { InvitationRequestModal } from "@/components/InvitationRequestModal";
import { PROPERTY_TYPE_COLORS as TYPE_COLORS, URGENCY_COLORS } from "@/lib/statusColors";
import { InvestorHeroHeader } from "@/components/investor/InvestorHeroHeader";
import { InvestorExpiryBanner } from "@/components/investor/InvestorExpiryBanner";
import { InvestorAccessGate } from "@/components/investor/InvestorAccessGate";
import { InvestorSidebarAnalytics } from "@/components/investor/InvestorSidebarAnalytics";

type Subscription = {
  id: string;
  user_id: string;
  tier: "private" | "institutional" | "developer";
  status: "active" | "cancelled" | "expired" | "trial";
  started_at: string;
  expires_at: string | null;
};

type LiveDeal = {
  id: string;
  address: string;
  city: string;
  property_type: string;
  sqm: number;
  bedrooms: number | null;
  condition: string | null;
  ai_estimate: number;
  asking_price: number;
  discount_pct: number;
  status: string;
  created_at: string;
  urgency: "HIGH" | "MEDIUM" | "LOW";
  reason: string;
  roi_est: number;
};

function daysUntilExpiry(expiresAt: string | null): number | null {
  if (!expiresAt) return null;
  const diff = new Date(expiresAt).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function formatHoldTime(expiresAt: string | null) {
  if (!expiresAt) return null;
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "Expired";
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  if (hours <= 0) return `${minutes}m left`;
  return `${hours}h ${minutes}m left`;
}

function getInterestBadge(entry: FiresaleInterestEntry) {
  if (isActiveReservation(entry)) {
    return {
      label: `Reserved for you${entry.reservation_expires_at ? ` · ${formatHoldTime(entry.reservation_expires_at)}` : ""}`,
      className: "bg-brand-gold/15 border-brand-gold/30 text-brand-gold",
      detail: "You currently hold the live first-look reservation window on this opportunity.",
    };
  }

  if (entry.status === "engaged" || entry.status === "won") {
    return {
      label: entry.status === "won" ? "Closed with you" : "In negotiation",
      className: "bg-emerald-500/10 border-emerald-500/30 text-emerald-700",
      detail: "This opportunity has moved beyond the open investor queue.",
    };
  }

  if (entry.status === "prioritized") {
    return {
      label: "Priority queue",
      className: "bg-primary/10 border-primary/30 text-primary",
      detail: "Proof-backed interest ranks ahead of standard expressions of interest.",
    };
  }

  if (entry.status === "expired") {
    return {
      label: "Hold expired",
      className: "bg-muted border-border text-muted-foreground",
      detail: "Your previous hold lapsed. You can rejoin the queue if you still want the deal.",
    };
  }

  if (entry.status === "passed") {
    return {
      label: "Passed for now",
      className: "bg-muted border-border text-muted-foreground",
      detail: "This opportunity is no longer active for your account unless you re-enter the queue.",
    };
  }

  return {
    label: hasPriorityProof(entry) ? "Interest registered · POF on file" : "Interest registered",
    className: "bg-emerald-500/10 border-emerald-500/30 text-emerald-700",
    detail: hasPriorityProof(entry)
      ? "Your proof of funds is attached and waiting for admin verification."
      : "You are in the queue, but proof-backed investors are ranked first.",
  };
}

export default function InvestorDashboard() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: subscription = null } = useQuery<Subscription | null>({
    queryKey: ["investor-subscription", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase
        .from("investor_subscriptions")
        .select("id, user_id, tier, status, started_at, expires_at")
        .eq("user_id", user.id)
        .maybeSingle();
      return (data as Subscription | null) ?? null;
    },
    enabled: !!user,
  });

  const { data: invitationStatusRow } = useQuery<string>({
    queryKey: ["invitation-status", user?.id],
    queryFn: async () => {
      if (!user) return "none";
      const { data } = await supabase
        .from("invitation_requests")
        .select("status")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const row = data as { status?: string } | null;
      if (row?.status === "pending") return "pending";
      if (row?.status === "approved") return "approved";
      if (row?.status === "rejected") return "rejected";
      return "none";
    },
    enabled: !!user,
  });
  const invitationStatus = (invitationStatusRow ?? "none") as "none" | "pending" | "approved" | "rejected";

  const subscribed = subscription?.status === "active" || subscription?.status === "trial";
  const isInvestorDealFlowRole =
    !profileRoleSwitchInProgress(profile) &&
    (profile?.role === "investor" || profile?.role === "institutional");
  const canAccessDealFlow = isPlatformAdmin(profile) || (isInvestorDealFlowRole && subscribed);
  const [showInvitationModal, setShowInvitationModal] = useState(false);

  const daysLeft = daysUntilExpiry(subscription?.expires_at ?? null);
  const showExpiryWarning = subscribed && daysLeft !== null && daysLeft <= 7 && daysLeft >= 0;

  const [filterCity, setFilterCity] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [filterUrgency, setFilterUrgency] = useState("all");

  const [interestDealId, setInterestDealId] = useState<string | null>(null);
  const [interestMessage, setInterestMessage] = useState("");
  const [interestProofFile, setInterestProofFile] = useState<File | null>(null);
  const [interestProofAmount, setInterestProofAmount] = useState("");
  const interestFileRef = useRef<HTMLInputElement>(null);
  const interestCloseButtonRef = useRef<HTMLButtonElement>(null);
  const interestDialogRef = useRef<HTMLDivElement>(null);
  const interestReturnFocusRef = useRef<HTMLElement | null>(null);
  const { data: myInterestsMap = new Map<string, FiresaleInterestEntry>() } = useMyFiresaleInterests();
  const expressInterest = useExpressInterest();

  const {
    data: liveDeals = [],
    isError: liveDealsFailed,
    isLoading: loading,
    refetch: refetchLiveDeals,
  } = useQuery<LiveDeal[]>({
    queryKey: ["investor-deal-feed", profile?.role],
    queryFn: async () => {
      const isAdmin = isPlatformAdmin(profile);
      const query = isAdmin
        ? supabase
            .from("firesale_requests")
            .select("id, address, city, property_type, sqm, bedrooms, condition, ai_estimate, asking_price, status, created_at")
            .neq("status", "pending")
        : supabase
            .from("firesale_requests_investor_feed")
            .select("id, address, city, property_type, sqm, asking_price, status, created_at");

      const { data, error } = await query.order("created_at", { ascending: false }).limit(50);
      if (error) throw error;

      return (data || []).map((deal) => {
        const d = deal as {
          id: string;
          address: string;
          city: string;
          property_type: string | null;
          sqm: number | null;
          bedrooms?: number | null;
          condition?: string | null;
          ai_estimate?: number | null;
          asking_price?: number | null;
          status: string | null;
          created_at: string;
          days_on_market?: number | null;
        };
        const aiVal = Number(d.ai_estimate || 0);
        const askingPrice = Number(d.asking_price || d.ai_estimate || 0);
        const daysOnMarket = Number(d.days_on_market || 0);
        const hasAiVal = aiVal > 0 && askingPrice > 0;
        const discountFrac = hasAiVal ? (aiVal - askingPrice) / askingPrice : 0;
        const discountPct = hasAiVal ? Number(((1 - askingPrice / aiVal) * 100).toFixed(1)) : 12;
        let urgency: "HIGH" | "MEDIUM" | "LOW";
        if (hasAiVal && discountFrac > 0.15) urgency = "HIGH";
        else if (daysOnMarket > 60) urgency = "HIGH";
        else if (hasAiVal && discountFrac < 0.05) urgency = "LOW";
        else urgency = "MEDIUM";

        const roiRaw = hasAiVal ? Math.round((((aiVal - askingPrice) / askingPrice) * 100) * 10) / 10 : 0;
        const roiEst = Math.min(40, Math.max(0, roiRaw));
        let reason: string;
        if (!hasAiVal) reason = "Published quick-sale opportunity";
        else if (discountFrac > 0.15) reason = "Significantly below market";
        else if (discountFrac >= 0.05) reason = "Below market value";
        else reason = "Near market price";

        return {
          id: d.id,
          address: d.address,
          city: d.city,
          property_type: d.property_type || "apartment",
          sqm: Number(d.sqm || 0),
          bedrooms: d.bedrooms ?? null,
          condition: d.condition ?? null,
          ai_estimate: aiVal,
          asking_price: askingPrice,
          discount_pct: discountPct,
          status: d.status || "reviewed",
          created_at: d.created_at,
          urgency,
          reason,
          roi_est: roiEst,
        };
      });
    },
    enabled: canAccessDealFlow && !!profile,
  });

  const cities = ["all", ...Array.from(new Set(liveDeals.map((deal) => deal.city)))];
  const types = ["all", "apartment", "villa", "house", "commercial", "land", "office"];

  const filtered = liveDeals.filter((deal) => {
    if (filterCity !== "all" && deal.city !== filterCity) return false;
    if (filterType !== "all" && deal.property_type !== filterType) return false;
    if (filterUrgency !== "all" && deal.urgency !== filterUrgency) return false;
    return true;
  });

  const cityBreakdown = useMemo(() => {
    if (liveDeals.length === 0) return [];
    const byCity = liveDeals.reduce<Record<string, { count: number; value: number }>>((acc, deal) => {
      const city = deal.city || "Other";
      if (!acc[city]) acc[city] = { count: 0, value: 0 };
      acc[city].count += 1;
      acc[city].value += deal.asking_price || 0;
      return acc;
    }, {});
    const total = liveDeals.length;
    return Object.entries(byCity)
      .map(([city, { count, value }]) => ({
        city,
        deals: count,
        value: formatPrice(value),
        pct: total ? Math.round((count / total) * 100) : 0,
      }))
      .sort((a, b) => b.deals - a.deals)
      .slice(0, 5);
  }, [liveDeals]);

  const typeBreakdown = useMemo(() => {
    if (liveDeals.length === 0) return [];
    const byType = liveDeals.reduce<Record<string, number>>((acc, deal) => {
      const type = (deal.property_type || "other").toLowerCase();
      acc[type] = (acc[type] || 0) + 1;
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

  const totalValue = liveDeals.reduce((sum, deal) => sum + (deal.asking_price || 0), 0);
  const avgDiscount = liveDeals.length
    ? (liveDeals.reduce((sum, deal) => sum + (deal.discount_pct || 0), 0) / liveDeals.length).toFixed(1)
    : "0";
  const avgRoi = liveDeals.length
    ? (liveDeals.reduce((sum, deal) => sum + (deal.roi_est || 0), 0) / liveDeals.length).toFixed(1)
    : "0";

  const marketPulse = useMemo(() => {
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const newThisWeek = liveDeals.filter((deal) => new Date(deal.created_at).getTime() >= sevenDaysAgo).length;
    const dealsWithAi = liveDeals.filter((deal) => deal.ai_estimate > 0 && deal.asking_price > 0);
    const avgDiscountVsAi = dealsWithAi.length
      ? (
          dealsWithAi.reduce((sum, deal) => sum + (((deal.ai_estimate - deal.asking_price) / deal.asking_price) * 100), 0) /
          dealsWithAi.length
        ).toFixed(1)
      : null;
    return { newThisWeek, avgDiscountVsAi };
  }, [liveDeals]);

  const openInterest = (dealId: string) => {
    interestReturnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setInterestDealId(dealId);
  };

  const closeInterest = () => {
    setInterestDealId(null);
    setInterestMessage("");
    setInterestProofFile(null);
    setInterestProofAmount("");
    window.setTimeout(() => interestReturnFocusRef.current?.focus(), 0);
  };

  useEffect(() => {
    if (!interestDealId) return;
    interestCloseButtonRef.current?.focus();
  }, [interestDealId]);

  const handleInterestDialogKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      closeInterest();
      return;
    }

    if (event.key !== "Tab") return;

    const focusable = interestDialogRef.current?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    const items = Array.from(focusable ?? []).filter((item) => item.offsetParent !== null || item === document.activeElement);
    if (items.length === 0) return;

    const first = items[0];
    const last = items[items.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
      return;
    }

    if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="min-h-screen bg-background" data-testid="investor-dashboard">
      <Navbar />
      <div className="pt-16">
        <InvestorHeroHeader
          dealsCount={liveDeals.length}
          totalValue={totalValue}
          avgDiscount={avgDiscount}
          avgRoi={avgRoi}
          subscription={subscription}
          subscribed={subscribed}
          showInviteCta={!canAccessDealFlow}
          onInviteClick={() => setShowInvitationModal(true)}
        />

        {showExpiryWarning && daysLeft !== null && (
          <InvestorExpiryBanner
            daysLeft={daysLeft}
            tier={subscription?.tier ?? ""}
            onRenewClick={() => setShowInvitationModal(true)}
          />
        )}

        <div className="container py-8">
          {!canAccessDealFlow && user && (
            <InvestorAccessGate
              invitationStatus={invitationStatus}
              onRequestClick={() => setShowInvitationModal(true)}
            />
          )}

          <div className="grid lg:grid-cols-[1fr_300px] gap-8">
            <div className="space-y-5">
              <div className="flex items-center gap-3 flex-wrap" data-testid="investor-filters">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  <span className="font-semibold">Filter:</span>
                </div>
                <label htmlFor="investor-filter-city" className="sr-only">Filter deals by city</label>
                <select id="investor-filter-city" value={filterCity} onChange={(e) => setFilterCity(e.target.value)} className="bg-muted border border-border rounded-lg px-3 py-1.5 text-xs text-foreground outline-none focus:border-primary capitalize">
                  {cities.map((city) => (
                    <option key={city} value={city} className="bg-card capitalize">
                      {city === "all" ? "All cities" : city}
                    </option>
                  ))}
                </select>
                <label htmlFor="investor-filter-type" className="sr-only">Filter deals by property type</label>
                <select id="investor-filter-type" value={filterType} onChange={(e) => setFilterType(e.target.value)} className="bg-muted border border-border rounded-lg px-3 py-1.5 text-xs text-foreground outline-none focus:border-primary capitalize">
                  {types.map((type) => (
                    <option key={type} value={type} className="bg-card capitalize">
                      {type === "all" ? "All types" : type}
                    </option>
                  ))}
                </select>
                <label htmlFor="investor-filter-urgency" className="sr-only">Filter deals by urgency</label>
                <select id="investor-filter-urgency" value={filterUrgency} onChange={(e) => setFilterUrgency(e.target.value)} className="bg-muted border border-border rounded-lg px-3 py-1.5 text-xs text-foreground outline-none focus:border-primary">
                  <option value="all" className="bg-card">All urgency</option>
                  <option value="HIGH" className="bg-card">High</option>
                  <option value="MEDIUM" className="bg-card">Medium</option>
                  <option value="LOW" className="bg-card">Low</option>
                </select>
                <span className="text-[10px] text-muted-foreground ml-auto">{filtered.length} deals found</span>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-20">
                  <RefreshCw className="w-6 h-6 text-muted-foreground animate-spin" />
                </div>
              ) : liveDealsFailed ? (
                <div className="glass-card rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center" data-testid="investor-deal-feed-error">
                  <p className="font-display font-bold text-base text-foreground">Deal feed could not load</p>
                  <p className="text-xs text-muted-foreground mt-2 max-w-md mx-auto">
                    We could not refresh the investor deal feed. Please retry before making investment decisions from this view.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-4"
                    onClick={() => void refetchLiveDeals()}
                  >
                    <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                    Retry
                  </Button>
                </div>
              ) : (
                <div className="space-y-3" data-testid="investor-deal-list">
                  {filtered.map((deal, idx) => {
                    const isBlurred = !canAccessDealFlow && idx >= 2;
                    const myInterest = myInterestsMap.get(deal.id);
                    const interestBadge = myInterest ? getInterestBadge(myInterest) : null;
                    const canRejoinQueue = myInterest ? ["passed", "expired"].includes(myInterest.status) : false;

                    return (
                      <div key={deal.id} className={`relative glass-card rounded-2xl border border-border overflow-hidden transition-all duration-200 ${!isBlurred ? "hover:border-primary/30" : ""}`}>
                        {isBlurred && (
                          <div className="absolute inset-0 backdrop-blur-md bg-background/60 z-10 flex flex-col items-center justify-center gap-3">
                            <Lock className="w-6 h-6 text-muted-foreground" />
                            <p className="text-xs text-muted-foreground font-semibold">Subscribe to unlock this deal</p>
                            <Button size="sm" className="bg-gradient-primary border-0 text-primary-foreground text-xs h-8" onClick={() => navigate("/pricing?audience=investor")}>
                              View Plans
                            </Button>
                          </div>
                        )}

                        <div className={`p-5 ${isBlurred ? "select-none pointer-events-none" : ""}`}>
                          <div className="flex items-start justify-between gap-4 flex-wrap">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-2 flex-wrap">
                                <span className={`text-[10px] font-bold uppercase tracking-widest border px-2 py-0.5 rounded-full ${URGENCY_COLORS[deal.urgency]}`}>
                                  {deal.urgency} urgency
                                </span>
                                <span className="text-[10px] font-semibold text-muted-foreground bg-muted border border-border px-2 py-0.5 rounded-full capitalize">
                                  {deal.property_type}
                                </span>
                                {interestBadge && (
                                  <span className={`text-[10px] font-bold border px-2 py-0.5 rounded-full ${interestBadge.className}`}>
                                    {interestBadge.label}
                                  </span>
                                )}
                                <span className="text-[10px] text-muted-foreground">{formatTimeAgo(deal.created_at)}</span>
                              </div>

                              <div className="flex items-center gap-1.5 mb-1">
                                <MapPin className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                <h3 className="font-display font-bold text-base">{deal.address}</h3>
                              </div>

                              <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                                <span>{deal.sqm} m2</span>
                                {deal.bedrooms && <span>{deal.bedrooms} bed</span>}
                                {deal.condition && <span className="capitalize">{deal.condition} condition</span>}
                                {deal.condition && <span className="text-muted-foreground/50">•</span>}
                                <span className="italic">{deal.reason}</span>
                              </div>

                              {interestBadge && (
                                <p className="mt-2 text-[11px] text-muted-foreground">{interestBadge.detail}</p>
                              )}
                            </div>

                            <div className="text-right shrink-0">
                              <div className="text-[10px] text-muted-foreground uppercase tracking-widest mb-0.5">Asking</div>
                              <div className="font-display font-black text-xl text-foreground">
                                {formatPrice(deal.asking_price)}
                              </div>
                              {deal.ai_estimate > 0 && (
                                <div className="text-[10px] text-muted-foreground mt-0.5">
                                  AI value: {formatPrice(deal.ai_estimate)}
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="grid grid-cols-4 gap-2 mt-4 pt-4 border-t border-border">
                            <div className="text-center">
                              <p className="font-black text-sm text-brand-emerald">-{deal.discount_pct}%</p>
                              <p className="text-[9px] text-muted-foreground uppercase tracking-wider mt-0.5">Discount</p>
                            </div>
                            <div className="text-center">
                              <p className="font-black text-sm text-brand-gold">{deal.roi_est}%</p>
                              <p className="text-[9px] text-muted-foreground uppercase tracking-wider mt-0.5">ROI Est.</p>
                            </div>
                            <div className="text-center">
                              <p className="font-black text-sm text-primary">{formatPrice(Math.round(deal.asking_price / Math.max(deal.sqm, 1)))}</p>
                              <p className="text-[9px] text-muted-foreground uppercase tracking-wider mt-0.5">Per m2</p>
                            </div>
                            <div className="text-center">
                              <p className="font-black text-sm text-foreground">48h</p>
                              <p className="text-[9px] text-muted-foreground uppercase tracking-wider mt-0.5">Close</p>
                            </div>
                          </div>

                          {!isBlurred && (
                            <div className="flex gap-2 mt-4">
                              {canAccessDealFlow ? (
                                myInterest && !canRejoinQueue ? (
                                  <div className={`flex-1 flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold ${interestBadge?.className ?? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700"}`}>
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    {interestBadge?.label ?? "Interest registered"}
                                    {hasPriorityProof(myInterest) && (
                                      <span className="ml-auto text-[10px] bg-brand-gold/20 text-brand-gold px-1.5 py-0.5 rounded-full font-bold">POF</span>
                                    )}
                                  </div>
                                ) : (
                                  <Button size="sm" className="bg-gradient-primary border-0 text-primary-foreground text-xs h-8 flex-1" onClick={() => openInterest(deal.id)}>
                                    <Flame className="w-3 h-3 mr-1" />
                                    {canRejoinQueue ? "Rejoin Queue" : "Express Interest"}
                                  </Button>
                                )
                              ) : (
                                <Button size="sm" className="bg-gradient-primary border-0 text-primary-foreground text-xs h-8 flex-1" onClick={() => navigate("/pricing?audience=investor")}>
                                  <Lock className="w-3 h-3 mr-1" />
                                  Unlock Deal Flow
                                </Button>
                              )}

                              <Button
                                size="sm"
                                variant="outline"
                                className="border-border text-xs h-8"
                                onClick={() => {
                                  if (!canAccessDealFlow) {
                                    navigate("/pricing?audience=investor");
                                    return;
                                  }
                                  const visibleDeals = filtered.filter((_, itemIdx) => canAccessDealFlow || itemIdx < 2);
                                  const reportData = visibleDeals.map((entry) => ({
                                    id: entry.id,
                                    address: entry.address,
                                    city: entry.city,
                                    asking_price: entry.asking_price,
                                    roi_est: entry.roi_est,
                                    urgency: entry.urgency,
                                  }));
                                  const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: "application/json" });
                                  const url = URL.createObjectURL(blob);
                                  const anchor = document.createElement("a");
                                  anchor.href = url;
                                  anchor.download = `maiprop-deal-report-${new Date().toISOString().slice(0, 10)}.json`;
                                  anchor.click();
                                  URL.revokeObjectURL(url);
                                }}
                              >
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
                  <Button className="bg-gradient-primary border-0 text-primary-foreground" onClick={() => navigate("/pricing?audience=investor")}>
                    Unlock Full Deal Flow
                  </Button>
                </div>
              )}
            </div>

            {interestDealId && (() => {
              const deal = liveDeals.find((entry) => entry.id === interestDealId);
              return (
                <div
                  className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="express-interest-title"
                  aria-describedby="express-interest-description"
                  onKeyDown={handleInterestDialogKeyDown}
                >
                  <div ref={interestDialogRef} className="glass-card rounded-2xl border border-border w-full max-w-md p-6 space-y-5 shadow-elevated">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 id="express-interest-title" className="font-display font-bold text-lg">Express Interest</h3>
                        <p id="express-interest-description" className="text-xs text-muted-foreground mt-0.5">
                          {deal?.address}, {deal?.city} · {deal ? formatPrice(deal.asking_price) : ""}
                        </p>
                      </div>
                      <button
                        ref={interestCloseButtonRef}
                        type="button"
                        aria-label="Close express interest dialog"
                        className="p-1 rounded-lg text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                        onClick={closeInterest}
                      >
                        <XIcon className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="rounded-xl bg-brand-gold/10 border border-brand-gold/30 px-4 py-3 flex gap-3">
                      <Crown className="w-4 h-4 text-brand-gold shrink-0 mt-0.5" />
                      <p className="text-xs text-muted-foreground">
                        <span className="font-semibold text-foreground">Priority queue:</span> proof-backed investors rise to the top, and one investor at a time can receive a timed reservation window from admin.
                      </p>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <label htmlFor="express-interest-message" className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block mb-1.5">Message to admin (optional)</label>
                        <textarea
                          id="express-interest-message"
                          value={interestMessage}
                          onChange={(e) => setInterestMessage(e.target.value)}
                          placeholder="e.g. Cash buyer, can move quickly, ready to verify funds..."
                          rows={3}
                          className="w-full bg-muted border border-border rounded-xl px-3 py-2 text-sm outline-none focus:border-primary resize-none"
                        />
                      </div>

                      <div>
                        <label htmlFor="express-interest-proof-file" className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block mb-1.5">
                          Proof of funds <span className="font-normal text-brand-gold">(priority path)</span>
                        </label>
                        <input
                          id="express-interest-proof-file"
                          ref={interestFileRef}
                          type="file"
                          accept="image/*,application/pdf"
                          className="hidden"
                          onChange={(e) => setInterestProofFile(e.target.files?.[0] ?? null)}
                        />
                        <Button type="button" variant="outline" className="w-full gap-2 mb-2" aria-describedby="express-interest-proof-file" onClick={() => interestFileRef.current?.click()}>
                          {interestProofFile ? <FileCheck className="w-4 h-4 text-emerald-600" /> : <Upload className="w-4 h-4" />}
                          {interestProofFile ? interestProofFile.name : "Upload bank statement / LOF"}
                        </Button>
                        {(interestProofFile || interestProofAmount) && (
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-bold">EUR</span>
                            <input
                              id="express-interest-proof-amount"
                              type="number"
                              aria-label="Available proof of funds amount"
                              value={interestProofAmount}
                              onChange={(e) => setInterestProofAmount(e.target.value)}
                              placeholder="Available amount"
                              className="w-full bg-background border border-border rounded-xl pl-12 pr-4 py-2.5 text-sm outline-none focus:border-primary"
                            />
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-2 pt-1">
                      <Button variant="outline" size="sm" className="flex-1" onClick={closeInterest}>Cancel</Button>
                      <Button
                        size="sm"
                        className="flex-1 bg-gradient-primary border-0 text-primary-foreground gap-1.5"
                        disabled={expressInterest.isPending}
                        onClick={async () => {
                          await expressInterest.mutateAsync({
                            dealId: interestDealId,
                            proofFile: interestProofFile,
                            proofAmount: interestProofAmount,
                            message: interestMessage,
                          });
                          closeInterest();
                        }}
                      >
                        {expressInterest.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Flame className="w-3.5 h-3.5" />}
                        Register Interest
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })()}

            <InvestorSidebarAnalytics
              cityBreakdown={cityBreakdown}
              typeBreakdown={typeBreakdown}
              marketPulse={marketPulse}
              liveDealsCount={liveDeals.length}
              invitationStatus={invitationStatus}
              canAccessDealFlow={canAccessDealFlow}
              onInviteClick={() => setShowInvitationModal(true)}
            />
          </div>
        </div>

        {showInvitationModal && (
          <InvitationRequestModal
            user={user}
            onClose={() => setShowInvitationModal(false)}
            onSuccess={() => {
              setShowInvitationModal(false);
              queryClient.invalidateQueries({ queryKey: ["invitation-status", user?.id] });
              toast.success("Invitation request submitted. We'll be in touch within 48 hours.");
            }}
          />
        )}
      </div>
      <Footer />
    </div>
  );
}
