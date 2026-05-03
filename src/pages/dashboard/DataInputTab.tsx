/**
 * DataInputTab — agent-only Dashboard tab.
 *
 * Lets an agent submit closings (sale/lease deals) in exchange for a 0.5%
 * discount on their next subscription invoice for each verified entry.
 * Capped at 20 submissions per calendar month.
 *
 * All entries are reviewed; flagged hallucinations result in a permanent ban
 * from the feature (enforced server-side in agent_data_input_bans).
 */
import { useMemo, useState } from "react";
import {
  AlertTriangle, BadgeCheck, CheckCircle2, Clock, Loader2,
  Percent, Plus, ShieldAlert, ShieldX, Database,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import {
  useAgentDataInputStatus, useSubmitDataInput,
  type SubmitDataInputPayload, type DataInputStatusEntry,
} from "@/hooks/useAgentDataInput";
import { formatDate } from "@/lib/format";

const PROPERTY_TYPE_OPTIONS: { value: SubmitDataInputPayload["property_type"]; label: string }[] = [
  { value: "apartment",  label: "Apartment" },
  { value: "house",      label: "House / Villa" },
  { value: "commercial", label: "Commercial" },
  { value: "land",       label: "Land / Plot" },
  { value: "other",      label: "Other" },
];

const TRANSACTION_OPTIONS: { value: SubmitDataInputPayload["transaction_type"]; label: string }[] = [
  { value: "sale",   label: "Sale" },
  { value: "rental", label: "Rental / Lease" },
];

const SIDE_OPTIONS: { value: SubmitDataInputPayload["agent_side"]; label: string }[] = [
  { value: "buyer",  label: "Buyer side" },
  { value: "seller", label: "Seller side" },
  { value: "both",   label: "Both sides" },
];

type FormState = {
  property_address: string;
  city: string;
  postal_code: string;
  kaek: string;
  property_type: SubmitDataInputPayload["property_type"];
  transaction_type: SubmitDataInputPayload["transaction_type"];
  agent_side: SubmitDataInputPayload["agent_side"];
  sale_price: string;
  closing_date: string;
  buyer_name: string;
  seller_name: string;
  notes: string;
};

const EMPTY_FORM: FormState = {
  property_address: "",
  city: "",
  postal_code: "",
  kaek: "",
  property_type: "apartment",
  transaction_type: "sale",
  agent_side: "seller",
  sale_price: "",
  closing_date: "",
  buyer_name: "",
  seller_name: "",
  notes: "",
};

function StatusPill({ status }: { status: DataInputStatusEntry["status"] }) {
  const map: Record<DataInputStatusEntry["status"], { cls: string; label: string; Icon: typeof Clock }> = {
    pending:  { cls: "bg-brand-gold/15 text-brand-gold",            label: "Pending review", Icon: Clock },
    verified: { cls: "bg-brand-emerald/15 text-brand-emerald",      label: "Verified",       Icon: BadgeCheck },
    rejected: { cls: "bg-destructive/15 text-destructive",          label: "Rejected",       Icon: ShieldX },
    flagged:  { cls: "bg-destructive/20 text-destructive font-bold", label: "Flagged",        Icon: ShieldAlert },
  };
  const { cls, label, Icon } = map[status];
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium", cls)}>
      <Icon className="w-3 h-3" />
      {label}
    </span>
  );
}

function StatBox({ icon: Icon, label, value, accent }: {
  icon: typeof Clock; label: string; value: React.ReactNode; accent: string;
}) {
  return (
    <div className="glass-card rounded-xl border border-border p-4 flex items-center gap-3">
      <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center shrink-0", accent)}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-widest text-muted-foreground">{label}</p>
        <p className="text-lg font-semibold leading-tight">{value}</p>
      </div>
    </div>
  );
}

