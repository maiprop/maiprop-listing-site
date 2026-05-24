import { Gavel } from "lucide-react";
import { useTranslation } from "react-i18next";

interface Stat {
  value: string;
  label: string;
}

interface AuctionHeroProps {
  stats: Stat[];
}

export function AuctionHero({ stats }: AuctionHeroProps) {
  const { i18n } = useTranslation();
  const isGreek = i18n.language?.toLowerCase().startsWith("el") ?? false;

  return (
    <div
      className="border-b border-border py-6 sm:py-12"
      style={{ background: "linear-gradient(135deg, hsl(var(--brand-navy)) 0%, hsl(var(--brand-purple-dark)) 55%, hsl(var(--brand-purple)) 100%)" }}
    >
      <div className="container">
        <div className="flex items-center gap-2 mb-2 sm:mb-3">
          <Gavel className="w-4 h-4 sm:w-5 sm:h-5 text-brand-indigo" />
          <span className="text-[10px] sm:text-xs font-bold uppercase tracking-widest bg-gradient-to-r from-brand-cyan via-primary-foreground to-brand-purple bg-clip-text text-transparent drop-shadow-[0_0_8px_rgba(255,255,255,0.35)]">
            {isGreek ? "Πλειστηριασμοί Ελλάδας · Ζωντανά δεδομένα" : "Greek Auctions · Live Data"}
          </span>
        </div>
        <h1 className="font-display text-xl sm:text-4xl font-bold mb-1.5 sm:mb-2 text-white">
          {isGreek ? "Πλειστηριασμοί ακινήτων" : "Property Auctions"}
        </h1>
        <p className="text-white/60 text-xs sm:text-base max-w-xl">
          {isGreek
            ? "Δεδομένα ηλεκτρονικών πλειστηριασμών σε πραγματικό χρόνο από το mAI Prop OS."
            : "Real-time electronic auction data powered by mAI Prop OS."}
        </p>
        <div className="grid grid-cols-3 gap-2 sm:gap-3 mt-4 sm:mt-8 max-w-2xl">
          {stats.map((s) => (
            <div
              key={s.label}
              className="min-h-20 sm:min-h-28 rounded-2xl p-2.5 sm:p-5 text-center flex flex-col items-center justify-center border border-white/15 bg-gradient-to-br from-white/18 via-white/6 to-transparent backdrop-blur-xl"
            >
              <div className="min-w-16 sm:min-w-28 font-display text-lg sm:text-3xl font-bold text-white drop-shadow-sm">
                {s.value}
              </div>
              <div className="text-[9px] sm:text-xs text-white/80 mt-0.5 sm:mt-1.5 font-medium leading-tight">
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
