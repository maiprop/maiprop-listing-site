/* eslint-disable react-refresh/only-export-components */
import { useState } from "react";
import {
  MapPin, Phone, Mail, RefreshCw, ChevronDown, Check, Save,
  SendHorizonal, ThumbsUp, ThumbsDown, ArrowLeftRight, X as XIcon,
  Users, Crown, Wallet, ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  hasPriorityProof,
  useFiresaleInterestQueue,
  useUpdateInterestStatus,
  type InterestStatus,
} from "@/hooks/useFiresaleInterest";
import { formatTimeAgo } from "@/lib/format";
import { useFocusTrap } from "@/hooks/useFocusTrap";

// ── Shared types & constants ──────────────────────────────────────────────────

export const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending:     { label: "Pending",     color: "bg-brand-gold/15 text-brand-gold border-brand-gold/20" },
  reviewed:    { label: "Reviewed",    color: "bg-primary/15 text-primary border-primary/20" },
  offer_sent:  { label: "Offer Sent",  color: "bg-accent/15 text-accent border-accent/20" },
  closed:      { label: "Closed",      color: "bg-brand-emerald/15 text-brand-emerald border-brand-emerald/20" },
};

export const STATUS_FLOW = ["pending", "reviewed", "offer_sent", "closed"] as const;

export type AdminDeal = {
  id: string;
  address: string;
  city: string;
  property_type: string | null;
  sqm: number;
  bedrooms: number | null;
  condition: string;
  ai_estimate: number | null;
  asking_price: number | null;
  offer_price: number | null;
  status: string;
  contact_email: string;
  contact_phone: string | null;
  notes: string | null;
  admin_notes: string | null;
  seller_response: string | null;
  seller_response_price: number | null;
  seller_responded_at: string | null;
  created_at: string;
};



function parseSellerResponse(notes: string | null): { response: string | null; cleanNotes: string } {
  if (!notes) return { response: null, cleanNotes: "" };
  const match = notes.match(/^\[SELLER:(\w+)\]\s*/);
  if (match) return { response: match[1], cleanNotes: notes.slice(match[0].length) };
  return { response: null, cleanNotes: notes };
}

const INTEREST_STATUS_CONFIG: Record<InterestStatus, { label: string; color: string }> = {
  interested:  { label: "Interested",   color: "bg-primary/15 text-primary border-primary/20" },
  prioritized: { label: "Priority",     color: "bg-brand-gold/15 text-brand-gold border-brand-gold/20" },
  reserved:    { label: "Reserved",     color: "bg-accent/15 text-accent border-accent/20" },
  engaged:     { label: "Engaged",      color: "bg-brand-emerald/15 text-brand-emerald border-brand-emerald/20" },
  won:         { label: "Won",          color: "bg-brand-emerald/15 text-brand-emerald border-brand-emerald/20" },
  passed:      { label: "Passed",       color: "bg-muted text-muted-foreground border-border" },
  expired:     { label: "Expired",      color: "bg-muted text-muted-foreground border-border" },
};

