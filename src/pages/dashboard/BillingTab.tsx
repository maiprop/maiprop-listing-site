import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSubscription } from "@/hooks/useSubscription";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import {
  CreditCard,
  FileText,
  ExternalLink,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Calendar,
  RefreshCw,
  Zap,
  Tag,
  Crown,
  Star,
  BarChart2,
  Globe,
  Bell,
  Layers,
  Shield,
  TrendingUp,
  Users,
  UserCheck,
  Briefcase,
  Mail,
} from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { getParticipantTypeFromProfile } from "@/lib/participantConfig";

interface Invoice {
  id: string;
  number: string | null;
  status: string | null;
  amount_paid: number;
  currency: string;
  created: string;
  period_start: string | null;
  period_end: string | null;
  hosted_invoice_url: string | null;
  invoice_pdf: string | null;
  description: string | null;
}

interface BillingInfo {
  invoices: Invoice[];
  billing_configured?: boolean;
  customer_found?: boolean;
  portal_eligible?: boolean;
  billing_reason?: string;
  subscription: {
    id: string;
    status: string;
    current_period_end: string;
    cancel_at_period_end: boolean;
    plan_name: string;
    amount: number | null;
    currency: string;
    interval: string;
  } | null;
}

// ── Role-specific add-ons ──────────────────────────────────────────────────
type AddonItem = {
  name: string;
  price: string;
  unit: string;
  desc: string;
  icon: React.ElementType;
  badge?: string;
};
type AddonSection = { category: string; accent: string; items: AddonItem[] };

