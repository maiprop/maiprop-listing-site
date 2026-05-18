import { useState, useEffect } from "react";
import {
  Users, Euro, ChevronDown, ChevronUp, Check, X, Loader2, Settings, Calendar, TrendingUp,
  FileCheck, FileText, Wallet, Shield, ExternalLink, Mail, Phone, UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  useOpenHouseSettings,
  useOpenHouseRegistrations,
  useOpenHouseOffers,
  useUpsertOpenHouseSettings,
  useUpdateOpenHouseRegistration,
  useUpdateOpenHouseOffer,
  useAcceptOpenHouseOffer,
  useRevealAllOffers,
  getOpenHouseDocSignedUrl,
  getOpenHouseApprovalBlockers,
  type OHTimeslot,
  type OHRegistrationStatus,
  type OpenHouseRegistration,
  type OpenHouseOffer,
  type OpenHouseSettings,
} from "@/hooks/useOpenHouseAssetControl";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { useFocusTrap } from "@/hooks/useFocusTrap";

interface Props {
  listingId: string;
  isOwner: boolean;
  listingPrice?: number | null;
}

const STATUS_LABELS: Record<OHRegistrationStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  attended: "Attended",
  cancelled: "Cancelled",
};

// skipcq: JS-0067 - Exported React component is intentionally module-scoped.
export default function OpenHouseAssetControlPanel({ listingId, isOwner, listingPrice }: Props) { // skipcq: JS-R1005 - Owner control panel coordinates settings, approvals, documents, and offers in one surface.
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [registrationsOpen, setRegistrationsOpen] = useState(true);
  const [offersOpen, setOffersOpen] = useState(true);
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const rejectDialogRef = useFocusTrap<HTMLDivElement>({
    active: Boolean(rejectTarget),
    onEscape: () => setRejectTarget(null),
  });

  const { user } = useAuth();
  const { data: settings, isLoading: _settingsLoading } = useOpenHouseSettings(listingId);
  const { data: registrations = [], isLoading: regLoading } = useOpenHouseRegistrations(listingId, isOwner);
  const { data: offers = [] } = useOpenHouseOffers(listingId);

  const upsertSettings = useUpsertOpenHouseSettings();
  const updateReg = useUpdateOpenHouseRegistration();
  const updateOffer = useUpdateOpenHouseOffer();
  const acceptOffer = useAcceptOpenHouseOffer();
  const revealAll = useRevealAllOffers();

  if (!isOwner) return null;

  const handleApprove = (registration: OpenHouseRegistration) => {
    const blockers = getOpenHouseApprovalBlockers(registration, settings, listingPrice);
    if (blockers.length > 0) {
      toast.error(`Approval blocked: ${blockers.join(", ")}`);
      return;
    }
    updateReg.mutate({
      id: registration.id,
      updates: {
        status: "approved",
        approved_at: new Date().toISOString(),
        approved_by: user?.id ?? undefined,
      },
    });
  };

  const handleRejectConfirm = () => {
    if (!rejectTarget) return;
    updateReg.mutate({
      id: rejectTarget,
      updates: { status: "rejected", rejection_reason: rejectReason || undefined },
    });
    setRejectTarget(null);
    setRejectReason("");
  };

  const handleViewDoc = async (path: string) => {
    try {
      const url = await getOpenHouseDocSignedUrl(path);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (_err) {
      toast.error("Could not open document");
    }
  };

  const pendingCount = registrations.filter((r: OpenHouseRegistration) => r.status === "pending").length;
  const approvedCount = registrations.filter((r: OpenHouseRegistration) => r.status === "approved").length;
  const attendedCount = registrations.filter((r: OpenHouseRegistration) => r.status === "attended").length;
  const offersCount = offers.length;
  const validOffers = offers.filter((o: OpenHouseOffer) => o.status !== "withdrawn").map((o: OpenHouseOffer) => Number(o.amount));
  const highestBid = validOffers.length > 0 ? Math.max(...validOffers) : null;
  const conversionRate = approvedCount ? ((attendedCount / approvedCount) * 100).toFixed(1) : "0";

  return (
    <div className="space-y-4">
      {/* Metrics summary */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="rounded-xl border border-border p-3 bg-card">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Users className="w-4 h-4" />
            <span className="text-xs font-medium">Registered</span>
          </div>
          <div className="font-display text-xl font-bold mt-1">{registrations.length}</div>
        </div>
        <div className="rounded-xl border border-border p-3 bg-card">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Check className="w-4 h-4" />
            <span className="text-xs font-medium">Approved</span>
          </div>
          <div className="font-display text-xl font-bold mt-1 text-emerald-600">{approvedCount}</div>
        </div>
        <div className="rounded-xl border border-border p-3 bg-card">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Calendar className="w-4 h-4" />
            <span className="text-xs font-medium">Attended</span>
          </div>
          <div className="font-display text-xl font-bold mt-1">{attendedCount}</div>
        </div>
        <div className="rounded-xl border border-border p-3 bg-card">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Euro className="w-4 h-4" />
            <span className="text-xs font-medium">Offers</span>
          </div>
          <div className="font-display text-xl font-bold mt-1">{offersCount}</div>
        </div>
        <div className="rounded-xl border border-border p-3 bg-card">
          <div className="flex items-center gap-2 text-muted-foreground">
            <TrendingUp className="w-4 h-4" />
            <span className="text-xs font-medium">Conversion</span>
          </div>
          <div className="font-display text-xl font-bold mt-1">{conversionRate}%</div>
        </div>
      </div>

      {/* Settings collapsible */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <button
          className="w-full flex items-center justify-between p-4 text-left hover:bg-secondary/50"
          onClick={() => setSettingsOpen(!settingsOpen)}
        >
          <span className="font-semibold flex items-center gap-2">
            <Settings className="w-4 h-4" /> Asset Control Settings
          </span>
          {settingsOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        {settingsOpen && (
          <div className="p-4 pt-0 space-y-4 border-t border-border">
            <OpenHouseSettingsForm
              listingId={listingId}
              settings={settings}
              onSave={(s) => upsertSettings.mutate({ listingId, settings: s })}
              saving={upsertSettings.isPending}
            />
          </div>
        )}
      </div>

      {/* Registrations */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <button
          className="w-full flex items-center justify-between p-4 text-left hover:bg-secondary/50"
          onClick={() => setRegistrationsOpen(!registrationsOpen)}
        >
          <span className="font-semibold flex items-center gap-2">
            <Users className="w-4 h-4" /> Participants {pendingCount > 0 && (
              <span className="text-xs font-bold bg-amber-500 text-background rounded-full px-2 py-0.5">{pendingCount} pending</span>
            )}
          </span>
          {registrationsOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        {registrationsOpen && (
          <div className="border-t border-border">
            {/* Pipeline: track where each application stands */}
            <div className="flex items-center gap-2 px-4 py-3 bg-muted/30 border-b border-border text-xs">
              <span className="font-semibold text-muted-foreground">Pipeline:</span>
              <span className="flex items-center gap-1">
                <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-700 font-medium">{pendingCount} Pending</span>
                <span className="text-muted-foreground">→</span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-700 font-medium">{approvedCount} Approved</span>
                <span className="text-muted-foreground">→</span>
                <span className="px-2 py-0.5 rounded-full bg-primary/20 text-primary font-medium">{attendedCount} Attended</span>
              </span>
            </div>
            <div>
            {regLoading ? (
              <div className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" /></div>
            ) : registrations.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">No registrations yet</div>
            ) : (
              <div className="divide-y divide-border">
                {registrations.map((r: OpenHouseRegistration) => ( // skipcq: JS-R1005 - Registration row renders optional contact and approval states together.
                  <div key={r.id} className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">
                        {r.contact_name || r.profiles?.display_name || [r.profiles?.first_name, r.profiles?.last_name].filter(Boolean).join(" ") || "Visitor"}
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-[11px] text-muted-foreground">
                        {r.contact_email && (
                          <span className="inline-flex items-center gap-1">
                            <Mail className="w-3 h-3" /> {r.contact_email}
                          </span>
                        )}
                        {r.contact_phone && (
                          <span className="inline-flex items-center gap-1">
                            <Phone className="w-3 h-3" /> {r.contact_phone}
                          </span>
                        )}
                        {r.visit_purpose && (
                          <span className="inline-flex items-center gap-1">
                            <UserRound className="w-3 h-3" /> {r.visit_purpose}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2 mt-2 text-[11px]">
                        <span className={cn(
                          "inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium capitalize",
                          r.status === "pending" ? "bg-amber-500/15 text-amber-700" :
                          r.status === "approved" ? "bg-emerald-500/15 text-emerald-700" :
                          r.status === "attended" ? "bg-primary/15 text-primary" :
                          r.status === "rejected" ? "bg-destructive/15 text-destructive" :
                          "bg-muted text-muted-foreground"
                        )}>
                          {STATUS_LABELS[(r.status as import("@/hooks/useOpenHouseAssetControl").OHRegistrationStatus)] || r.status}
                        </span>
                        <span className={cn("inline-flex items-center gap-0.5", r.id_doc_url ? "text-emerald-600" : "text-muted-foreground")}>
                          <FileCheck className="w-3 h-3" />
                          {r.id_doc_url ? (
                            <button
                              onClick={() => r.id_doc_url && handleViewDoc(r.id_doc_url)}
                              className="underline underline-offset-2 hover:opacity-70 transition-opacity"
                              title="View ID document"
                            >
                              ID ✓ <ExternalLink className="w-2.5 h-2.5 inline" />
                            </button>
                          ) : "ID —"}
                        </span>
                        <span className={cn("inline-flex items-center gap-0.5", r.waiver_signed_at ? "text-emerald-600" : "text-muted-foreground")}>
                          <FileText className="w-3 h-3" /> {r.waiver_signed_at ? "Waiver ✓" : "Waiver —"}
                        </span>
                        <span className={cn("inline-flex items-center gap-0.5", r.proof_of_funds_url ? "text-emerald-600" : "text-muted-foreground")}>
                          <Wallet className="w-3 h-3" /> {r.proof_of_funds_url ? (r.proof_amount ? `€${Number(r.proof_amount).toLocaleString()} ✓` : "POF ✓") : "POF —"}
                        </span>
                        <span className={cn("inline-flex items-center gap-0.5", r.investor_declaration_signed_at ? "text-emerald-600" : "text-muted-foreground")}>
                          <Shield className="w-3 h-3" /> {r.investor_declaration_signed_at ? "Investor ✓" : "Investor —"}
                        </span>
                      </div>
                      {r.status === "pending" && (() => {
                        const blockers = getOpenHouseApprovalBlockers(r, settings, listingPrice);
                        if (blockers.length === 0) return null;
                        return (
                          <p className="mt-2 text-xs text-amber-700">
                            Missing before approval: {blockers.join(", ")}
                          </p>
                        );
                      })()}
                    </div>
                    {r.status === "pending" && (
                      <div className="flex gap-2 flex-wrap">
                        {r.id_doc_url && !r.id_verified_at && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1 text-primary border-primary/40"
                            onClick={() => updateReg.mutate({ id: r.id, updates: { id_verified_at: new Date().toISOString() } })}
                          >
                            <FileCheck className="w-3.5 h-3.5" /> Verify ID
                          </Button>
                        )}
                        <Button size="sm" variant="outline" className="gap-1 text-emerald-600 border-emerald-500/40"
                          onClick={() => handleApprove(r)}>
                          <Check className="w-3.5 h-3.5" /> Approve
                        </Button>
                        <Button size="sm" variant="outline" className="gap-1 text-destructive border-destructive/40"
                          onClick={() => { setRejectTarget(r.id); setRejectReason(""); }}>
                          <X className="w-3.5 h-3.5" /> Reject
                        </Button>
                      </div>
                    )}
                    {r.status === "approved" && (
                      <Button size="sm" variant="outline"
                        onClick={() => updateReg.mutate({ id: r.id, updates: { status: "attended", attended_at: new Date().toISOString() } })}>
                        Mark attended
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
            </div>
          </div>
        )}
      </div>

      {/* Reject reason dialog */}
      {rejectTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div
            ref={rejectDialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="Rejection reason"
            tabIndex={-1}
            className="bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl overflow-hidden"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h3 className="font-semibold text-foreground">Rejection Reason</h3>
              <button onClick={() => setRejectTarget(null)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-6 py-4 space-y-3">
              <p className="text-sm text-muted-foreground">Provide a reason (optional but recommended — helps the applicant understand).</p>
              <textarea
                rows={3}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="e.g. Timeslot full, incomplete documents, does not meet requirements..."
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-destructive resize-none"
              />
            </div>
            <div className="px-6 py-4 border-t border-border flex gap-2">
              <Button
                className="flex-1 gap-1.5 bg-destructive/10 text-destructive border border-destructive/20 hover:bg-destructive/20"
                variant="ghost"
                onClick={handleRejectConfirm}
              >
                <X className="w-4 h-4" /> Confirm Rejection
              </Button>
              <Button variant="outline" onClick={() => setRejectTarget(null)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}

      {/* Offers */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <button
          className="w-full flex items-center justify-between p-4 text-left hover:bg-secondary/50"
          onClick={() => setOffersOpen(!offersOpen)}
        >
          <span className="font-semibold flex items-center gap-2">
            <Euro className="w-4 h-4" /> Sealed Bids {highestBid != null && (
              <span className="text-xs font-bold bg-primary/20 text-primary rounded-full px-2 py-0.5">€{highestBid.toLocaleString()} highest</span>
            )}
            {offers.some((o: OpenHouseOffer) => o.status === "accepted") && (
              <span className="text-xs font-bold bg-emerald-500/20 text-emerald-700 rounded-full px-2 py-0.5">Winner selected</span>
            )}
          </span>
          {offersOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        {offersOpen && (
          <div className="border-t border-border">
            {offers.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">No bids yet</div>
            ) : (
              <>
                {/* Bulk actions bar */}
                {!offers.some((o: OpenHouseOffer) => o.status === "accepted") && (
                  <div className="flex items-center gap-3 px-4 py-3 bg-muted/30 border-b border-border">
                    <span className="text-xs text-muted-foreground font-medium">{offers.length} bid{offers.length !== 1 ? "s" : ""} received</span>
                    {offers.some((o: OpenHouseOffer) => o.status === "submitted") && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs gap-1"
                        disabled={revealAll.isPending}
                        onClick={() =>
                          revealAll.mutate({
                            listingId,
                            offerIds: offers.filter((o: OpenHouseOffer) => o.status === "submitted").map((o: OpenHouseOffer) => o.id),
                          })
                        }
                      >
                        {revealAll.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                        Reveal All Bids
                      </Button>
                    )}
                  </div>
                )}

                {/* Winner banner */}
                {(() => {
                  const winner = offers.find(o => o.status === "accepted");
                  if (!winner) return null;
                  return (
                    <div className="mx-4 mt-4 mb-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 flex items-center justify-between">
                      <div>
                        <p className="text-xs font-bold text-emerald-700 uppercase tracking-widest mb-0.5">Winning Bid</p>
                        <p className="font-display font-black text-xl text-emerald-700">€{Number(winner.amount).toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {winner.profiles?.display_name || "Bidder"}
                        </p>
                      </div>
                      <Check className="w-8 h-8 text-emerald-500" />
                    </div>
                  );
                })()}

                <div className="divide-y divide-border max-h-64 overflow-y-auto">
                  {[...offers].sort((a, b) => Number(b.amount) - Number(a.amount)).map((o) => { // skipcq: JS-R1005 - Offer row keeps sealed, revealed, accepted, and rejected states together.
                    const bidderName = o.profiles?.display_name || "Bidder";
                    const isWinner = o.status === "accepted";
                    const isRevealed = o.status === "revealed";
                    const isSealed = o.status === "submitted";
                    const allOfferIds = offers.map((x: OpenHouseOffer) => x.id);

                    return (
                      <div key={o.id} className={cn("p-4 flex items-center justify-between gap-4", isWinner && "bg-emerald-500/5")}>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-base">
                              {isSealed ? "Sealed bid" : `€${Number(o.amount).toLocaleString()}`}
                            </span>
                            {isWinner && <span className="text-[10px] font-bold bg-emerald-500/20 text-emerald-700 px-2 py-0.5 rounded-full">ACCEPTED</span>}
                            {o.status === "rejected" && <span className="text-[10px] font-bold bg-destructive/10 text-destructive px-2 py-0.5 rounded-full">REJECTED</span>}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">{bidderName}{o.message && ` · "${o.message}"`}</div>
                        </div>
                        <div className="flex gap-2 shrink-0">
                          {isSealed && (
                            <Button size="sm" variant="outline" className="h-7 text-xs"
                              disabled={updateOffer.isPending}
                              onClick={() => updateOffer.mutate({ id: o.id, status: "revealed" })}>
                              Reveal
                            </Button>
                          )}
                          {isRevealed && (
                            <>
                              <Button size="sm" className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white border-0 gap-1"
                                disabled={acceptOffer.isPending}
                                onClick={() => acceptOffer.mutate({ acceptId: o.id, listingId, allOfferIds })}>
                                {acceptOffer.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                                Accept
                              </Button>
                              <Button size="sm" variant="outline" className="h-7 text-xs text-destructive border-destructive/40"
                                disabled={updateOffer.isPending}
                                onClick={() => updateOffer.mutate({ id: o.id, status: "rejected" })}>
                                <X className="w-3 h-3" />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// skipcq: JS-0067 - Form subcomponent is intentionally module-scoped for stable identity.
function OpenHouseSettingsForm({ // skipcq: JS-R1005 - Settings form owns related open-house controls and defaults.
  listingId: _listingId,
  settings,
  onSave,
  saving,
}: {
  listingId: string;
  settings: OpenHouseSettings | null | undefined;
  onSave: (s: Partial<OpenHouseSettings>) => void;
  saving: boolean;
}) {
  const [timeslots, setTimeslots] = useState<OHTimeslot[]>(settings?.timeslots ?? []);
  const [maxPerSlot, setMaxPerSlot] = useState(settings?.max_visitors_per_slot ?? 10);
  const [brokerRequired, setBrokerRequired] = useState(settings?.broker_required ?? false);
  const [requirePOF, setRequirePOF] = useState(settings?.require_proof_of_funds ?? false);
  const [minProof, setMinProof] = useState(String(settings?.min_proof_amount ?? ""));
  const [requireInvestor, setRequireInvestor] = useState(settings?.require_investor_declaration ?? false);
  const [offerDeadline, setOfferDeadline] = useState(
    settings?.offer_deadline ? new Date(settings.offer_deadline).toISOString().slice(0, 16) : ""
  );
  const [allowSealed, setAllowSealed] = useState(settings?.allow_sealed_bids ?? true);

  useEffect(() => { // skipcq: JS-R1005 - Settings sync mirrors several related form fields from one source.
    if (settings) {
      setTimeslots(settings.timeslots ?? []);
      setMaxPerSlot(settings.max_visitors_per_slot ?? 10);
      setBrokerRequired(settings.broker_required ?? false);
      setRequirePOF(settings.require_proof_of_funds ?? false);
      setMinProof(String(settings.min_proof_amount ?? ""));
      setRequireInvestor(settings.require_investor_declaration ?? false);
      setOfferDeadline(settings.offer_deadline ? new Date(settings.offer_deadline).toISOString().slice(0, 16) : "");
      setAllowSealed(settings.allow_sealed_bids ?? true);
    }
  }, [settings]);

  const handleSave = () => {
    onSave({
      timeslots,
      max_visitors_per_slot: maxPerSlot,
      broker_required: brokerRequired,
      require_proof_of_funds: requirePOF,
      min_proof_amount: minProof ? parseFloat(minProof) : null,
      require_investor_declaration: requireInvestor,
      offer_deadline: offerDeadline ? new Date(offerDeadline).toISOString() : null,
      allow_sealed_bids: allowSealed,
    });
  };

  const addSlot = () => {
    setTimeslots([...timeslots, { start: "10:00", end: "11:00", max_visitors: maxPerSlot }]);
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="text-xs font-semibold text-muted-foreground block mb-2">Timeslots</label>
        {timeslots.map((ts, i) => (
          <div key={i} className="flex gap-2 mb-2">
            <input type="time" value={ts.start} onChange={e => {
              const n = [...timeslots]; n[i] = { ...n[i], start: e.target.value }; setTimeslots(n);
            }} className="px-2 py-1.5 rounded-lg border border-border text-sm" />
            <input type="time" value={ts.end} onChange={e => {
              const n = [...timeslots]; n[i] = { ...n[i], end: e.target.value }; setTimeslots(n);
            }} className="px-2 py-1.5 rounded-lg border border-border text-sm" />
            <input type="number" value={ts.max_visitors} onChange={e => {
              const n = [...timeslots]; n[i] = { ...n[i], max_visitors: parseInt(e.target.value) || 0 }; setTimeslots(n);
            }} placeholder="Max" className="w-16 px-2 py-1.5 rounded-lg border border-border text-sm" />
            <Button size="sm" variant="ghost" onClick={() => setTimeslots(timeslots.filter((_, j) => j !== i))}>×</Button>
          </div>
        ))}
        <Button size="sm" variant="outline" onClick={addSlot}>+ Add slot</Button>
      </div>
      <div>
        <label className="text-xs font-semibold text-muted-foreground block mb-2">Max visitors per slot</label>
        <input type="number" value={maxPerSlot} onChange={e => setMaxPerSlot(parseInt(e.target.value) || 0)}
          className="w-24 px-2 py-1.5 rounded-lg border border-border text-sm" />
      </div>
      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={brokerRequired} onChange={e => setBrokerRequired(e.target.checked)} className="rounded" />
        <span className="text-sm">Broker / representative required</span>
      </label>
      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={requirePOF} onChange={e => setRequirePOF(e.target.checked)} className="rounded" />
        <span className="text-sm">Require proof of funds</span>
      </label>
      {requirePOF && (
        <input type="number" placeholder="Min amount (€)" value={minProof} onChange={e => setMinProof(e.target.value)}
          className="w-full px-2 py-1.5 rounded-lg border border-border text-sm" />
      )}
      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={requireInvestor} onChange={e => setRequireInvestor(e.target.checked)} className="rounded" />
        <span className="text-sm">Require investor declaration</span>
      </label>
      <div>
        <label className="text-xs font-semibold text-muted-foreground block mb-2">Offer deadline</label>
        <input type="datetime-local" value={offerDeadline} onChange={e => setOfferDeadline(e.target.value)}
          className="w-full px-2 py-1.5 rounded-lg border border-border text-sm" />
      </div>
      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={allowSealed} onChange={e => setAllowSealed(e.target.checked)} className="rounded" />
        <span className="text-sm">Allow sealed bids</span>
      </label>
      <Button onClick={handleSave} disabled={saving} className="gap-2">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Save
      </Button>
    </div>
  );
}
