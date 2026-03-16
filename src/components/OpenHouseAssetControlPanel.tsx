import { useState, useEffect } from "react";
import {
  Users, Euro, ChevronDown, ChevronUp, Check, X, Loader2, Settings, Calendar, TrendingUp
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import {
  useOpenHouseSettings,
  useOpenHouseRegistrations,
  useOpenHouseOffers,
  useUpsertOpenHouseSettings,
  useUpdateOpenHouseRegistration,
  useUpdateOpenHouseOffer,
  type OHTimeslot,
  type OHRegistrationStatus,
} from "@/hooks/useOpenHouseAssetControl";

interface Props {
  listingId: string;
  isOwner: boolean;
}

const STATUS_LABELS: Record<OHRegistrationStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  attended: "Attended",
  cancelled: "Cancelled",
};

export default function OpenHouseAssetControlPanel({ listingId, isOwner }: Props) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [registrationsOpen, setRegistrationsOpen] = useState(true);
  const [offersOpen, setOffersOpen] = useState(true);

  const { data: settings, isLoading: settingsLoading } = useOpenHouseSettings(listingId);
  const { data: registrations = [], isLoading: regLoading } = useOpenHouseRegistrations(listingId, isOwner);
  const { data: offers = [] } = useOpenHouseOffers(listingId);

  const upsertSettings = useUpsertOpenHouseSettings();
  const updateReg = useUpdateOpenHouseRegistration();
  const updateOffer = useUpdateOpenHouseOffer();

  if (!isOwner) return null;

  const timeslots = (settings?.timeslots ?? []) as OHTimeslot[];
  const pendingCount = registrations.filter((r: any) => r.status === "pending").length;
  const approvedCount = registrations.filter((r: any) => r.status === "approved").length;
  const attendedCount = registrations.filter((r: any) => r.status === "attended").length;
  const offersCount = offers.length;
  const validOffers = offers.filter((o: any) => o.status !== "withdrawn").map((o: any) => Number(o.amount));
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
          <div className="border-t border-border max-h-64 overflow-y-auto">
            {regLoading ? (
              <div className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" /></div>
            ) : registrations.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">No registrations yet</div>
            ) : (
              <div className="divide-y divide-border">
                {registrations.map((r: any) => (
                  <div key={r.id} className="p-4 flex items-center justify-between gap-4">
                    <div>
                      <div className="font-medium">
                        {r.profiles?.display_name || r.profiles?.first_name || "Visitor"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {STATUS_LABELS[r.status] || r.status} • {r.id_doc_url ? "ID uploaded" : "—"} • {r.waiver_signed_at ? "Waiver signed" : "—"}
                      </div>
                    </div>
                    {r.status === "pending" && (
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" className="gap-1 text-emerald-600 border-emerald-500/40"
                          onClick={() => updateReg.mutate({ id: r.id, updates: { status: "approved", approved_at: new Date().toISOString() } })}>
                          <Check className="w-3.5 h-3.5" /> Approve
                        </Button>
                        <Button size="sm" variant="outline" className="gap-1 text-destructive border-destructive/40"
                          onClick={() => updateReg.mutate({ id: r.id, updates: { status: "rejected" } })}>
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
        )}
      </div>

      {/* Offers */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <button
          className="w-full flex items-center justify-between p-4 text-left hover:bg-secondary/50"
          onClick={() => setOffersOpen(!offersOpen)}
        >
          <span className="font-semibold flex items-center gap-2">
            <Euro className="w-4 h-4" /> Offers {highestBid != null && (
              <span className="text-xs font-bold bg-primary/20 text-primary rounded-full px-2 py-0.5">€{highestBid.toLocaleString()} max</span>
            )}
          </span>
          {offersOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        {offersOpen && (
          <div className="border-t border-border max-h-48 overflow-y-auto">
            {offers.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">No offers yet</div>
            ) : (
              <div className="divide-y divide-border">
                {offers.map((o: any) => (
                  <div key={o.id} className="p-4 flex items-center justify-between gap-4">
                    <div>
                      <div className="font-medium">
                        {o.status === "submitted" ? "Sealed bid" : `€${Number(o.amount).toLocaleString()}`}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {o.profiles?.display_name || "Bidder"} • {o.status}
                      </div>
                    </div>
                    {o.status === "submitted" && (
                      <Button size="sm" variant="outline"
                        onClick={() => updateOffer.mutate({ id: o.id, status: "revealed" })}>
                        Reveal
                      </Button>
                    )}
                    {o.status === "revealed" && (
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" className="text-emerald-600"
                          onClick={() => updateOffer.mutate({ id: o.id, status: "accepted" })}>
                          Accept
                        </Button>
                        <Button size="sm" variant="outline" className="text-destructive"
                          onClick={() => updateOffer.mutate({ id: o.id, status: "rejected" })}>
                          Reject
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function OpenHouseSettingsForm({
  listingId,
  settings,
  onSave,
  saving,
}: {
  listingId: string;
  settings: any;
  onSave: (s: any) => void;
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

  useEffect(() => {
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
