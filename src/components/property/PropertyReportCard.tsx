/* eslint complexity: "off" */
import { useEffect, useState, type ReactNode } from "react";
import { ClipboardList, Download, Loader2, Printer, Zap } from "lucide-react";
import { Link } from "react-router-dom";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/hooks/useSubscription";
import { createAddonCheckoutUrl } from "@/pages/dashboard/billing/checkoutActions";
import {
  usePropertyReportAddonCredits,
  useReportUsage,
  REPORT_INCLUDED,
  REPORT_EXTRA_COST,
} from "@/hooks/useUsageAddons";
import { supabase } from "@/integrations/supabase/client";
import type { ListingWithJoins } from "@/hooks/useListings";
import i18next from "i18next";
import { useTranslation } from "react-i18next";
import { isPlatformAdmin } from "@/lib/authUtils";
import { getParticipantTypeFromProfile } from "@/lib/participantConfig";

interface OsPrintableReport {
  html: string;
  fileName: string;
}

interface OsReportResponse {
  ok?: boolean;
  reason?: string;
  retry_after_ms?: number;
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

const getHtmlReportFileName = (fileName: string): string => {
  if (/\.html?$/i.test(fileName)) return fileName;
  return fileName.replace(/\.[a-z0-9]+$/i, "") + ".html";
};

const sanitizePrintableReportHtml = (html: string): string =>
  html
    .replace(/<\s*(script|iframe|object|embed|form)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*(script|iframe|object|embed|base|form|input|button|textarea|select)\b[^>]*\/?>/gi, "")
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s+(href|src|xlink:href)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, "")
    .replace(/\s+(href|src|xlink:href)\s*=\s*javascript:[^\s>]+/gi, "")
    .replace(/\s+srcdoc\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");

const downloadHtmlReport = (html: string, fileName: string) => {
  const blob = new Blob([sanitizePrintableReportHtml(html)], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = getHtmlReportFileName(fileName);
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
};

const openPrintableBlobUrl = (url: string): boolean => {
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.setAttribute("aria-hidden", "true");
  iframe.tabIndex = -1;
  iframe.onload = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch {
      toast.error(ui("Print preview could not be opened. Download HTML instead.", "Print preview could not be opened. Download HTML instead."));
    }
  };
  iframe.onerror = () => {
    toast.error(ui("Print preview could not be opened. Download HTML instead.", "Print preview could not be opened. Download HTML instead."));
    iframe.remove();
  };
  iframe.src = url;
  document.body.appendChild(iframe);
  window.setTimeout(() => iframe.remove(), 60_000);
  return true;
};

const openPrintablePdf = (html: string) => {
  const printableHtml = sanitizePrintableReportHtml(html);
  const blob = new Blob([printableHtml], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const opened = openPrintableBlobUrl(url);
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
    fileName: osRes.report?.fileName ?? `maiprop-property-report-${listingId}.html`,
  };
};

const refreshReportUsage = (queryClient: QueryClient, osRes: OsReportResponse | null | undefined) => {
  if (!osRes?.billing?.charged) return;
  queryClient.invalidateQueries({ queryKey: ["usage_property_reports"] }).catch(() => undefined);
};

const invalidateReportBillingState = (queryClient: QueryClient) => {
  queryClient.invalidateQueries({ queryKey: ["addon_purchases"] }).catch(() => undefined);
  queryClient.invalidateQueries({ queryKey: ["usage_property_reports"] }).catch(() => undefined);
};

const buildReportCheckoutReturnPath = (
  listingId: string,
  checkoutStatus: "success" | "cancelled",
): string => {
  const params = new URLSearchParams(window.location.search);
  params.set("checkout", checkoutStatus);
  params.set("addon", "property_report_single");
  params.set("target_id", listingId);
  const query = params.toString();
  return `${window.location.pathname}${query ? `?${query}` : ""}`;
};

const clearReportCheckoutReturnParams = () => {
  const params = new URLSearchParams(window.location.search);
  params.delete("checkout");
  params.delete("addon");
  params.delete("target_id");
  const query = params.toString();
  window.history.replaceState(
    null,
    "",
    `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`,
  );
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
    if (osRes?.retry_after_ms && osRes.retry_after_ms > 0) {
      setUnavailableReason(null);
      toast.info(osRes.reason ?? ui("Report generation is in progress. Please retry shortly.", "Η δημιουργία της αναφοράς βρίσκεται σε εξέλιξη. Δοκιμάστε ξανά σε λίγο."));
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
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 40_000);

    try {
      const { data: osRes, error } = await supabase.functions.invoke<OsReportResponse>("fetch-report-from-os", {
        signal: controller.signal,
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
      window.clearTimeout(timeoutId);
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

const FreeReportOptionsContent = ({
  checkoutLoading,
  onPurchaseReport,
}: {
  checkoutLoading: boolean;
  onPurchaseReport: () => void;
}) => (
  <div className="text-center space-y-3">
    <p className="text-xs text-muted-foreground leading-relaxed">
      {ui(
        `Free plans do not include property reports. Upgrade for included reports or buy one for EUR ${REPORT_EXTRA_COST}.`,
        `Τα δωρεάν πλάνα δεν περιλαμβάνουν αναφορές ακινήτων. Αναβαθμίστε για περιλαμβανόμενες αναφορές ή αγοράστε μία για EUR ${REPORT_EXTRA_COST}.`,
      )}
    </p>
    <Button className="w-full bg-gradient-primary border-0 text-primary-foreground gap-2" asChild>
      <Link to="/pricing">
        <Zap className="w-4 h-4" /> {ui("Upgrade to Pro", "Αναβάθμιση σε Pro")}
      </Link>
    </Button>
    <Button
      className="w-full gap-2"
      variant="outline"
      onClick={onPurchaseReport}
      disabled={checkoutLoading}
    >
      {checkoutLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardList className="w-4 h-4" />}
      {ui("Buy One-Off Report", "Αγορά μεμονωμένης αναφοράς")}
    </Button>
  </div>
);

const UnavailableContent = ({ reason }: { reason: string }) => (
  <div className="text-center space-y-3">
    <p className="text-xs text-muted-foreground leading-relaxed">{reason}</p>
    <Button className="w-full gap-2" disabled variant="secondary">
      <ClipboardList className="w-4 h-4" />
      {ui("Report unavailable", "Η αναφορά δεν είναι διαθέσιμη")}
    </Button>
  </div>
);

const LoadedReportContent = ({ osReport }: { osReport: OsPrintableReport }) => (
  <div className="space-y-3">
    <p className="text-xs text-muted-foreground leading-relaxed">
      {ui("MAIProp OS generated the printable property report for this listing.", "Το mAI Prop OS δημιούργησε εκτυπώσιμη αναφορά ακινήτου για αυτή την αγγελία.")}
    </p>
    <div className="grid grid-cols-1 gap-2">
      <Button
        className="w-full bg-gradient-primary border-0 text-primary-foreground gap-2"
        onClick={() => downloadHtmlReport(osReport.html, osReport.fileName)}
      >
        <Download className="w-4 h-4" />
        {ui("Download HTML", "Λήψη HTML")}
      </Button>
      <Button
        className="w-full gap-2"
        variant="outline"
        onClick={() => openPrintablePdf(osReport.html)}
      >
        <Printer className="w-4 h-4" />
        {ui("Print / Save PDF", "Εκτύπωση / Αποθήκευση PDF")}
      </Button>
    </div>
    <p className="text-[10px] text-muted-foreground">{ui("Source: MAIProp OS - HTML report", "Πηγή: mAI Prop OS - Αναφορά HTML")}</p>
  </div>
);

const ExtraReportContent = ({
  checkoutLoading,
  onPurchaseExtraReport,
}: {
  checkoutLoading: boolean;
  onPurchaseExtraReport: () => void;
}) => (
  <div className="text-center space-y-3">
    <p className="text-xs text-muted-foreground leading-relaxed">
      {ui(`Included reports used this month. Extra reports cost EUR ${REPORT_EXTRA_COST} each.`, `Οι περιλαμβανόμενες αναφορές του μήνα έχουν χρησιμοποιηθεί. Κάθε επιπλέον αναφορά κοστίζει EUR ${REPORT_EXTRA_COST}.`)}
    </p>
    <Button
      className="w-full bg-gradient-primary border-0 text-primary-foreground gap-2"
      onClick={onPurchaseExtraReport}
      disabled={checkoutLoading}
    >
      {checkoutLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
      {ui("Get Extra Report", "Αγορά επιπλέον αναφοράς")}
    </Button>
    <p className="text-[10px] text-muted-foreground">{ui(`EUR ${REPORT_EXTRA_COST} per extra report`, `EUR ${REPORT_EXTRA_COST} ανά επιπλέον αναφορά`)}</p>
  </div>
);

const LoadReportContent = ({
  currentUnavailableReason,
  includedReportsRemaining,
  isUnlimited,
  loadReport,
  purchasedCreditsRemaining,
  reportLoading,
}: {
  currentUnavailableReason: string | null;
  includedReportsRemaining: number;
  isUnlimited: boolean;
  loadReport: () => void;
  purchasedCreditsRemaining: number;
  reportLoading: boolean;
}) => (
  <div className="text-center space-y-3">
    {isUnlimited ? (
      <p className="text-[10px] text-muted-foreground">
        {ui("Unlimited reports with your business plan", "Απεριόριστες αναφορές με το επαγγελματικό πλάνο σας")}
      </p>
    ) : purchasedCreditsRemaining > 0 ? (
      <p className="text-[10px] text-muted-foreground">
        {ui(
          `${purchasedCreditsRemaining} purchased report credit${purchasedCreditsRemaining === 1 ? "" : "s"} available`,
          `${purchasedCreditsRemaining} αγορασμέν${purchasedCreditsRemaining === 1 ? "η πίστωση" : "ες πιστώσεις"} αναφοράς διαθέσιμ${purchasedCreditsRemaining === 1 ? "η" : "ες"}`,
        )}
      </p>
    ) : includedReportsRemaining > 0 ? (
      <p className="text-[10px] text-muted-foreground">
        {ui(
          `${includedReportsRemaining} included report${includedReportsRemaining === 1 ? "" : "s"} remaining this month`,
          `${includedReportsRemaining} περιλαμβανόμεν${includedReportsRemaining === 1 ? "η αναφορά απομένει" : "ες αναφορές απομένουν"} αυτόν τον μήνα`,
        )}
      </p>
    ) : null}
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
  canLoadReport: boolean;
  currentUnavailableReason: string | null;
  includedReportsRemaining: number;
  isPro: boolean;
  isUnlimited: boolean;
  loadReport: () => void;
  osReport: OsPrintableReport | null;
  purchaseExtraReport: () => void;
  purchaseExtraReportLoading: boolean;
  purchasedCreditsRemaining: number;
  reportLoading: boolean;
};

type ReportCardViewState = {
  content: ReactNode;
  reportLoaded: boolean;
};

const REPORT_CONTENT_RULES = [
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
    when: ({ canLoadReport, isPro }: ReportContentContext) => !canLoadReport && !isPro,
    render: ({ purchaseExtraReport, purchaseExtraReportLoading }: ReportContentContext) => (
      <FreeReportOptionsContent
        checkoutLoading={purchaseExtraReportLoading}
        onPurchaseReport={purchaseExtraReport}
      />
    ),
  },
  {
    when: ({ canLoadReport }: ReportContentContext) => !canLoadReport,
    render: ({ purchaseExtraReport, purchaseExtraReportLoading }: ReportContentContext) => (
      <ExtraReportContent
        checkoutLoading={purchaseExtraReportLoading}
        onPurchaseExtraReport={purchaseExtraReport}
      />
    ),
  },
];

const FALLBACK_CONTENT_RULE = {
  render: (context: ReportContentContext) => <LoadReportContent {...context} />,
};

const getReportCardClass = (reportLoaded: boolean) => [
  "glass-card rounded-2xl overflow-hidden border",
  reportLoaded ? "border-primary/30" : "border-primary/20",
].join(" ");

const PARTICIPANT_REPORT_AUDIENCES = new Set(["buyer", "seller"]);
const REPORT_AUDIENCES = new Set([
  "buyer",
  "seller",
  "agent",
  "developer",
  "professional",
  "investor",
  "institutional",
]);

const hasUnlimitedReportAccess = (
  isPro: boolean,
  profile: ReturnType<typeof useAuth>["profile"],
) => {
  const participantType = profile?.role && REPORT_AUDIENCES.has(profile.role)
    ? profile.role
    : getParticipantTypeFromProfile(profile);
  return isPro && (
    isPlatformAdmin(profile) || !PARTICIPANT_REPORT_AUDIENCES.has(participantType)
  );
};

const getReportAccess = ({
  isPro,
  profile,
  purchasedCreditsRemaining,
  reportCount,
}: {
  isPro: boolean;
  profile: ReturnType<typeof useAuth>["profile"];
  purchasedCreditsRemaining: number;
  reportCount: number;
}) => {
  const isUnlimited = hasUnlimitedReportAccess(isPro, profile);
  const includedReports = isPro && !isUnlimited ? REPORT_INCLUDED : 0;
  const includedReportsRemaining = Math.max(includedReports - reportCount, 0);
  const safePurchasedCredits = Math.max(purchasedCreditsRemaining, 0);

  return {
    canLoadReport: isUnlimited || includedReportsRemaining > 0 || safePurchasedCredits > 0,
    includedReportsRemaining,
    isUnlimited,
    purchasedCreditsRemaining: safePurchasedCredits,
  };
};

const usePropertyReportCardView = ({ listingId, listing }: Props): ReportCardViewState => {
  const { profile } = useAuth();
  const { isPro } = useSubscription();
  const queryClient = useQueryClient();
  const hasUnlimitedReports = hasUnlimitedReportAccess(isPro, profile);
  const { data: reportCount = 0 } = useReportUsage({ enabled: !hasUnlimitedReports });
  const { data: remainingAddonCredits = 0 } = usePropertyReportAddonCredits({
    enabled: !hasUnlimitedReports,
  });
  const [purchaseExtraReportLoading, setPurchaseExtraReportLoading] = useState(false);
  const {
    currentUnavailableReason,
    loadReport,
    osReport,
    reportLoaded,
    reportLoading,
  } = usePropertyReportLoader(listingId, listing);
  const reportAccess = getReportAccess({
    isPro,
    profile,
    purchasedCreditsRemaining: remainingAddonCredits,
    reportCount,
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("addon") !== "property_report_single" || params.get("target_id") !== listingId) return;

    const checkoutStatus = params.get("checkout");
    if (checkoutStatus === "success") {
      invalidateReportBillingState(queryClient);
      toast.success(
        ui(
          "Report credit added. You can load the property report now.",
          "Η πίστωση αναφοράς προστέθηκε. Μπορείτε να φορτώσετε την αναφορά ακινήτου τώρα.",
        ),
      );
      clearReportCheckoutReturnParams();
    } else if (checkoutStatus === "cancelled") {
      toast.info(ui("Report checkout cancelled. No charge was made.", "Το checkout αναφοράς ακυρώθηκε. Δεν έγινε χρέωση."));
      clearReportCheckoutReturnParams();
    }
  }, [listingId, queryClient]);

  const purchaseExtraReport = async () => {
    setPurchaseExtraReportLoading(true);
    try {
      window.location.href = await createAddonCheckoutUrl("property_report_single", {
        targetType: "listing",
        targetId: listingId,
        successUrl: buildReportCheckoutReturnPath(listingId, "success"),
        cancelUrl: buildReportCheckoutReturnPath(listingId, "cancelled"),
      });
    } catch (err: unknown) {
      toast.error(
        (err instanceof Error ? err.message : null) ??
          ui("Could not start report checkout.", "Δεν ήταν δυνατή η έναρξη checkout για την αναφορά."),
      );
      setPurchaseExtraReportLoading(false);
    }
  };
  const contentContext = {
    ...reportAccess,
    currentUnavailableReason,
    isPro,
    loadReport,
    osReport,
    purchaseExtraReport,
    purchaseExtraReportLoading,
    reportLoading,
  };
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
