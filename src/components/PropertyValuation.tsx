import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronUp, Loader2, Zap } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { SignInForAI } from "@/components/SignInForAI";
import { useAuth } from "@/contexts/AuthContext";
import { getAiErrorMessage } from "@/lib/aiErrorUtils";
import { invokeAuthenticatedFunction } from "@/lib/invokeAuthenticatedFunction";
import { parseMutationInput, propertyValuationBodySchema } from "@/lib/mutationSchemas";
import { parseValuationResponseV2, selectPrimaryValuation, type ValuationResponseV2 } from "@/lib/valuationResult";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

export interface PropertyValuationProps {
  title: string; city: string; address?: string; price: number; sqm: number;
  bedrooms?: number | null; bathrooms?: number | null; propertyType?: string; listingType?: string;
  openHouseTransactionType?: "sale" | "rent" | null; askingMonthlyRent?: number | null;
  floor?: number | null; totalFloors?: number | null; yearBuilt?: number | null;
  heatingSystem?: string | null; energyClass?: string | null; pricePerSqm?: number | null;
  hasParking?: boolean | null; hasPool?: boolean | null; hasElevator?: boolean | null; hasGarden?: boolean | null;
  hasStorage?: boolean | null; hasBalcony?: boolean | null; hasView?: boolean | null; hasFurnished?: boolean | null;
  region?: string | null; description?: string | null; tags?: string[] | null; ownershipStatus?: string;
  ownershipPercentage?: number; auctionCourt?: string | null; plotSurface?: number | null; condition?: string | null;
  isNeoclassical?: boolean | null; isPreserved?: boolean | null; distanceFromSea?: number | null;
  withinCityPlan?: boolean | null; withinSettlement?: boolean | null; buildingAllowance?: number | null;
  coverageRatio?: number | null; isBuildable?: boolean | null; cadastreNumber?: string | null;
  hasLandConcession?: boolean | null; landUse?: string | null; latitude?: number | null; longitude?: number | null;
  listingId?: string | null;
}

const TIMEOUT_MS = 45_000;
const money = (value: number, unit: "EUR" | "EUR/month") => `€${value.toLocaleString("el-GR")}${unit === "EUR/month" ? "/mo" : ""}`;
const sourceLabel = (source: string) => source === "os_prediction" ? "OS model prediction" : source === "ai_estimate" ? "Unverified AI estimate" : "Derived estimate";