const ADDONS_BY_ROLE: Record<string, AddonSection[]> = {
  buyer: [
    {
      category: "AI Reports — pay as you go",
      accent: "primary",
      items: [
        {
          name: "Single AI Valuation",
          price: "€39",
          unit: "/ report",
          desc: "Full AI valuation with market comparison, yield estimate & confidence score.",
          icon: BarChart2,
        },
        {
          name: "Valuation Bundle × 5",
          price: "€149",
          unit: "bundle",
          desc: "Save 24% vs. single. Ideal when comparing several properties.",
          icon: TrendingUp,
          badge: "Save 24%",
        },
        {
          name: "Property Report",
          price: "€49",
          unit: "/ report",
          desc: "Ownership history, registered liens, legal encumbrances & cadastral data.",
          icon: FileText,
        },
        {
          name: "Neighbourhood Report",
          price: "€19",
          unit: "/ report",
          desc: "Price trends, safety index, POIs, development projects & investment outlook.",
          icon: Globe,
        },
        {
          name: "Neighbourhood Bundle × 3",
          price: "€39",
          unit: "bundle",
          desc: "Save 31% vs. single. Insights on three areas at once.",
          icon: Globe,
          badge: "Save 31%",
        },
      ],
    },
  ],
  seller: [
    {
      category: "Listing Boosts",
      accent: "amber",
      items: [
        {
          name: "Featured Listing",
          price: "€39",
          unit: "/ 30 days",
          desc: "Homepage carousel + search top placement. Avg. 3× more views.",
          icon: Crown,
        },
        {
          name: "Priority Placement",
          price: "€59",
          unit: "/ 30 days",
          desc: "Pinned above all non-priority results for your area and type.",
          icon: Star,
        },
        {
          name: "Featured + Priority",
          price: "€79",
          unit: "/ 30 days",
          desc: "Both boosts together — maximum exposure at a bundled rate.",
          icon: Zap,
          badge: "Best value",
        },
        {
          name: "Extra Listing Slot",
          price: "€12",
          unit: "/ listing",
          desc: "Add one listing beyond your plan quota.",
          icon: Layers,
        },
      ],
    },
    {
      category: "AI Reports",
      accent: "primary",
      items: [
        {
          name: "Property Report",
          price: "€49",
          unit: "/ report",
          desc: "Full ownership history, liens & legal status — ideal before listing.",
          icon: FileText,
        },
        {
          name: "Neighbourhood Report",
          price: "€19",
          unit: "/ report",
          desc: "Price trends & comparable sales to help price your property.",
          icon: Globe,
        },
      ],
    },
  ],
  agent: [
    {
      category: "Listing Boosts",
      accent: "amber",
      items: [
        {
          name: "Featured Listing",
          price: "€39",
          unit: "/ 30 days",
          desc: "Homepage carousel + search top placement. Avg. 3× more views.",
          icon: Crown,
        },
        {
          name: "Priority Placement",
          price: "€59",
          unit: "/ 30 days",
          desc: "Pinned above all non-priority results for your area and type.",
          icon: Star,
        },
        {
          name: "Featured + Priority",
          price: "€79",
          unit: "/ 30 days",
          desc: "Both boosts together — maximum exposure at a bundled rate.",
          icon: Zap,
          badge: "Best value",
        },
        {
          name: "Extra Listing Slot",
          price: "€12",
          unit: "/ listing",
          desc: "Add one listing beyond your plan quota.",
          icon: Layers,
        },
      ],
    },
    {
      category: "AI Reports",
      accent: "primary",
      items: [
        {
          name: "Single AI Valuation",
          price: "€39",
          unit: "/ report",
          desc: "Full AI valuation for client presentations or offer pricing.",
          icon: BarChart2,
        },
        {
          name: "Valuation Bundle × 5",
          price: "€149",
          unit: "bundle",
          desc: "Save 24% — ideal for busy agents handling multiple clients.",
          icon: TrendingUp,
          badge: "Save 24%",
        },
        {
          name: "Neighbourhood Report",
          price: "€19",
          unit: "/ report",
          desc: "Area intel to share with buyers — price trends, safety, POIs.",
          icon: Globe,
        },
      ],
    },
    {
      category: "Agency Add-ons",
      accent: "rose",
      items: [
        {
          name: "Extra Agent Seat",
          price: "€39",
          unit: "/ seat / mo",
          desc: "Add another agent to your agency under a single Pro plan. Shared listing pool.",
          icon: Users,
        },
        {
          name: "Agency-Branded Profile",
          price: "€49",
          unit: "/ month",
          desc: "Custom logo, colours and team page on your agency profile.",
          icon: Crown,
        },
        {
          name: "Dedicated Account Mgr",
          price: "€199",
          unit: "/ month",
          desc: "A named account manager for onboarding, training & support.",
          icon: UserCheck,
        },
        {
          name: "White-label Domain",
          price: "€149",
          unit: "/ month",
          desc: "Serve listings on your own domain (yourname.gr).",
          icon: Globe,
          badge: "Enterprise",
        },
      ],
    },
  ],
  developer: [
    {
      category: "Listing Boosts",
      accent: "amber",
      items: [
        {
          name: "Featured New Build",
          price: "€39",
          unit: "/ 30 days",
          desc: "Showcase at the top of the New Builds section — high-intent buyers.",
          icon: Crown,
        },
        {
          name: "Priority Placement",
          price: "€59",
          unit: "/ 30 days",
          desc: "Pinned above all non-priority results across all listing types.",
          icon: Star,
        },
        {
          name: "Extra Project Listing",
          price: "€12",
          unit: "/ listing",
          desc: "Add a project listing beyond your plan quota.",
          icon: Layers,
        },
      ],
    },
    {
      category: "Market Intelligence",
      accent: "primary",
      items: [
        {
          name: "Neighbourhood Report",
          price: "€19",
          unit: "/ report",
          desc: "Price trends, demand signals & comparable sales for site selection.",
          icon: Globe,
        },
        {
          name: "AI Property Valuation",
          price: "€39",
          unit: "/ report",
          desc: "Pre-launch pricing intelligence for individual units.",
          icon: BarChart2,
        },
        {
          name: "Market Intelligence",
          price: "€199",
          unit: "/ month",
          desc: "Greek property price index, transaction comps, regional trend reports.",
          icon: TrendingUp,
        },
      ],
    },
  ],
  professional: [
    {
      category: "Directory & Lead Boosts",
      accent: "rose",
      items: [
        {
          name: "Featured Professional",
          price: "€59",
          unit: "/ month",
          desc: "Top-of-category placement in the Professionals directory for 30 days.",
          icon: Crown,
        },
        {
          name: "Extra Priority Ad",
          price: "€8",
          unit: "/ ad",
          desc: "Push a listing to the top of search results when acting as a property manager.",
          icon: Bell,
        },
      ],
    },
    {
      category: "Premium Tools",
      accent: "rose",
      items: [
        {
          name: "API Access",
          price: "€59",
          unit: "/ month",
          desc: "Programmatic access to your bookings, leads and AI tools — for valuers and legal practices.",
          icon: Globe,
          badge: "Pro+",
        },
        {
          name: "Referral Network Slot",
          price: "€39",
          unit: "/ month",
          desc: "Get matched with cross-discipline referrals from agents and other professionals.",
          icon: Briefcase,
        },
        {
          name: "Extra Client Seat",
          price: "€19",
          unit: "/ seat / mo",
          desc: "Add a colleague or paralegal to your account under a single Pro plan.",
          icon: Users,
        },
        {
          name: "Branded Email Templates",
          price: "€15",
          unit: "/ month",
          desc: "Send all client communications from your own branded templates.",
          icon: Mail,
        },
      ],
    },
    {
      category: "AI Tools",
      accent: "primary",
      items: [
        {
          name: "AI Property Valuation",
          price: "€39",
          unit: "/ report",
          desc: "Full AI-backed valuation — useful for valuers and legal due diligence.",
          icon: BarChart2,
        },
        {
          name: "Neighbourhood Report",
          price: "€19",
          unit: "/ report",
          desc: "Area analysis to accompany legal opinions or architectural briefs.",
          icon: Globe,
        },
        {
          name: "Property Report",
          price: "€49",
          unit: "/ report",
          desc: "Ownership history, registered liens & cadastral data for legal review.",
          icon: FileText,
        },
      ],
    },
  ],
  investor: [
    {
      category: "AI Deal Intelligence",
      accent: "primary",
      items: [
        {
          name: "Single AI Valuation",
          price: "€39",
          unit: "/ report",
          desc: "Full AI valuation with yield estimate — sharpen your offer pricing.",
          icon: BarChart2,
        },
        {
          name: "Valuation Bundle × 5",
          price: "€149",
          unit: "bundle",
          desc: "Save 24% — ideal when assessing multiple Quick Sale opportunities.",
          icon: TrendingUp,
          badge: "Save 24%",
        },
        {
          name: "Property Report",
          price: "€49",
          unit: "/ report",
          desc: "Liens, encumbrances & legal status before committing to a deal.",
          icon: FileText,
        },
        {
          name: "Neighbourhood Report",
          price: "€19",
          unit: "/ report",
          desc: "Price trends, rental demand & investment outlook for the target area.",
          icon: Globe,
        },
        {
          name: "Neighbourhood Bundle × 3",
          price: "€39",
          unit: "bundle",
          desc: "Save 31% — compare three micro-markets side by side.",
          icon: Globe,
          badge: "Save 31%",
        },
      ],
    },
  ],
};

