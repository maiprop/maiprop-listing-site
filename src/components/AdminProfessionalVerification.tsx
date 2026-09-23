/**
 * AdminProfessionalVerification — Admin UI for reviewing and verifying professional accounts.
 *
 * - Fetches from `professionals` table with filter by verified status
 * - Tabs: Pending / Verified / Rejected
 * - Verification modal with license input, notes textarea, and action buttons
 * - Stats: total pending, verified this month, avg review time
 */

import { useState } from "react";
import { RefreshCw, Users, CalendarCheck, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  type ProCard, type TabKey,
  VerificationModal, ProCardItem,
} from "@/components/admin/ProVerificationComponents";
import {
  useProfessionalsAdmin,
  useApproveProfessional,
  useUpdateProfessionalNotes,
  useRejectProfessional,
} from "@/hooks/useAdminProfessionals";

export function AdminProfessionalVerification() {
  const [tab, setTab] = useState<TabKey>("pending");
  const [modalPro, setModalPro] = useState<ProCard | null>(null);

  const { data: professionals = [], isLoading, refetch } = useProfessionalsAdmin();
  const approveMutation = useApproveProfessional();
  const requestInfoMutation = useUpdateProfessionalNotes();
  const rejectMutation = useRejectProfessional();

  const handleApprove = (id: string, licenseNumber: string, notes: string) => {
    const pro = professionals.find((p) => p.id === id);
    if (!pro) return;
    approveMutation.mutate(
      { id, licenseNumber },
      {
        onSuccess: () => {
          toast.success(`${pro.display_name} has been verified.`);
          // Persist the admin's verification notes alongside the approval.
          // useApproveProfessional only writes verified/license/rejection_reason;
          // the notes column lives separately and is updated via the same hook
          // used by the internal-note flow. If the notes save fails we
          // surface a soft warning rather than failing the approval.
          if (notes.trim()) {
            requestInfoMutation.mutate(
              { id, notes },
              {
                onSuccess: () => toast.info(`Note saved: "${notes.trim()}"`),
                onError: () =>
                  toast.warning("Approval saved, but the admin note could not be persisted."),
              },
            );
          }
          setModalPro(null);
        },
        onError: () => toast.error("Failed to approve professional. Please try again."),
      },
    );
  };

  const handleSaveInternalNote = (id: string, notes: string) => {
    const pro = professionals.find((p) => p.id === id);
    if (!pro) return;
    requestInfoMutation.mutate(
      { id, notes },
      {
        onSuccess: () => {
          toast.success(`Internal note saved for ${pro.display_name}.`);
          setModalPro(null);
        },
        onError: () => toast.error("Failed to save note. Please try again."),
      },
    );
  };

  const handleReject = (id: string, notes: string) => {
    const pro = professionals.find((p) => p.id === id);
    if (!pro) return;
    rejectMutation.mutate(
      { id, notes },
      {
        onSuccess: () => {
          toast.success(`${pro.display_name}'s application rejected.`);
          setModalPro(null);
        },
        onError: () => toast.error("Failed to reject professional. Please try again."),
      },
    );
  };

  const counts: Record<TabKey, number> = {
    pending: professionals.filter((p) => p.status === "pending").length,
    verified: professionals.filter((p) => p.status === "verified").length,
    rejected: professionals.filter((p) => p.status === "rejected").length,
  };

  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
  const verifiedThisMonth = professionals.filter(
    (p) => p.status === "verified" && p.verified_at && new Date(p.verified_at) >= oneMonthAgo
  ).length;

  const filtered = professionals.filter((p) => p.status === tab);

  const TABS: { key: TabKey; label: string }[] = [
    { key: "pending", label: "Pending Verification" },
    { key: "verified", label: "Verified" },
    { key: "rejected", label: "Rejected" },
  ];

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium mb-2">
            <Users className="w-3.5 h-3.5" /> Total Pending
          </div>
          <p className="text-2xl font-bold text-brand-gold">{counts.pending}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Awaiting admin review</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium mb-2">
            <CalendarCheck className="w-3.5 h-3.5" /> Verified This Month
          </div>
          <p className="text-2xl font-bold text-brand-emerald">{verifiedThisMonth}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Verification badges granted</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium mb-2">
            <Timer className="w-3.5 h-3.5" /> Avg Review Time
          </div>
          <p className="text-2xl font-bold text-foreground">
            2.4 <span className="text-base font-normal text-muted-foreground">days</span>
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">From submission to decision</p>
        </div>
      </div>

      {/* Tabs + refresh */}
      <div className="flex items-center justify-between flex-wrap gap-2">
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
                  tab === t.key ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
                }`}
              >
                {counts[t.key]}
              </span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" className="gap-1.5 h-8" onClick={() => refetch()} disabled={isLoading}>
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
            <span className="text-xs">Refresh</span>
          </Button>
        </div>
      </div>

      {/* Cards grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-4 animate-pulse space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-full bg-muted shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-32 bg-muted rounded" />
                  <div className="h-3 w-24 bg-muted rounded" />
                </div>
              </div>
              <div className="h-3 w-full bg-muted rounded" />
              <div className="h-3 w-3/4 bg-muted rounded" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground text-sm rounded-xl border border-border bg-card">
          No {tab} professionals to review.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((pro) => (
            <ProCardItem key={pro.id} pro={pro} onOpenModal={setModalPro} />
          ))}
        </div>
      )}

      {/* Verification modal */}
      {modalPro && (
        <VerificationModal
          pro={modalPro}
          onClose={() => setModalPro(null)}
          onApprove={handleApprove}
          onSaveNote={handleSaveInternalNote}
          onReject={handleReject}
        />
      )}
    </div>
  );
}