export default function PropertyValuation(props: PropertyValuationProps) {
  const { user } = useAuth();
  const { i18n } = useTranslation();
  const isGreek = i18n.language?.toLowerCase().startsWith("el") ?? false;
  const tr = (en: string, el: string) => isGreek ? el : en;
  const queryClient = useQueryClient();
  const [result, setResult] = useState<ValuationResponseV2 | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const requestGeneration = useRef(0);
  const subjectKey = `${props.listingId ?? ""}|${props.city}|${props.price}|${props.sqm}`;
  const primary = selectPrimaryValuation(result);

  useEffect(() => {
    requestGeneration.current += 1;
    setResult(null); setErrorMessage(null); setExpanded(false); setLoading(false);
  }, [subjectKey, user?.id]);

  const runValuation = async () => {
    if (!user) return;
    setLoading(true); setErrorMessage(null);
    const generation = ++requestGeneration.current;
    try {
      const body = parseMutationInput(propertyValuationBodySchema, { ...props, responseVersion: 2 }, "property valuation");
      const { data, error } = await invokeAuthenticatedFunction<unknown>("property-valuation", { body, timeout: TIMEOUT_MS });
      if (error) throw error;
      const parsed = parseValuationResponseV2(data);
      if (!parsed) throw new Error(tr("Valuation returned an unsupported response", "Η εκτίμηση επέστρεψε μη υποστηριζόμενη απάντηση"));
      if (generation !== requestGeneration.current) return;
      setResult(parsed); setExpanded(true);
      void queryClient.invalidateQueries({ queryKey: ["usage_ai_calls"] });
    } catch (error: unknown) {
      const message = getAiErrorMessage(error, null, tr("Valuation evidence is unavailable", "Τα στοιχεία εκτίμησης δεν είναι διαθέσιμα"));
      if (generation === requestGeneration.current) { setErrorMessage(message); toast.error(message); }
    } finally { if (generation === requestGeneration.current) setLoading(false); }
  };

  return (
    <div className="glass-card rounded-2xl overflow-hidden border border-primary/20">
      <div className="flex items-center gap-2 px-5 py-3.5 bg-primary/5 border-b border-primary/20">
        <Zap className="w-4 h-4 text-primary" />
        <h4 className="font-display font-semibold text-sm flex-1">{tr("Valuation analysis", "Ανάλυση εκτίμησης")}</h4>
      </div>
      <div className="p-5 space-y-4">
        {!user && <SignInForAI feature={tr("Property valuation", "Εκτίμηση ακινήτου")} />}
        {user && !result && (
          <div className="space-y-3 text-center">
            <p className="text-xs text-muted-foreground">{tr("Request a source-labelled estimate or partial analysis. Not a formal appraisal.", "Ζητήστε εκτίμηση με σαφή πηγή ή μερική ανάλυση. Δεν αποτελεί επίσημη εκτίμηση.")}</p>
            {errorMessage && <div role="alert" className="flex gap-2 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-left text-xs text-destructive"><AlertTriangle className="h-3.5 w-3.5" />{errorMessage}</div>}
            <Button className="w-full gap-2" onClick={runValuation} disabled={loading}>
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" />{tr("Analysing...", "Ανάλυση...")}</> : <><Zap className="w-4 h-4" />{tr("Run valuation analysis", "Εκτέλεση ανάλυσης εκτίμησης")}</>}
            </Button>
          </div>
        )}
        {user && result && (
          <div className="space-y-4">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{tr("Primary estimate", "Κύρια εκτίμηση")}</p>
              <p className="font-display text-2xl font-black">{primary ? money(primary.value, primary.unit) : tr("Unavailable", "Μη διαθέσιμη")}</p>
              {primary && <p className="text-xs text-muted-foreground">{sourceLabel(primary.source)} · {primary.basis.replace(/_/g, " ")}{result.transaction === "auction" && primary.basis === "market_value" ? ` · ${tr("clear-title assumption; documents not verified", "παραδοχή καθαρού τίτλου· τα έγγραφα δεν επαληθεύτηκαν")}` : ""}</p>}
              {primary?.rangeLow != null && primary.rangeHigh != null && <p className="text-xs font-mono text-muted-foreground">{money(primary.rangeLow, primary.unit)} — {money(primary.rangeHigh, primary.unit)}</p>}
            </div>
            {result.providerPrediction && result.providerPrediction.unit === null && (
              <div className="rounded-lg border border-border bg-secondary/50 p-3 text-xs">
                <strong>{tr("Rental model estimate", "Εκτίμηση μοντέλου μίσθωσης")}:</strong> €{result.providerPrediction.value.toLocaleString("el-GR")} · {tr("rental period unavailable", "η περίοδος μίσθωσης δεν είναι διαθέσιμη")}
              </div>
            )}
            {result.transaction === "auction" && result.estimatedValue != null && result.auctionAdjustedValue != null && (
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs"><strong>{tr("Separate OS auction-model estimate", "Ξεχωριστή εκτίμηση μοντέλου πλειστηριασμού OS")}:</strong> {money(result.estimatedValue, "EUR")} · {tr("not labelled as clean-market, bid or execution value", "δεν χαρακτηρίζεται ως καθαρή εμπορική αξία, προσφορά ή αξία εκτέλεσης")}</div>
            )}
            {result.marketComparisonPct != null && <p className="text-xs"><strong>{tr("Asking versus estimate", "Ζητούμενη τιμή έναντι εκτίμησης")}:</strong> {result.marketComparisonPct > 0 ? "+" : ""}{result.marketComparisonPct}% · {result.pricingPosition}</p>}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg bg-secondary p-2">{tr("Valuation density", "Πυκνότητα εκτίμησης")}: {result.pricePerSqmEstimate == null ? tr("Unavailable", "Μη διαθέσιμη") : `€${result.pricePerSqmEstimate.toLocaleString("el-GR")}/m²${result.valueUnit === "EUR/month" ? "/mo" : ""}`}</div>
              <div className="rounded-lg bg-secondary p-2">{tr("Gross annual yield", "Μικτή ετήσια απόδοση")}: {result.rentalYieldEstimate == null ? tr("Unavailable", "Μη διαθέσιμη") : `${result.rentalYieldEstimate}%`}</div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg bg-secondary p-2">{tr("Confidence", "Εμπιστοσύνη")}: {result.confidence == null ? tr("Unavailable", "Μη διαθέσιμη") : `${result.confidence}/100 (${result.confidenceLabel})`}</div>
              <div className="rounded-lg bg-secondary p-2">{tr("Liquidity", "Ρευστότητα")}: {result.liquidityScore == null ? tr("Unavailable", "Μη διαθέσιμη") : `${result.liquidityScore}/100`}</div>
            </div>
            {result.summary && <p className="text-xs leading-relaxed text-muted-foreground">{result.summary}</p>}
            {result.keyFactors.length > 0 && <div className="space-y-1 text-xs">{result.keyFactors.map((factor) => <p key={`${factor.factor}-${factor.note}`}><strong>{factor.factor}:</strong> {factor.note} <span className="text-muted-foreground">({factor.impact})</span></p>)}</div>}
            {result.redFlags.length > 0 && <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-xs"><strong>{tr("Reported concerns", "Αναφερόμενες επισημάνσεις")}:</strong><ul>{result.redFlags.map((flag) => <li key={flag}>• {flag}</li>)}</ul></div>}
            {(result.renovationPotential || result.highestBestUseHint) && <div className="space-y-1 text-xs text-muted-foreground">{result.renovationPotential && <p><strong>{tr("Renovation potential", "Δυνατότητα ανακαίνισης")}:</strong> {result.renovationPotential}</p>}{result.highestBestUseHint && <p><strong>{tr("Potential use", "Πιθανή χρήση")}:</strong> {result.highestBestUseHint}</p>}</div>}
            <button type="button" className="flex w-full items-center justify-between text-xs font-semibold" onClick={() => setExpanded((value) => !value)}>
              {tr("Method, legal context and limitations", "Μέθοδος, νομικό πλαίσιο και περιορισμοί")}{expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {expanded && <div className="space-y-2 rounded-lg border border-border p-3 text-xs text-muted-foreground">
              <p><strong>{tr("Method", "Μέθοδος")}:</strong> {result.methodUsed}</p>
              <p><strong>{tr("Legal assessment", "Νομική αξιολόγηση")}:</strong> {result.legalSummary ?? tr("Unavailable — documents were not reviewed.", "Μη διαθέσιμη — δεν ελέγχθηκαν έγγραφα.")}</p>
              {result.taxSummary && <p><strong>{tr("Tax context", "Φορολογικό πλαίσιο")}:</strong> {result.taxSummary}</p>}
              {result.evidence.limitations.map((limitation) => <p key={limitation}>• {limitation}</p>)}
            </div>}
            <Button variant="outline" size="sm" onClick={runValuation} disabled={loading}>{loading ? tr("Refreshing...", "Ανανέωση...") : tr("Refresh analysis", "Ανανέωση ανάλυσης")}</Button>
          </div>
        )}
      </div>
    </div>
  );
}