// investor and institutional share the same add-ons
ADDONS_BY_ROLE["institutional"] = ADDONS_BY_ROLE["investor"];

const ADDON_KEY_BY_NAME: Record<string, string> = {
  "Single AI Valuation": "valuation_single",
  "AI Property Valuation": "valuation_single",
  "Property Report": "property_report_single",
  "Neighbourhood Report": "neighbourhood_report_single",
  "Featured Listing": "featured_listing",
  "Featured New Build": "featured_listing",
  "Priority Placement": "priority_placement",
  "Featured + Priority": "featured_priority_bundle",
  "Extra Listing Slot": "extra_listing",
  "Extra Project Listing": "extra_listing",
  "Market Intelligence": "market_intelligence",
  "Extra Agent Seat": "agent_extra_seat",
  "Agency-Branded Profile": "agency_branded_profile",
  "Dedicated Account Mgr": "agency_dedicated_manager",
  "White-label Domain": "agency_white_label",
  "Featured Professional": "featured_professional",
  "Extra Priority Ad": "extra_priority_ad",
  "API Access": "professional_api_access",
  "Referral Network Slot": "professional_referral_network",
  "Extra Client Seat": "professional_extra_seat",
  "Branded Email Templates": "professional_branded_email",
};

const ADDON_KEY_PREFIXES: Array<[string, string]> = [
  ["Valuation Bundle", "valuation_bundle"],
  ["Neighbourhood Bundle", "neighbourhood_report_bundle"],
];

