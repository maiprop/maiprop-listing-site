import { AlertCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

interface Props {
  daysLeft: number;
  tier: string;
  onRenewClick: () => void;
}

export function InvestorExpiryBanner({ daysLeft, tier, onRenewClick }: Props) {
  const { t } = useTranslation();
  return (
    <div className="border-b border-destructive/30 bg-gradient-to-r from-destructive/10 via-destructive/5 to-transparent">
      <div className="container py-4">
        <div className="flex items-start gap-4 flex-wrap">
          {/* Countdown circle */}
          <div className="relative shrink-0 w-12 h-12 flex items-center justify-center">
            <svg className="absolute inset-0 w-12 h-12 -rotate-90" viewBox="0 0 48 48">
              <circle cx="24" cy="24" r="20" fill="none" stroke="hsl(var(--destructive)/0.15)" strokeWidth="4" />
              <circle
                cx="24" cy="24" r="20"
                fill="none"
                stroke="hsl(var(--destructive))"
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 20}`}
                strokeDashoffset={`${2 * Math.PI * 20 * (1 - daysLeft / 7)}`}
                className="transition-all duration-500"
              />
            </svg>
            <span className="relative font-display font-black text-xs text-destructive">{daysLeft}</span>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
              <p className="text-sm text-destructive font-bold">
                {daysLeft === 0
                  ? t("investor.expiry.titleToday", { tier })
                  : t(daysLeft === 1 ? "investor.expiry.title" : "investor.expiry.title_other", { tier, count: daysLeft })}
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("investor.expiry.subtitle")}
            </p>
            <div className="mt-2.5 w-full max-w-xs h-1.5 rounded-full bg-destructive/15 overflow-hidden">
              <div
                className="h-full rounded-full bg-destructive transition-all duration-700"
                style={{ width: `${(daysLeft / 7) * 100}%` }}
              />
            </div>
          </div>

          <Button
            size="sm"
            className="bg-destructive hover:bg-destructive/90 text-destructive-foreground text-xs h-9 px-4 shrink-0 font-semibold"
            onClick={onRenewClick}
          >
            {t("investor.expiry.requestRenewal")}
          </Button>
        </div>
      </div>
    </div>
  );
}
