import { Zap } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";

/**
 * Static "upgrade to Pro" placeholder for users who don't have access to the
 * AI valuation feature. Renders only when `isPro === false`.
 *
 * Extracted from PropertyDetail.tsx so the parent does not embed a 25-line
 * inline JSX block in its render path.
 */
export function PropertyValuationLockedCard() {
  const { i18n } = useTranslation();
  const isGreek = i18n.language?.toLowerCase().startsWith("el") ?? false;

  return (
    <div className="glass-card rounded-2xl overflow-hidden border border-primary/20">
      <div className="flex items-center gap-2 px-5 py-3.5 bg-primary/5 border-b border-primary/20">
        <Zap className="w-4 h-4 text-primary" />
        <h4 className="font-display font-semibold text-sm flex-1">{isGreek ? "Εκτίμηση αξίας ακινήτου" : "Property Valuation"}</h4>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/15 text-primary font-semibold">
          mAI Prop · 2026 Model
        </span>
      </div>
      <div className="p-5 text-center space-y-3">
        <p className="text-xs text-muted-foreground leading-relaxed">
          {isGreek
            ? "AI εκτίμηση ανά τύπο ακινήτου — εύρος τιμής, βεβαιότητα, ρευστότητα και ελληνικός νομικός/φορολογικός έλεγχος."
            : "Type-specific AI valuation — price range, confidence, liquidity, and Greek legal/tax overlay."}
        </p>
        <Button className="w-full bg-gradient-primary border-0 text-primary-foreground gap-2" asChild>
          <Link to="/pricing">
            <Zap className="w-4 h-4" /> {isGreek ? "Αναβάθμιση σε Pro" : "Upgrade to Pro"}
          </Link>
        </Button>
        <p className="text-[10px] text-muted-foreground">{isGreek ? "Λειτουργία Pro · Πλήρεις εκτιμήσεις αξίας" : "Pro Feature · Unlock full valuations"}</p>
      </div>
    </div>
  );
}
