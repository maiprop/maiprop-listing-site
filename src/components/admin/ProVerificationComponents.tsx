/* eslint-disable react-refresh/only-export-components */
import { useState } from "react";
import {
  ShieldCheck,
  ShieldX,
  Clock,
  CheckCircle2,
  XCircle,
  FileText,
  X,
  ChevronRight,
  Building2,
  Scale,
  Stamp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PROFESSIONAL_CATEGORY_COLORS as CATEGORY_COLORS } from "@/lib/statusColors";
import { fmtDate } from "@/lib/format";
import { useFocusTrap } from "@/hooks/useFocusTrap";

// ── Types ─────────────────────────────────────────────────────────────────────

export type VerifStatus = "pending" | "verified" | "rejected";

export interface ProCard {
  id: string;
  display_name: string;
  category: string;
  title: string;
  avatar_url: string | null;
  created_at: string;
  license_number: string | null;
  specialties: string[] | null;
  status: VerifStatus;
  rejection_reason?: string;
  verified_at?: string;
}

export type TabKey = "pending" | "verified" | "rejected";

// ── Helpers ───────────────────────────────────────────────────────────────────

export function initials(name: string): string {
  return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
}


export function pendingSince(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return "Today";
  if (days === 1) return "1d ago";
  return `${days}d ago`;
}

export function categoryIcon(cat: string) {
  if (cat === "architect") return <Building2 className="w-4 h-4" />;
  if (cat === "lawyer") return <Scale className="w-4 h-4" />;
  if (cat === "notary") return <Stamp className="w-4 h-4" />;
  return <FileText className="w-4 h-4" />;
}

// ── Status badge ──────────────────────────────────────────────────────────────

export function StatusBadge({ status }: { status: VerifStatus }) {
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
      <Clock className="w-3 h-3" /> Pending
    </Badge>
  );
}

// ── Verification modal ────────────────────────────────────────────────────────

interface VerificationModalProps {
  pro: ProCard;
  onClose: () => void;
  onApprove: (id: string, licenseNumber: string, notes: string) => void;
  onSaveNote: (id: string, notes: string) => void;
  onReject: (id: string, notes: string) => void;
}

