import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Settings, Shield, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { PARTICIPANT_LABELS, type ParticipantId } from "@/lib/participantConfig";
import { logger } from "@/lib/logger";
import { useAuth } from "@/contexts/AuthContext";
import { prepareRoleSwitchOperation } from "@/pages/onboarding/onboardingHelpers";

const ROLE_PERMISSIONS: Record<ParticipantId, { label: string; can: string[] }> = {
  buyer:         { label: "Buyer / Renter",      can: ["Browse listings", "Save properties", "Request viewings", "Auction alerts"] },
  seller:        { label: "Seller / Landlord",   can: ["Create & manage listings", "Receive viewing requests", "AI listing assist"] },
  agent:         { label: "Agent",               can: ["Unlimited listings", "Lead management", "Analytics"] },
  developer:     { label: "Developer",           can: ["Listings", "Projects", "Portfolios", "Analytics"] },
  professional:  { label: "Professional",        can: ["Professional directory", "Service catalog", "Client leads", "Verified badge"] },
  investor:      { label: "Investor",            can: ["Deal flow access", "Auction bidding", "Portfolio tracking", "Market analytics"] },
  institutional: { label: "Institutional",       can: ["Bulk listings", "Portfolio management", "Institutional deal flow", "Dedicated support"] },
};

const SELF_SERVICE_ROLE_TARGETS: ParticipantId[] = [
  "buyer",
  "seller",
  "agent",
  "developer",
  "professional",
];

