/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Loader2, Bell, BellOff, MapPin, Euro, Edit2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuctionAlerts, useDeleteAuctionAlert, useUpdateAuctionAlert } from "@/hooks/useAuctionAlerts";
import { usePrivateOwnerAdAlert } from "@/hooks/usePrivateOwnerAdAlert";
import { useSubscription } from "@/hooks/useSubscription";
import { AuctionAlertModal } from "@/components/AuctionAlertModal";
import { getParticipantTypeFromProfile } from "@/lib/participantConfig";
import { useAuth } from "@/contexts/AuthContext";

export default function AuctionsTab() {
  const { profile } = useAuth();
  const { isPro } = useSubscription();
  const bioType = getParticipantTypeFromProfile(profile);
  const role = profile?.role as string | undefined;
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const { data: auctionAlerts = [], isLoading: alertsLoading } = useAuctionAlerts();
  const deleteAuctionAlert = useDeleteAuctionAlert();
  const toggleAuctionAlert = useUpdateAuctionAlert();
  const privateOwnerAlert = usePrivateOwnerAdAlert();

  const [alertModalOpen, setAlertModalOpen] = useState(false);
  const [editingAlert, setEditingAlert] = useState<any>(null);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Auction Alerts</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Get notified when new auctions match your criteria.
          </p>
        </div>
        <Button
          className="bg-gradient-gold border-0 text-background font-semibold gap-2"
          onClick={() => {
            setEditingAlert(null);
            setAlertModalOpen(true);
          }}
        >
          <Bell className="w-4 h-4" /> New Alert
        </Button>
      </div>

      {alertsLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-brand-gold" />
        </div>
      ) : auctionAlerts.length === 0 ? (
        <div className="glass-card rounded-xl p-12 text-center">
          <Bell className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="font-semibold">No auction alerts yet</p>
          <p className="text-sm text-muted-foreground mt-1 mb-4">
            Create an alert to get notified of matching auctions
          </p>
          <Button
            className="bg-gradient-gold border-0 text-background font-semibold gap-2"
            onClick={() => {
              setEditingAlert(null);
              setAlertModalOpen(true);
            }}
          >
            <Bell className="w-4 h-4" /> Create First Alert
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {auctionAlerts.map((a: any) => (
            <div key={a.id} className="glass-card rounded-xl p-4 flex items-center gap-4">
              <div
                className={`w-2 h-10 rounded-full shrink-0 ${
                  a.active ? "bg-brand-gold" : "bg-muted-foreground/30"
                }`}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  {a.city && (
                    <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-secondary border border-border text-foreground">
                      <MapPin className="w-3 h-3" />
                      {a.city}
                    </span>
                  )}
                  {a.property_type && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-brand-gold/15 text-brand-gold border border-brand-gold/20 capitalize">
                      {a.property_type}
                    </span>
                  )}
                  {(a.min_price || a.max_price) && (
                    <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-secondary border border-border text-foreground">
                      <Euro className="w-3 h-3" />
                      {a.min_price ? `€${Number(a.min_price).toLocaleString()}` : "Any"} –{" "}
                      {a.max_price ? `€${Number(a.max_price).toLocaleString()}` : "Any"}
                    </span>
                  )}
                  {!a.city && !a.property_type && !a.min_price && !a.max_price && (
                    <span className="text-xs text-muted-foreground">All auctions</span>
                  )}
                </div>
                {a.court_name && (
                  <p className="text-xs text-muted-foreground truncate">{a.court_name}</p>
                )}
                <div className="flex items-center gap-2 mt-1">
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                      a.active
                        ? "bg-brand-emerald/20 text-brand-emerald"
                        : "bg-secondary text-muted-foreground"
                    }`}
                  >
                    {a.active ? "Active" : "Paused"}
                  </span>
                  {a.email_notify && (
                    <span className="text-xs text-muted-foreground">📧 Email on</span>
                  )}
                  <span className="text-xs text-muted-foreground">
                    Created {new Date(a.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() =>
                    toggleAuctionAlert.mutate({ id: a.id, updates: { active: !a.active } })
                  }
                  className={`p-2 rounded-lg border transition-colors ${
                    a.active
                      ? "border-brand-gold/30 bg-brand-gold/10 text-brand-gold hover:bg-brand-gold/20"
                      : "border-border bg-secondary text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {a.active ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => {
                    setEditingAlert(a);
                    setAlertModalOpen(true);
                  }}
                  className="p-2 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setDeleteTarget(a.id)}
                  className="p-2 rounded-lg hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Private Owner Ad Alert — Pro agents only */}
      {(bioType === "agent" || role === "agent") && isPro && (
        <div className="glass-card rounded-xl p-5 border border-primary/20 mt-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="font-display font-semibold mb-1 flex items-center gap-2">
                <Bell className="w-4 h-4 text-primary" /> Alert for Private Owner&apos;s Ad
              </h2>
              <p className="text-sm text-muted-foreground">
                Get notified when private sellers list new properties.
              </p>
            </div>
            <button
              onClick={() => privateOwnerAlert.toggle.mutate(!privateOwnerAlert.isEnabled)}
              disabled={privateOwnerAlert.toggle.isPending}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-medium border transition-colors",
                privateOwnerAlert.isEnabled
                  ? "bg-primary/10 border-primary text-primary"
                  : "border-border bg-secondary text-muted-foreground hover:text-foreground"
              )}
            >
              {privateOwnerAlert.isEnabled ? "Enabled" : "Enable"}
            </button>
          </div>
        </div>
      )}

      <AuctionAlertModal
        open={alertModalOpen}
        onClose={() => {
          setAlertModalOpen(false);
          setEditingAlert(null);
        }}
        editAlert={editingAlert}
      />
      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete alert?"
        description="You will no longer receive notifications for this auction filter."
        confirmLabel="Delete"
        onConfirm={() => { if (deleteTarget) deleteAuctionAlert.mutate(deleteTarget); setDeleteTarget(null); }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
