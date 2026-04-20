import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AuctionAlertBannerProps {
  isAuthenticated: boolean;
  onOpenAlert: () => void;
  onSignInRedirect: () => void;
}

export function AuctionAlertBanner({ isAuthenticated, onOpenAlert, onSignInRedirect }: AuctionAlertBannerProps) {
  return (
    <div className="container py-4 sm:py-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4 p-4 rounded-xl bg-primary/8 border border-primary/20">
        <div className="flex items-start gap-3 flex-1">
          <Bell className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium">Get notified of new auctions matching your criteria</p>
            <p className="text-xs text-muted-foreground mt-0.5">Set custom alerts for location, price range, and property type</p>
          </div>
        </div>
        <Button
          size="sm"
          className="bg-gradient-primary border-0 text-primary-foreground font-semibold w-full sm:w-auto shrink-0"
          onClick={isAuthenticated ? onOpenAlert : onSignInRedirect}
        >
          {isAuthenticated ? "Set Alert" : "Sign in to Alert"}
        </Button>
      </div>
    </div>
  );
}
