import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";

export function MapGate({ consent, accept, children, height }: {
  consent: { mapping: boolean; accepted: boolean };
  accept: (overrides?: Record<string, boolean>) => void;
  children: React.ReactNode;
  height?: string;
}) {
  const { i18n } = useTranslation();
  const isGreek = i18n.language?.toLowerCase().startsWith("el") ?? false;

  if (!consent.mapping) {
    return (
      <div
        className="flex-1 flex items-center justify-center bg-secondary rounded-xl min-h-[400px]"
        style={height ? { height } : undefined}
      >
        <div className="text-center max-w-xs px-6">
          <Lock className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="font-display font-semibold mb-1">{isGreek ? "Ο χάρτης απαιτεί cookies" : "Map requires cookies"}</p>
          <p className="text-sm text-muted-foreground mb-4">
            {isGreek
              ? "Οι διαδραστικοί χάρτες χρησιμοποιούν Mapbox, το οποίο θέτει cookies τρίτων. Ενεργοποιήστε τα cookies χαρτών για να συνεχίσετε."
              : "Interactive maps use Mapbox which sets third-party cookies. Enable mapping cookies to continue."}
          </p>
          <Button
            size="sm"
            className="bg-gradient-primary border-0 text-primary-foreground gap-2"
            onClick={() => accept({ mapping: true })}
          >
            {isGreek ? "Ενεργοποίηση χάρτη" : "Enable Map"}
          </Button>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
