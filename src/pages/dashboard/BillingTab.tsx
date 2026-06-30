/* eslint complexity: "off" */
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  Shield,
} from "lucide-react";
import { toast } from "sonner";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getParticipantTypeFromProfile } from "@/lib/participantConfig";
import { getPlanForParticipant } from "@/lib/rolePlanMap";
import { buildBillingContactHref } from "@/lib/billingContact";
import { BillingUsagePanel } from "@/components/dashboard/BillingUsagePanel";
import { formatDate } from "@/lib/format";
import { AddonCard } from "./billing/AddonCard";
import { getAddonSectionsForParticipant, resolveAddonKey, type AddonItem } from "./billing/addons";
import {
  createAddonCheckoutUrl,
  createSubscriptionCheckoutUrl,
  formatBillingAmount,
  type SubscriptionBillingCycle,
} from "./billing/checkoutActions";
import { StatusBadge } from "./billing/StatusBadge";
import type { BillingInfo } from "./billing/types";

type PortalAction =
  | "manage"
  | "payment_method_update"
  | "subscription_cancel"
  | "subscription_update"
  | "resume_subscription";

const showAddonCheckoutError = (e: unknown) => {
  toast.error(
    (e instanceof Error ? e.message : null) ?? "Could not start add-on checkout",
  );
};

