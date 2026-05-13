import { useState } from "react";
import { Loader2, Bookmark, Bell, BellOff, Search, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  useSavedSearches,
  useDeleteSavedSearch,
  useToggleSavedSearchAlert,
  type SavedSearch,
} from "@/hooks/useSavedSearches";

export default function SavedSearchesTab() {
  const { data: savedSearches = [], isLoading: savedSearchesLoading } = useSavedSearches();
  const deleteSavedSearch = useDeleteSavedSearch();
  const toggleAlert = useToggleSavedSearchAlert();
  const [savedSearchToDelete, setSavedSearchToDelete] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Saved Searches</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Your saved filter sets — click to re-run or set email alerts.
          </p>
        </div>
        <Button className="bg-gradient-primary border-0 text-primary-foreground gap-2" asChild>
          <Link to="/listings">
            <Search className="w-4 h-4" /> Browse Listings
          </Link>
        </Button>
      </div>
      {savedSearchesLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : savedSearches.length === 0 ? (
        <div className="glass-card rounded-xl p-12 text-center">
          <Bookmark className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="font-semibold">No saved searches yet</p>
          <p className="text-sm text-muted-foreground mt-1">
            Go to Listings, apply filters, and click &quot;Save Search&quot;
          </p>
          <Button variant="outline" className="border-border mt-4" asChild>
            <Link to="/listings">Browse Listings</Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {savedSearches.map((s: SavedSearch) => {
            const filterCount = Object.keys(s.filters || {}).filter(
              (k) => s.filters[k]
            ).length;
            const params = new URLSearchParams(s.filters as Record<string, string> || {});
            return (
              <div key={s.id} className="glass-card rounded-xl p-4 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-semibold text-sm">{s.name}</p>
                    {s.email_alerts && (
                      <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                        <Bell className="w-3 h-3" /> Alerts ON
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {filterCount > 0
                      ? Object.entries(s.filters)
                          .filter(([, v]) => v)
                          .map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`)
                          .join(", ")
                      : "All listings"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Saved {new Date(s.created_at).toLocaleDateString()}
                    {s.last_alert_sent_at && (
                      <span className="ml-1">
                        · Last alert{" "}
                        {new Date(s.last_alert_sent_at).toLocaleDateString()}
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() =>
                      toggleAlert.mutate({ id: s.id, emailAlerts: !s.email_alerts })
                    }
                    className={`p-2 rounded-lg border transition-colors ${
                      s.email_alerts
                        ? "border-primary bg-primary/10 text-primary hover:bg-primary/20"
                        : "border-border bg-secondary text-muted-foreground hover:text-foreground hover:border-primary/40"
                    }`}
                  >
                    {s.email_alerts ? (
                      <Bell className="w-4 h-4" />
                    ) : (
                      <BellOff className="w-4 h-4" />
                    )}
                  </button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-border text-xs gap-1.5"
                    asChild
                  >
                    <Link to={`/listings?${params.toString()}`}>
                      <Search className="w-3 h-3" /> Run
                    </Link>
                  </Button>
                  <button
                    type="button"
                    onClick={() => setSavedSearchToDelete(s.id)}
                    className="p-2 rounded-lg hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <ConfirmDialog
        open={Boolean(savedSearchToDelete)}
        title="Delete saved search"
        description="Delete this saved search and stop its email alerts?"
        confirmLabel="Delete"
        onConfirm={() => {
          if (savedSearchToDelete) deleteSavedSearch.mutate(savedSearchToDelete);
          setSavedSearchToDelete(null);
        }}
        onCancel={() => setSavedSearchToDelete(null)}
      />
    </div>
  );
}
