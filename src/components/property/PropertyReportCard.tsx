import { useState } from "react";
import { ClipboardList, Download, Loader2, Zap } from "lucide-react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/hooks/useSubscription";
import { useReportUsage, REPORT_INCLUDED, REPORT_EXTRA_COST } from "@/hooks/useUsageAddons";
import { supabase } from "@/integrations/supabase/client";
import type { ListingWithJoins } from "@/hooks/useListings";

interface OsPrintableReport {
  html: string;
  fileName: string;
}

interface Props {
  listingId: string;
  listing?: ListingWithJoins | null;
}

function openPrintablePdf(html: string, fileName: string) { // skipcq: JS-0067 - Browser print helper is module-local and intentionally not exported.
  const title = fileName.replace(/\.pdf$/i, "");
  const printScript = `
    <script>
      window.addEventListener("load", function() {
        document.title = ${JSON.stringify(title)};
        setTimeout(function() { window.focus(); window.print(); }, 250);
      });
    </script>
  `;
  const printableHtml = html.includes("</body>")
    ? html.replace("</body>", `${printScript}</body>`)
    : `${html}${printScript}`;
  const blob = new Blob([printableHtml], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const opened = window.open(url, "_blank");
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  if (!opened) {
    toast.error("Popup blocked. Allow popups to export the report as PDF.");
  }
}

function getUnavailableReason(listingId: string, listing?: ListingWithJoins | null): string | null { // skipcq: JS-0067, JS-R1005 - Keeps report preflight denial reasons explicit for users and tests.
  if (!listingId) return "Report unavailable for this listing.";
  if (!listing) return null;
  if (listing.latitude == null || listing.longitude == null) {
    return "Report unavailable: this listing needs map coordinates first.";
  }
  if (listing.sqm == null || Number(listing.sqm) <= 0) {
    return "Report unavailable: this listing needs a valid property size first.";
  }
  return null;
}

export function PropertyReportCard({ listingId, listing }: Props) { // skipcq: JS-0067, JS-R1005 - Compact card coordinates billing quota, OS fetch, and print/export states.
  const { user } = useAuth();
  const { isPro } = useSubscription();
  const queryClient = useQueryClient();
  const { data: reportCount = 0 } = useReportUsage();
  const [osReport, setOsReport] = useState<OsPrintableReport | null>(null);
  const [unavailableReason, setUnavailableReason] = useState<string | null>(() => getUnavailableReason(listingId, listing));
  const [reportLoading, setReportLoading] = useState(false);
  const reportLoaded = osReport !== null;
  const currentUnavailableReason = unavailableReason ?? getUnavailableReason(listingId, listing);

  const handleLoad = async () => { // skipcq: JS-R1005 - One click handler keeps quota invalidation and unavailable-report states in order.
    const preflightReason = getUnavailableReason(listingId, listing);
    if (!user || preflightReason) {
      if (preflightReason) setUnavailableReason(preflightReason);
      return;
    }

    setReportLoading(true);
    setUnavailableReason(null);

    try {
      const { data: osRes, error } = await supabase.functions.invoke("fetch-report-from-os", {
        body: { listing_id: listingId, report_type: "valuation" },
      });
      if (error) throw error;

      if (osRes?.ok && osRes.report?.html) {
        setOsReport({
          html: osRes.report.html,
          fileName: osRes.report.fileName ?? `maiprop-property-report-${listingId}.pdf`,
        });
        if (osRes.billing?.charged) {
          queryClient.invalidateQueries({ queryKey: ["usage_property_reports"] }).catch(() => undefined);
        }
        return;
      }

      setUnavailableReason(osRes?.reason ?? "Report unavailable: MAIProp OS has not generated this property report yet.");
    } catch (_err) {
      setUnavailableReason("Report unavailable right now. Please try again later.");
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
          mAI Prop - 2026 Model
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
            <p className="text-[10px] text-muted-foreground">Pro Feature - Unlock full reports</p>
          </div>
        ) : currentUnavailableReason ? (
          <div className="text-center space-y-3">
            <p className="text-xs text-muted-foreground leading-relaxed">
              {currentUnavailableReason}
            </p>
            <Button className="w-full gap-2" disabled variant="secondary">
              <ClipboardList className="w-4 h-4" />
              Report unavailable
            </Button>
            <p className="text-[10px] text-muted-foreground">A downloadable OS report is required for PDF export</p>
          </div>
        ) : osReport ? (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground leading-relaxed">
              MAIProp OS generated the printable property report for this listing.
            </p>
            <Button
              className="w-full bg-gradient-primary border-0 text-primary-foreground gap-2"
              onClick={() => openPrintablePdf(osReport.html, osReport.fileName)}
            >
              <Download className="w-4 h-4" />
              Export PDF
            </Button>
            <p className="text-[10px] text-muted-foreground">Source: MAIProp OS - Browser PDF export</p>
          </div>
        ) : reportCount >= REPORT_INCLUDED ? (
          <div className="text-center space-y-3">
            <p className="text-xs text-muted-foreground leading-relaxed">
              Included reports used this month. Extra reports cost EUR {REPORT_EXTRA_COST} each.
            </p>
            <Button className="w-full bg-gradient-primary border-0 text-primary-foreground gap-2" asChild>
              <Link to="/pricing"><Zap className="w-4 h-4" /> Get Extra Report</Link>
            </Button>
            <p className="text-[10px] text-muted-foreground">EUR {REPORT_EXTRA_COST} per extra report</p>
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
              disabled={reportLoading || Boolean(currentUnavailableReason)}
            >
              {reportLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardList className="w-4 h-4" />}
              {reportLoading ? "Loading..." : "Load Report"}
            </Button>
            <p className="text-[10px] text-muted-foreground">Full - Instant - OS PDF export</p>
          </div>
        )}
      </div>
    </div>
  );
}
