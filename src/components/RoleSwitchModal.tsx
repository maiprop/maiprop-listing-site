/**
 * RoleSwitchModal — shown before a participant-type switch when billing implications exist.
 *
 * Covers four cases:
 *   same-tier  → no modal (caller skips it)
 *   upgrade    → warn that new plan costs more; current sub will be cancelled
 *   downgrade  → warn no refund on remaining cycle
 *   proonly    → warn that the new role (developer) requires a paid plan
 */

import { AlertTriangle, ArrowRight, CreditCard, Mail, TrendingDown, TrendingUp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ParticipantId } from "@/lib/participantConfig";
import { PARTICIPANT_LABELS } from "@/lib/participantConfig";
import {
  getPlanForParticipant,
  classifySwitch,
  resolveRolePlanDisplayPricing,
  type RolePlan,
  type RolePlanDisplayPricing,
  type SwitchKind,
} from "@/lib/rolePlanMap";
import type { PricingConfigMap } from "@/hooks/usePricingConfigs";
import { useFocusTrap } from "@/hooks/useFocusTrap";

interface RoleSwitchModalProps {
  fromType: ParticipantId;
  toType: ParticipantId;
  hasActiveSub: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  confirming?: boolean;
  pricingConfigs?: PricingConfigMap;
  errorMessage?: string | null;
  onManageBilling?: () => void;
}

function SwitchKindBadge({ kind }: { kind: SwitchKind }) {
  if (kind === "invite-only") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
        <Mail className="w-3 h-3" /> Invitation-only
      </span>
    );
  }
  if (kind === "upgrade" || kind === "proonly") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">
        <TrendingUp className="w-3 h-3" /> Upgrade
      </span>
    );
  }
  if (kind === "downgrade") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/30">
        <TrendingDown className="w-3 h-3" /> Downgrade
      </span>
    );
  }
  return null;
}

function formatMonthlyPrice(pricing: RolePlanDisplayPricing): string {
  return new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency: pricing.currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(pricing.monthlyPrice);
}

/** Format the active pricing row, falling back to the canonical role plan. */
function formatPlanLine(plan: RolePlan, pricing: RolePlanDisplayPricing): string {
  if (plan.inviteOnly) return "Custom annual link";
  if (pricing.monthlyPrice === 0) return "Free";
  return `${formatMonthlyPrice(pricing)}/mo`;
}

