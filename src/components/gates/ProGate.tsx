import { ReactNode } from "react";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSubscription } from "@/hooks/useSubscription";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

interface ProGateProps {
  feature?: string;
  children?: ReactNode;
  fallback?: ReactNode;
}

export function ProGate({ feature, children, fallback }: ProGateProps) {
  const { isPro } = useSubscription();
  const navigate = useNavigate();
  const { t } = useTranslation();

  if (isPro) return <>{children}</>;

  if (fallback) return <>{fallback}</>;

  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 rounded-lg border border-dashed border-border bg-secondary/30">
      <Lock className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
      <p className="text-sm font-medium text-center">{feature ?? t("common.proRequired")}</p>
      <Button size="sm" onClick={() => navigate("/pricing")}>
        {t("common.upgradeNow")}
      </Button>
    </div>
  );
}
