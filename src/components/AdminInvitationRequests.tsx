/**
 * Admin view for Quick Sale invitation requests.
 * One-click Approve auto-creates an investor_subscriptions record.
 * Sends email notification via edge function on approve/reject.
 */

import { useState } from "react";
import { formatDate } from "@/lib/format";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  MailPlus, Loader2, Check, ChevronDown, ChevronUp,
  Building2, Globe, TrendingUp, DollarSign,
  ExternalLink, RefreshCw, Filter, MessageSquare, Mail
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { isPlatformAdmin } from "@/lib/authUtils";
import { useAuth } from "@/contexts/AuthContext";
import { REQUEST_STATUS_COLORS as STATUS_COLORS } from "@/lib/statusColors";
import { logger } from "@/lib/logger";

type InvitationRequest = {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  company: string | null;
  job_title: string | null;
  company_website: string | null;
  linkedin_url: string | null;
  investment_focus: string | null;
  deal_size_range: string | null;
  investment_vehicle: string | null;
  geographic_focus: string | null;
  aum_range: string | null;
  years_experience: string | null;
  source: string | null;
  message: string | null;
  user_id: string | null;
  created_at: string;
  status: "pending" | "approved" | "rejected";
};

const TIER_OPTIONS = [
  { value: "private", label: "Private" },
  { value: "institutional", label: "Institutional" },
  { value: "developer", label: "Developer" },
];

function ExpandedDetail({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-0.5">{label}</p>
      <p className="text-xs text-foreground">{value}</p>
    </div>
  );
}

async function sendNotificationEmail(params: {
  type: "approved" | "rejected";
  email: string;
  full_name: string | null;
  tier?: string;
  rejection_reason?: string;
}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;

  const { error } = await supabase.functions.invoke("invitation-notify", {
    body: params,
    headers: { Authorization: `Bearer ${session.access_token}` },
  });

  if (error) {
    logger.warn("Email notification failed (non-fatal):", error.message);
  }
}

async function reviewInvitationRequest(params: {
  requestId: string;
  decision: "approved" | "rejected";
  tier?: string;
  rejectionReason?: string;
}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Admin session expired");

  const { data, error } = await supabase.functions.invoke("admin-review-invitation", {
    body: params,
    headers: { Authorization: `Bearer ${session.access_token}` },
  });

  if (error) throw error;
  return data as {
    success: boolean;
    result?: {
      granted_role?: string | null;
    };
  };
}

