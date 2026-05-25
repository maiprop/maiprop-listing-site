/**
 * POFVerificationPanel — Admin panel for reviewing investor Proof of Funds documents.
 *
 * - Fetches from `open_house_registrations` where proof_of_funds_url is not null
 * - Groups by: Unreviewed / Verified / Rejected
 * - Stats: total docs, total verified, total verified capital
 * - Falls back to 3 mock entries when no real data
 */

import { useState, useEffect } from "react";
import {
  Wallet,
  CheckCircle2,
  XCircle,
  Clock,
  ExternalLink,
  TrendingUp,
  Timer,
  Euro,
  AlertCircle,
  RefreshCw,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useFocusTrap } from "@/hooks/useFocusTrap";

// ── Types ─────────────────────────────────────────────────────────────────────

type PofStatus = "unreviewed" | "verified" | "rejected";

interface PofEntry {
  id: string;
  investor_name: string;
  proof_amount: number;
  proof_of_funds_url: string;
  uploaded_at: string;
  listing_id: string;
  status: PofStatus;
  rejection_reason?: string;
}

/**
 * Shape of a row returned from `open_house_registrations` for the POF
 * panel. Some of these columns may not be in the generated Supabase
 * types yet (rejection_reason, pof_verified_status), so we declare the
 * shape locally and cast the query result via `unknown`.
 */
interface PofRowFromDb {
  id: string;
  requester_id: string;
  proof_of_funds_url: string | null;
  proof_amount: number | null;
  pof_verified_status: PofStatus | null;
  created_at: string | null;
  listing_id: string;
  rejection_reason: string | null;
  status: string | null;
}


// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtEur(n: number): string {
  return new Intl.NumberFormat("en-EU", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
}

import { formatDate as fmtDate } from "@/lib/format";

function initials(name: string): string {
  return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
}

type TabKey = "unreviewed" | "verified" | "rejected";

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: PofStatus }) {
  if (status === "verified") {
    return (
      <Badge className="gap-1 bg-brand-emerald/10 text-brand-emerald border border-brand-emerald/20 hover:bg-brand-emerald/20">
        <CheckCircle2 className="w-3 h-3" /> Verified
      </Badge>
    );
  }
  if (status === "rejected") {
    return (
      <Badge className="gap-1 bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500/20">
        <XCircle className="w-3 h-3" /> Rejected
      </Badge>
    );
  }
  return (
    <Badge className="gap-1 bg-brand-gold/10 text-brand-gold border border-brand-gold/20 hover:bg-brand-gold/20">
      <Clock className="w-3 h-3" /> Unreviewed
    </Badge>
  );
}

// ── Reject reason dialog ──────────────────────────────────────────────────────

interface RejectDialogProps {
  investorName: string;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}