const getInvoiceTaxIdLabel = (
  invoice: BillingInfo["invoices"][number],
): string | null => {
  const taxId = invoice.customer_tax_ids?.find((entry) => entry.value)?.value;
  return taxId ? `VAT ID ${taxId}` : null;
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

export default function BillingTab() { // skipcq: JS-0067
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const {
    isPro,
    subscriptionEnd,
    loading: subLoading,
    accessSource,
    hasStripeBilling,
    isInvestorManagedPlan,
    isManuallyManagedPlan,
  } = useSubscription();
  const { profile, user } = useAuth();
  const { data, isLoading, refetch, isRefetching, error } = useBillingInfo();
  const [portalLoading, setPortalLoading] = useState(false);
  const [addonLoadingKey, setAddonLoadingKey] = useState<string | null>(null);
  const [subscriptionCheckoutLoading, setSubscriptionCheckoutLoading] =
    useState(false);
  const [subscriptionBillingCycle, setSubscriptionBillingCycle] =
    useState<SubscriptionBillingCycle>("monthly");

  const participantType = getParticipantTypeFromProfile(profile) ?? "buyer";
  const rolePlan = getPlanForParticipant(participantType);
  const addonSections = getAddonSectionsForParticipant(participantType);

  useEffect(() => {
    if (searchParams.get("checkout") !== "success") return;
    void refetch();
    for (const queryKey of [
      ["billing-info"],
      ["addon_purchases"],
      ["usage_property_reports"],
      ["usage_priority_ads"],
      ["usage_ai_calls"],
    ]) {
      void queryClient.invalidateQueries({ queryKey });
    }
    if (searchParams.get("billing_mode") === "mock") {
      toast.info("Mock add-on checkout completed. No live payment or add-on entitlement was created.");
    }
  }, [queryClient, refetch, searchParams]);

  const openPortal = async (action: PortalAction = "manage") => {
    if (isLoading || !data) {
      toast.info("Billing details are still loading.");
      return;
    }
    if (!hasStripeBilling || data?.portal_eligible === false) {
      toast.info("This plan is managed outside the self-serve Stripe portal.");
      return;
    }
    if (
      action !== "manage" &&
      action !== "payment_method_update" &&
      !data.subscription?.id
    ) {
      toast.info("Subscription details are still loading.");
      return;
    }
    setPortalLoading(true);
    try {
      const { data: pData, error } =
        await supabase.functions.invoke("customer-portal", {
          body: {
            action,
            ...(data.subscription?.id
              ? { subscription_id: data.subscription.id }
              : {}),
          },
        });
      if (action === "resume_subscription" && pData?.resumed) {
        toast.success("Your subscription renewal has been resumed.");
        await refetch();
        setPortalLoading(false);
        return;
      }
      if (error || !pData?.url) {
        throw new Error(
          pData?.error ?? error?.message ?? "Could not open billing portal",
        );
      }
      window.location.href = pData.url;
    } catch (e: unknown) {
      toast.error(
        (e instanceof Error ? e.message : null) ??
          "Could not open billing portal",
      );
      setPortalLoading(false);
    }
  };

  const purchaseAddonKey = async (addonKey: string) => {
    setAddonLoadingKey(addonKey);
    try {
      window.location.href = await createAddonCheckoutUrl(addonKey);
    } catch (e: unknown) {
      showAddonCheckoutError(e);
      setAddonLoadingKey(null);
    }
  };

  const purchaseAddon = async (item: AddonItem) => { // skipcq: JS-R1005
    const addonKey = resolveAddonKey(item);
    if (!addonKey) {
      return;
    }
    await purchaseAddonKey(addonKey);
  };

  const startSubscriptionCheckout = async () => {
    if (rolePlan.inviteOnly) {
      navigate(participantType === "institutional" ? "/contact" : "/investor-dashboard");
      return;
    }
    setSubscriptionCheckoutLoading(true);
    try {
      window.location.href = await createSubscriptionCheckoutUrl(
        rolePlan.planKey,
        { billingCycle: subscriptionBillingCycle },
      );
    } catch (e: unknown) {
      toast.error(
        (e instanceof Error ? e.message : null) ??
          "Could not start subscription checkout",
      );
      setSubscriptionCheckoutLoading(false);
    }
  };

  const sub = data?.subscription ?? null;
  const isPastDue = sub?.status === "past_due";
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
                onClick={() => void openPortal("manage")}
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
                onClick={() => void startSubscriptionCheckout()}
                disabled={subscriptionCheckoutLoading}
              >
                {subscriptionCheckoutLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Zap className="w-3.5 h-3.5" />
                )}
                Upgrade
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
                  ? formatBillingAmount(sub.amount, sub.currency)
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
                {sub.current_period_end ? formatDate(sub.current_period_end) : "Not available"}
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
          <div className="rounded-xl bg-secondary p-4 space-y-3">
            <div className="text-sm text-muted-foreground">
              You're on the free plan. Upgrade to unlock analytics, unlimited
              viewings, saved searches and more.
            </div>
            {!rolePlan.inviteOnly && (
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-lg border border-border bg-background p-1">
                  {(["monthly", "annual"] as const).map((cycle) => (
                    <button
                      key={cycle}
                      type="button"
                      className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                        subscriptionBillingCycle === cycle
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                      onClick={() => setSubscriptionBillingCycle(cycle)}
                    >
                      {cycle === "monthly"
                        ? `${formatBillingAmount(rolePlan.monthlyPrice, "EUR")}/mo`
                        : `${formatBillingAmount(rolePlan.annualPrice, "EUR")}/yr`}
                    </button>
                  ))}
                </div>
                <Button
                  size="sm"
                  className="gap-1.5"
                  onClick={() => void startSubscriptionCheckout()}
                  disabled={subscriptionCheckoutLoading}
                >
                  {subscriptionCheckoutLoading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Zap className="w-3.5 h-3.5" />
                  )}
                  Get {rolePlan.planName}
                </Button>
              </div>
            )}
          </div>
        )}
        {error && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-muted-foreground">
            Live billing details could not be fully refreshed right now. Your
            access state is still shown from the account profile.
          </div>
        )}
        {isPastDue && canManageBilling && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-muted-foreground flex items-start justify-between gap-3 flex-wrap">
            <div>
              <p className="font-semibold text-foreground">Payment needs attention</p>
              <p className="mt-1">
                Stripe could not collect the latest payment. Update your card to keep the plan active.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 shrink-0"
              onClick={() => void openPortal("payment_method_update")}
              disabled={portalLoading}
            >
              {portalLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <CreditCard className="w-3.5 h-3.5" />
              )}
              Update card
            </Button>
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
            <div className="flex items-center gap-2 flex-wrap justify-end">
              {sub?.cancel_at_period_end && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 shrink-0"
                  onClick={() => void openPortal("resume_subscription")}
                  disabled={portalLoading}
                >
                  {portalLoading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3.5 h-3.5" />
                  )}
                  Resume plan
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 shrink-0"
                onClick={() => void openPortal("subscription_update")}
                disabled={portalLoading}
              >
                {portalLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <ExternalLink className="w-3.5 h-3.5" />
                )}
                Change plan
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 shrink-0"
                onClick={() => void openPortal("payment_method_update")}
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
        </div>
      )}

      <BillingUsagePanel
        user={user}
        isPro={isPro}
        participantType={participantType}
        addonLoadingKey={addonLoadingKey}
        onPurchaseAddon={(addonKey) => void purchaseAddonKey(addonKey)}
        onUpgrade={() => void startSubscriptionCheckout()}
      />

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
                    {inv.tax_amount != null &&
                      inv.tax_amount > 0 &&
                      ` Â· VAT/tax ${formatBillingAmount(inv.tax_amount, inv.currency)}`}
                    {getInvoiceTaxIdLabel(inv) &&
                      ` Â· ${getInvoiceTaxIdLabel(inv)}`}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-sm">
                    {formatBillingAmount(inv.amount_paid, inv.currency)}
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
                    {inv.receipt_url && (
                      <a
                        href={inv.receipt_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline ml-2"
                      >
                        Receipt
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
                onClick={() => void openPortal("subscription_cancel")}
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
                {section.items.map((item) => {
                  const addonKey = resolveAddonKey(item);

                  return (
                    <AddonCard
                      key={item.name}
                      item={item}
                      accent={section.accent}
                      checkoutAvailable={Boolean(addonKey)}
                      contactHref={buildBillingContactHref({
                        topic: item.name,
                        participantType,
                        addonName: item.name,
                      })}
                      loading={Boolean(addonKey && addonLoadingKey === addonKey)}
                      onPurchase={() => purchaseAddon(item)}
                    />
                  );
                })}
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
