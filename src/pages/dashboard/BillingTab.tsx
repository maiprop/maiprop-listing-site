import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSubscription } from "@/hooks/useSubscription";
import { Button } from "@/components/ui/button";
import { CreditCard, FileText, ExternalLink, Loader2, CheckCircle2, AlertCircle, Calendar, RefreshCw, Zap } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

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

function useBillingInfo() {
  return useQuery<BillingInfo>({
    queryKey: ["billing-info"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("get-invoices");
      if (error) throw error;
      return data as BillingInfo;
    },
    staleTime: 60_000,
  });
}

function formatAmount(amount: number, currency: string) {
  return new Intl.NumberFormat("el-GR", { style: "currency", currency, minimumFractionDigits: 2 }).format(amount);
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function StatusBadge({ status }: { status: string | null }) {
  const map: Record<string, { cls: string; label: string }> = {
    paid:   { cls: "bg-brand-emerald/15 text-brand-emerald", label: "Paid" },
    open:   { cls: "bg-brand-gold/15 text-brand-gold",       label: "Due" },
    void:   { cls: "bg-muted text-muted-foreground",          label: "Void" },
    draft:  { cls: "bg-muted text-muted-foreground",          label: "Draft" },
    uncollectible: { cls: "bg-destructive/15 text-destructive", label: "Uncollectible" },
  };
  const { cls, label } = map[status ?? ""] ?? { cls: "bg-muted text-muted-foreground", label: status ?? "—" };
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cls}`}>{label}</span>;
}

export default function BillingTab() {
  const navigate = useNavigate();
  const { isPro, subscriptionEnd, loading: subLoading } = useSubscription();
  const { data, isLoading, refetch, isRefetching } = useBillingInfo();
  const [portalLoading, setPortalLoading] = useState(false);

  const openPortal = async () => {
    setPortalLoading(true);
    try {
      const { data: pData, error } = await supabase.functions.invoke("customer-portal");
      if (error || !pData?.url) throw new Error(pData?.error ?? error?.message ?? "Could not open billing portal");
      window.location.href = pData.url;
    } catch (e: any) {
      toast.error(e.message ?? "Could not open billing portal");
      setPortalLoading(false);
    }
  };

  const sub = data?.subscription ?? null;
  const invoices = data?.invoices ?? [];

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Billing & Payments</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage your subscription, view invoices and update payment details.</p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => refetch()} disabled={isRefetching}>
          {isRefetching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Refresh
        </Button>
      </div>

      {/* Current plan card */}
      <div className="glass-card rounded-2xl border border-border p-5 space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">Current plan</p>
            {subLoading || isLoading ? (
              <div className="h-7 w-32 bg-muted animate-pulse rounded" />
            ) : (
              <h2 className="font-display text-xl font-bold flex items-center gap-2">
                {sub ? (
                  <>
                    <Zap className="w-5 h-5 text-primary" />
                    {sub.plan_name}
                  </>
                ) : (
                  "Free plan"
                )}
              </h2>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isPro ? (
              <Button variant="outline" size="sm" className="gap-1.5" onClick={openPortal} disabled={portalLoading}>
                {portalLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CreditCard className="w-3.5 h-3.5" />}
                Manage billing
              </Button>
            ) : (
              <Button size="sm" className="gap-1.5 bg-gradient-primary border-0 text-primary-foreground" onClick={() => navigate("/pricing")}>
                <Zap className="w-3.5 h-3.5" /> Upgrade
              </Button>
            )}
          </div>
        </div>

        {sub ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="bg-secondary rounded-xl p-3">
              <p className="text-xs text-muted-foreground mb-0.5">Monthly price</p>
              <p className="font-semibold">{sub.amount != null ? formatAmount(sub.amount, sub.currency) : "—"} <span className="text-xs font-normal text-muted-foreground">/{sub.interval}</span></p>
            </div>
            <div className="bg-secondary rounded-xl p-3">
              <p className="text-xs text-muted-foreground mb-0.5">Status</p>
              <div className="flex items-center gap-1.5">
                {sub.status === "active" ? <CheckCircle2 className="w-3.5 h-3.5 text-brand-emerald" /> : <AlertCircle className="w-3.5 h-3.5 text-brand-gold" />}
                <span className="font-semibold capitalize">{sub.status}</span>
              </div>
            </div>
            <div className="bg-secondary rounded-xl p-3">
              <p className="text-xs text-muted-foreground mb-0.5">{sub.cancel_at_period_end ? "Cancels on" : "Renews on"}</p>
              <p className="font-semibold flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                {formatDate(sub.current_period_end)}
              </p>
            </div>
          </div>
        ) : isPro ? (
          <div className="text-sm text-muted-foreground">
            {subscriptionEnd ? `Pro access active until ${formatDate(subscriptionEnd)}.` : "Pro access active."}
          </div>
        ) : (
          <div className="rounded-xl bg-secondary p-4 text-sm text-muted-foreground">
            You're on the free plan. Upgrade to unlock analytics, unlimited viewings, saved searches and more.
          </div>
        )}
      </div>

      {/* Payment method */}
      {isPro && (
        <div className="glass-card rounded-2xl border border-border p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">Payment method</p>
              <p className="text-sm text-muted-foreground">Manage your card and billing details via the Stripe customer portal.</p>
            </div>
            <Button variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={openPortal} disabled={portalLoading}>
              {portalLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ExternalLink className="w-3.5 h-3.5" />}
              Update card
            </Button>
          </div>
        </div>
      )}

      {/* Invoices */}
      <div className="glass-card rounded-2xl border border-border p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">Invoice history</p>
            <p className="text-sm text-muted-foreground">Your last 12 invoices.</p>
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
            No invoices yet. They'll appear here after your first payment.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {invoices.map(inv => (
              <div key={inv.id} className="flex items-center justify-between gap-3 py-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium">{inv.number ?? inv.id.slice(-8)}</p>
                    <StatusBadge status={inv.status} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formatDate(inv.created)}
                    {inv.period_start && inv.period_end && ` · ${formatDate(inv.period_start)} – ${formatDate(inv.period_end)}`}
                    {inv.description && ` · ${inv.description}`}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-sm">{formatAmount(inv.amount_paid, inv.currency)}</span>
                  <div className="flex items-center gap-1">
                    {inv.hosted_invoice_url && (
                      <a href={inv.hosted_invoice_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                        <ExternalLink className="w-3 h-3" /> View
                      </a>
                    )}
                    {inv.invoice_pdf && (
                      <a href={inv.invoice_pdf} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline ml-2">
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
          <p>To cancel your subscription, click <button className="underline hover:text-foreground" onClick={openPortal}>Manage billing</button> and choose "Cancel plan".</p>
          <p>Need help? <a href="mailto:support@maiprop.co" className="underline hover:text-foreground">support@maiprop.co</a></p>
        </div>
      )}
    </div>
  );
}
