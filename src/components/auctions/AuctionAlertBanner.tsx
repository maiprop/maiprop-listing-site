import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";

interface AuctionAlertBannerProps {
  isAuthenticated: boolean;
  onOpenAlert: () => void;
  onSignInRedirect: () => void;
}

export function AuctionAlertBanner({ isAuthenticated, onOpenAlert, onSignInRedirect }: AuctionAlertBannerProps) {
  const { i18n } = useTranslation();
  const isGreek = i18n.language?.toLowerCase().startsWith("el") ?? false;

  return (
    <div className="container py-4 sm:py-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4 p-4 rounded-xl bg-primary/8 border border-primary/20">
        <div className="flex items-start gap-3 flex-1">
          <Bell className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium">
              {isGreek ? "Λάβετε ειδοποίηση για νέους πλειστηριασμούς που ταιριάζουν στα κριτήριά σας" : "Get notified of new auctions matching your criteria"}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isGreek ? "Ορίστε ειδοποιήσεις ανά περιοχή, τιμή πρώτης προσφοράς και τύπο ακινήτου" : "Set custom alerts for location, first offer price, and property type"}
            </p>
          </div>
        </div>
        <Button
          size="sm"
          className="bg-gradient-primary border-0 text-primary-foreground font-semibold w-full sm:w-auto shrink-0"
          onClick={isAuthenticated ? onOpenAlert : onSignInRedirect}
        >
          {isAuthenticated ? (isGreek ? "Νέα ειδοποίηση" : "Set Alert") : (isGreek ? "Σύνδεση για ειδοποίηση" : "Sign in to Alert")}
        </Button>
      </div>
    </div>
  );
}
