/**
 * ProofOfFundsReviewer — Admin panel to review investor POF submissions.
 * Inline expand, verify with amount input, or reject with reason.
 */

import { useState } from "react";
import {
  Wallet,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronDown,
  ChevronUp,
  Eye,
  FileCheck,
  FileX,
  Euro,
  TrendingUp,
  Timer,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

// ── Types ────────────────────────────────────────────────────────────────────

type PofStatus = "pending" | "verified" | "rejected";

interface PofSubmission {
  id: string;
  investor_name: string;
  amount_claimed: number;
  currency: string;
  submitted: string;
  doc_type: string;
  status: PofStatus;
  deal_ref: string;
  verified_amount?: number;
  rejection_reason?: string;
}

// ── Mock data ────────────────────────────────────────────────────────────────

const INITIAL_DATA: PofSubmission[] = [
  { id: "pof1", investor_name: "Thanasis Georgiou", amount_claimed: 450000, currency: "EUR", submitted: "2026-03-21", doc_type: "Bank Statement", status: "pending", deal_ref: "QS-2026-0041" },
  { id: "pof2", investor_name: "Anna Konstantinou", amount_claimed: 200000, currency: "EUR", submitted: "2026-03-20", doc_type: "Letter of Credit", status: "verified", verified_amount: 195000, deal_ref: "QS-2026-0038" },
  { id: "pof3", investor_name: "Petros Alexiou", amount_claimed: 750000, currency: "EUR", submitted: "2026-03-19", doc_type: "Asset Declaration", status: "pending", deal_ref: "QS-2026-0035" },
  { id: "pof4", investor_name: "Katerina Stavros", amount_claimed: 320000, currency: "EUR", submitted: "2026-03-18", doc_type: "Bank Statement", status: "rejected", rejection_reason: "Document expired (over 90 days)", deal_ref: "QS-2026-0033" },
  { id: "pof5", investor_name: "Manolis Papadakis", amount_claimed: 180000, currency: "EUR", submitted: "2026-03-17", doc_type: "Savings Certificate", status: "verified", verified_amount: 180000, deal_ref: "QS-2026-0031" },
  { id: "pof6", investor_name: "Zoe Tsalikis", amount_claimed: 600000, currency: "EUR", submitted: "2026-03-16", doc_type: "Investment Portfolio", status: "pending", deal_ref: "QS-2026-0029" },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
}

import { formatDate as fmtDate } from "@/lib/format";

function initials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
}

type TabFilter = "all" | PofStatus;

// ── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: PofStatus }) {
  if (status === "verified") return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-brand-emerald/10 text-brand-emerald border border-brand-emerald/20">
      <CheckCircle2 className="w-3 h-3" /> Verified
    </span>
  );
  if (status === "rejected") return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-red-500/10 text-red-500 border border-red-500/20">
      <XCircle className="w-3 h-3" /> Rejected
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-brand-gold/10 text-brand-gold border border-brand-gold/20">
      <Clock className="w-3 h-3" /> Pending
    </span>
  );
}

// ── Doc type badge ───────────────────────────────────────────────────────────

const DOC_COLORS: Record<string, string> = {
  "Bank Statement": "bg-primary/10 text-primary border-primary/20",
  "Letter of Credit": "bg-accent/10 text-accent border-accent/20",
  "Asset Declaration": "bg-purple-500/10 text-purple-500 border-purple-500/20",
  "Savings Certificate": "bg-brand-emerald/10 text-brand-emerald border-brand-emerald/20",
  "Investment Portfolio": "bg-brand-gold/10 text-brand-gold border-brand-gold/20",
};

// ── Row component ─────────────────────────────────────────────────────────────

