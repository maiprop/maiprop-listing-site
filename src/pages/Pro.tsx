import { useState, useEffect } from "react";
import { CheckCircle, Lock, Zap, TrendingUp, BarChart2, Filter, Bell, Star, ArrowRight, Shield, Loader2, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const FREE_FEATURES = [
  "Browse all property listings",
  "View auction listings",
  "Save favorites",
  "Send messages to agents",
  "Book viewings",
  "AI Market Insights (summary)",
  "Neighbourhood Report",
  "Mortgage Calculator",
  "Auction Alerts",
];

const PRO_FEATURES = [
  { label: "Full AI Property Valuation", icon: BarChart2, desc: "Price range, confidence score, key factors & renovation potential" },
  { label: "AI Capital Growth Forecasts", icon: TrendingUp, desc: "5-year capital appreciation projections per neighbourhood" },
  { label: "Ownership Status Filters", icon: Filter, desc: "Filter auctions by full, partial, shared, and no-ownership" },
  { label: "Auction Round Filters", icon: Filter, desc: "Filter by 1st, 2nd, and 3rd+ round auctions" },
  { label: "Expected Yield Filters", icon: Filter, desc: "Filter auction properties by gross rental yield range" },
  { label: "Priority Auction Alerts", icon: Bell, desc: "Real-time push & email notifications before anyone else" },
  { label: "Unlimited Saved Searches", icon: Star, desc: "Save unlimited property search configurations with daily email digests" },
  { label: "Legal Status Check", icon: Shield, desc: "Automated cadastre & encumbrance verification per listing" },
  { label: "Comparable Sales Data", icon: BarChart2, desc: "See recent sold prices for similar properties in the same area" },
];

// Pro product ID mapping
const PRO_PRODUCT_ID = "prod_U8SJbk3fZQ3xgD";

export default function Pro() {
  const { user, subscription, refreshSubscription } = useAuth();
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [searchParams] = useSearchParams();

  const successParam = searchParams.get("success");
  const cancelledParam = searchParams.get("cancelled");

  // Trigger subscription refresh on return from checkout
  useEffect(() => {
    if (successParam === "1") {
      refreshSubscription();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [successParam]);

  const isPro = subscription.subscribed && subscription.productId === PRO_PRODUCT_ID;

  const handleUpgrade = async () => {
    if (!user) {
      toast.error("Please sign in to upgrade");
      return;
    }
    setCheckoutLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-checkout", {});
      if (error || !data?.url) throw new Error(error?.message || "Failed to create checkout");
      window.open(data.url, "_blank");
    } catch (e: any) {
      toast.error(e.message || "Failed to start checkout");
    } finally {
      setCheckoutLoading(false);
    }
  };

  const handleManage = async () => {
    if (!user) return;
    setPortalLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("customer-portal", {});
      if (error || !data?.url) throw new Error(error?.message || "Failed to open portal");
      window.open(data.url, "_blank");
    } catch (e: any) {
      toast.error(e.message || "Failed to open subscription portal");
    } finally {
      setPortalLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-16">
        {/* Success / Cancelled banners */}
        {successParam === "1" && (
          <div className="bg-emerald-500/15 border-b border-emerald-500/30 py-3 text-center">
            <p className="text-sm font-semibold text-emerald-400 flex items-center justify-center gap-2">
              <CheckCircle className="w-4 h-4" /> Payment successful! Your Pro subscription is now active.
            </p>
          </div>
        )}
        {cancelledParam === "1" && (
          <div className="bg-muted/60 border-b border-border py-3 text-center">
            <p className="text-sm text-muted-foreground">Checkout cancelled. No charges were made.</p>
          </div>
        )}

        {/* Hero */}
        <div className="bg-card border-b border-border py-16">
          <div className="container max-w-4xl text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand-gold/15 border border-brand-gold/30 text-brand-gold text-xs font-bold uppercase tracking-widest mb-5">
              <Zap className="w-3.5 h-3.5" /> mAI Prop Pro
            </div>
            <h1 className="font-display text-4xl md:text-5xl font-black mb-4 leading-tight">
              Unlock the full power of<br />
              <span className="gradient-text-gold">AI Property Intelligence</span>
            </h1>
            <p className="text-muted-foreground text-lg max-w-xl mx-auto">
              Get professional-grade analysis, advanced auction filters, and complete AI valuations — everything serious investors need.
            </p>
            {isPro && (
              <div className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-semibold text-sm">
                <Crown className="w-4 h-4" /> You have an active Pro subscription
                {subscription.subscriptionEnd && (
                  <span className="text-emerald-400/70 text-xs">· renews {new Date(subscription.subscriptionEnd).toLocaleDateString("en-GB")}</span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Pricing cards */}
        <div className="container max-w-5xl py-16">
          <div className="grid md:grid-cols-2 gap-6 items-stretch">

            {/* Free plan */}
            <div className="glass-card rounded-2xl border border-border overflow-hidden flex flex-col">
              <div className="px-7 py-6 border-b border-border">
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">Free</p>
                <div className="flex items-baseline gap-1">
                  <span className="font-display text-4xl font-black text-foreground">€0</span>
                  <span className="text-muted-foreground text-sm">/ month</span>
                </div>
                <p className="text-xs text-muted-foreground mt-2">Everything to get started</p>
              </div>
              <div className="p-7 flex-1">
                <ul className="space-y-3">
                  {FREE_FEATURES.map(f => (
                    <li key={f} className="flex items-center gap-2.5 text-sm">
                      <CheckCircle className="w-4 h-4 text-primary shrink-0" />
                      <span className="text-muted-foreground">{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="px-7 pb-7">
                <Button variant="outline" className="w-full border-border" asChild>
                  <Link to="/listings">Browse Free</Link>
                </Button>
              </div>
            </div>

            {/* Pro plan */}
            <div className={`relative glass-card rounded-2xl border-2 overflow-hidden flex flex-col shadow-elevated ${isPro ? "border-emerald-500/60" : "border-brand-gold/50"}`}>
              {/* Badge */}
              <div className="absolute top-4 right-4">
                {isPro ? (
                  <span className="flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full bg-emerald-500 text-white uppercase tracking-wider">
                    <Crown className="w-2.5 h-2.5" /> Your Plan
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full bg-brand-gold text-background uppercase tracking-wider">
                    <Star className="w-2.5 h-2.5 fill-current" /> Most Popular
                  </span>
                )}
              </div>

              <div className="px-7 py-6 border-b border-border bg-brand-gold/5">
                <p className="text-xs font-bold uppercase tracking-widest text-brand-gold mb-2">Pro</p>
                <div className="flex items-baseline gap-1">
                  <span className="font-display text-4xl font-black text-foreground">€29</span>
                  <span className="text-muted-foreground text-sm">/ month</span>
                </div>
                <p className="text-xs text-muted-foreground mt-2">Everything in Free, plus:</p>
              </div>

              <div className="p-7 flex-1">
                <ul className="space-y-4">
                  {PRO_FEATURES.map(f => (
                    <li key={f.label} className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded-lg bg-brand-gold/15 flex items-center justify-center shrink-0 mt-0.5">
                        <f.icon className="w-3 h-3 text-brand-gold" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">{f.label}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{f.desc}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="px-7 pb-7 space-y-3">
                {isPro ? (
                  <Button
                    className="w-full border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 gap-2 h-11"
                    variant="outline"
                    onClick={handleManage}
                    disabled={portalLoading}
                  >
                    {portalLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Crown className="w-4 h-4" />}
                    Manage Subscription
                  </Button>
                ) : (
                  <Button
                    className="w-full bg-gradient-gold border-0 text-background font-bold gap-2 h-11 text-base"
                    onClick={handleUpgrade}
                    disabled={checkoutLoading}
                  >
                    {checkoutLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                    {user ? "Upgrade to Pro" : "Get Started"}
                  </Button>
                )}
                <p className="text-[11px] text-muted-foreground text-center">
                  {isPro ? "Cancel or change plan anytime" : "No commitment · Cancel anytime · Instant access"}
                </p>
              </div>
            </div>
          </div>

          {/* Feature breakdown table */}
          <div className="mt-14">
            <h2 className="font-display text-2xl font-bold text-center mb-8">Compare plans</h2>
            <div className="glass-card rounded-2xl border border-border overflow-hidden">
              <div className="grid grid-cols-3 bg-card/50 border-b border-border">
                <div className="px-5 py-3.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">Feature</div>
                <div className="px-4 py-3.5 text-xs font-bold uppercase tracking-wider text-muted-foreground text-center border-l border-border">Free</div>
                <div className="px-4 py-3.5 text-xs font-bold uppercase tracking-wider text-brand-gold text-center border-l border-border">Pro</div>
              </div>
              {[
                { feature: "Property search & listings", free: true, pro: true },
                { feature: "Auction discovery", free: true, pro: true },
                { feature: "Favorites & saved searches", free: "3 searches", pro: "Unlimited" },
                { feature: "AI Market Insights (summary)", free: true, pro: true },
                { feature: "Neighbourhood Report", free: true, pro: true },
                { feature: "Full AI Property Valuation", free: false, pro: true },
                { feature: "Capital growth forecasts", free: false, pro: true },
                { feature: "Ownership status filter", free: false, pro: true },
                { feature: "Auction round filter", free: false, pro: true },
                { feature: "Expected yield filter", free: false, pro: true },
                { feature: "Comparable sales data", free: false, pro: true },
                { feature: "Legal status check", free: false, pro: true },
                { feature: "Priority auction alerts", free: false, pro: true },
              ].map((row, i) => (
                <div key={row.feature} className={`grid grid-cols-3 ${i % 2 === 0 ? "bg-transparent" : "bg-muted/30"} border-b border-border last:border-0`}>
                  <div className="px-5 py-3.5 text-sm text-foreground">{row.feature}</div>
                  <div className="px-4 py-3.5 text-center border-l border-border">
                    {row.free === true
                      ? <CheckCircle className="w-4 h-4 text-primary mx-auto" />
                      : row.free === false
                      ? <Lock className="w-4 h-4 text-muted-foreground/40 mx-auto" />
                      : <span className="text-xs text-muted-foreground">{row.free}</span>
                    }
                  </div>
                  <div className="px-4 py-3.5 text-center border-l border-border">
                    {row.pro === true
                      ? <CheckCircle className="w-4 h-4 text-brand-gold mx-auto" />
                      : <span className="text-xs font-semibold text-brand-gold">{row.pro}</span>
                    }
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* CTA bottom */}
          <div className="mt-12 text-center space-y-3">
            {!isPro && (
              <Button
                className="bg-gradient-gold border-0 text-background font-bold gap-2 h-12 px-8 text-base"
                onClick={handleUpgrade}
                disabled={checkoutLoading}
              >
                {checkoutLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                Get Pro Access <ArrowRight className="w-4 h-4" />
              </Button>
            )}
            <p className="text-xs text-muted-foreground">
              Trusted by 500+ Greek property investors · Powered by mAI Prop OS
            </p>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