export default function DataInputTab() {
  const { data: status, isLoading } = useAgentDataInputStatus();
  const submit = useSubmitDataInput();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);

  const monthlyCount = status?.monthly_count ?? 0;
  const monthlyLimit = status?.monthly_limit ?? 20;
  const remaining = Math.max(0, monthlyLimit - monthlyCount);
  const banned = status?.lifetime_banned === true;
  const pendingPct = Number(status?.pending_discount_pct ?? 0);
  const pendingCount = status?.pending_discount_count ?? 0;
  const pctPerInput = Number(status?.discount_pct_per_input ?? 0.5);
  const maxDiscount = monthlyLimit * pctPerInput;

  const monthlyProgress = useMemo(
    () => Math.min(100, Math.round((monthlyCount / monthlyLimit) * 100)),
    [monthlyCount, monthlyLimit],
  );

  const formInvalid = !form.property_address.trim() || !form.sale_price || !form.closing_date;
  const submittingDisabled = banned || remaining <= 0 || formInvalid || submit.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingDisabled) return;
    const priceNum = Number(form.sale_price);
    if (!Number.isFinite(priceNum) || priceNum <= 0) return;
    submit.mutate(
      {
        property_address: form.property_address.trim(),
        city: form.city.trim() || null,
        postal_code: form.postal_code.trim() || null,
        kaek: form.kaek.trim() || null,
        property_type: form.property_type,
        transaction_type: form.transaction_type,
        agent_side: form.agent_side,
        sale_price: priceNum,
        closing_date: form.closing_date,
        buyer_name: form.buyer_name.trim() || null,
        seller_name: form.seller_name.trim() || null,
        notes: form.notes.trim() || null,
      },
      {
        onSuccess: () => {
          setForm(EMPTY_FORM);
          setShowForm(false);
        },
      },
    );
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-2xl font-bold flex items-center gap-2">
            <Database className="w-6 h-6 text-primary" />
            Data Input
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Submit your closings (sales and leases you've completed) and earn{" "}
            <span className="font-semibold text-foreground">{pctPerInput}% off your next invoice</span>{" "}
            for each verified entry — up to{" "}
            <span className="font-semibold text-foreground">{maxDiscount}% off</span>{" "}
            ({monthlyLimit} entries / month).
          </p>
        </div>
        {!banned && (
          <Button
            className="gap-1.5"
            onClick={() => setShowForm(s => !s)}
            disabled={remaining <= 0}
          >
            <Plus className="w-4 h-4" />
            {showForm ? "Hide form" : "Add closing"}
          </Button>
        )}
      </div>

      {/* Lifetime ban banner — must be impossible to miss */}
      {banned && (
        <Alert variant="destructive" className="border-destructive">
          <ShieldX className="h-4 w-4" />
          <AlertTitle>Data Input access permanently revoked</AlertTitle>
          <AlertDescription className="space-y-1 text-sm">
            <p>
              {status?.ban_reason ??
                "A previous submission was flagged as a false claim. Per our terms, this account has lost access to the Data Input discount feature — this is lifetime and cannot be reversed."}
            </p>
            {status?.banned_at && (
              <p className="text-xs opacity-80">Revoked on {formatDate(status.banned_at)}.</p>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* Anti-fraud warning — shown to non-banned agents */}
      {!banned && (
        <Alert className="border-amber-500/40 bg-amber-500/10 text-amber-100">
          <AlertTriangle className="h-4 w-4 text-amber-400" />
          <AlertTitle className="text-amber-300">All entries are reviewed</AlertTitle>
          <AlertDescription className="text-sm text-amber-100/90 space-y-1">
            <p>
              Every closing you submit is checked against public registries and our internal records.
              Submissions that cannot be verified are rejected.
            </p>
            <p className="font-semibold">
              False, fabricated, or duplicate submissions result in <u>permanent loss</u> of access
              to this feature for the lifetime of your account.
            </p>
          </AlertDescription>
        </Alert>
      )}

      {/* Stat row */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 bg-muted animate-pulse rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <StatBox
            icon={Plus}
            accent="bg-primary/10 text-primary"
            label="This month"
            value={`${monthlyCount} / ${monthlyLimit}`}
          />
          <StatBox
            icon={Percent}
            accent="bg-brand-gold/15 text-brand-gold"
            label="Next-invoice discount"
            value={
              <span>
                {pendingPct}% <span className="text-xs text-muted-foreground font-normal">({pendingCount} verified)</span>
              </span>
            }
          />
          <StatBox
            icon={BadgeCheck}
            accent="bg-brand-emerald/15 text-brand-emerald"
            label="Verified all-time"
            value={status?.total_verified ?? 0}
          />
          <StatBox
            icon={Clock}
            accent="bg-muted text-muted-foreground"
            label="Pending review"
            value={status?.total_pending ?? 0}
          />
        </div>
      )}

      {/* Monthly progress */}
      {!banned && (
        <div className="glass-card rounded-2xl border border-border p-4 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Monthly submissions</span>
            <span className="font-medium">
              {remaining > 0
                ? `${remaining} of ${monthlyLimit} remaining this month`
                : "Limit reached — try again next month"}
            </span>
          </div>
          <div className="h-2 rounded-full bg-secondary overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                monthlyProgress >= 100 ? "bg-destructive" : "bg-primary",
              )}
              style={{ width: `${monthlyProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Submission form */}
      {!banned && showForm && (
        <form
          onSubmit={handleSubmit}
          className="glass-card rounded-2xl border border-border p-5 space-y-4"
        >
          <div>
            <h2 className="font-semibold text-base">Add a verified closing</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Provide the deal details. We will cross-check against our records before crediting the discount.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2 space-y-1.5">
              <Label htmlFor="property_address">Property address *</Label>
              <Input
                id="property_address"
                required
                minLength={5}
                maxLength={300}
                placeholder="e.g. Iroon Polytechniou 21, Athens 10433"
                value={form.property_address}
                onChange={e => setForm(f => ({ ...f, property_address: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                value={form.city}
                onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="postal_code">Postal code</Label>
              <Input
                id="postal_code"
                value={form.postal_code}
                onChange={e => setForm(f => ({ ...f, postal_code: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="property_type">Property type *</Label>
              <Select
                value={form.property_type}
                onValueChange={v => setForm(f => ({ ...f, property_type: v as FormState["property_type"] }))}
              >
                <SelectTrigger id="property_type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PROPERTY_TYPE_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="transaction_type">Transaction *</Label>
              <Select
                value={form.transaction_type}
                onValueChange={v => setForm(f => ({ ...f, transaction_type: v as FormState["transaction_type"] }))}
              >
                <SelectTrigger id="transaction_type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TRANSACTION_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="agent_side">Your side *</Label>
              <Select
                value={form.agent_side}
                onValueChange={v => setForm(f => ({ ...f, agent_side: v as FormState["agent_side"] }))}
              >
                <SelectTrigger id="agent_side"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SIDE_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sale_price">
                {form.transaction_type === "rental" ? "Annual rent (€) *" : "Sale price (€) *"}
              </Label>
              <Input
                id="sale_price"
                required
                type="number"
                min={1}
                step="0.01"
                value={form.sale_price}
                onChange={e => setForm(f => ({ ...f, sale_price: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="closing_date">Closing date *</Label>
              <Input
                id="closing_date"
                required
                type="date"
                value={form.closing_date}
                onChange={e => setForm(f => ({ ...f, closing_date: e.target.value }))}
                max={new Date().toISOString().slice(0, 10)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="kaek">KAEK (cadastre code)</Label>
              <Input
                id="kaek"
                placeholder="optional but speeds verification"
                value={form.kaek}
                onChange={e => setForm(f => ({ ...f, kaek: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="buyer_name">Buyer name</Label>
              <Input
                id="buyer_name"
                value={form.buyer_name}
                onChange={e => setForm(f => ({ ...f, buyer_name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="seller_name">Seller name</Label>
              <Input
                id="seller_name"
                value={form.seller_name}
                onChange={e => setForm(f => ({ ...f, seller_name: e.target.value }))}
              />
            </div>

            <div className="md:col-span-2 space-y-1.5">
              <Label htmlFor="notes">Notes (optional)</Label>
              <Textarea
                id="notes"
                rows={3}
                placeholder="e.g. listing reference, notary, any context that helps verification"
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => { setShowForm(false); setForm(EMPTY_FORM); }}>
              Cancel
            </Button>
            <Button type="submit" disabled={submittingDisabled} className="gap-1.5">
              {submit.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Submit for review
            </Button>
          </div>
        </form>
      )}

      {/* Submissions table */}
      <div className="glass-card rounded-2xl border border-border p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-0.5">
              Your submissions
            </p>
            <p className="text-sm text-muted-foreground">Most recent first.</p>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-14 bg-muted animate-pulse rounded-xl" />
            ))}
          </div>
        ) : !status?.entries?.length ? (
          <div className="text-center py-10 text-sm text-muted-foreground">
            <Database className="w-8 h-8 mx-auto mb-2 opacity-30" />
            No submissions yet. Add a closing above to start earning discounts on your next invoice.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {status.entries.map(e => (
              <div key={e.id} className="flex items-start justify-between gap-3 py-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium truncate">{e.property_address}</p>
                    <StatusPill status={e.status} />
                    {e.discount_applied && (
                      <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                        <Percent className="w-3 h-3" />
                        Discount applied
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {[
                      e.city,
                      `${e.transaction_type === "rental" ? "Lease" : "Sale"} · ${e.property_type}`,
                      `Closed ${formatDate(e.closing_date)}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {e.rejection_reason && (
                    <p className="text-xs text-destructive mt-0.5">Reviewer note: {e.rejection_reason}</p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="font-semibold text-sm">
                    €{new Intl.NumberFormat("el-GR").format(e.sale_price)}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Submitted {formatDate(e.created_at)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
