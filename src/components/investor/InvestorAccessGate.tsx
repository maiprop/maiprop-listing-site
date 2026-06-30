import { Clock, Ban, Lock, MailPlus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

interface Props {
  invitationStatus: "none" | "pending" | "approved" | "rejected";
  onRequestClick: () => void;
}

export function InvestorAccessGate({ invitationStatus, onRequestClick }: Props) {
  const { t } = useTranslation();
  return (
    <div className={`mb-8 relative glass-card rounded-2xl overflow-hidden ${
      invitationStatus === "pending"
        ? "border border-brand-gold/30"
        : invitationStatus === "rejected"
        ? "border border-destructive/30"
        : "border border-primary/30"
    }`}>
      {/* Background glow */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: invitationStatus === "pending"
          ? "radial-gradient(ellipse 60% 80% at 0% 50%, hsl(var(--brand-gold)/0.06), transparent 60%)"
          : invitationStatus === "rejected"
          ? "radial-gradient(ellipse 60% 80% at 0% 50%, hsl(var(--destructive)/0.06), transparent 60%)"
          : "radial-gradient(ellipse 60% 80% at 0% 50%, hsl(var(--primary)/0.06), transparent 60%), radial-gradient(ellipse 40% 60% at 100% 30%, hsl(var(--accent)/0.05), transparent 60%)"
      }} />
      <div className="relative px-6 py-7 sm:px-8 sm:py-9">
        <div className="flex flex-col lg:flex-row lg:items-center gap-6 lg:gap-10">
          {/* Left */}
          <div className="flex-1 min-w-0">
            {invitationStatus === "pending" ? (
              <>
                <div className="inline-flex items-center gap-2 bg-brand-gold/10 border border-brand-gold/30 text-brand-gold px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest mb-4">
                  <Clock className="w-3 h-3" />
                  {t("investor.access.pendingBadge")}
                </div>
                <h2 className="font-display text-xl sm:text-2xl font-black mb-2">
                  {t("investor.access.pendingTitle")} <span className="text-brand-gold">{t("investor.access.pendingTitleHighlight")}</span>
                </h2>
                <p className="text-sm text-muted-foreground leading-relaxed max-w-lg">
                  {t("investor.access.pendingDesc")}
                </p>
                <div className="flex items-center gap-2 mt-5">
                  <div className="w-2 h-2 rounded-full bg-brand-gold animate-pulse" />
                  <span className="text-xs text-muted-foreground">{t("investor.access.pendingNote")}</span>
                </div>
              </>
            ) : invitationStatus === "rejected" ? (
              <>
                <div className="inline-flex items-center gap-2 bg-destructive/10 border border-destructive/30 text-destructive px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest mb-4">
                  <Ban className="w-3 h-3" />
                  {t("investor.access.rejectedBadge")}
                </div>
                <h2 className="font-display text-xl sm:text-2xl font-black mb-2">
                  {t("investor.access.rejectedTitle")} <span className="text-destructive">{t("investor.access.rejectedTitleHighlight")}</span>
                </h2>
                <p className="text-sm text-muted-foreground leading-relaxed max-w-lg">
                  {t("investor.access.rejectedDesc")}
                </p>
              </>
            ) : (
              <>
                <div className="inline-flex items-center gap-2 bg-primary/10 border border-primary/20 text-primary px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest mb-4">
                  <Lock className="w-3 h-3" />
                  {t("investor.access.noneBadge")}
                </div>
                <h2 className="font-display text-xl sm:text-2xl font-black mb-2">
                  {t("investor.access.noneTitle")} <span className="gradient-text-primary">{t("investor.access.noneTitleHighlight")}</span>
                </h2>
                <p className="text-sm text-muted-foreground leading-relaxed max-w-lg">
                  {t("investor.access.noneDesc")}
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
                  {[
                    { icon: "🔒", label: "Custom annual link" },
                    { icon: "✅", label: "Admin-vetted" },
                    { icon: "⚡", label: "48h response" },
                    { icon: "🤝", label: "NDA protected" },
                  ].map(f => (
                    <div key={f.label} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="text-base leading-none">{f.icon}</span>
                      {f.label}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Right: CTA */}
          <div className="shrink-0 flex flex-col items-start lg:items-end gap-3 lg:min-w-[200px]">
            {invitationStatus === "pending" ? (
              <div className="flex flex-col items-start lg:items-end gap-2">
                <div className="inline-flex items-center gap-2.5 bg-brand-gold/10 border border-brand-gold/30 text-brand-gold px-5 py-3 rounded-xl font-bold text-sm">
                  <Clock className="w-4 h-4 shrink-0" />
                  {t("investor.access.pendingCTA")}
                </div>
                <p className="text-[11px] text-muted-foreground text-right max-w-[200px]">
                  {t("investor.access.pendingCTANote")}
                </p>
              </div>
            ) : invitationStatus === "rejected" ? (
              <div className="flex flex-col items-start lg:items-end gap-2">
                <Button
                  className="bg-secondary border border-border text-foreground h-12 px-7 text-sm font-bold hover:bg-muted"
                  onClick={onRequestClick}
                >
                  <MailPlus className="w-4 h-4 mr-2" />
                  {t("investor.access.reApply")}
                </Button>
                <p className="text-[11px] text-muted-foreground">
                  {t("investor.access.reApplyNote")}
                </p>
              </div>
            ) : (
              <>
                <Button
                  className="bg-gradient-primary border-0 text-primary-foreground h-12 px-7 text-sm font-bold shadow-elevated"
                  onClick={onRequestClick}
                >
                  <MailPlus className="w-4 h-4 mr-2" />
                  {t("investor.access.cta")}
                </Button>
                <p className="text-[11px] text-muted-foreground">
                  {t("investor.access.alreadyApplied")}{" "}
                  <span className="text-primary cursor-default">{t("investor.access.alreadyAppliedNote")}</span>
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
