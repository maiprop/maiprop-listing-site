import { useState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Link } from "react-router-dom";
import {
  TrendingUp, Plus, ExternalLink, Edit2, Trash2, LayoutGrid, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PropertyCard } from "@/components/PropertyCard";
import { dbListingToCard } from "@/lib/listingUtils";
import { toast } from "sonner";
import {
  usePortfolios,
  useCreatePortfolio,
  useUpdatePortfolio,
  useDeletePortfolio,
  type Portfolio,
  type PortfolioListing,
} from "@/hooks/usePortfolios";
import { useFavorites } from "@/hooks/useFavorites";

type PortfolioItem = Portfolio & { listings?: PortfolioListing[] };
type FavoriteWithListing = { listing_id: string; listings?: { id: string; title: string; city?: string | null } | null };

export default function PortfoliosTab() {
  const { data: portfolios = [], isLoading: portfoliosLoading } = usePortfolios();
  const { data: favorites = [] } = useFavorites();
  const createPortfolio = useCreatePortfolio();
  const updatePortfolio = useUpdatePortfolio();
  const deletePortfolio = useDeletePortfolio();

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [addFromSavedPortfolioId, setAddFromSavedPortfolioId] = useState<string | null>(null);

  const handleCreate = () => {
    if (!newName.trim()) {
      toast.error("Portfolio name is required");
      return;
    }
    createPortfolio.mutate(newName.trim(), {
      onSuccess: () => {
        setNewName("");
        setShowCreate(false);
      },
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-primary" /> Portfolios
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Group properties for bulk analysis and tracking
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="border-border gap-2" asChild>
            <Link to="/portfolios">
              <ExternalLink className="w-4 h-4" /> Full View
            </Link>
          </Button>
          <Button
            className="bg-gradient-primary border-0 text-primary-foreground gap-2"
            onClick={() => setShowCreate(true)}
          >
            <Plus className="w-4 h-4" /> New Portfolio
          </Button>
        </div>
      </div>

      {showCreate && (
        <div className="glass-card rounded-xl p-6 border border-border">
          <h3 className="font-display font-semibold mb-4">Create portfolio</h3>
          <div className="flex gap-3">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Athens Buy-to-Let"
              className="flex-1 bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors"
            />
            <Button
              onClick={handleCreate}
              disabled={createPortfolio.isPending}
              className="bg-gradient-primary border-0 text-primary-foreground"
            >
              {createPortfolio.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : null}{" "}
              Create
            </Button>
            <Button
              variant="outline"
              className="border-border"
              onClick={() => setShowCreate(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {portfoliosLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-7 h-7 animate-spin text-primary" />
        </div>
      ) : portfolios.length === 0 ? (
        <div className="glass-card rounded-xl p-12 text-center">
          <LayoutGrid className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="font-semibold">No portfolios yet</h2>
          <p className="text-sm text-muted-foreground mt-2 mb-4">
            Create a portfolio to group properties for analysis
          </p>
          <Button
            className="bg-gradient-primary border-0 text-primary-foreground"
            onClick={() => setShowCreate(true)}
          >
            Create your first portfolio
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {portfolios.map((p: PortfolioItem) => {
            const listingIds: string[] = p.listing_ids || [];
            const totalValue = (p.listings || []).reduce(
              (s: number, l: PortfolioListing) => s + Number(l?.price || 0),
              0
            );
            const isEditing = editingId === p.id;
            return (
              <div
                key={p.id}
                className="glass-card rounded-xl border border-border overflow-hidden"
              >
                <div className="p-5 flex items-center justify-between gap-4">
                  {isEditing ? (
                    <div className="flex items-center gap-2 flex-1">
                      <input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="flex-1 bg-secondary border border-border rounded-xl px-3 py-2 text-sm font-semibold text-foreground outline-none focus:border-primary transition-colors"
                      />
                      <Button
                        size="sm"
                        className="bg-gradient-primary border-0 text-primary-foreground"
                        onClick={() => {
                          if (!editName.trim()) return;
                          updatePortfolio.mutate(
                            { id: p.id, updates: { name: editName.trim() } },
                            {
                              onSuccess: () => {
                                setEditingId(null);
                                setEditName("");
                              },
                            }
                          );
                        }}
                      >
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-border"
                        onClick={() => {
                          setEditingId(null);
                          setEditName("");
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <div className="flex-1 min-w-0">
                      <h3 className="font-display font-semibold">{p.name}</h3>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {listingIds.length} properties
                        {totalValue > 0 && ` · €${totalValue.toLocaleString()} total`}
                      </p>
                    </div>
                  )}
                  {!isEditing && (
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setEditingId(p.id);
                          setEditName(p.name);
                        }}
                        aria-label="Rename"
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Delete portfolio"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setDeleteTarget(p.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </div>
                {(p.listings || []).length > 0 && (
                  <div className="border-t border-border px-5 py-3 bg-muted/20">
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                      {(p.listings || []).map((l: PortfolioListing) => (
                        <div key={l.id} className="relative">
                          <PropertyCard property={dbListingToCard(l)} />
                          <Button
                            variant="ghost"
                            size="sm"
                            className="absolute top-2 right-2 bg-background/80 backdrop-blur-sm text-xs"
                            onClick={() => {
                              const ids = listingIds.filter((id: string) => id !== l.id);
                              updatePortfolio.mutate({ id: p.id, updates: { listing_ids: ids } });
                            }}
                          >
                            Remove
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="border-t border-border px-5 py-3 bg-muted/30">
                  {addFromSavedPortfolioId === p.id ? (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-foreground mb-2">
                        Add from Saved Properties:
                      </p>
                      {favorites.filter(
                        (f: FavoriteWithListing) => f.listings && !listingIds.includes(f.listings.id)
                      ).length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          No saved properties available to add.
                        </p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {favorites
                            .filter(
                              (f: FavoriteWithListing) => f.listings && !listingIds.includes(f.listings.id)
                            )
                            .map((f: FavoriteWithListing) => {
                              const listing = f.listings;
                              if (!listing) return null;
                              return (
                              <button
                                key={listing.id}
                                className="text-xs px-2.5 py-1.5 bg-secondary border border-border rounded-lg hover:border-primary/50 hover:bg-primary/10 transition-colors truncate max-w-[200px]"
                                onClick={() => {
                                  const newIds = [...listingIds, listing.id];
                                  updatePortfolio.mutate(
                                    { id: p.id, updates: { listing_ids: newIds } },
                                    {
                                      onSuccess: () => toast.success("Added to portfolio"),
                                    }
                                  );
                                }}
                              >
                                + {listing.title || listing.city}
                              </button>
                            );
                            })}
                        </div>
                      )}
                      <button
                        onClick={() => setAddFromSavedPortfolioId(null)}
                        className="text-xs text-muted-foreground hover:text-foreground mt-1 underline underline-offset-2"
                      >
                        Close
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setAddFromSavedPortfolioId(p.id)}
                      className="text-xs text-primary underline underline-offset-2 hover:opacity-80 transition-opacity"
                    >
                      + Add from saved properties
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete portfolio?"
        description="This will permanently remove the portfolio and all its saved listings."
        confirmLabel="Delete"
        onConfirm={() => { if (deleteTarget) deletePortfolio.mutate(deleteTarget); setDeleteTarget(null); }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