function formatReservationEnds(expiresAt: string | null) {
  if (!expiresAt) return null;
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "expired";
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}h ${minutes}m left`;
}

// ── InvestorQueue ─────────────────────────────────────────────────────────────

export function InvestorQueue({ dealId }: { dealId: string }) {
  const [open, setOpen] = useState(false);
  const { data: queue = [], isLoading } = useFiresaleInterestQueue(open ? dealId : undefined);
  const updateStatus = useUpdateInterestStatus();

  const total = queue.length;
  const withPOF = queue.filter((entry) => hasPriorityProof(entry)).length;
  const activeReservationLabel = formatReservationEnds(
    queue.find((entry) => entry.status === "reserved")?.reservation_expires_at ?? null,
  );

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/30 transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <span className="flex items-center gap-2 text-sm font-semibold">
          <Users className="w-4 h-4 text-primary" />
          Investor Queue
          {total > 0 && (
            <span className="text-[10px] font-bold bg-primary/15 text-primary border border-primary/20 px-2 py-0.5 rounded-full">
              {total} interested{withPOF > 0 ? ` · ${withPOF} POF` : ""}
            </span>
          )}
        </span>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>

      {open && (
        <div className="border-t border-border">
          {activeReservationLabel && (
            <div className="px-4 py-2 border-b border-border bg-accent/5 text-[10px] text-accent">
              Active reservation window: {activeReservationLabel}
            </div>
          )}
          {isLoading ? (
            <div className="p-6 flex justify-center"><RefreshCw className="w-4 h-4 animate-spin text-muted-foreground" /></div>
          ) : queue.length === 0 ? (
            <p className="p-6 text-center text-xs text-muted-foreground">No investors have expressed interest yet.</p>
          ) : (
            <>
              {/* Priority legend */}
              <div className="px-4 py-2 bg-brand-gold/5 border-b border-border flex items-center gap-2 text-[10px] text-muted-foreground">
                <Crown className="w-3 h-3 text-brand-gold" />
                <span>Sorted by priority — investors with proof of funds appear first</span>
              </div>
              <div className="divide-y divide-border max-h-72 overflow-y-auto">
                {queue.map((entry, idx) => {
                  type ProfileSnippet = { display_name?: string; first_name?: string; last_name?: string } | null;
                  const prof = entry.profiles as ProfileSnippet;
                  const name = prof?.display_name ||
                    [prof?.first_name, prof?.last_name].filter(Boolean).join(" ") ||
                    "Investor";
                  const hasPOF = hasPriorityProof(entry);
                  const cfg = INTEREST_STATUS_CONFIG[entry.status];
                  return (
                    <div key={entry.id} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        {/* Priority number */}
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 ${hasPOF ? "bg-brand-gold/20 text-brand-gold" : "bg-muted text-muted-foreground"}`}>
                          {idx + 1}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold truncate">{name}</span>
                            {hasPOF && (
                              <span className="flex items-center gap-1 text-[10px] font-bold text-brand-gold bg-brand-gold/10 border border-brand-gold/20 px-2 py-0.5 rounded-full shrink-0">
                                <Crown className="w-2.5 h-2.5" /> POF
                                {entry.proof_amount ? ` €${Number(entry.proof_amount).toLocaleString()}` : " ✓"}
                              </span>
                            )}
                            <span className={`text-[10px] font-bold border px-2 py-0.5 rounded-full ${cfg.color}`}>
                              {cfg.label}
                            </span>
                          </div>
                          {entry.message && (
                            <p className="text-xs text-muted-foreground mt-0.5 italic truncate">"{entry.message}"</p>
                          )}
                          <div className="flex items-center gap-2 mt-0.5">
                            {hasPOF ? (
                              <span className="flex items-center gap-1 text-[10px] text-emerald-600">
                                <Wallet className="w-2.5 h-2.5" /> {entry.proof_of_funds_verified_at ? "Funds verified" : "Funds uploaded"}
                              </span>
                            ) : (
                              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                <Wallet className="w-2.5 h-2.5" /> No POF uploaded
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      {/* Status selector */}
                      <select
                        value={entry.status}
                        onChange={e => updateStatus.mutate({ id: entry.id, dealId, status: e.target.value as InterestStatus })}
                        className="bg-background border border-border rounded-lg px-2 py-1.5 text-xs outline-none focus:border-primary shrink-0"
                      >
                        {(Object.keys(INTEREST_STATUS_CONFIG) as InterestStatus[]).map(s => (
                          <option key={s} value={s}>{INTEREST_STATUS_CONFIG[s].label}</option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── AdminDealRow ──────────────────────────────────────────────────────────────

export function AdminDealRow({
  deal,
  onUpdate,
}: {
  deal: AdminDeal;
  onUpdate: (
    id: string,
    status: string,
    notes: string,
    offerPrice?: number,
    sellerResponse?: string,
    sellerResponsePrice?: number,
  ) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const legacySellerResponse = parseSellerResponse(deal.admin_notes);
  const sellerResponse = deal.seller_response?.toUpperCase() ?? legacySellerResponse.response;
  const cleanNotes = legacySellerResponse.response ? legacySellerResponse.cleanNotes : (deal.admin_notes ?? "");
  const [editNotes, setEditNotes] = useState(cleanNotes);
  const [saving, setSaving] = useState(false);
  const [showOfferModal, setShowOfferModal] = useState(false);
  const [offerPrice, setOfferPrice] = useState(deal.offer_price ? String(deal.offer_price) : "");
  const [offerValidity, setOfferValidity] = useState("");
  const [offerConditions, setOfferConditions] = useState("");
  const [showCounterInput, setShowCounterInput] = useState(false);
  const [counterPrice, setCounterPrice] = useState("");
  const offerDialogRef = useFocusTrap<HTMLDivElement>({
    active: showOfferModal,
    onEscape: () => setShowOfferModal(false),
  });
  const statusCfg = STATUS_CONFIG[deal.status] || STATUS_CONFIG.pending;

  const handleSave = async () => {
    setSaving(true);
    await onUpdate(deal.id, deal.status, editNotes);
    setSaving(false);
  };

  const handleStatusChange = async (newStatus: string) => {
    if (newStatus === "offer_sent") { setShowOfferModal(true); return; }
    setSaving(true);
    await onUpdate(deal.id, newStatus, editNotes);
    setSaving(false);
  };

  const handleSendOffer = async () => {
    if (!offerPrice) return;
    setSaving(true);
    const notes = [offerConditions && `Terms: ${offerConditions}`, offerValidity && `Valid until: ${offerValidity}`].filter(Boolean).join(" | ");
    await onUpdate(deal.id, "offer_sent", notes, Number(offerPrice));
    setShowOfferModal(false);
    setSaving(false);
  };

  const handleSellerResponse = async (resp: "ACCEPTED" | "COUNTERED" | "REJECTED") => {
    if (resp === "COUNTERED" && !showCounterInput) { setShowCounterInput(true); return; }
    setSaving(true);
    const newStatus = resp === "ACCEPTED" ? "closed" : resp === "REJECTED" ? "reviewed" : "offer_sent";
    const counterVal = resp === "COUNTERED" && counterPrice ? Number(counterPrice) : undefined;
    await onUpdate(deal.id, newStatus, editNotes, counterVal, resp.toLowerCase(), counterVal);
    setShowCounterInput(false);
    setSaving(false);
  };

  const discountPct = deal.ai_estimate && deal.asking_price ? ((1 - deal.asking_price / deal.ai_estimate) * 100).toFixed(1) : null;

  return (
    <div className="glass-card rounded-xl border border-border overflow-hidden">
      <button className="w-full text-left p-4 flex items-center gap-4 hover:bg-muted/30 transition-colors" onClick={() => setExpanded(e => !e)}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`text-[10px] font-bold uppercase tracking-widest border px-2 py-0.5 rounded-full ${statusCfg.color}`}>{statusCfg.label}</span>
            {sellerResponse && (
              <span className={`text-[10px] font-bold uppercase tracking-widest border px-2 py-0.5 rounded-full ${
                sellerResponse === "ACCEPTED" ? "bg-brand-emerald/15 text-brand-emerald border-brand-emerald/20" :
                sellerResponse === "REJECTED" ? "bg-destructive/15 text-destructive border-destructive/20" : "bg-brand-gold/15 text-brand-gold border-brand-gold/20"
              }`}>Seller: {sellerResponse.toLowerCase()}</span>
            )}
            <span className="text-[10px] font-semibold text-muted-foreground bg-muted border border-border px-2 py-0.5 rounded-full capitalize">{deal.property_type || "property"}</span>
            <span className="text-[10px] text-muted-foreground">{formatTimeAgo(deal.created_at)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <MapPin className="w-3 h-3 text-muted-foreground shrink-0" />
            <span className="font-semibold text-sm truncate">{deal.address}, {deal.city}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{deal.sqm} m² {deal.bedrooms ? `· ${deal.bedrooms} bed` : ""} · {deal.condition}</p>
        </div>
        <div className="text-right shrink-0 hidden sm:block">
          <p className="text-[10px] text-muted-foreground">Asking</p>
          <p className="font-display font-black text-base">€{(deal.asking_price || 0).toLocaleString()}</p>
          {deal.offer_price ? <p className="text-[10px] text-primary font-bold">Offer: €{deal.offer_price.toLocaleString()}</p> : deal.ai_estimate ? <p className="text-[10px] text-muted-foreground">AI: €{deal.ai_estimate.toLocaleString()}</p> : null}
        </div>
        <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>

      {expanded && (
        <div className="border-t border-border p-4 space-y-5 bg-muted/20">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">Deal Journey</p>
            <div className="flex items-center gap-0">
              {STATUS_FLOW.map((s, i) => {
                const cfg = STATUS_CONFIG[s];
                const currentIdx = STATUS_FLOW.indexOf(deal.status as typeof STATUS_FLOW[number]);
                const isDone = i < currentIdx;
                const isCurrent = deal.status === s;
                return (
                  <div key={s} className="flex items-center flex-1">
                    <div className="flex flex-col items-center gap-1 flex-1">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black border transition-all ${
                        isCurrent ? cfg.color + " ring-2 ring-offset-1 ring-offset-background" : isDone ? "bg-brand-emerald/20 text-brand-emerald border-brand-emerald/30" : "bg-muted text-muted-foreground border-border"
                      }`}>{isDone ? <Check className="w-3 h-3" /> : i + 1}</div>
                      <span className={`text-[9px] font-bold uppercase tracking-wider text-center leading-tight ${isCurrent ? "text-foreground" : "text-muted-foreground"}`}>{cfg.label}</span>
                    </div>
                    {i < STATUS_FLOW.length - 1 && <div className={`h-px w-4 shrink-0 mb-4 ${isDone || isCurrent ? "bg-brand-emerald/40" : "bg-border"}`} />}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Contact Info</p>
              <div className="flex items-center gap-2 text-xs">
                <Mail className="w-3 h-3 text-muted-foreground" />
                <a href={`mailto:${deal.contact_email}`} className="text-primary hover:underline">{deal.contact_email}</a>
              </div>
              {deal.contact_phone && (
                <div className="flex items-center gap-2 text-xs">
                  <Phone className="w-3 h-3 text-muted-foreground" />
                  <a href={`tel:${deal.contact_phone}`} className="text-primary hover:underline">{deal.contact_phone}</a>
                </div>
              )}
              {deal.notes && <div className="mt-2 p-2 bg-muted rounded-lg text-xs text-muted-foreground"><span className="font-semibold text-foreground">Seller notes: </span>{deal.notes}</div>}
            </div>
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Deal Metrics</p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-muted rounded-lg p-2"><p className="text-muted-foreground">Asking Price</p><p className="font-bold">€{(deal.asking_price || 0).toLocaleString()}</p></div>
                <div className="bg-muted rounded-lg p-2"><p className="text-muted-foreground">Market estimate</p><p className="font-bold text-brand-emerald">{deal.ai_estimate == null ? "Unavailable" : `€${deal.ai_estimate.toLocaleString()}`}</p></div>
                {discountPct && <div className="bg-destructive/10 rounded-lg p-2"><p className="text-muted-foreground">Discount</p><p className="font-bold text-destructive">{discountPct}% below value</p></div>}
                {!!deal.offer_price && <div className="bg-primary/10 rounded-lg p-2"><p className="text-muted-foreground">Our Offer</p><p className="font-bold text-primary">€{deal.offer_price.toLocaleString()}</p></div>}
              </div>
            </div>
          </div>

          {deal.status === "offer_sent" && (
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-widest text-primary flex items-center gap-1.5"><SendHorizonal className="w-3.5 h-3.5" /> Offer Sent — Awaiting Seller Response</p>
                {!!deal.offer_price && <span className="text-sm font-black text-primary">€{deal.offer_price.toLocaleString()}</span>}
              </div>
              {deal.admin_notes && !sellerResponse && <p className="text-xs text-muted-foreground bg-muted rounded-lg px-3 py-2">{deal.admin_notes}</p>}
              <p className="text-xs text-muted-foreground">Record how the seller responded:</p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" className="bg-brand-emerald/15 hover:bg-brand-emerald/25 text-brand-emerald border border-brand-emerald/30 gap-1.5 h-8 text-xs" onClick={() => handleSellerResponse("ACCEPTED")} disabled={saving}><ThumbsUp className="w-3 h-3" /> Seller Accepted</Button>
                <Button size="sm" variant="outline" className="border-brand-gold/30 text-brand-gold hover:bg-brand-gold/10 gap-1.5 h-8 text-xs" onClick={() => handleSellerResponse("COUNTERED")} disabled={saving}><ArrowLeftRight className="w-3 h-3" /> Counter-Offer</Button>
                <Button size="sm" variant="outline" className="border-destructive/30 text-destructive hover:bg-destructive/10 gap-1.5 h-8 text-xs" onClick={() => handleSellerResponse("REJECTED")} disabled={saving}><ThumbsDown className="w-3 h-3" /> Rejected</Button>
              </div>
              {showCounterInput && (
                <div className="flex gap-2 items-center pt-1">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">€</span>
                    <input type="number" value={counterPrice} onChange={e => setCounterPrice(e.target.value)} placeholder="Seller's counter price" className="w-full bg-background border border-border rounded-lg pl-7 pr-3 py-2 text-xs outline-none focus:border-primary" />
                  </div>
                  <Button size="sm" className="bg-gradient-primary border-0 text-primary-foreground text-xs h-9 gap-1.5" onClick={() => handleSellerResponse("COUNTERED")} disabled={saving || !counterPrice}>{saving ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Save Counter</Button>
                  <Button size="sm" variant="ghost" className="h-9 px-2" onClick={() => setShowCounterInput(false)}><XIcon className="w-3 h-3" /></Button>
                </div>
              )}
            </div>
          )}

          {deal.status === "closed" && (
            <div className="rounded-xl border border-brand-emerald/30 bg-brand-emerald/5 p-4 space-y-3">
              <div className="flex items-center gap-2"><p className="text-sm font-bold text-brand-emerald">Deal Closed!</p></div>
              <div className="grid grid-cols-1 min-[420px]:grid-cols-3 gap-2 text-xs">
                <div className="bg-background rounded-lg p-2 text-center"><p className="text-muted-foreground mb-0.5">Asking</p><p className="font-bold">€{(deal.asking_price || 0).toLocaleString()}</p></div>
                <div className="bg-background rounded-lg p-2 text-center"><p className="text-muted-foreground mb-0.5">Closed At</p><p className="font-bold text-brand-emerald">€{(deal.offer_price || deal.asking_price || 0).toLocaleString()}</p></div>
                {!!deal.ai_estimate && !!deal.offer_price && <div className="bg-background rounded-lg p-2 text-center"><p className="text-muted-foreground mb-0.5">Saved vs. Market</p><p className="font-bold text-primary">€{(deal.ai_estimate - deal.offer_price).toLocaleString()}</p></div>}
              </div>
            </div>
          )}

          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Move to Stage</p>
            <div className="flex items-center gap-2 flex-wrap">
              {STATUS_FLOW.map((s) => {
                const cfg = STATUS_CONFIG[s];
                const isCurrent = deal.status === s;
                return (
                  <button key={s} onClick={() => handleStatusChange(s)} disabled={saving || isCurrent} className={`text-[10px] font-bold uppercase tracking-widest border px-3 py-1.5 rounded-full transition-all disabled:opacity-50 ${isCurrent ? cfg.color + " ring-2 ring-offset-1 ring-offset-background" : "text-muted-foreground border-border hover:border-primary/40"}`}>
                    {s === "offer_sent" ? "✉ Send Offer" : cfg.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Internal Notes</p>
            <textarea value={editNotes} onChange={e => setEditNotes(e.target.value)} placeholder="Add internal notes..." rows={3} className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-primary resize-none" />
            <div className="flex justify-end mt-2">
              <Button size="sm" className="bg-gradient-primary border-0 text-primary-foreground text-xs h-8 gap-1.5" onClick={handleSave} disabled={saving}>{saving ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Save Notes</Button>
            </div>
          </div>

          <InvestorQueue dealId={deal.id} />
        </div>
      )}

      {showOfferModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <div
            ref={offerDialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="Send offer"
            tabIndex={-1}
            className="glass-card rounded-2xl border border-border w-full max-w-md p-6 space-y-5 shadow-elevated"
          >
            <div className="flex items-start justify-between">
              <div><h3 className="font-display font-bold text-lg">Send Offer</h3><p className="text-xs text-muted-foreground mt-0.5">{deal.address}, {deal.city}</p></div>
              <button aria-label="Close" className="p-1 rounded-lg text-muted-foreground hover:text-foreground" onClick={() => setShowOfferModal(false)}><XIcon className="w-4 h-4" aria-hidden="true" /></button>
            </div>
            <div className="space-y-3">
              <div className="flex gap-2 text-xs">
                <div className="flex-1 bg-muted rounded-lg p-2.5"><p className="text-muted-foreground">Asking</p><p className="font-bold text-base">€{(deal.asking_price || 0).toLocaleString()}</p></div>
                <div className="flex-1 bg-brand-emerald/10 rounded-lg p-2.5"><p className="text-muted-foreground">Market estimate</p><p className="font-bold text-base text-brand-emerald">{deal.ai_estimate == null ? "Unavailable" : `€${deal.ai_estimate.toLocaleString()}`}</p></div>
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block mb-1.5">Your Offer Price *</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-bold">€</span>
                  <input type="number" value={offerPrice} onChange={e => setOfferPrice(e.target.value)} placeholder={String(Math.round((deal.asking_price || 0) * 0.9))} className="w-full bg-background border border-border rounded-xl pl-8 pr-4 py-3 text-sm font-bold outline-none focus:border-primary" />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block mb-1.5">Offer Valid Until</label>
                <input type="date" value={offerValidity} onChange={e => setOfferValidity(e.target.value)} className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-primary" />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block mb-1.5">Key Conditions</label>
                <textarea value={offerConditions} onChange={e => setOfferConditions(e.target.value)} placeholder="e.g. Subject to survey..." rows={2} className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-primary resize-none" />
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" size="sm" className="flex-1 border-border" onClick={() => setShowOfferModal(false)}>Cancel</Button>
              <Button size="sm" className="flex-1 bg-gradient-primary border-0 text-primary-foreground gap-1.5" onClick={handleSendOffer} disabled={saving || !offerPrice}>
                {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <SendHorizonal className="w-3.5 h-3.5" />} Send Offer
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
