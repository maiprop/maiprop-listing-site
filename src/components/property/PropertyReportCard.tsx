/* eslint complexity: "off" */
import { useState, type ReactNode } from "react";
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
import i18next from "i18next";
import { useTranslation } from "react-i18next";

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

const buildReportListingPayload = (listing?: ListingWithJoins | null) => {
  if (!listing) return undefined;
  return {
    id: listing.id,
    address: listing.address,
    city: listing.city,
    latitude: listing.latitude,
    longitude: listing.longitude,
    sqm: listing.sqm,
    property_type: listing.property_type,
    floor: listing.floor,
    year_built: listing.year_built,
  };
};

type ReportUnavailableRule = {
  when: (listingId: string, listing?: ListingWithJoins | null) => boolean;
  reason: { en: string; el: string };
};

const UNAVAILABLE_RULES: ReportUnavailableRule[] = [
  {
    when: (listingId) => !listingId,
    reason: {
      en: "Report unavailable for this listing.",
      el: "Η αναφορά δεν είναι διαθέσιμη για αυτή την αγγελία.",
    },
  },
  {
    when: (_listingId, listing) => Boolean(listing && (listing.latitude == null || listing.longitude == null)),
    reason: {
      en: "Report unavailable: this listing needs map coordinates first.",
      el: "Η αναφορά δεν είναι διαθέσιμη: χρειάζονται πρώτα συντεταγμένες χάρτη.",
    },
  },
  {
    when: (_listingId, listing) => Boolean(listing && (listing.sqm == null || Number(listing.sqm) <= 0)),
    reason: {
      en: "Report unavailable: this listing needs a valid property size first.",
      el: "Η αναφορά δεν είναι διαθέσιμη: χρειάζεται έγκυρο εμβαδόν ακινήτου.",
    },
  },
];

const isGreek = () => i18next.language?.toLowerCase().startsWith("el") ?? false;
const ui = (en: string, el: string) => (isGreek() ? el : en);

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
    toast.error(ui("Popup blocked. Allow popups to export the report as PDF.", "Το αναδυόμενο παράθυρο μπλοκαρίστηκε. Επιτρέψτε τα popups για εξαγωγή της αναφοράς σε PDF."));
  }
};

const getUnavailableReason = (listingId: string, listing?: ListingWithJoins | null): string | null => { // skipcq: JS-R1005
  if (!listing) {
    const reason = UNAVAILABLE_RULES[0].reason;
    return !listingId ? (isGreek() ? reason.el : reason.en) : null;
  }
  const reason = UNAVAILABLE_RULES.find((rule) => rule.when(listingId, listing))?.reason;
  return reason ? (isGreek() ? reason.el : reason.en) : null;
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
    setUnavailableReason(osRes?.reason ?? ui("Report unavailable: MAIProp OS has not generated this property report yet.", "Η αναφορά δεν είναι διαθέσιμη: το mAI Prop OS δεν έχει δημιουργήσει ακόμη αναφορά για αυτό το ακίνητο."));
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
        body: {
          listing_id: listingId,
          report_type: "valuation",
          listing: buildReportListingPayload(listing),
        },
      });
      if (error) throw error;
      handleReportResponse(osRes);
    } catch (_err) {
      setUnavailableReason(ui("Report unavailable right now. Please try again later.", "Η αναφορά δεν είναι διαθέσιμη αυτή τη στιγμή. Δοκιμάστε ξανά αργότερα."));
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
      {ui("Deep-dive: Area trends, comparable sales, property specifics analysis, and charts.", "Πλήρης αναφορά: τάσεις περιοχής, συγκρίσιμες πωλήσεις, ανάλυση χαρακτηριστικών ακινήτου και γραφήματα.")}
    </p>
    <Button className="w-full bg-gradient-primary border-0 text-primary-foreground gap-2" asChild>
      <Link to="/pricing">
        <Zap className="w-4 h-4" /> {ui("Upgrade to Pro", "Αναβάθμιση σε Pro")}
      </Link>
    </Button>
    <p className="text-[10px] text-muted-foreground">{ui("Pro Feature - Unlock full reports", "Λειτουργία Pro - Ξεκλειδώστε πλήρεις αναφορές")}</p>
  </div>
);

const UnavailableContent = ({ reason }: { reason: string }) => (
  <div className="text-center space-y-3">
    <p className="text-xs text-muted-foreground leading-relaxed">{reason}</p>
    <Button className="w-full gap-2" disabled variant="secondary">
      <ClipboardList className="w-4 h-4" />
      {ui("Report unavailable", "Η αναφορά δεν είναι διαθέσιμη")}
    </Button>
    <p className="text-[10px] text-muted-foreground">{ui("A downloadable OS report is required for PDF export", "Απαιτείται αναφορά από το OS για εξαγωγή PDF")}</p>
  </div>
);

