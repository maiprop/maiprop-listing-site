import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Cookie, X } from "lucide-react";

const CONSENT_KEY = "cookie-consent";

type ConsentValue = "accepted" | "rejected";

const CookieConsent = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(CONSENT_KEY);
    if (!stored) {
      // Small delay so it doesn't compete with initial paint
      const timer = setTimeout(() => setVisible(true), 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleConsent = (value: ConsentValue) => {
    localStorage.setItem(CONSENT_KEY, value);
    setVisible(false);

    if (value === "rejected") {
      // Disable Google Analytics cookies
      const w = window as unknown as { dataLayer: unknown[] };
      w.dataLayer = w.dataLayer || [];
      w.dataLayer.push(["consent", "update", {
        analytics_storage: "denied",
        ad_storage: "denied",
      }]);
    }
  };

  if (!visible) return null;

  return (
    <div
      className="fixed bottom-4 left-4 right-4 z-[9999] mx-auto max-w-lg animate-in slide-in-from-bottom-4 duration-500"
      role="dialog"
      aria-label="Cookie consent"
    >
      <div className="rounded-xl border border-border bg-card p-5 shadow-2xl backdrop-blur-sm">
        <div className="flex items-start gap-3">
          <Cookie className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div className="flex-1 space-y-3">
            <p className="text-sm leading-relaxed text-card-foreground">
              We use cookies to enhance your experience and analyze site traffic.
              By clicking "Accept", you consent to our use of cookies.
            </p>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={() => handleConsent("accepted")}
                className="h-8 text-xs"
              >
                Accept
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleConsent("rejected")}
                className="h-8 text-xs"
              >
                Reject
              </Button>
            </div>
          </div>
          <button
            onClick={() => handleConsent("rejected")}
            className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Close cookie banner"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default CookieConsent;