export function RoleSwitchModal({
  fromType,
  toType,
  hasActiveSub,
  onConfirm,
  onCancel,
  confirming = false,
  pricingConfigs = {},
  errorMessage = null,
  onManageBilling,
}: RoleSwitchModalProps) {
  const dialogRef = useFocusTrap<HTMLDivElement>({ onEscape: onCancel });
  const fromPlan = getPlanForParticipant(fromType);
  const toPlan   = getPlanForParticipant(toType);
  const kind     = classifySwitch(fromType, toType);
  const fromPricing = resolveRolePlanDisplayPricing(
    fromPlan,
    pricingConfigs[fromPlan.planKey],
  );
  const toPricing = resolveRolePlanDisplayPricing(
    toPlan,
    pricingConfigs[toPlan.planKey],
  );
  const fromMonthly = formatMonthlyPrice(fromPricing);
  const toMonthly = formatMonthlyPrice(toPricing);

  const fromLabel = PARTICIPANT_LABELS[fromType];
  const toLabel   = PARTICIPANT_LABELS[toType];

  return (
    // Backdrop
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="role-switch-title"
        tabIndex={-1}
        className="w-full max-w-md max-h-[calc(100dvh-2rem)] bg-background border border-border rounded-lg shadow-2xl overflow-y-auto"
      >

        {/* Header */}
        <div className={cn(
          "px-6 py-4 border-b border-border flex items-center gap-3",
          kind === "invite-only" ? "bg-emerald-500/5"
            : kind === "upgrade" || kind === "proonly" ? "bg-amber-500/5"
            : "bg-blue-500/5"
        )}>
          <div className={cn(
            "w-9 h-9 rounded-xl flex items-center justify-center shrink-0",
            kind === "invite-only" ? "bg-emerald-500/15"
              : kind === "upgrade" || kind === "proonly" ? "bg-amber-500/15"
              : "bg-blue-500/15"
          )}>
            {kind === "invite-only"
              ? <Mail className="w-5 h-5 text-emerald-400" />
              : kind === "downgrade"
                ? <TrendingDown className="w-5 h-5 text-blue-400" />
                : <AlertTriangle className="w-5 h-5 text-amber-400" />
            }
          </div>
          <div>
            <h2 id="role-switch-title" className="font-display font-bold text-base">Switching account type</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Review billing implications before proceeding</p>
          </div>
          <SwitchKindBadge kind={kind} />
        </div>

        {/* Role transition summary */}
        <div className="px-6 pt-5 pb-4">
          <div className="flex items-center gap-3 bg-secondary/60 rounded-xl px-4 py-3 mb-4">
            <div className="text-center flex-1 min-w-0">
              <p className="text-[11px] text-muted-foreground mb-0.5">From</p>
              <p className="text-sm font-semibold text-foreground truncate">{fromLabel}</p>
              <p className="text-xs text-muted-foreground">{formatPlanLine(fromPlan, fromPricing)}</p>
            </div>
            <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
            <div className="text-center flex-1 min-w-0">
              <p className="text-[11px] text-muted-foreground mb-0.5">To</p>
              <p className="text-sm font-semibold text-foreground truncate">{toLabel}</p>
              <p className={cn(
                "text-xs font-medium",
                kind === "invite-only" ? "text-emerald-400"
                  : kind === "upgrade" || kind === "proonly" ? "text-amber-400"
                  : "text-blue-400"
              )}>
                {toPlan.inviteOnly
                  ? "Custom annual link"
                  : toPlan.proOnly
                    ? `${toMonthly}/mo required`
                    : toPricing.monthlyPrice === 0
                      ? "Free available"
                      : `${toMonthly}/mo`
                }
              </p>
            </div>
          </div>

          {/* Billing notices */}
          <div className="space-y-2.5">
            {kind === "invite-only" && (
              <Notice
                icon={<Mail className="w-4 h-4 text-emerald-400" />}
                title="Invitation required"
                body={`The ${toLabel} role is invitation-only. Submit an application — once approved, you'll receive an email with a custom annual payment link. Your current account stays active in the meantime.`}
                color="emerald"
              />
            )}

            {kind === "proonly" && (
              <Notice
                icon={<CreditCard className="w-4 h-4 text-amber-400" />}
                title="Paid plan required"
                body={`The ${toLabel} role has no free tier. After setup, you'll be redirected to checkout for the ${toPlan.planName} at ${toMonthly}/mo.`}
                color="amber"
              />
            )}

            {kind === "upgrade" && hasActiveSub && (
              <Notice
                icon={<TrendingUp className="w-4 h-4 text-amber-400" />}
                title="Higher-tier plan required"
                body={`Your current ${fromPlan.planName} (${fromMonthly}/mo) will be scheduled to cancel at period end. After setup you'll need to subscribe to the ${toPlan.planName} at ${toMonthly}/mo.`}
                color="amber"
              />
            )}

            {kind === "upgrade" && !hasActiveSub && (
              <Notice
                icon={<TrendingUp className="w-4 h-4 text-amber-400" />}
                title="Upgrade pricing applies"
                body={`The ${toLabel} role has a Pro plan at ${toMonthly}/mo. A free tier is available, and you can upgrade from your dashboard when ready.`}
                color="amber"
              />
            )}

            {kind === "downgrade" && hasActiveSub && (
              <Notice
                icon={<TrendingDown className="w-4 h-4 text-blue-400" />}
                title="No refund on downgrade"
                body="Your current subscription will be scheduled to cancel at period end. There is no prorated refund under the Terms of Service. The new role has a lower-cost plan available."
                color="blue"
              />
            )}

            {kind === "downgrade" && !hasActiveSub && (
              <Notice
                icon={<TrendingDown className="w-4 h-4 text-blue-400" />}
                title="Lower-tier plan"
                body={`The ${toLabel} role uses the ${toPlan.planName} (${toMonthly}/mo). Review the operational changes below before continuing.`}
                color="blue"
              />
            )}

            <Notice
              icon={<AlertTriangle className="w-3.5 h-3.5 text-muted-foreground" />}
              title="What changes immediately"
              body={
                fromType === "professional"
                  ? "Saved properties and message history remain. Your professional profile and services are archived. Active listings are paused, while pending viewings, registrations, offers, leads, contacts, and open conversations may be cancelled or closed."
                  : fromType === "developer"
                    ? "Saved properties and message history remain. Your projects are archived. Active listings are paused, while pending viewings, registrations, offers, leads, contacts, and open conversations may be cancelled or closed."
                    : "Saved properties and message history remain. Active listings are paused, while pending viewings, registrations, offers, leads, contacts, and open conversations may be cancelled or closed."
              }
              color="neutral"
            />
            {errorMessage && (
              <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3">
                <p className="text-xs font-semibold text-destructive">Switch not started</p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{errorMessage}</p>
                {onManageBilling && (
                  <Button
                    type="button"
                    variant="link"
                    className="mt-1 h-11 px-0 text-xs"
                    onClick={onManageBilling}
                    disabled={confirming}
                  >
                    Open Billing
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="px-6 pb-5 flex gap-2">
          <Button variant="outline" className="min-h-11 flex-1 border-border" onClick={onCancel} disabled={confirming}>
            Cancel
          </Button>
          <Button
            className={cn(
              "min-h-11 flex-1 border-0 text-white gap-2",
              kind === "invite-only" ? "bg-emerald-600 hover:bg-emerald-700"
                : kind === "downgrade" ? "bg-blue-600 hover:bg-blue-700"
                : "bg-amber-600 hover:bg-amber-700"
            )}
            onClick={onConfirm}
            disabled={confirming}
          >
            {confirming
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <ArrowRight className="w-4 h-4" />
            }
            {kind === "invite-only"
              ? "Apply for access"
              : kind === "proonly" || kind === "upgrade"
                ? "Continue to setup"
                : "Switch role"
            }
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Internal helper ────────────────────────────────────────────────────────────

function Notice({
  icon,
  title,
  body,
  color,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  color: "amber" | "blue" | "emerald" | "neutral";
}) {
  const bg = color === "amber"   ? "bg-amber-500/8 border-amber-500/20"
           : color === "blue"    ? "bg-blue-500/8 border-blue-500/20"
           : color === "emerald" ? "bg-emerald-500/8 border-emerald-500/20"
           : "bg-secondary/60 border-border";
  return (
    <div className={cn("rounded-xl border p-3 flex gap-2.5", bg)}>
      <div className="shrink-0 mt-0.5">{icon}</div>
      <div>
        <p className="text-xs font-semibold text-foreground mb-0.5">{title}</p>
        <p className="text-[11px] text-muted-foreground leading-relaxed">{body}</p>
      </div>
    </div>
  );
}