const LoadedReportContent = ({ osReport }: { osReport: OsPrintableReport }) => (
  <div className="space-y-3">
    <p className="text-xs text-muted-foreground leading-relaxed">
      {ui("MAIProp OS generated the printable property report for this listing.", "Το mAI Prop OS δημιούργησε εκτυπώσιμη αναφορά ακινήτου για αυτή την αγγελία.")}
    </p>
    <Button
      className="w-full bg-gradient-primary border-0 text-primary-foreground gap-2"
      onClick={() => openPrintablePdf(osReport.html, osReport.fileName)}
    >
      <Download className="w-4 h-4" />
      {ui("Export PDF", "Εξαγωγή PDF")}
    </Button>
    <p className="text-[10px] text-muted-foreground">{ui("Source: MAIProp OS - Browser PDF export", "Πηγή: mAI Prop OS - Εξαγωγή PDF από τον browser")}</p>
  </div>
);

const ExtraReportContent = () => (
  <div className="text-center space-y-3">
    <p className="text-xs text-muted-foreground leading-relaxed">
      {ui(`Included reports used this month. Extra reports cost EUR ${REPORT_EXTRA_COST} each.`, `Οι περιλαμβανόμενες αναφορές του μήνα έχουν χρησιμοποιηθεί. Κάθε επιπλέον αναφορά κοστίζει EUR ${REPORT_EXTRA_COST}.`)}
    </p>
    <Button className="w-full bg-gradient-primary border-0 text-primary-foreground gap-2" asChild>
      <Link to="/pricing"><Zap className="w-4 h-4" /> {ui("Get Extra Report", "Αγορά επιπλέον αναφοράς")}</Link>
    </Button>
    <p className="text-[10px] text-muted-foreground">{ui(`EUR ${REPORT_EXTRA_COST} per extra report`, `EUR ${REPORT_EXTRA_COST} ανά επιπλέον αναφορά`)}</p>
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
        {ui(
          `${Math.max(0, REPORT_INCLUDED - reportCount)} of ${REPORT_INCLUDED} reports remaining this month`,
          `${Math.max(0, REPORT_INCLUDED - reportCount)} από ${REPORT_INCLUDED} αναφορές απομένουν αυτόν τον μήνα`,
        )}
      </p>
    )}
    <p className="text-xs text-muted-foreground leading-relaxed">
      {ui("Deep-dive: Area trends, comparable sales, property specifics analysis, and charts.", "Πλήρης αναφορά: τάσεις περιοχής, συγκρίσιμες πωλήσεις, ανάλυση χαρακτηριστικών ακινήτου και γραφήματα.")}
    </p>
    <Button
      className="w-full bg-gradient-primary border-0 text-primary-foreground gap-2"
      onClick={loadReport}
      disabled={reportLoading || Boolean(currentUnavailableReason)}
    >
      {reportLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardList className="w-4 h-4" />}
      {reportLoading ? ui("Loading...", "Φόρτωση...") : ui("Load Report", "Φόρτωση αναφοράς")}
    </Button>
    <p className="text-[10px] text-muted-foreground">{ui("Full - Instant - OS PDF export", "Πλήρης - Άμεση - Εξαγωγή PDF από το OS")}</p>
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

type ReportCardViewState = {
  content: ReactNode;
  reportLoaded: boolean;
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
];

const FALLBACK_CONTENT_RULE = {
  render: (context: ReportContentContext) => <LoadReportContent {...context} />,
};

const getReportCardClass = (reportLoaded: boolean) => [
  "glass-card rounded-2xl overflow-hidden border",
  reportLoaded ? "border-primary/30" : "border-primary/20",
].join(" ");

const usePropertyReportCardView = ({ listingId, listing }: Props): ReportCardViewState => {
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
  const contentRule = REPORT_CONTENT_RULES.find((rule) => rule.when(contentContext)) ?? FALLBACK_CONTENT_RULE;
  const content = contentRule.render(contentContext);
  return { content, reportLoaded };
};

export const PropertyReportCard = (props: Props) => { // skipcq: JS-R1005
  const { i18n } = useTranslation();
  const greek = i18n.language?.toLowerCase().startsWith("el") ?? false;
  const { content, reportLoaded } = usePropertyReportCardView(props);
  return (
    <div className={getReportCardClass(reportLoaded)}>
      <div className="flex items-center gap-2 px-5 py-3.5 bg-primary/5 border-b border-primary/20">
        <ClipboardList className="w-4 h-4 text-primary" />
        <h4 className="font-display font-semibold text-sm flex-1">{greek ? "Αναφορά ακινήτου" : "Property Report"}</h4>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/15 text-primary font-semibold">
          mAI Prop - 2026 Model
        </span>
      </div>

      <div className="p-5">{content}</div>
    </div>
  );
};
