import { useState } from "react";
import { Bookmark, Bell, BellOff, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCreateSavedSearch } from "@/hooks/useSavedSearches";
import { useAuth } from "@/contexts/AuthContext";
import { useFocusTrap } from "@/hooks/useFocusTrap";

interface Props {
  currentFilters: Record<string, string>;
  onClose: () => void;
}

export function SaveSearchModal({ currentFilters, onClose }: Props) {
  const { user } = useAuth();
  const dialogRef = useFocusTrap<HTMLDivElement>({ active: Boolean(user), onEscape: onClose });
  const [name, setName] = useState("My Search");
  const [emailAlerts, setEmailAlerts] = useState(false);
  const createSavedSearch = useCreateSavedSearch();

  if (!user) return null;

  const handleSave = async () => {
    await createSavedSearch.mutateAsync({ name, filters: currentFilters, emailAlerts });
    onClose();
  };

  // Build a readable summary of active filters
  const filterEntries = Object.entries(currentFilters).filter(([, v]) => v && v.length > 0);
  const summary = filterEntries.length > 0
    ? filterEntries.map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`).join(", ")
    : "No filters — all listings";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Save this search"
        tabIndex={-1}
        className="bg-card border border-border rounded-2xl shadow-elevated w-full max-w-sm"
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Bookmark className="w-4 h-4 text-primary" />
            <h3 className="font-display font-semibold text-base">Save This Search</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary transition-colors" aria-label="Close">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs text-muted-foreground block mb-1.5 font-medium">Search Name</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary transition-colors"
              placeholder="e.g. Athens 2-bed Apartments"
            />
          </div>

          <div className="bg-secondary/60 border border-border rounded-xl p-3">
            <p className="text-xs text-muted-foreground font-medium mb-1">Active filters</p>
            <p className="text-xs text-foreground/70 line-clamp-2">{summary}</p>
          </div>

          <button
            onClick={() => setEmailAlerts(v => !v)}
            className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl border transition-all ${
              emailAlerts
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-secondary text-muted-foreground hover:border-primary/40"
            }`}
          >
            {emailAlerts
              ? <Bell className="w-4 h-4 shrink-0" />
              : <BellOff className="w-4 h-4 shrink-0" />
            }
            <div className="text-left">
              <p className="text-xs font-semibold">{emailAlerts ? "Email alerts ON" : "Email alerts OFF"}</p>
              <p className="text-xs opacity-70">Get notified when new matches appear</p>
            </div>
          </button>
        </div>

        <div className="flex gap-2 px-5 pb-5">
          <Button variant="outline" className="border-border flex-1" onClick={onClose}>Cancel</Button>
          <Button
            className="bg-gradient-primary border-0 text-primary-foreground flex-1"
            onClick={handleSave}
            disabled={!name.trim() || createSavedSearch.isPending}
          >
            Save Search
          </Button>
        </div>
      </div>
    </div>
  );
}
