import { useState } from "react";
import { ClipboardList, Download, Loader2, Zap } from "lucide-react";
import { Link } from "react-router-dom";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
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

interface OsReportResponse {
  ok?: boolean;
  reason?: string;
  billing?: { charged?: boolean };
  report?: {
    html?: string;
    fileName?: string;
  };
}

interface Props {
  listingId: string;
  listing?: ListingWithJoins | null;
}

type ReportUnavailableRule = {
  when: (listingId: string, listing?: ListingWithJoins | null) => boolean;
  reason: string;
};

const UNAVAILABLE_RULES: ReportUnavailableRule[] = [
  {
    when: (listingId) => !listingId,
    reason: "Report unavailable for this listing.",
  },
  {
    when: (_listingId, listing) => Boolean(listing && (listing.latitude == null || listing.longitude == null)),
    reason: "Report unavailable: this listing needs map coordinates first.",
  },
  {
    when: (_listingId, listing) => Boolean(listing && (listing.sqm == null || Number(listing.sqm) <= 0)),
    reason: "Report unavailable: this listing needs a valid property size first.",
  },
];

const openPrintablePdf = (html: string, fileName: string) => {
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
};

const getUnavailableReason = (listingId: string, listing?: ListingWithJoins | null): string | null => {
  if (!listing) return !listingId ? UNAVAILABLE_RULES[0].reason : null;
  return UNAVAILABLE_RULES.find((rule) => rule.when(listingId, listing))?.reason ?? null;
};

const getPrintableReport = (osRes: OsReportResponse | null | undefined, listingId: string): OsPrintableReport | null => {
  const html = osRes?.report?.html;
  if (!osRes?.ok || !html) return null;
  return {
    html,
    fileName: osRes.report?.fileName ?? `maiprop-property-report-${listingId}.pdf`,
  };
};

const refreshReportUsage = (queryClient: QueryClient, osRes: OsReportResponse | null | undefined) => {
  if (!osRes?.billing?.charged) return;
  queryClient.invalidateQueries({ queryKey: ["usage_property_reports"] }).catch(() => undefined);
};

const usePropertyReportLoader = (listingId: string, listing?: ListingWithJoins | null) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [osReport, setOsReport] = useState<OsPrintableReport | null>(null);
  const [unavailableReason, setUnavailableReason] = useState<string | null>(() => getUnavailableReason(listingId, listing));
  const [reportLoading, setReportLoading] = useState(false);
  const currentUnavailableReason = unavailableReason ?? getUnavailableReason(listingId, listing);

  const handleBlockedLoad = (reason: string | null) => {
    if (reason) setUnavailableReason(reason);
  };

  const handleReportResponse = (osRes: OsReportResponse | null | undefined) => {
    const printableReport = getPrintableReport(osRes, listingId);
    if (printableReport) {
      setOsReport(printableReport);
      refreshReportUsage(queryClient, osRes);
      return;
    }
    setUnavailableReason(osRes?.reason ?? "Report unavailable: MAIProp OS has not generated this property report yet.");
  };

  const loadReport = async () => {
    const preflightReason = getUnavailableReason(listingId, listing);
    if (!user || preflightReason) {
      handleBlockedLoad(preflightReason);
      return;
    }

    setReportLoading(true);
    setUnavailableReason(null);

    try {
      const { data: osRes, error } = await supabase.functions.invoke<OsReportResponse>("fetch-report-from-os", {
        body: { listing_id: listingId, report_type: "valuation" },
      });
      if (error) throw error;
      handleReportResponse(osRes);
    } catch (_err) {
      setUnavailableReason("Report unavailable right now. Please try again later.");
    } finally {
      setReportLoading(false);
    }
  };

  return {
    currentUnavailableReason,
    loadReport,
    osReport,
    reportLoaded: osReport !== null,
    reportLoading,
  };
};

const ProUpgradeContent = () => (
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
);