function PofRow({ pof, onVerify, onReject }: {
  pof: PofSubmission;
  onVerify: (id: string, amount: number) => void;
  onReject: (id: string, reason: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [verifyAmt, setVerifyAmt] = useState(String(pof.amount_claimed));
  const [rejectReason, setRejectReason] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [docPreview, setDocPreview] = useState(false);
  const docColor = DOC_COLORS[pof.doc_type] ?? "bg-muted text-muted-foreground border-border";

  return (
    <div className="border-b border-border last:border-0">
      {/* Main row */}
      <div className="px-4 py-4 flex flex-wrap items-center gap-3">
        {/* Avatar */}
        <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs shrink-0">
          {initials(pof.investor_name)}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-foreground text-sm">{pof.investor_name}</p>
            <span className="text-xs font-mono text-muted-foreground bg-muted/40 px-1.5 py-0.5 rounded">{pof.deal_ref}</span>
          </div>
          <div className="flex flex-wrap gap-3 mt-0.5 text-xs text-muted-foreground">
            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-xs ${docColor}`}>
              {pof.doc_type}
            </span>
            <span>{fmtDate(pof.submitted)}</span>
          </div>
        </div>

        {/* Amounts */}
        <div className="text-right shrink-0 hidden sm:block">
          <p className="text-sm font-semibold text-foreground">{fmt(pof.amount_claimed)}</p>
          {pof.verified_amount && (
            <p className="text-xs text-brand-emerald">Verified: {fmt(pof.verified_amount)}</p>
          )}
          {pof.status === "rejected" && (
            <p className="text-xs text-red-500">Rejected</p>
          )}
        </div>

        {/* Status + actions */}
        <div className="flex items-center gap-2 shrink-0">
          <StatusBadge status={pof.status} />
          {pof.status === "pending" && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-medium transition-colors"
            >
              Review {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
      </div>

      {/* Expand panel (pending only) */}
      {expanded && pof.status === "pending" && (
        <div className="px-4 pb-4">
          <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-4">
            {/* Document preview mock */}
            <div>
              <Button
                size="sm"
                variant="outline"
                className="gap-2"
                onClick={() => setDocPreview((v) => !v)}
              >
                <Eye className="w-3.5 h-3.5" /> View Document
              </Button>
              {docPreview && (
                <div className="mt-3 rounded-lg border border-dashed border-border bg-card p-4 text-center">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-2">
                    <FileCheck className="w-6 h-6 text-primary" />
                  </div>
                  <p className="text-sm font-medium text-foreground">{pof.doc_type}</p>
                  <p className="text-xs text-muted-foreground mt-1">Submitted by {pof.investor_name}</p>
                  <p className="text-xs text-muted-foreground">Claimed amount: {fmt(pof.amount_claimed)}</p>
                  <div className="mt-3 flex items-center justify-center gap-1 text-xs text-brand-gold">
                    <AlertCircle className="w-3 h-3" />
                    Document preview requires secure viewer (placeholder)
                  </div>
                </div>
              )}
            </div>

            {/* Verify amount input */}
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1.5">
                Verified amount (€)
              </label>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-2 flex-1">
                  <Euro className="w-4 h-4 text-muted-foreground shrink-0" />
                  <input
                    type="number"
                    value={verifyAmt}
                    onChange={(e) => setVerifyAmt(e.target.value)}
                    className="flex-1 bg-transparent text-sm text-foreground focus:outline-none"
                  />
                </div>
                <Button
                  size="sm"
                  className="gap-1 bg-brand-emerald/10 text-brand-emerald border border-brand-emerald/20 hover:bg-brand-emerald/20"
                  variant="ghost"
                  disabled={!verifyAmt || Number(verifyAmt) <= 0}
                  onClick={() => {
                    onVerify(pof.id, Number(verifyAmt));
                    setExpanded(false);
                  }}
                >
                  <FileCheck className="w-3.5 h-3.5" /> Verify
                </Button>
              </div>
            </div>

            {/* Reject section */}
            <div>
              <button
                onClick={() => setShowReject((v) => !v)}
                className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-400 font-medium transition-colors"
              >
                <FileX className="w-3.5 h-3.5" />
                Reject submission
                {showReject ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>

              {showReject && (
                <div className="mt-2 rounded-lg border border-red-500/20 bg-red-500/5 p-3 space-y-2">
                  <textarea
                    rows={2}
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="Rejection reason (e.g. Document expired, amount insufficient...)"
                    className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-red-500 resize-none"
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="gap-1 bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500/20"
                      variant="ghost"
                      disabled={!rejectReason.trim()}
                      onClick={() => {
                        onReject(pof.id, rejectReason);
                        setExpanded(false);
                        setShowReject(false);
                      }}
                    >
                      <XCircle className="w-3.5 h-3.5" /> Confirm rejection
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setShowReject(false)}>Cancel</Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Rejected reason display */}
      {pof.status === "rejected" && pof.rejection_reason && (
        <div className="px-4 pb-3">
          <p className="text-xs text-muted-foreground italic">Reason: "{pof.rejection_reason}"</p>
        </div>
      )}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export function ProofOfFundsReviewer() {
  const [submissions, setSubmissions] = useState<PofSubmission[]>(INITIAL_DATA);
  const [tab, setTab] = useState<TabFilter>("all");

  const counts = {
    all: submissions.length,
    pending: submissions.filter((s) => s.status === "pending").length,
    verified: submissions.filter((s) => s.status === "verified").length,
    rejected: submissions.filter((s) => s.status === "rejected").length,
  };

  const totalVerifiedVolume = submissions
    .filter((s) => s.status === "verified" && s.verified_amount)
    .reduce((sum, s) => sum + (s.verified_amount ?? 0), 0);

  function verify(id: string, amount: number) {
    const name = submissions.find((s) => s.id === id)?.investor_name ?? "Investor";
    setSubmissions((prev) =>
      prev.map((s) => s.id === id ? { ...s, status: "verified", verified_amount: amount } : s)
    );
    toast.success(`POF verified for ${name} — ${fmt(amount)}`);
  }

  function reject(id: string, reason: string) {
    const name = submissions.find((s) => s.id === id)?.investor_name ?? "Investor";
    setSubmissions((prev) =>
      prev.map((s) => s.id === id ? { ...s, status: "rejected", rejection_reason: reason } : s)
    );
    toast.success(`POF submission rejected for ${name}`);
  }

  const filtered = tab === "all" ? submissions : submissions.filter((s) => s.status === tab);

  const TABS: { key: TabFilter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "pending", label: "Pending" },
    { key: "verified", label: "Verified" },
    { key: "rejected", label: "Rejected" },
  ];

  return (
    <div className="space-y-5">
      {/* Summary stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium mb-2">
            <Wallet className="w-3.5 h-3.5" /> Total Pending
          </div>
          <p className="text-2xl font-bold text-brand-gold">{counts.pending}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Awaiting review</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium mb-2">
            <TrendingUp className="w-3.5 h-3.5" /> Verified Volume
          </div>
          <p className="text-2xl font-bold text-brand-emerald">{fmt(totalVerifiedVolume)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Across {counts.verified} verified submissions</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium mb-2">
            <Timer className="w-3.5 h-3.5" /> Avg Verification Time
          </div>
          <p className="text-2xl font-bold text-foreground">4.2 <span className="text-base font-normal text-muted-foreground">hours</span></p>
          <p className="text-xs text-muted-foreground mt-0.5">Submission to decision</p>
        </div>
      </div>

      {/* Panel */}
      <div className="rounded-xl border border-border overflow-hidden bg-card">
        {/* Tabs */}
        <div className="flex items-center gap-1 px-4 py-3 border-b border-border bg-muted/20 flex-wrap">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`text-sm px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
                tab === t.key ? "bg-primary/10 text-primary font-semibold" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                tab === t.key ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
              }`}>
                {counts[t.key]}
              </span>
            </button>
          ))}
        </div>

        {/* Column headers */}
        <div className="px-4 py-2.5 bg-muted/10 border-b border-border hidden sm:grid grid-cols-[36px_1fr_auto_auto_auto] gap-3 items-center">
          <div />
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Investor / Deal</p>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide text-right">Amount claimed</p>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</p>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Action</p>
        </div>

        {/* Rows */}
        {filtered.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground text-sm">
            No {tab === "all" ? "" : tab} submissions found.
          </div>
        ) : (
          <div>
            {filtered.map((pof) => (
              <PofRow key={pof.id} pof={pof} onVerify={verify} onReject={reject} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