const resolveAddonKey = (item: AddonItem): string | null => {
  const prefixMatch = ADDON_KEY_PREFIXES.find(([prefix]) => item.name.startsWith(prefix));
  return prefixMatch?.[1] ?? ADDON_KEY_BY_NAME[item.name] ?? null;
};

const createAddonCheckoutUrl = async (addonKey: string): Promise<string> => {
  const { data: checkout, error } = await supabase.functions.invoke("create-checkout", {
    body: {
      addon_key: addonKey,
      success_url: "/dashboard/billing?checkout=success",
      cancel_url: "/dashboard/billing?checkout=cancelled",
    },
  });

  if (error || !checkout?.url) {
    throw new Error(checkout?.error ?? error?.message ?? "Could not start add-on checkout");
  }

  return checkout.url;
};

const showManualAddonToast = () => {
  toast.info("This add-on is handled by the maiProp team.");
};

const showAddonCheckoutError = (e: unknown) => {
  toast.error(
    (e instanceof Error ? e.message : null) ?? "Could not start add-on checkout",
  );
};

const AddonCard = ({
  item,
  accent,
  loading,
  onPurchase,
}: {
  item: AddonItem;
  accent: string;
  loading: boolean;
  onPurchase: () => void;
}) => {
  const accentClasses = {
    amber: {
      border: "border-amber-500/20",
      bg: "bg-amber-500/10",
      icon: "text-amber-500",
    },
    primary: {
      border: "border-primary/20",
      bg: "bg-primary/10",
      icon: "text-primary",
    },
    rose: {
      border: "border-rose-500/20",
      bg: "bg-rose-500/10",
      icon: "text-rose-400",
    },
  }[accent] ?? {
    border: "border-border",
    bg: "bg-secondary",
    icon: "text-foreground",
  };

  return (
    <div
      className={cn(
        "relative rounded-xl border bg-card p-4 flex flex-col gap-2",
        accentClasses.border,
      )}
    >
      {item.badge && (
        <div className="absolute -top-2.5 right-3">
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 border border-emerald-500/30">
            {item.badge}
          </span>
        </div>
      )}
      <div className="flex items-start justify-between gap-2">
        <div
          className={cn(
            "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
            accentClasses.bg,
          )}
        >
          <item.icon className={cn("w-4 h-4", accentClasses.icon)} />
        </div>
        <div className="text-right">
          <p className="font-bold text-lg leading-none">{item.price}</p>
          <p className="text-[10px] text-muted-foreground">{item.unit}</p>
        </div>
      </div>
      <p className="font-semibold text-sm">{item.name}</p>
      <p className="text-xs text-muted-foreground leading-relaxed">
        {item.desc}
      </p>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="mt-auto gap-1.5"
        onClick={onPurchase}
        disabled={loading}
      >
        {loading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <CreditCard className="w-3.5 h-3.5" />
        )}
        Buy add-on
      </Button>
    </div>
  );
};

const useBillingInfo = () => {
  return useQuery<BillingInfo>({
    queryKey: ["billing-info"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("get-invoices");
      if (error) throw error;
      return data as BillingInfo;
    },
    staleTime: 60_000,
  });
};

