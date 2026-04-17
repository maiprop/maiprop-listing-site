import { useNavigate } from "react-router-dom";
import { BarChart2, Star, Check, Lock, Clock, Flame, ChevronRight, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useEligibleForQuickSale } from "@/hooks/useEligibleForQuickSale";

interface Props {
  invitationStatus: "none" | "pending" | "rejected";
  onRequestInvitation: () => void;
}

export function FiresaleInvestorPanel({ invitationStatus, onRequestInvitation }: Props) {
  const { user } = useAuth();
  const { eligible } = useEligibleForQuickSale();
  const navigate = useNavigate();

  return (
    <div className="space-y-4">
      {/* Who buys */}
      <div className="reveal in-view glass-card rounded-2xl border border-brand-gold/20 p-6 relative overflow-hidden transition-all duration-300 hover:border-brand-gold/40 hover:shadow-elevated">
        <div className="absolute top-0 right-0 w-40 h-40 rounded-bl-full bg-brand-gold/5 pointer-events-none" />
        <div className="relative">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-7 h-7 rounded-lg bg-brand-gold/15 flex items-center justify-center">
              <Star className="w-3.5 h-3.5 text-brand-gold fill-current" />
            </div>
            <h4 className="font-display font-bold text-sm">Who Buys Your Property</h4>
          </div>
          <p className="text-[10px] text-muted-foreground mb-4 ml-9">
            Pre-vetted, capital-ready buyers — no time-wasters.
          </p>
          <div className="space-y-2">
            {[
              { type: "Family Offices", desc: "Greek & Cypriot capital deploying at scale", icon: "🏛️" },
              { type: "Hedge Funds", desc: "International RE-focused alternative funds", icon: "📈" },
              { type: "Private Equity", desc: "Buy-to-hold and value-add strategies", icon: "💼" },
              { type: "HNWIs", desc: "Ultra-high-net-worth private individuals", icon: "👤" },
            ].map((b) => (
              <div
                key={b.type}
                className="flex items-center gap-3 rounded-xl bg-brand-gold/5 border border-brand-gold/10 px-3 py-2.5 hover:border-brand-gold/30 transition-colors"
              >
                <span className="text-base leading-none">{b.icon}</span>
                <div>
                  <p className="text-xs font-bold text-foreground">{b.type}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{b.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Comparison table */}
      <div className="reveal in-view reveal-delay-1 glass-card rounded-2xl border border-border overflow-hidden transition-all duration-300 hover:border-primary/20 hover:shadow-elevated">
        <div className="grid grid-cols-3 bg-muted/60 border-b border-border text-[10px] font-bold uppercase tracking-widest">
          <div className="px-4 py-3 text-muted-foreground"></div>
          <div className="px-4 py-3 flex items-center justify-center gap-1.5 text-destructive border-x border-border">
            <Flame className="w-3 h-3" /> Quick Sale™
          </div>
          <div className="px-4 py-3 text-center text-muted-foreground/60">Traditional</div>
        </div>
        {[
          { label: "Time to offer", firesale: "96 hours", trad: "3–6 months", icon: "⚡" },
          { label: "Viewings", firesale: "Fast & private", trad: "10–30 open days", icon: "🔑" },
          { label: "Negotiations", firesale: "None", trad: "Weeks of back-forth", icon: "🤝" },
          { label: "Certainty of sale", firesale: "Guaranteed", trad: "~60% chance", icon: "🎯" },
          { label: "Legal & notary", firesale: "Fully managed", trad: "You arrange it", icon: "📋" },
        ].map((r, i) => (
          <div
            key={r.label}
            className={`grid grid-cols-3 text-xs items-stretch ${i < 4 ? "border-b border-border" : ""}`}
          >
            <div className="px-4 py-3 flex items-center gap-2 text-muted-foreground">
              <span className="text-sm leading-none">{r.icon}</span>
              <span className="font-medium">{r.label}</span>
            </div>
            <div className="px-4 py-3 flex items-center justify-center border-x border-border bg-destructive/3">
              <span className="font-bold text-foreground text-center leading-tight">{r.firesale}</span>
            </div>
            <div className="px-4 py-3 flex items-center justify-center">
              <span className="text-muted-foreground/60 line-through text-center leading-tight">{r.trad}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Investor dashboard CTA */}
      <div className="reveal in-view reveal-delay-2 glass-card rounded-2xl border border-accent/20 p-6 relative overflow-hidden transition-all duration-300 hover:border-accent/40 hover:shadow-elevated">
        <div className="absolute top-0 right-0 w-32 h-32 rounded-bl-full bg-accent/5 pointer-events-none" />
        <div className="relative">
          <div className="flex items-center gap-2 mb-3">
            <Lock className="w-4 h-4 text-accent" />
            <span className="text-xs font-bold text-accent uppercase tracking-widest">For Investors</span>
          </div>
          <h4 className="font-display font-bold text-base mb-2">Access the Deal Flow</h4>
          <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
            Off-market properties before they hit the market. Access is by invitation only — request an invitation on the Investor Dashboard.
          </p>
          <div className="space-y-1.5 mb-4">
            {[
              "Live quick sale deal feed",
              "AI valuation reports",
              "Seller contact details",
              "Portfolio analytics",
            ].map((f) => (
              <div key={f} className="flex items-center gap-2 text-xs text-muted-foreground">
                <Check className="w-3 h-3 text-accent shrink-0" />
                {f}
              </div>
            ))}
          </div>
          {user && eligible ? (
            <Button
              className="w-full bg-accent/10 border border-accent/30 text-accent hover:bg-accent/20 gap-2 text-xs"
              onClick={() => navigate("/investor-dashboard")}
            >
              <BarChart2 className="w-3.5 h-3.5" />
              View Investor Dashboard
              <ChevronRight className="w-3.5 h-3.5 ml-auto" />
            </Button>
          ) : user && invitationStatus === "pending" ? (
            <div className="rounded-xl bg-brand-gold/10 border border-brand-gold/30 px-4 py-3 flex items-center gap-3">
              <Clock className="w-4 h-4 text-brand-gold shrink-0" />
              <p className="text-[11px] text-brand-gold font-semibold leading-snug">
                Application under review — we'll contact you within 48h.
              </p>
            </div>
          ) : user && !eligible ? (
            <div className="space-y-2">
              {invitationStatus === "rejected" && (
                <p className="text-[11px] text-destructive">Your previous application wasn't approved. You may re-apply.</p>
              )}
              <Button
                className="w-full bg-gradient-primary border-0 text-primary-foreground gap-2 text-xs h-10"
                onClick={onRequestInvitation}
              >
                <ArrowRight className="w-3.5 h-3.5" />
                {invitationStatus === "rejected" ? "Re-apply for Access" : "Request an Invitation"}
              </Button>
            </div>
          ) : (
            <Button
              className="w-full bg-gradient-primary border-0 text-primary-foreground gap-2 text-xs h-10"
              onClick={() => navigate("/login", { state: { from: "/investor-dashboard" } })}
            >
              <ArrowRight className="w-3.5 h-3.5" />
              Sign In & Request Access
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