export function SettingsSection({
  roleLabel,
  onUpdate: _onUpdate,
  refreshProfile: _refreshProfile,
  currentType,
  hasActiveSub,
}: {
  roleLabel: string;
  onUpdate: (updates: Record<string, unknown>) => Promise<{ error: Error | null }>;
  refreshProfile: () => Promise<void>;
  currentType: ParticipantId | null;
  hasActiveSub: boolean;
}) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [targetType, setTargetType] = useState<ParticipantId | "">("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Settings records only a local, destination-bound intent. Billing and role
  // mutations happen after the destination-specific review on /onboarding.
  const prepareRoleSwitchReview = () => {
    if (!currentType) {
      toast.error("Could not identify your current account type. Please refresh and try again.");
      return;
    }
    if (!user?.id) {
      toast.error("Could not identify your account for role switching. Please sign out and back in.");
      return;
    }
    if (!targetType || targetType === currentType) {
      toast.error("Choose a different participant type to continue.");
      return;
    }

    try {
      const operation = prepareRoleSwitchOperation({
        userId: user.id,
        fromType: currentType,
        toType: targetType,
        hadActiveSub: hasActiveSub,
      });
      sessionStorage.setItem("role_switch_ctx", JSON.stringify({
        userId: user.id,
        fromType: currentType,
        toType: targetType,
        hadActiveSub: hasActiveSub,
        auditId: operation.operationId,
        status: "prepared",
      }));
    } catch (error: unknown) {
      logger.warn("[SettingsSection] role-switch operation could not be persisted", {
        error: error instanceof Error ? error.message : String(error),
      });
      toast.error("Could not safely start the account switch in this browser. Enable site storage and try again.");
      return;
    }

    navigate("/onboarding");
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) throw new Error("No active session");
      const { error } = await supabase.functions.invoke("delete-account", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      toast.success("Your account has been deleted. Goodbye.");
      await supabase.auth.signOut();
      navigate("/");
    } catch (err: unknown) {
      toast.error("Deletion was not completed. Your account is still active. Please try again.");
      logger.error("delete-account", err instanceof Error ? err : new Error(String(err)));
    } finally {
      setDeleting(false);
      setDeleteDialogOpen(false);
    }
  };

  const perm = currentType ? ROLE_PERMISSIONS[currentType] : null;

  return (
    <div className="space-y-6 max-w-xl">
      <h1 className="font-display text-2xl font-bold">Settings</h1>

      <div className="glass-card rounded-xl p-6 space-y-4">
        <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Account</h2>
        <div className="flex items-center justify-between py-2">
          <div>
            <p className="text-sm font-medium">Account Type</p>
            <p className="text-xs text-muted-foreground mt-0.5">Shown in sidebar — switch below to change</p>
          </div>
          <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20">
            {roleLabel}
          </span>
        </div>
      </div>

      {perm ? (
        <div className="glass-card rounded-xl p-5 border border-primary/10">
          <h2 className="font-semibold text-sm mb-3 flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" /> Your Permissions
          </h2>
          <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
            {perm.can.map((c) => <li key={c}>{c}</li>)}
          </ul>
        </div>
      ) : (
        <div className="glass-card rounded-xl p-5 border border-primary/10">
          <h2 className="font-semibold text-sm mb-3 flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" /> Your Permissions
          </h2>
          <p className="text-xs text-muted-foreground">
            Your access rights are determined server-side and cannot be changed from here.
          </p>
        </div>
      )}

      <div className="glass-card rounded-xl p-5 border border-brand-gold/20 bg-brand-gold/5">
        <div className="flex items-start gap-3">
          <Shield className="w-5 h-5 text-brand-gold shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-sm text-brand-gold">Security Notice</p>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Switching your participant type <strong>changes both your dashboard layout and which features are available to you</strong> —
              for example, listing creation requires a sell-side type (Seller, Agent, Developer, Institutional) and
              some routes are restricted to specific roles. Admin access is granted only by platform administrators
              and cannot be obtained by switching types.
            </p>
          </div>
        </div>
      </div>

      <div className="glass-card rounded-xl p-6 space-y-4">
        <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Participant Type</h2>
        <p className="text-sm text-muted-foreground">Re-run the setup wizard to reconfigure your dashboard view.</p>

        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-2">
          <p className="text-xs font-semibold text-primary flex items-center gap-1.5">
            Before you switch: billing and account effects
          </p>
          <ul className="text-xs text-muted-foreground space-y-1.5 leading-relaxed list-none">
            {[
              { color: "text-brand-gold", text: <><strong className="text-foreground">Billing is checked by Stripe after confirmation.</strong> Any active core subscription is set to cancel at the end of its current period before the role change starts.</> },
              { color: "text-destructive", text: <><strong className="text-foreground">Operational work is affected.</strong> Active listings are paused; pending viewings, registrations, offers, leads, contacts, and active conversations may be cancelled or closed.</> },
              { color: "text-brand-emerald", text: <><strong className="text-foreground">Historical account data remains.</strong> Saved properties and message history remain attached to your account. Professional profiles or developer projects are archived while that role is inactive.</> },
              { color: "text-primary", text: <><strong className="text-foreground">Access and pricing change by destination.</strong> You will review the exact destination before anything is mutated. Switching never grants platform-admin access.</> },
            ].map(({ color, text }, i) => (
              <li key={i} className="flex items-start gap-2">
                <span aria-hidden="true" className={`${color} shrink-0 mt-0.5`}>-</span>
                <span>{text}</span>
              </li>
            ))}
          </ul>
        </div>

        {!confirmOpen ? (
          <Button variant="outline" className="border-border gap-2" onClick={() => setConfirmOpen(true)}>
            <Settings className="w-4 h-4" /> Switch Participant Type
          </Button>
        ) : (
          <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="role-switch-destination" className="text-sm font-semibold">
                New participant type
              </label>
              <select
                id="role-switch-destination"
                value={targetType}
                onChange={(event) => setTargetType(event.target.value as ParticipantId | "")}
                className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Choose a participant type</option>
                {SELF_SERVICE_ROLE_TARGETS
                  .filter((type) => type !== currentType)
                  .map((type) => (
                    <option key={type} value={type}>{PARTICIPANT_LABELS[type]}</option>
                  ))}
              </select>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Next you will review destination pricing and every account effect. Nothing is
              cancelled, paused, archived, or cleared until you confirm that review.
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Investor and institutional access require approval and are not available through
              self-service account switching.
            </p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" className="min-h-11 border-border" onClick={() => {
                setConfirmOpen(false);
                setTargetType("");
              }}>
                Cancel
              </Button>
              <Button
                className="min-h-11 gap-2"
                disabled={!targetType}
                onClick={prepareRoleSwitchReview}
              >
                <ArrowRight className="w-4 h-4" />
                Review switch
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Danger Zone — Account Deletion */}
      <div className="glass-card rounded-xl p-6 space-y-4 border border-destructive/30">
        <h2 className="font-semibold text-sm text-destructive uppercase tracking-wide flex items-center gap-2">
          <Trash2 className="w-4 h-4" /> Danger Zone
        </h2>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Delete Account</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Permanently removes your account and account-controlled platform data. Records retained for legal reasons are handled under the Privacy Policy.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="border-destructive/40 text-destructive hover:bg-destructive/10 gap-1.5 shrink-0 ml-4"
            onClick={() => setDeleteDialogOpen(true)}
            disabled={deleting}
          >
            {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            Delete account
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={deleteDialogOpen}
        title="Delete your account?"
        description="This will permanently delete your account and account-controlled platform data, including active listings, saved properties, messages, and profile information. Records we are legally required to retain will be handled under our Privacy Policy. This action cannot be undone."
        confirmLabel="Yes, delete my account"
        destructive
        onConfirm={handleDeleteAccount}
        onCancel={() => setDeleteDialogOpen(false)}
      />
    </div>
  );
}