const formatAmount = (amount: number, currency: string) => {
  return new Intl.NumberFormat("el-GR", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
};

import { formatDate } from "@/lib/format";

const StatusBadge = ({ status }: { status: string | null }) => {
  const map: Record<string, { cls: string; label: string }> = {
    paid: { cls: "bg-brand-emerald/15 text-brand-emerald", label: "Paid" },
    open: { cls: "bg-brand-gold/15 text-brand-gold", label: "Due" },
    void: { cls: "bg-muted text-muted-foreground", label: "Void" },
    draft: { cls: "bg-muted text-muted-foreground", label: "Draft" },
    uncollectible: {
      cls: "bg-destructive/15 text-destructive",
      label: "Uncollectible",
    },
  };
  const { cls, label } = map[status ?? ""] ?? {
    cls: "bg-muted text-muted-foreground",
    label: status ?? "—",
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cls}`}>
      {label}
    </span>
  );
};

export default function BillingTab() { // skipcq: JS-0067 - React route component is intentionally exported from this module.
  const navigate = useNavigate();
  const {
    isPro,
    subscriptionEnd,
    loading: subLoading,
    accessSource,
    hasStripeBilling,
    isInvestorManagedPlan,
    isManuallyManagedPlan,
  } = useSubscription();
  const { profile } = useAuth();
  const { data, isLoading, refetch, isRefetching, error } = useBillingInfo();
  const [portalLoading, setPortalLoading] = useState(false);
  const [addonLoadingKey, setAddonLoadingKey] = useState<string | null>(null);

  const participantType = getParticipantTypeFromProfile(profile) ?? "buyer";
  const addonSections: AddonSection[] =
    ADDONS_BY_ROLE[participantType] ?? ADDONS_BY_ROLE["buyer"];

  const openPortal = async () => {
    if (isLoading || !data) {
      toast.info("Billing details are still loading.");
      return;
    }
    if (!hasStripeBilling || data?.portal_eligible === false) {
      toast.info("This plan is managed outside the self-serve Stripe portal.");
      return;
    }
    setPortalLoading(true);
    try {
      const { data: pData, error } =
        await supabase.functions.invoke("customer-portal");
      if (error || !pData?.url)
        throw new Error(
          pData?.error ?? error?.message ?? "Could not open billing portal",
        );
      window.location.href = pData.url;
    } catch (e: unknown) {
      toast.error(
        (e instanceof Error ? e.message : null) ??
          "Could not open billing portal",
      );
      setPortalLoading(false);
    }
  };

  const purchaseAddon = async (item: AddonItem) => { // skipcq: JS-R1005 - Add-on purchase flow keeps eligibility, checkout, and toast feedback together.
    const addonKey = resolveAddonKey(item);
    if (!addonKey) {
      showManualAddonToast();
      return;
    }
    setAddonLoadingKey(addonKey);
    try {
      window.location.href = await createAddonCheckoutUrl(addonKey);
    } catch (e: unknown) {
      showAddonCheckoutError(e);
      setAddonLoadingKey(null);
    }
  };

  const sub = data?.subscription ?? null;
  const invoices = data?.invoices ?? [];
  const canManageBilling =
    isPro && hasStripeBilling && data?.portal_eligible !== false;
  const showsManualManagement =
    isInvestorManagedPlan ||
    isManuallyManagedPlan ||
    (!hasStripeBilling && isPro);
  const invoiceHistoryDescription =
    data?.billing_reason === "invoice_unavailable"
      ? "Stripe billing is connected, but invoice history could not be loaded on this refresh."
      : "Your last 12 invoices.";
  const emptyInvoiceCopy =
    showsManualManagement || data?.customer_found === false
      ? "This access is not currently backed by a Stripe invoice history in maiProp."
      : "No invoices yet. They'll appear here after your first payment.";

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">
            Billing & Payments
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your subscription, view invoices and update payment details.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => refetch()}
          disabled={isRefetching}
        >
          {isRefetching ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <RefreshCw className="w-3.5 h-3.5" />
          )}
          Refresh
        </Button>
      </div>

      {/* Current plan card */}
      <div className="glass-card rounded-2xl border border-border p-5 space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">
              Current plan
            </p>
            {subLoading || isLoading ? (
              <div className="h-7 w-32 bg-muted animate-pulse rounded" />
            ) : (
              <h2 className="font-display text-xl font-bold flex items-center gap-2">
                {sub ? (
                  <>
                    <Zap className="w-5 h-5 text-primary" />
                    {sub.plan_name}
                  </>
                ) : isInvestorManagedPlan ? (
                  "Investor managed plan"
                ) : isManuallyManagedPlan ? (
                  "Managed access"
                ) : (
                  "Free plan"
                )}
              </h2>
            )}
          </div>
          <div className="flex items-center gap-2">
            {canManageBilling ? (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={openPortal}
                disabled={portalLoading}
              >
                {portalLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <CreditCard className="w-3.5 h-3.5" />
                )}
                Manage billing
              </Button>
            ) : isPro ? (
              <Button variant="outline" size="sm" className="gap-1.5" disabled>
                <Shield className="w-3.5 h-3.5" />
                Managed by maiProp
              </Button>
            ) : (
              <Button
                size="sm"
                className="gap-1.5 bg-gradient-primary border-0 text-primary-foreground"
                onClick={() => navigate("/pricing")}
              >
                <Zap className="w-3.5 h-3.5" /> Upgrade
              </Button>
            )}
          </div>
        </div>

        {sub ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="bg-secondary rounded-xl p-3">
              <p className="text-xs text-muted-foreground mb-0.5">
                Monthly price
              </p>
              <p className="font-semibold">
                {sub.amount != null
                  ? formatAmount(sub.amount, sub.currency)
                  : "—"}{" "}
                <span className="text-xs font-normal text-muted-foreground">
                  /{sub.interval}
                </span>
              </p>
            </div>
            <div className="bg-secondary rounded-xl p-3">
              <p className="text-xs text-muted-foreground mb-0.5">Status</p>
              <div className="flex items-center gap-1.5">
                {sub.status === "active" ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-brand-emerald" />
                ) : (
                  <AlertCircle className="w-3.5 h-3.5 text-brand-gold" />
                )}
                <span className="font-semibold capitalize">{sub.status}</span>
              </div>
            </div>
            <div className="bg-secondary rounded-xl p-3">
              <p className="text-xs text-muted-foreground mb-0.5">
                {sub.cancel_at_period_end ? "Cancels on" : "Renews on"}
              </p>
              <p className="font-semibold flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                {formatDate(sub.current_period_end)}
              </p>
            </div>
          </div>
        ) : isPro ? (
          <div className="text-sm text-muted-foreground">
            {canManageBilling
              ? subscriptionEnd
                ? `Pro access active until ${formatDate(subscriptionEnd)}.`
                : "Pro access active."
              : accessSource === "investor"
                ? "Investor access is active and managed directly by maiProp."
                : "This access is active but managed outside the self-serve billing portal."}
          </div>
        ) : (
          <div className="rounded-xl bg-secondary p-4 text-sm text-muted-foreground">
            You're on the free plan. Upgrade to unlock analytics, unlimited
            viewings, saved searches and more.
          </div>
        )}
        {error && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-muted-foreground">
            Live billing details could not be fully refreshed right now. Your
            access state is still shown from the account profile.
          </div>
        )}
      </div>

      {/* Payment method */}
      {canManageBilling && (
        <div className="glass-card rounded-2xl border border-border p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">
                Payment method
              </p>
              <p className="text-sm text-muted-foreground">
                Manage your card and billing details via the Stripe customer
                portal.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 shrink-0"
              onClick={openPortal}
              disabled={portalLoading}
            >
              {portalLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <ExternalLink className="w-3.5 h-3.5" />
              )}
              Update card
            </Button>
          </div>
        </div>
      )}

      {/* Invoices */}
      <div className="glass-card rounded-2xl border border-border p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">
              Invoice history
            </p>
            <p className="text-sm text-muted-foreground">
              {invoiceHistoryDescription}
            </p>
          </div>
          <FileText className="w-5 h-5 text-muted-foreground" />
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-14 bg-muted animate-pulse rounded-xl" />
            ))}
          </div>
        ) : invoices.length === 0 ? (
          <div className="text-center py-10 text-sm text-muted-foreground">
            <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
            {emptyInvoiceCopy}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {invoices.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center justify-between gap-3 py-3 flex-wrap"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium">
                      {inv.number ?? inv.id.slice(-8)}
                    </p>
                    <StatusBadge status={inv.status} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formatDate(inv.created)}
                    {inv.period_start &&
                      inv.period_end &&
                      ` · ${formatDate(inv.period_start)} – ${formatDate(inv.period_end)}`}
                    {inv.description && ` · ${inv.description}`}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-sm">
                    {formatAmount(inv.amount_paid, inv.currency)}
                  </span>
                  <div className="flex items-center gap-1">
                    {inv.hosted_invoice_url && (
                      <a
                        href={inv.hosted_invoice_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        <ExternalLink className="w-3 h-3" /> View
                      </a>
                    )}
                    {inv.invoice_pdf && (
                      <a
                        href={inv.invoice_pdf}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline ml-2"
                      >
                        PDF
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Cancel / support */}
      {isPro && (
        <div className="text-center text-xs text-muted-foreground space-y-1">
          {canManageBilling ? (
            <p>
              To cancel your subscription, click{" "}
              <button
                className="underline hover:text-foreground"
                onClick={openPortal}
              >
                Manage billing
              </button>{" "}
              and choose "Cancel plan".
            </p>
          ) : (
            <p>
              Subscription changes for this access level are handled directly by
              the maiProp team.
            </p>
          )}
          <p>
            Need help?{" "}
            <a
              href="mailto:support@maiprop.co"
              className="underline hover:text-foreground"
            >
              support@maiprop.co
            </a>
          </p>
        </div>
      )}

      {/* ── Role-specific add-ons & pay-as-you-go ──────────────────── */}
      <div className="pt-4 border-t border-border">
        <div className="flex items-center gap-2 mb-1">
          <Tag className="w-4 h-4 text-muted-foreground" />
          <h2 className="font-display text-lg font-bold">
            Add-ons & Pay-as-you-go
          </h2>
        </div>
        <p className="text-sm text-muted-foreground mb-6">
          Your plan includes a generous baseline. Add exactly what you need — no
          upgrade required.
        </p>

        {(participantType === "investor" ||
          participantType === "institutional") && (
          <div className="mb-6 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 flex items-start gap-3">
            <Shield className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-foreground">
                Invitation-only access
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Your subscription tier and pricing were set when your
                application was approved. For subscription changes contact{" "}
                <a
                  href="mailto:investor@maiprop.co"
                  className="underline hover:text-foreground"
                >
                  investor@maiprop.co
                </a>
                . Add-ons below can be purchased on demand without changing your
                tier.
              </p>
            </div>
          </div>
        )}

        <div className="space-y-8">
          {addonSections.map((section) => (
            <div key={section.category}>
              <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">
                {section.category}
              </h3>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {section.items.map((item) => (
                  <AddonCard
                    key={item.name}
                    item={item}
                    accent={section.accent}
                    loading={addonLoadingKey === resolveAddonKey(item)}
                    onPurchase={() => purchaseAddon(item)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        <p className="text-[11px] text-muted-foreground mt-6">
          Add-on checkout is processed securely by Stripe. For custom packages,
          contact{" "}
          <a
            href="mailto:support@maiprop.co"
            className="underline hover:text-foreground"
          >
            support@maiprop.co
          </a>
          .
        </p>
      </div>
    </div>
  );
}