const UnavailableContent = ({ reason }: { reason: string }) => (
  <div className="text-center space-y-3">
    <p className="text-xs text-muted-foreground leading-relaxed">{reason}</p>
    <Button className="w-full gap-2" disabled variant="secondary">
      <ClipboardList className="w-4 h-4" />
      Report unavailable
    </Button>
    <p className="text-[10px] text-muted-foreground">A downloadable OS report is required for PDF export</p>
  </div>
);

const LoadedReportContent = ({ osReport }: { osReport: OsPrintableReport }) => (
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
);

const ExtraReportContent = () => (
  <div className="text-center space-y-3">
    <p className="text-xs text-muted-foreground leading-relaxed">
      Included reports used this month. Extra reports cost EUR {REPORT_EXTRA_COST} each.
    </p>
    <Button className="w-full bg-gradient-primary border-0 text-primary-foreground gap-2" asChild>
      <Link to="/pricing"><Zap className="w-4 h-4" /> Get Extra Report</Link>
    </Button>
    <p className="text-[10px] text-muted-foreground">EUR {REPORT_EXTRA_COST} per extra report</p>
  </div>
);

const LoadReportContent = ({
  currentUnavailableReason,
  isPro,
  loadReport,
  reportCount,
  reportLoading,
}: {
  currentUnavailableReason: string | null;
  isPro: boolean;
  loadReport: () => void;
  reportCount: number;
  reportLoading: boolean;
}) => (
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
      onClick={loadReport}
      disabled={reportLoading || Boolean(currentUnavailableReason)}
    >
      {reportLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardList className="w-4 h-4" />}
      {reportLoading ? "Loading..." : "Load Report"}
    </Button>
    <p className="text-[10px] text-muted-foreground">Full - Instant - OS PDF export</p>
  </div>
);

type ReportContentContext = {
  currentUnavailableReason: string | null;
  isPro: boolean;
  loadReport: () => void;
  osReport: OsPrintableReport | null;
  reportCount: number;
  reportLoading: boolean;
};

const REPORT_CONTENT_RULES = [
  {
    when: ({ isPro }: ReportContentContext) => !isPro,
    render: () => <ProUpgradeContent />,
  },
  {
    when: ({ currentUnavailableReason }: ReportContentContext) => Boolean(currentUnavailableReason),
    render: ({ currentUnavailableReason }: ReportContentContext) => (
      <UnavailableContent reason={currentUnavailableReason ?? ""} />
    ),
  },
  {
    when: ({ osReport }: ReportContentContext) => Boolean(osReport),
    render: ({ osReport }: ReportContentContext) => (
      osReport ? <LoadedReportContent osReport={osReport} /> : null
    ),
  },
  {
    when: ({ reportCount }: ReportContentContext) => reportCount >= REPORT_INCLUDED,
    render: () => <ExtraReportContent />,
  },
  {
    when: () => true,
    render: (context: ReportContentContext) => <LoadReportContent {...context} />,
  },
];

export const PropertyReportCard = ({ listingId, listing }: Props) => {
  const { isPro } = useSubscription();
  const { data: reportCount = 0 } = useReportUsage();
  const {
    currentUnavailableReason,
    loadReport,
    osReport,
    reportLoaded,
    reportLoading,
  } = usePropertyReportLoader(listingId, listing);
  const contentContext = { currentUnavailableReason, isPro, loadReport, osReport, reportCount, reportLoading };
  const content = REPORT_CONTENT_RULES.find((rule) => rule.when(contentContext))?.render(contentContext);

  return (
    <div className={`glass-card rounded-2xl overflow-hidden border ${reportLoaded ? "border-primary/30" : "border-primary/20"}`}>
      <div className="flex items-center gap-2 px-5 py-3.5 bg-primary/5 border-b border-primary/20">
        <ClipboardList className="w-4 h-4 text-primary" />
        <h4 className="font-display font-semibold text-sm flex-1">Property Report</h4>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/15 text-primary font-semibold">
          mAI Prop - 2026 Model
        </span>
      </div>

      <div className="p-5">{content}</div>
    </div>
  );
};