export default function AdminInvitationRequests() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [updating, setUpdating] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<"all" | "pending" | "approved" | "rejected">("all");
  const [tierMap, setTierMap] = useState<Record<string, string>>({});
  const [rejectionReasonMap, setRejectionReasonMap] = useState<Record<string, string>>({});
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [approveTarget, setApproveTarget] = useState<InvitationRequest | null>(null);

  const isAdmin = isPlatformAdmin(profile);

  const { data: requests = [], isLoading: loading, refetch } = useQuery<InvitationRequest[]>({
    queryKey: ["admin-invitation-requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invitation_requests")
        .select("id, email, full_name, phone, company, job_title, company_website, linkedin_url, investment_focus, deal_size_range, investment_vehicle, geographic_focus, aum_range, years_experience, source, message, user_id, created_at, status")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as InvitationRequest[]) || [];
    },
    enabled: isAdmin,
  });

  const getTier = (id: string) => tierMap[id] ?? "private";
  const getRejectionReason = (id: string) => rejectionReasonMap[id] ?? "";

  const approve = async (req: InvitationRequest) => {
    if (!req.user_id) {
      toast.error("Cannot approve: this applicant has no linked user account yet.");
      return;
    }
    setUpdating(req.id);
    try {
      const tier = getTier(req.id);
      const review = await reviewInvitationRequest({
        requestId: req.id,
        decision: "approved",
        tier,
      });
      const grantedRole = review.result?.granted_role ?? "investor";

      sendNotificationEmail({
        type: "approved",
        email: req.email,
        full_name: req.full_name,
        tier,
      });

      qc.invalidateQueries({ queryKey: ["admin-invitation-requests"] });
      toast.success(`✅ Approved — role: ${grantedRole}, subscription: ${tier} (1 year) — email sent`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not approve");
    } finally {
      setUpdating(null);
    }
  };

  const openRejectPanel = (id: string) => {
    setRejectingId(id);
    if (!expanded || expanded !== id) setExpanded(id);
  };

  const confirmReject = async (req: InvitationRequest) => {
    setUpdating(req.id);
    const reason = getRejectionReason(req.id);
    try {
      await reviewInvitationRequest({
        requestId: req.id,
        decision: "rejected",
        rejectionReason: reason || undefined,
      });

      sendNotificationEmail({
        type: "rejected",
        email: req.email,
        full_name: req.full_name,
        rejection_reason: reason || undefined,
      });

      qc.invalidateQueries({ queryKey: ["admin-invitation-requests"] });
      setRejectingId(null);
      toast.success("Request rejected" + (reason ? " — email sent with reason" : " — email sent"));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not reject");
    } finally {
      setUpdating(null);
    }
  };

  if (!isAdmin) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground text-sm">
        Admin access required.
      </div>
    );
  }

  const filtered = filterStatus === "all" ? requests : requests.filter(r => r.status === filterStatus);
  const counts = {
    all: requests.length,
    pending: requests.filter(r => r.status === "pending").length,
    approved: requests.filter(r => r.status === "approved").length,
    rejected: requests.filter(r => r.status === "rejected").length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-display text-lg font-semibold flex items-center gap-2">
            <MailPlus className="w-5 h-5 text-primary" /> Invitation Requests
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Approve to mark the applicant as vetted and send the payment next step. Deal-flow access activates only after payment is confirmed.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2 h-8 text-xs">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </Button>
      </div>

      {/* Status filter tabs */}
      <div className="flex items-center gap-2 flex-wrap">
        {(["all", "pending", "approved", "rejected"] as const).map(s => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filterStatus === s
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary"
            }`}
          >
            <Filter className="w-3 h-3" />
            {s.charAt(0).toUpperCase() + s.slice(1)}
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
              filterStatus === s ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground"
            }`}>
              {counts[s]}
            </span>
          </button>
        ))}
      </div>

      {/* Cards */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground text-sm rounded-xl border border-border bg-card">
          No {filterStatus !== "all" ? filterStatus : ""} invitation requests.
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(req => {
            const isExpanded = expanded === req.id;
            const isUpdating = updating === req.id;
            const isRejectOpen = rejectingId === req.id;
            return (
              <div
                key={req.id}
                className={`rounded-2xl border overflow-hidden transition-all duration-200 ${
                  req.status === "pending"
                    ? "border-amber-500/25 bg-amber-500/5"
                    : req.status === "approved"
                    ? "border-emerald-500/20 bg-emerald-500/5"
                    : "border-border bg-card"
                }`}
              >
                {/* Main row */}
                <div className="p-4 sm:p-5">
                  <div className="flex items-start gap-4 flex-wrap">
                    {/* Avatar / initials */}
                    <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 text-primary font-bold text-sm">
                      {(req.full_name || req.email).charAt(0).toUpperCase()}
                    </div>

                    {/* Core info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-semibold text-sm">{req.full_name || "—"}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${STATUS_COLORS[req.status]}`}>
                          {req.status}
                        </span>
                        <span className="text-[10px] text-muted-foreground">{formatDate(req.created_at)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">{req.email}</p>

                      {/* Key signals row */}
                      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                        {req.company && (
                          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                            <Building2 className="w-3 h-3" /> {req.company}
                            {req.job_title && <span className="text-muted-foreground/60"> · {req.job_title}</span>}
                          </span>
                        )}
                        {req.investment_vehicle && (
                          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                            <TrendingUp className="w-3 h-3 text-primary" /> {req.investment_vehicle}
                          </span>
                        )}
                        {req.aum_range && (
                          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                            <DollarSign className="w-3 h-3 text-brand-gold" /> AUM {req.aum_range}
                          </span>
                        )}
                        {req.deal_size_range && (
                          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                            <TrendingUp className="w-3 h-3 text-brand-emerald" /> Deal {req.deal_size_range}
                          </span>
                        )}
                        {req.geographic_focus && (
                          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                            <Globe className="w-3 h-3" /> {req.geographic_focus}
                          </span>
                        )}
                        {req.linkedin_url && (
                          <a
                            href={req.linkedin_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-[11px] text-primary hover:underline"
                            onClick={e => e.stopPropagation()}
                          >
                            <ExternalLink className="w-3 h-3" /> LinkedIn
                          </a>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0 flex-wrap">
                      {req.status === "pending" && (
                        <>
                          {/* Tier picker for this request */}
                          <select
                            value={getTier(req.id)}
                            onChange={e => setTierMap(prev => ({ ...prev, [req.id]: e.target.value }))}
                            className="bg-secondary border border-border rounded-lg px-2 py-1.5 text-xs text-foreground outline-none focus:border-primary"
                            disabled={isUpdating}
                          >
                            {TIER_OPTIONS.map(t => (
                              <option key={t.value} value={t.value}>{t.label}</option>
                            ))}
                          </select>
                          <Button
                            size="sm"
                            className="h-8 text-xs gap-1.5 bg-brand-emerald hover:bg-brand-emerald/90 text-primary-foreground border-0"
                            onClick={() => setApproveTarget(req)}
                            disabled={isUpdating}
                          >
                            {isUpdating && !isRejectOpen ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className={`h-8 text-xs gap-1.5 border-destructive/30 transition-colors ${
                              isRejectOpen
                                ? "bg-destructive/10 text-destructive"
                                : "text-destructive hover:bg-destructive/10"
                            }`}
                            onClick={() => isRejectOpen ? setRejectingId(null) : openRejectPanel(req.id)}
                            disabled={isUpdating}
                          >
                            <MessageSquare className="w-3 h-3" />
                            {isRejectOpen ? "Cancel" : "Reject"}
                          </Button>
                        </>
                      )}
                      <button
                        onClick={() => setExpanded(isExpanded ? null : req.id)}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                      >
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Rejection reason panel */}
                {isRejectOpen && req.status === "pending" && (
                  <div className="border-t border-destructive/20 bg-destructive/5 px-4 sm:px-5 py-4">
                    <div className="flex items-start gap-2 mb-2">
                      <MessageSquare className="w-3.5 h-3.5 text-destructive mt-0.5 shrink-0" />
                      <p className="text-xs font-medium text-destructive">Rejection reason (sent to applicant by email)</p>
                    </div>
                    <Textarea
                      placeholder="Optional: explain why this application was declined. This will be included in the notification email sent to the applicant."
                      value={getRejectionReason(req.id)}
                      onChange={e => setRejectionReasonMap(prev => ({ ...prev, [req.id]: e.target.value }))}
                      className="min-h-[80px] text-xs bg-background border-destructive/30 focus-visible:ring-destructive/30 resize-none"
                      disabled={isUpdating}
                    />
                    <div className="flex items-center gap-2 mt-3 justify-end">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => setRejectingId(null)}
                        disabled={isUpdating}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        className="h-7 text-xs gap-1.5 bg-destructive hover:bg-destructive/90 text-destructive-foreground border-0"
                        onClick={() => confirmReject(req)}
                        disabled={isUpdating}
                      >
                        {isUpdating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Mail className="w-3 h-3" />}
                        Confirm Rejection & Send Email
                      </Button>
                    </div>
                  </div>
                )}

                {/* Expanded details */}
                {isExpanded && (
                  <div className="border-t border-border/60 px-4 sm:px-5 py-4 bg-card/60">
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-6 gap-y-4">
                      <ExpandedDetail label="Investment focus" value={req.investment_focus} />
                      <ExpandedDetail label="Investment vehicle" value={req.investment_vehicle} />
                      <ExpandedDetail label="Typical deal size" value={req.deal_size_range} />
                      <ExpandedDetail label="AUM range" value={req.aum_range} />
                      <ExpandedDetail label="Geographic focus" value={req.geographic_focus} />
                      <ExpandedDetail label="Years of experience" value={req.years_experience} />
                      <ExpandedDetail label="Phone" value={req.phone} />
                      <ExpandedDetail label="Source" value={req.source} />
                      {req.company_website && (
                        <div>
                          <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-0.5">Website</p>
                          <a
                            href={req.company_website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-primary hover:underline flex items-center gap-1"
                          >
                            <ExternalLink className="w-3 h-3" /> {req.company_website}
                          </a>
                        </div>
                      )}
                    </div>
                    {req.message && (
                      <div className="mt-4 p-3 bg-secondary/60 rounded-xl border border-border">
                        <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Message</p>
                        <p className="text-xs text-foreground leading-relaxed">{req.message}</p>
                      </div>
                    )}
                    {req.user_id ? (
                      <p className="text-[10px] text-muted-foreground mt-3">
                        <span className="text-brand-emerald font-semibold">✓ Linked user account</span> — approval will auto-create subscription.
                      </p>
                    ) : (
                      <p className="text-[10px] text-brand-gold mt-3">
                        ⚠ No linked user account — applicant must sign up before subscription can be created.
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      <ConfirmDialog
        open={!!approveTarget}
        title="Approve investor access?"
        description={`Approve ${approveTarget?.full_name || approveTarget?.email || "this applicant"} for payment setup? Full investor dashboard access starts only after payment is confirmed.`}
        confirmLabel="Approve"
        destructive={false}
        onConfirm={() => { if (approveTarget) approve(approveTarget); setApproveTarget(null); }}
        onCancel={() => setApproveTarget(null)}
      />
    </div>
  );
}