function RejectDialog({ investorName, onConfirm, onCancel }: RejectDialogProps) {
  const dialogRef = useFocusTrap<HTMLDivElement>({ onEscape: onCancel });
  const [reason, setReason] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Reject POF for ${investorName}`}
        tabIndex={-1}
        className="bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h3 className="font-semibold text-foreground">Reject POF — {investorName}</h3>
          <button onClick={onCancel} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-6 py-4 space-y-3">
          <p className="text-sm text-muted-foreground">
            Provide a rejection reason. This may be communicated to the investor.
          </p>
          <textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Document expired, amount insufficient, unclear source of funds..."
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-red-500 resize-none"
          />
        </div>
        <div className="px-6 py-4 border-t border-border flex gap-2">
          <Button
            className="flex-1 gap-1.5 bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500/20"
            variant="ghost"
            disabled={!reason.trim()}
            onClick={() => onConfirm(reason)}
          >
            <XCircle className="w-4 h-4" /> Confirm Rejection
          </Button>
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}

// ── POF row ───────────────────────────────────────────────────────────────────

interface PofRowProps {
  entry: PofEntry;
  onVerify: (id: string) => void;
  onReject: (id: string) => void;
}

function PofRow({ entry, onVerify, onReject }: PofRowProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-4 border-b border-border last:border-0 hover:bg-muted/10 transition-colors">
      {/* Avatar */}
      <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs shrink-0">
        {initials(entry.investor_name)}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-foreground text-sm">{entry.investor_name}</p>
        <div className="flex flex-wrap gap-2 mt-0.5 text-xs text-muted-foreground">
          <span className="flex items-center gap-0.5">
            <Euro className="w-3 h-3" /> {fmtEur(entry.proof_amount)}
          </span>
          <span>Uploaded {fmtDate(entry.uploaded_at)}</span>
        </div>
        {entry.rejection_reason && (
          <p className="text-xs text-red-500 mt-0.5 italic">Reason: &ldquo;{entry.rejection_reason}&rdquo;</p>
        )}
      </div>

      {/* Document link */}
      {entry.proof_of_funds_url && entry.proof_of_funds_url !== "#" ? (
        <a
          href={entry.proof_of_funds_url}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Button size="sm" variant="outline" className="h-7 gap-1 shrink-0">
            <ExternalLink className="w-3 h-3" /> View Doc
          </Button>
        </a>
      ) : (
        <Button size="sm" variant="outline" className="h-7 gap-1 shrink-0" disabled>
          <AlertCircle className="w-3 h-3" /> Demo Doc
        </Button>
      )}

      {/* Status badge */}
      <StatusBadge status={entry.status} />

      {/* Actions */}
      {entry.status === "unreviewed" && (
        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            size="sm"
            className="h-7 gap-1 bg-brand-emerald/10 text-brand-emerald border border-brand-emerald/20 hover:bg-brand-emerald/20"
            variant="ghost"
            onClick={() => onVerify(entry.id)}
          >
            <CheckCircle2 className="w-3.5 h-3.5" /> Verify
          </Button>
          <Button
            size="sm"
            className="h-7 gap-1 bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500/20"
            variant="ghost"
            onClick={() => onReject(entry.id)}
          >
            <XCircle className="w-3.5 h-3.5" /> Reject
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface POFVerificationPanelProps {
  dealId?: string;
}

export function POFVerificationPanel({ dealId }: POFVerificationPanelProps) {
  const [entries, setEntries] = useState<PofEntry[]>([]);
  const [tab, setTab] = useState<TabKey>("unreviewed");
  const [loading, setLoading] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);

  async function load(): Promise<void> {
    setLoading(true);
    try {
      let query = supabase
        .from("open_house_registrations")
        .select("id, requester_id, proof_of_funds_url, proof_amount, pof_verified_status, created_at, listing_id, rejection_reason, status")
        .not("proof_of_funds_url", "is", null)
        .order("created_at", { ascending: false })
        .limit(100);

      if (dealId) {
        query = query.eq("listing_id", dealId);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Cast through `unknown` because the generated Supabase types may
      // not yet include all fields we select (rejection_reason,
      // pof_verified_status). PofRowFromDb mirrors the runtime shape.
      const rows = (data ?? []) as unknown as PofRowFromDb[];

      if (rows.length > 0) {
        const mapped: PofEntry[] = rows.map((r) => {
          const status: PofStatus = r.pof_verified_status ?? "unreviewed";

          return {
            id: r.id,
            investor_name: `Investor ${r.requester_id.slice(0, 6)}`,
            proof_amount: r.proof_amount ?? 0,
            proof_of_funds_url: r.proof_of_funds_url ?? "",
            uploaded_at: r.created_at ?? new Date().toISOString(),
            listing_id: r.listing_id,
            status,
            rejection_reason: r.rejection_reason ?? undefined,
          };
        });
        setEntries(mapped);
      }
    } catch (_err: unknown) {
      // leave list empty on error
    } finally {
      setLoading(false);
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, [dealId]);

  async function handleVerify(id: string): Promise<void> {
    const entry = entries.find((e) => e.id === id);
    if (!entry) return;

    {
      const { error } = await supabase
        .from("open_house_registrations")
        .update({ pof_verified_status: "verified" })
        .eq("id", id);
      if (error) {
        toast.error("Failed to verify. Please try again.");
        return;
      }
    }

    setEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, status: "verified" } : e))
    );
    toast.success(`POF verified for ${entry.investor_name} — ${fmtEur(entry.proof_amount)}`);
  }

  async function handleRejectConfirm(reason: string): Promise<void> {
    if (!rejectTarget) return;
    const entry = entries.find((e) => e.id === rejectTarget);
    if (!entry) return;

    {
      const { error } = await supabase
        .from("open_house_registrations")
        .update({
          pof_verified_status: "rejected",
          rejection_reason: reason,
        })
        .eq("id", rejectTarget);
      if (error) {
        toast.error("Failed to reject. Please try again.");
        return;
      }
    }

    setEntries((prev) =>
      prev.map((e) =>
        e.id === rejectTarget ? { ...e, status: "rejected", rejection_reason: reason } : e
      )
    );
    toast.success(`POF rejected for ${entry.investor_name}.`);
    setRejectTarget(null);
  }

  // ── Derived stats ─────────────────────────────────────────────────────────

  const counts: Record<TabKey, number> = {
    unreviewed: entries.filter((e) => e.status === "unreviewed").length,
    verified: entries.filter((e) => e.status === "verified").length,
    rejected: entries.filter((e) => e.status === "rejected").length,
  };

  const totalCapital = entries
    .filter((e) => e.status === "verified")
    .reduce((sum, e) => sum + e.proof_amount, 0);

  const filtered = entries.filter((e) => e.status === tab);

  const rejectEntry = rejectTarget ? entries.find((e) => e.id === rejectTarget) : null;

  const TABS: { key: TabKey; label: string }[] = [
    { key: "unreviewed", label: "Unreviewed" },
    { key: "verified", label: "Verified" },
    { key: "rejected", label: "Rejected" },
  ];

  return (
    <div className="space-y-5">
      {/* Stats bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="glass-card rounded-xl border border-border p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium mb-2">
            <Wallet className="w-3.5 h-3.5" /> Total POF Docs
          </div>
          <p className="text-2xl font-bold text-foreground">{entries.length}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {counts.unreviewed} awaiting review
          </p>
        </div>
        <div className="glass-card rounded-xl border border-border p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium mb-2">
            <CheckCircle2 className="w-3.5 h-3.5" /> Total Verified
          </div>
          <p className="text-2xl font-bold text-brand-emerald">{counts.verified}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Approved submissions</p>
        </div>
        <div className="glass-card rounded-xl border border-border p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium mb-2">
            <TrendingUp className="w-3.5 h-3.5" /> Total Capital Available
          </div>
          <p className="text-2xl font-bold text-primary">{fmtEur(totalCapital)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Verified investor funds
          </p>
        </div>
      </div>

      {/* Panel */}
      <div className="glass-card rounded-xl border border-border overflow-hidden bg-card">
        {/* Tabs + refresh */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/20 flex-wrap gap-2">
          <div className="flex gap-1 flex-wrap">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`text-sm px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
                  tab === t.key
                    ? "bg-primary/10 text-primary font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
                <span
                  className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                    tab === t.key
                      ? "bg-primary/20 text-primary"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {counts[t.key]}
                </span>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            {dealId && (
              <span className="text-xs text-muted-foreground bg-muted/40 px-2 py-0.5 rounded font-mono">
                Deal: {dealId.slice(0, 8)}…
              </span>
            )}
            <Button size="sm" variant="ghost" className="gap-1.5 h-8" onClick={load} disabled={loading}>
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              <span className="text-xs">Refresh</span>
            </Button>
          </div>
        </div>

        {/* Column headers (desktop) */}
        <div className="hidden sm:grid grid-cols-[36px_1fr_auto_auto_auto_auto] gap-3 px-4 py-2.5 bg-muted/10 border-b border-border items-center">
          <div />
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Investor</p>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide text-right">POF Amount</p>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Document</p>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</p>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Actions</p>
        </div>

        {/* Rows */}
        {loading ? (
          <div>
            {[0, 1, 2].map((i) => (
              <div key={i} className="px-4 py-4 flex items-center gap-3 border-b border-border animate-pulse">
                <div className="w-9 h-9 rounded-full bg-muted shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-36 bg-muted rounded" />
                  <div className="h-3 w-24 bg-muted rounded" />
                </div>
                <div className="h-6 w-20 bg-muted rounded" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-14 text-center">
            <Timer className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No {tab} POF submissions.</p>
          </div>
        ) : (
          <div>
            {filtered.map((entry) => (
              <PofRow
                key={entry.id}
                entry={entry}
                onVerify={handleVerify}
                onReject={(id) => setRejectTarget(id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Reject dialog */}
      {rejectTarget && rejectEntry && (
        <RejectDialog
          investorName={rejectEntry.investor_name}
          onConfirm={handleRejectConfirm}
          onCancel={() => setRejectTarget(null)}
        />
      )}
    </div>
  );
}
