import { useState } from "react";
import { ClipboardList, Loader2, Zap, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/hooks/useSubscription";
import { useReportUsage, REPORT_INCLUDED, REPORT_EXTRA_COST } from "@/hooks/useUsageAddons";
import { supabase } from "@/integrations/supabase/client";
import type { ListingWithJoins } from "@/hooks/useListings";

interface ReportResult {
  estimatedValue: number;
  rangeLow: number;
  rangeHigh: number;
  marketComparison: string;
  marketComparisonPct: number;
  confidenceLabel: string;
  source: "os" | "ai";
}

interface Props {
  listingId: string;
  listing?: ListingWithJoins | null;
}

export function PropertyReportCard({ listingId, listing }: Props) {
  const { user } = useAuth();
  const { isPro } = useSubscription();
  const { data: reportCount = 0 } = useReportUsage();
  const [reportResult, setReportResult] = useState<ReportResult | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const reportLoaded = reportResult !== null;

  const handleLoad = async () => {
    if (!user) return;
    setReportLoading(true);
    try {
      const { data: osRes } = await supabase.functions.invoke("fetch-report-from-os", {
        body: { listing_id: listingId, report_type: "valuation" },
      });
      if (osRes?.ok && osRes.report?.estimatedValue) {
        const r = osRes.report;
        setReportResult({ estimatedValue: r.estimatedValue, rangeLow: r.rangeLow ?? r.estimatedValue, rangeHigh: r.rangeHigh ?? r.estimatedValue, marketComparison: r.marketComparison ?? "at_market", marketComparisonPct: r.marketComparisonPct ?? 0, confidenceLabel: r.confidenceLabel ?? "Medium", source: "os" });
        return;
      }
      const body = listing
        ? { title: listing.title, city: listing.city, address: listing.address, price: Number(listing.price), sqm: Number(listing.sqm), bedrooms: listing.bedrooms, bathrooms: listing.bathrooms, propertyType: listing.property_type, listingType: listing.listing_type, floor: listing.floor, yearBuilt: listing.year_built, energyClass: listing.energy_class, pricePerSqm: listing.price_per_sqm ? Number(listing.price_per_sqm) : undefined, hasParking: listing.has_parking, hasPool: listing.has_pool, hasElevator: listing.has_elevator, region: listing.region }
        : { listing_id: listingId };
      const { data } = await supabase.functions.invoke("property-valuation", { body });
      if (data?.estimatedValue) {
        setReportResult({ estimatedValue: data.estimatedValue, rangeLow: data.rangeLow ?? data.estimatedValue, rangeHigh: data.rangeHigh ?? data.estimatedValue, marketComparison: data.marketComparison ?? "at_market", marketComparisonPct: data.marketComparisonPct ?? 0, confidenceLabel: data.confidenceLabel ?? "Medium", source: "ai" });
      }
    } finally {
      setReportLoading(false);
    }
  };

  return (
    <div className={`glass-card rounded-2xl overflow-hidden border ${reportLoaded ? "border-primary/30" : "border-primary/20"}`}>
      <div className="flex items-center gap-2 px-5 py-3.5 bg-primary/5 border-b border-primary/20">
        <ClipboardList className="w-4 h-4 text-primary" />
        <h4 className="font-display font-semibold text-sm flex-1">Property Report</h4>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/15 text-primary font-semibold">
          mAI Prop · 2026 Model
        </span>
      </div>

      <div className="p-5">
        {!isPro ? (
          <div className="text-center space-y-3">
            <p className="text-xs text-muted-foreground leading-relaxed">
              Deep-dive: Area trends, comparable sales, property specifics analysis, and charts.
            </p>
            <Button className="w-full bg-gradient-primary border-0 text-primary-foreground gap-2" asChild>
              <Link to="/pricing">
                <Zap className="w-4 h-4" /> Upgrade to Pro
              </Link>
            </Button>
            <p className="text-[10px] text-muted-foreground">Pro Feature · Unlock full reports</p>
          </div>
        ) : reportLoaded && reportResult ? (
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">AI Estimated Value</p>
                <p className="font-display font-bold text-lg">€{reportResult.estimatedValue.toLocaleString()}</p>
                <p className="text-[10px] text-muted-foreground">€{reportResult.rangeLow.toLocaleString()} – €{reportResult.rangeHigh.toLocaleString()}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-muted-foreground mb-0.5">vs Asking</p>
                <div className={`flex items-center gap-1 justify-end text-xs font-semibold ${
                  reportResult.marketComparison === "below_market" ? "text-emerald-500" :
                  reportResult.marketComparison === "above_market" ? "text-red-500" : "text-yellow-500"
                }`}>
                  {reportResult.marketComparison === "below_market" ? <TrendingDown className="w-3.5 h-3.5" /> :
                   reportResult.marketComparison === "above_market" ? <TrendingUp className="w-3.5 h-3.5" /> :
                   <Minus className="w-3.5 h-3.5" />}
                  {reportResult.marketComparisonPct > 0 ? "+" : ""}{reportResult.marketComparisonPct}%
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">{reportResult.confidenceLabel} confidence</p>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground">Source: {reportResult.source === "os" ? "maiProp OS" : "AI Model"} · Not a formal valuation</p>
          </div>
        ) : reportCount >= REPORT_INCLUDED ? (
          <div className="text-center space-y-3">
            <p className="text-xs text-muted-foreground leading-relaxed">
              Included reports used this month. Extra reports cost €{REPORT_EXTRA_COST} each.
            </p>
            <Button className="w-full bg-gradient-primary border-0 text-primary-foreground gap-2" asChild>
              <Link to="/pricing"><Zap className="w-4 h-4" /> Get Extra Report</Link>
            </Button>
            <p className="text-[10px] text-muted-foreground">€{REPORT_EXTRA_COST} per extra report</p>
          </div>
        ) : (
          <div className="text-center space-y-3">
            {isPro && (
              <p className="text-[10px] text-muted-foreground">
                {Math.max(0, REPORT_INCLUDED - reportCount)} of {REPORT_INCLUDED} reports remaining this month
              </p>
            )}
            <p className="text-xs text-muted-foreground leading-relaxed">
              Deep-dive: Area trends, comparable sales, property specifics analysis, and charts.
            </p>
            <Button
              className="w-full bg-gradient-primary border-0 text-primary-foreground gap-2"
              onClick={handleLoad}
              disabled={reportLoading}
            >
              {reportLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardList className="w-4 h-4" />}
              {reportLoading ? "Loading…" : "Load Report"}
            </Button>
            <p className="text-[10px] text-muted-foreground">Full · Instant · Not a formal report</p>
          </div>
        )}
      </div>
    </div>
  );
}