export function VerificationModal({
  pro,
  onClose,
  onApprove,
  onSaveNote,
  onReject,
}: VerificationModalProps) {
  const dialogRef = useFocusTrap<HTMLDivElement>({ onEscape: onClose });
  const [licenseNumber, setLicenseNumber] = useState(pro.license_number ?? "");
  const [notes, setNotes] = useState("");
  const catColor = CATEGORY_COLORS[pro.category] ?? "bg-muted text-muted-foreground border-border";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Review professional"
        tabIndex={-1}
        className="bg-card border border-border rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-display font-semibold text-foreground">Review Professional</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-muted text-muted-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Professional details */}
        <div className="px-6 py-4 space-y-4">
          {/* Identity */}
          <div className="flex items-start gap-3">
            <div
              className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-base shrink-0 ${catColor}`}
            >
              {pro.avatar_url ? (
                <img src={pro.avatar_url} alt={`${pro.display_name || "Professional"} profile photo`} className="w-full h-full rounded-full object-cover" />
              ) : (
                initials(pro.display_name)
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold text-foreground">{pro.display_name}</p>
                <StatusBadge status={pro.status} />
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">{pro.title}</p>
              <div className="flex items-center gap-1.5 mt-1">
                <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${catColor}`}>
                  {categoryIcon(pro.category)} {pro.category}
                </span>
                <span className="text-xs text-muted-foreground">
                  Applied {pendingSince(pro.created_at)}
                </span>
              </div>
            </div>
          </div>

          {/* Specializations */}
          {pro.specialties && pro.specialties.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">Specializations</p>
              <div className="flex flex-wrap gap-1.5">
                {pro.specialties.map((s) => (
                  <span
                    key={s}
                    className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Submitted date */}
          <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Submitted</span>
              <span className="font-medium text-foreground">{fmtDate(pro.created_at)}</span>
            </div>
          </div>

          {/* License number input */}
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1.5">
              License Number
            </label>
            <input
              type="text"
              value={licenseNumber}
              onChange={(e) => setLicenseNumber(e.target.value)}
              placeholder="e.g. ARK-2019-4521"
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Admin notes */}
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1.5">
              Admin Review Note / Rejection Reason
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Internal review note or rejection reason..."
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
            />
            <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
              Saving this note keeps it internal. Rejecting shares it with the applicant as the rejection reason.
            </p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="px-6 py-4 border-t border-border bg-muted/10 flex flex-col sm:flex-row gap-2">
          <Button
            className="flex-1 gap-2 bg-brand-emerald/10 text-brand-emerald border border-brand-emerald/20 hover:bg-brand-emerald/20"
            variant="ghost"
            onClick={() => onApprove(pro.id, licenseNumber, notes)}
          >
            <ShieldCheck className="w-4 h-4" /> Approve &amp; Verify
          </Button>
          <Button
            className="flex-1 gap-2"
            variant="outline"
            onClick={() => onSaveNote(pro.id, notes)}
          >
            <FileText className="w-4 h-4" /> Save Internal Note
          </Button>
          <Button
            className="flex-1 gap-2 bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500/20"
            variant="ghost"
            onClick={() => onReject(pro.id, notes)}
            disabled={!notes.trim()}
          >
            <ShieldX className="w-4 h-4" /> Reject
          </Button>
        </div>
        {!notes.trim() && (
          <p className="px-6 pb-3 text-xs text-muted-foreground text-center">
            Add a note before rejecting.
          </p>
        )}
      </div>
    </div>
  );
}

// ── Professional card ─────────────────────────────────────────────────────────

export function ProCardItem({
  pro,
  onOpenModal,
}: {
  pro: ProCard;
  onOpenModal: (pro: ProCard) => void;
}) {
  const catColor = CATEGORY_COLORS[pro.category] ?? "bg-muted text-muted-foreground border-border";

  return (
    <div className="glass-card rounded-xl border border-border p-4 space-y-3 hover:border-primary/30 transition-colors">
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div
          className={`w-11 h-11 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${catColor}`}
        >
          {pro.avatar_url ? (
            <img src={pro.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
          ) : (
            initials(pro.display_name)
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-foreground text-sm">{pro.display_name}</p>
            <StatusBadge status={pro.status} />
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{pro.title}</p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${catColor}`}>
              {categoryIcon(pro.category)} {pro.category}
            </span>
            {pro.license_number && (
              <span className="text-xs font-mono text-muted-foreground bg-muted/40 px-1.5 py-0.5 rounded">
                {pro.license_number}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Specializations */}
      {pro.specialties && pro.specialties.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {pro.specialties.slice(0, 3).map((s) => (
            <span
              key={s}
              className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
            >
              {s}
            </span>
          ))}
          {pro.specialties.length > 3 && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
              +{pro.specialties.length - 3}
            </span>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-1">
        <span className="text-xs text-muted-foreground">
          {pro.status === "pending"
            ? `Pending ${pendingSince(pro.created_at)}`
            : pro.status === "verified"
            ? `Verified ${pro.verified_at ? fmtDate(pro.verified_at) : ""}`
            : `Rejected`}
        </span>
        {pro.status === "pending" && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 text-xs"
            onClick={() => onOpenModal(pro)}
          >
            Review Documents <ChevronRight className="w-3 h-3" />
          </Button>
        )}
      </div>

      {/* Rejection reason */}
      {pro.status === "rejected" && pro.rejection_reason && (
        <p className="text-xs text-muted-foreground italic border-t border-border pt-2">
          Reason: &ldquo;{pro.rejection_reason}&rdquo;
        </p>
      )}
    </div>
  );
}
