import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Settings, Shield, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { ParticipantId } from "@/lib/participantConfig";
import { logger } from "@/lib/logger";

const ROLE_PERMISSIONS: Record<ParticipantId, { label: string; can: string[] }> = {
  buyer:         { label: "Buyer / Renter",      can: ["Browse listings", "Save properties", "Request viewings", "Auction alerts"] },
  seller:        { label: "Seller / Landlord",   can: ["Create & manage listings", "Receive viewing requests", "AI listing assist"] },
  agent:         { label: "Agent",               can: ["Unlimited listings", "Lead management", "Analytics"] },
  developer:     { label: "Developer",           can: ["Listings", "Projects", "Portfolios", "Analytics"] },
  professional:  { label: "Professional",        can: ["Professional directory", "Service catalog", "Client leads", "Verified badge"] },
  investor:      { label: "Investor",            can: ["Deal flow access", "Auction bidding", "Portfolio tracking", "Market analytics"] },
  institutional: { label: "Institutional",       can: ["Bulk listings", "Portfolio management", "Institutional deal flow", "Dedicated support"] },
};

const ROLE_SWITCH_ERROR_MESSAGES: Record<string, string> = {
  profile_not_found: "Your profile record was not found. Please sign out, sign back in, and try again. If the problem persists, contact support.",
  not_authenticated: "Your session has expired. Please sign in again.",
  profile_update_failed: "Failed to update your profile. Please try again in a moment.",
  active_firesale_commitment_blocks_role_switch: "You have an active Quick Sale reservation or commitment. Resolve it before switching account type.",
  accepted_open_house_offer_blocks_role_switch: "You have an accepted open-house offer. Resolve it before switching account type.",
  role_switch_user_id_required: "Could not identify your account for role switching. Please sign out and back in.",
};

const stripeErrorFromResponse = (data: unknown): string | null => {
  if (!data || typeof data !== "object") return null;
  const value = (data as { stripe_error?: unknown }).stripe_error;
  return typeof value === "string" && value.length > 0 ? value : null;
};

export function SettingsSection({
  roleLabel,
  onUpdate: _onUpdate,
  refreshProfile,
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
  const [switching, setSwitching] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const invokeBeginRoleSwitch = async (validateOnly: boolean): Promise<boolean> => {
    const { error } = await supabase.functions.invoke("begin-role-switch", {
      body: validateOnly ? { validate_only: true } : {},
    });
    if (error) {
      const friendlyMsg = ROLE_SWITCH_ERROR_MESSAGES[error.message]
        ?? "Could not start role switch. Please try again or contact support.";
      toast.error(friendlyMsg);
      return false;
    }
    return true;
  };

  const logRoleSwitchStart = async (): Promise<boolean> => {
    if (!currentType || !hasActiveSub) return true;

    try {
      const { data, error } = await supabase.functions.invoke("log-role-switch", {
        body: {
          from_type: currentType,
          to_type: "",
          switch_kind: "same-tier",
          had_active_sub: true,
          cancel_subscription: true,
        },
      });
      if (error) {
        logger.warn("[SettingsSection] log-role-switch start failed:", error.message);
        toast.error("We couldn't cancel your active Stripe subscription. Please manage it from Billing before switching account type.");
        return false;
      }
      if (stripeErrorFromResponse(data)) {
        toast.error("We couldn't cancel your active Stripe subscription. Please manage it from Billing before switching account type.");
        return false;
      }
      return true;
    } catch (err: unknown) {
      logger.warn("[SettingsSection] log-role-switch start threw:", err instanceof Error ? err.message : err);
      toast.error("We couldn't cancel your active Stripe subscription. Please manage it from Billing before switching account type.");
      return false;
    }
  };

  // Role switch starts with a validate-only begin-role-switch call. That checks
  // business blockers without mutating the profile, so Stripe is not cancelled
  // for users who cannot switch yet. Once the current core subscription is
  // safely marked cancel-at-period-end, the real begin-role-switch call:
  //   - clears participant_type + bio,
  //   - stamps profiles.role_switch_in_progress_at,
  //   - pauses/cancels active role-specific public and counterparty workflows.
  // The subsequent /onboarding flow finalises the switch with
  // complete_onboarding_role_for_user(), which clears the sentinel and
  // unarchives the destination role's rows (idempotent).
  const handleSwitchRole = async () => {
    setSwitching(true);

    if (!(await invokeBeginRoleSwitch(true))) {
      setSwitching(false);
      return;
    }

    if (!(await logRoleSwitchStart())) {
      setSwitching(false);
      return;
    }

    try {
      sessionStorage.setItem("role_switch_ctx", JSON.stringify({
        fromType: currentType,
        hadActiveSub: hasActiveSub,
      }));
    } catch (_err: unknown) { /* ignore storage errors */ }

    if (!(await invokeBeginRoleSwitch(false))) {
      try { sessionStorage.removeItem("role_switch_ctx"); } catch { /* ignore */ }
      setSwitching(false);
      return;
    }
    await refreshProfile();
    setSwitching(false);
    toast.success("Account type cleared — redirecting to setup…");
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
      toast.error("Could not delete account. Please contact support.");
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
            <span>⚡</span> Before you switch — important billing &amp; access notes
          </p>
          <ul className="text-xs text-muted-foreground space-y-1.5 leading-relaxed list-none">
            {[
              { color: "text-brand-gold",    text: <><strong className="text-foreground">Extra charges may apply.</strong> Upgrading to a higher-tier participant type (e.g. Agent, Developer) may activate a paid plan. You will be informed before any charge is made.</> },
              { color: "text-destructive",   text: <><strong className="text-foreground">No refunds on downgrade.</strong> If you switch to a lower-tier type mid-billing cycle, the remaining period is non-refundable per our Terms of Service.</> },
              { color: "text-brand-emerald", text: <><strong className="text-foreground">Access rights will change.</strong> Choosing a superior participant type may unlock additional features and data access (e.g. deal flow, leads). Admin features live only at /admin and require platform admin. These are granted server-side upon plan activation.</> },
              { color: "text-primary",       text: <><strong className="text-foreground">Pricing adjustment.</strong> After selecting your new type, you will be redirected to the Pricing page to choose or update your plan. Switch does not grant admin — only dashboard layout and feature visibility change.</> },
            ].map(({ color, text }, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className={`${color} shrink-0 mt-0.5`}>▸</span>
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
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 space-y-3">
            <p className="text-sm font-semibold text-destructive">Confirm switch</p>
            <p className="text-xs text-muted-foreground">
              Your current setup (<strong>{roleLabel}</strong>) will be cleared and you'll go through onboarding again.
              Your listings, saved properties, and messages won't be affected. By proceeding you acknowledge the billing &amp; access notes above.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="border-border" onClick={() => setConfirmOpen(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                className="bg-destructive/90 border-0 text-destructive-foreground hover:bg-destructive gap-2"
                disabled={switching}
                onClick={handleSwitchRole}
              >
                {switching
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <ArrowRight className="w-3.5 h-3.5" />
                }
                I understand — switch my type
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
