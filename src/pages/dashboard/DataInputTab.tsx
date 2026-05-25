/**
 * DataInputTab — Agent Dashboard › Data Input.
 *
 * Lets agents log closings they completed off-platform in exchange for a
 * 0.5% discount on their next subscription invoice (max 20 inputs/month).
 *
 * Submissions go through the `submit_agent_data_input` security-definer RPC
 * which enforces the role check, lifetime ban, and the monthly cap.
 * Verification is performed by an admin out-of-band; the Stripe credit is
 * applied only AFTER a submission is marked verified by the
 * `apply-data-input-credit` edge function.
 */
import { useMemo, useState, type FormEvent } from "react";
import {
  Loader2, FileText, ShieldAlert, BadgeCheck, XCircle, Clock,
  AlertOctagon, TrendingDown, Plus,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatPrice, formatPriceFromCents, formatDate } from "@/lib/format";
import {
  useAgentDataInputs,
  useAgentDataInputQuota,
  useSubmitAgentDataInput,
  type AgentDataInputStatus,
  type AgentDataInputSide,
} from "@/hooks/useAgentDataInputs";

const PROPERTY_TYPES = [
  "apartment", "house", "villa", "land", "commercial", "office",
] as const;

const STATUS_META: Record<AgentDataInputStatus, { label: string; cls: string; Icon: React.ElementType }> = {
  pending:  { label: "Pending review", cls: "bg-amber-500/10 text-amber-600 border-amber-500/20", Icon: Clock },
  verified: { label: "Verified",       cls: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20", Icon: BadgeCheck },
  rejected: { label: "Rejected",       cls: "bg-rose-500/10 text-rose-600 border-rose-500/20", Icon: XCircle },
};

interface FormState {
  closed_at: string;
  property_address: string;
  property_city: string;
  property_postal_code: string;
  property_type: string;
  transaction_type: "sale" | "rent";
  agent_side: AgentDataInputSide;
  closing_price: string;
  kaek: string;
  buyer_name: string;
  seller_name: string;
  notes: string;
}

const EMPTY_FORM: FormState = {
  closed_at: "",
  property_address: "",
  property_city: "",
  property_postal_code: "",
  property_type: "",
  transaction_type: "sale",
  agent_side: "seller",
  closing_price: "",
  kaek: "",
  buyer_name: "",
  seller_name: "",
  notes: "",
};

export default function DataInputTab() {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const { data: inputs = [], isLoading: inputsLoading } = useAgentDataInputs();
  const { data: quota, isLoading: quotaLoading } = useAgentDataInputQuota();
  const submit = useSubmitAgentDataInput();

  const banned = !!quota?.is_banned;
  const used = quota?.used ?? 0;
  const limit = quota?.monthly_limit ?? 20;
  const remaining = quota?.remaining ?? Math.max(limit - used, 0);
  const quotaReached = remaining <= 0;
  const submittingDisabled = banned || quotaReached || submit.isPending;

  const verifiedCount = useMemo(
    () => inputs.filter(i => i.status === "verified").length,
    [inputs],
  );
  const projectedDiscountPct = useMemo(
    () => inputs
      .filter((i) => i.status === "verified" && !i.applied_to_invoice_at)
      .reduce((sum, i) => sum + i.discount_pct, 0)
      .toFixed(1),
    [inputs],
  );
  const totalCreditCents = useMemo(
    () => inputs.reduce((sum, i) => sum + (i.stripe_credit_amount_cents ?? 0), 0),
    [inputs],
  );

  const handleChange = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm(prev => ({ ...prev, [k]: v }));
  };

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submittingDisabled) return;

    const closingPrice = Number(form.closing_price);
    if (!Number.isFinite(closingPrice) || closingPrice < 0) {
      return;
    }

    try {
      await submit.mutateAsync({
        closed_at: form.closed_at,
        property_address: form.property_address.trim(),
        property_city: form.property_city.trim(),
        property_postal_code: form.property_postal_code.trim() || null,
        property_type: form.property_type || null,
        transaction_type: form.transaction_type,
        agent_side: form.agent_side,
        closing_price: closingPrice,
        kaek: form.kaek.trim() || null,
        buyer_name: form.buyer_name.trim() || null,
        seller_name: form.seller_name.trim() || null,
        notes: form.notes.trim() || null,
      });
      setForm(EMPTY_FORM);
    } catch {
      // Toast surfaced inside the mutation hook.
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold flex items-center gap-2">
          <FileText className="w-6 h-6 text-primary" /> Data Input
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Log closings you completed off-platform. Each verified closing earns a{" "}
          <span className="font-semibold text-foreground">0.5% discount</span>{" "}
          on your next subscription invoice. Up to <span className="font-semibold text-foreground">20 submissions per month</span>.
        </p>
      </div>

      {/* Integrity warning */}
      <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-4 flex gap-3">
        <ShieldAlert className="w-5 h-5 text-rose-500 mt-0.5 flex-shrink-0" />
        <div className="text-sm">
          <p className="font-semibold text-rose-700 dark:text-rose-300">
            All submissions are continuously verified.
          </p>
          <p className="text-rose-700/80 dark:text-rose-300/80 mt-1">
            Submitting fabricated, hallucinated, or otherwise unverifiable data will permanently disable
            the Data Input feature for your account — no exceptions, no reinstatement.
          </p>
        </div>
      </div>

      {/* Banned state */}
      {banned && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-6 flex gap-4">
          <AlertOctagon className="w-7 h-7 text-rose-600 flex-shrink-0" />
          <div className="space-y-2">
            <p className="font-display text-lg font-semibold text-rose-700 dark:text-rose-300">
              Data input submissions disabled
            </p>
            <p className="text-sm text-rose-700/80 dark:text-rose-300/80">
              Following review of past submissions, this feature has been permanently disabled
              on your account. Existing verified credits remain valid; you can no longer add new entries.
            </p>
          </div>
        </div>
      )}

      {/* Quota / discount summary */}
      {!banned && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="glass-card rounded-xl p-4 space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              This month
            </p>
            <p className="font-display text-2xl font-bold">
              {quotaLoading ? "—" : `${used} / ${limit}`}
            </p>
            <Progress value={limit > 0 ? (used / limit) * 100 : 0} className="h-2" />
            <p className="text-xs text-muted-foreground">
              {quotaReached
                ? "Monthly limit reached. Resets next month."
                : `${remaining} submission${remaining === 1 ? "" : "s"} remaining`}
            </p>
          </div>

          <div className="glass-card rounded-xl p-4 space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Verified closings
            </p>
            <p className="font-display text-2xl font-bold">{verifiedCount}</p>
            <p className="text-xs text-muted-foreground">
              Across all submissions to date.
            </p>
          </div>

          <div className="glass-card rounded-xl p-4 space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
              <TrendingDown className="w-3 h-3" /> Earned credit
            </p>
            <p className="font-display text-2xl font-bold">
              {totalCreditCents > 0
                ? formatPriceFromCents(totalCreditCents)
                : `${projectedDiscountPct}%`}
            </p>
            <p className="text-xs text-muted-foreground">
              {totalCreditCents > 0
                ? "Applied to upcoming invoices."
                : "Pending — applies once submissions are verified."}
            </p>
          </div>
        </div>
      )}

      {/* Submission form */}
      {!banned && (
        <form
          onSubmit={onSubmit}
          className="glass-card rounded-xl p-4 sm:p-6 space-y-4"
        >
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold">Add a closing</h2>
            {quotaReached && (
              <p className="text-xs text-amber-600 font-medium">
                Limit reached for this month.
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="closed_at">Closing date *</Label>
              <Input
                id="closed_at"
                type="date"
                required
                disabled={submittingDisabled}
                max={new Date().toISOString().slice(0, 10)}
                value={form.closed_at}
                onChange={(e) => handleChange("closed_at", e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="closing_price">Closing price (€) *</Label>
              <Input
                id="closing_price"
                type="number"
                min={0}
                step={1}
                required
                disabled={submittingDisabled}
                value={form.closing_price}
                onChange={(e) => handleChange("closing_price", e.target.value)}
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="property_address">Property address *</Label>
              <Input
                id="property_address"
                required
                disabled={submittingDisabled}
                value={form.property_address}
                onChange={(e) => handleChange("property_address", e.target.value)}
                placeholder="e.g. Ermou 12"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="property_city">City *</Label>
              <Input
                id="property_city"
                required
                disabled={submittingDisabled}
                value={form.property_city}
                onChange={(e) => handleChange("property_city", e.target.value)}
                placeholder="e.g. Athens"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="property_postal_code">Postal code</Label>
              <Input
                id="property_postal_code"
                disabled={submittingDisabled}
                value={form.property_postal_code}
                onChange={(e) => handleChange("property_postal_code", e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="property_type">Property type</Label>
              <Select
                value={form.property_type}
                onValueChange={(v) => handleChange("property_type", v)}
                disabled={submittingDisabled}
              >
                <SelectTrigger id="property_type">
                  <SelectValue placeholder="Select…" />
                </SelectTrigger>
                <SelectContent>
                  {PROPERTY_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="transaction_type">Transaction type *</Label>
              <Select
                value={form.transaction_type}
                onValueChange={(v) => handleChange("transaction_type", v as "sale" | "rent")}
                disabled={submittingDisabled}
              >
                <SelectTrigger id="transaction_type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sale">Sale</SelectItem>
                  <SelectItem value="rent">Rent</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="agent_side">Agent side *</Label>
              <Select
                value={form.agent_side}
                onValueChange={(v) => handleChange("agent_side", v as AgentDataInputSide)}
                disabled={submittingDisabled}
              >
                <SelectTrigger id="agent_side">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="seller">Seller side</SelectItem>
                  <SelectItem value="buyer">Buyer side</SelectItem>
                  <SelectItem value="both">Both sides</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="kaek">KAEK (cadastral code)</Label>
              <Input
                id="kaek"
                disabled={submittingDisabled}
                value={form.kaek}
                onChange={(e) => handleChange("kaek", e.target.value)}
                placeholder="Optional"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="buyer_name">Buyer name</Label>
              <Input
                id="buyer_name"
                disabled={submittingDisabled}
                value={form.buyer_name}
                onChange={(e) => handleChange("buyer_name", e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="seller_name">Seller name</Label>
              <Input
                id="seller_name"
                disabled={submittingDisabled}
                value={form.seller_name}
                onChange={(e) => handleChange("seller_name", e.target.value)}
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                rows={3}
                disabled={submittingDisabled}
                value={form.notes}
                onChange={(e) => handleChange("notes", e.target.value)}
                placeholder="Anything that helps verification — e.g. notary, contract reference"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="submit"
              disabled={submittingDisabled}
              className="bg-gradient-primary border-0 text-primary-foreground gap-2"
            >
              {submit.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Submit closing
            </Button>
          </div>
        </form>
      )}

      {/* History */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">Submission history</h2>
          {!inputsLoading && inputs.length > 0 && (
            <p className="text-xs text-muted-foreground">{inputs.length} total</p>
          )}
        </div>

        {inputsLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : inputs.length === 0 ? (
          <div className="glass-card rounded-xl p-12 text-center">
            <FileText className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="font-semibold">No submissions yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Submit your first closing above to start earning credits.
            </p>
          </div>
        ) : (
          <div className="glass-card rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr>
                    <th className="text-left font-medium px-4 py-3">Submitted</th>
                    <th className="text-left font-medium px-4 py-3">Closed</th>
                    <th className="text-left font-medium px-4 py-3">Property</th>
                    <th className="text-right font-medium px-4 py-3">Price</th>
                    <th className="text-left font-medium px-4 py-3">Status</th>
                    <th className="text-right font-medium px-4 py-3">Credit</th>
                  </tr>
                </thead>
                <tbody>
                  {inputs.map((i) => {
                    const meta = STATUS_META[i.status];
                    const Icon = meta.Icon;
                    const credit = formatPriceFromCents(i.stripe_credit_amount_cents);
                    return (
                      <tr key={i.id} className="border-t border-border/50">
                        <td className="px-4 py-3 whitespace-nowrap">{formatDate(i.created_at)}</td>
                        <td className="px-4 py-3 whitespace-nowrap">{formatDate(i.closed_at)}</td>
                        <td className="px-4 py-3">
                          <div className="font-medium">{i.property_address}</div>
                          <div className="text-xs text-muted-foreground">
                            {i.property_city}{i.property_postal_code ? `, ${i.property_postal_code}` : ""} · {i.transaction_type} · {i.agent_side}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          {formatPrice(Math.round(Number(i.closing_price)))}
                        </td>
                        <td className="px-4 py-3">
                          <span className={cn(
                            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
                            meta.cls,
                          )}>
                            <Icon className="w-3 h-3" />
                            {meta.label}
                          </span>
                          {i.status === "rejected" && i.rejection_reason && (
                            <p className="text-xs text-muted-foreground mt-1">{i.rejection_reason}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">{credit}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
