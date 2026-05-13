import { useState } from "react";
import { Link } from "react-router-dom";
import {
  LayoutGrid, Plus, Loader2, Edit2, Trash2, ChevronRight,
  FolderOpen, BarChart2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { PropertyCard } from "@/components/PropertyCard";
import {
  usePortfolios, usePortfolio, useCreatePortfolio, useUpdatePortfolio, useDeletePortfolio,
  type Portfolio, type PortfolioListing, type PortfolioWithListings,
} from "@/hooks/usePortfolios";
import type { Database } from "@/integrations/supabase/types";
import { useFavorites } from "@/hooks/useFavorites";
import { useAuth } from "@/contexts/AuthContext";
import { dbListingToCard } from "@/lib/listingUtils";
import { toast } from "sonner";
import { ProGate } from "@/components/gates/ProGate";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

/** Shape returned by useFavorites(): a favorites row with the joined listing. */
type FavoriteRow = Database["public"]["Tables"]["favorites"]["Row"] & {
  listings: Database["public"]["Tables"]["listings"]["Row"] | null;
};

// skipcq: JS-R1005 - Portfolio list actions share one confirmation and rename state for a compact dashboard page.
const Portfolios = () => {
  const { user } = useAuth();
  const { data: portfolios = [], isLoading } = usePortfolios();
  const { data: favorites = [] } = useFavorites();
  const createPortfolio = useCreatePortfolio();
  const deletePortfolio = useDeletePortfolio();
  const updatePortfolio = useUpdatePortfolio();

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [portfolioToDelete, setPortfolioToDelete] = useState<string | null>(null);

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

  const handleDelete = (id: string) => {
    setPortfolioToDelete(id);
  };

  const handleRename = (id: string) => {
    if (!editName.trim()) return;
    updatePortfolio.mutate({ id, updates: { name: editName.trim() } }, {
      onSuccess: () => {
        setEditingId(null);
        setEditName("");
      },
    });
  };

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <main className="flex-1 flex items-center justify-center p-8">
          <div className="text-center">
            <LayoutGrid className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h1 className="font-display text-xl font-semibold">Sign in to manage portfolios</h1>
            <p className="text-sm text-muted-foreground mt-2">Group properties for bulk analysis</p>
            <Button className="mt-4" asChild>
              <Link to="/login">Sign in</Link>
            </Button>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <main className="flex-1 container max-w-5xl mx-auto px-4 pt-16 pb-10">
        <ProGate>
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-display text-2xl font-bold">Portfolios</h1>
            <p className="text-sm text-muted-foreground mt-1">Group properties for bulk analysis and tracking</p>
          </div>
          <Button onClick={() => setShowCreate(true)} className="bg-gradient-primary border-0 text-primary-foreground gap-2">
            <Plus className="w-4 h-4" /> New Portfolio
          </Button>
        </div>

        {showCreate && (
          <div className="glass-card rounded-xl p-6 mb-6 border border-border">
            <h3 className="font-display font-semibold mb-4">Create portfolio</h3>
            <div className="flex gap-3">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Athens Buy-to-Let"
                className="flex-1 bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors"
              />
              <Button onClick={handleCreate} disabled={createPortfolio.isPending} className="bg-gradient-primary border-0 text-primary-foreground">
                {createPortfolio.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Create
              </Button>
              <Button variant="outline" className="border-border" onClick={() => setShowCreate(false)}>Cancel</Button>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : portfolios.length === 0 ? (
          <div className="glass-card rounded-xl p-12 text-center">
            <FolderOpen className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="font-semibold">No portfolios yet</h2>
            <p className="text-sm text-muted-foreground mt-2">Create a portfolio to group properties for analysis</p>
            <Button className="mt-4 bg-gradient-primary border-0 text-primary-foreground" onClick={() => setShowCreate(true)}>Create your first portfolio</Button>
          </div>
        ) : (
          <div className="space-y-8">
            {portfolios.map((p: Portfolio) => (
              <PortfolioDetail
                key={p.id}
                portfolioId={p.id}
                portfolio={p}
                favorites={favorites}
                onDelete={handleDelete}
                onRename={(id, name) => {
                  setEditingId(id);
                  setEditName(name);
                }}
                editingId={editingId}
                editName={editName}
                setEditName={setEditName}
                onSaveRename={handleRename}
                onCancelEdit={() => {
                  setEditingId(null);
                  setEditName("");
                }}
                updatePortfolio={updatePortfolio}
              />
            ))}
          </div>
        )}

        <div className="mt-8">
          <Button variant="outline" className="border-border" asChild>
            <Link to="/dashboard" className="gap-2">
              <ChevronRight className="w-4 h-4 rotate-180" /> Back to Dashboard
            </Link>
          </Button>
        </div>
        </ProGate>
      </main>
      <Footer />
      <ConfirmDialog
        open={Boolean(portfolioToDelete)}
        title="Delete portfolio"
        description="Delete this portfolio and remove its listing groupings?"
        confirmLabel="Delete"
        onConfirm={() => {
          if (portfolioToDelete) deletePortfolio.mutate(portfolioToDelete);
          setPortfolioToDelete(null);
        }}
        onCancel={() => setPortfolioToDelete(null)}
      />
    </div>
  );
};

// skipcq: JS-R1005 - Portfolio detail coordinates listing membership, rename, and add/remove controls in one repeated item.
const PortfolioDetail = ({
  portfolioId,
  portfolio,
  favorites,
  onDelete,
  onRename,
  editingId,
  editName,
  setEditName,
  onSaveRename,
  onCancelEdit,
  updatePortfolio,
}: {
  portfolioId: string;
  portfolio: Portfolio;
  favorites: FavoriteRow[];
  onDelete: (id: string) => void;
  onRename: (id: string, name: string) => void;
  editingId: string | null;
  editName: string;
  setEditName: (s: string) => void;
  onSaveRename: (id: string) => void;
  onCancelEdit: () => void;
  updatePortfolio: ReturnType<typeof useUpdatePortfolio>;
}) => {
  const { data: fullPortfolio } = usePortfolio(portfolioId);
  // fullPortfolio is the full join (listings included); portfolio is the
  // sidebar entry (no listings). Default to an empty listings[] so callers
  // don't have to null-check.
  const portfolioData: PortfolioWithListings = fullPortfolio ?? { ...portfolio, listings: [] };
  const [showAdd, setShowAdd] = useState(false);
  const listingIds = (portfolioData.listing_ids as string[]) || [];
  const listings = portfolioData.listings ?? [];
  const favListings = favorites
    .map((f) => f.listings)
    .filter((l): l is NonNullable<FavoriteRow["listings"]> => l != null && !listingIds.includes(l.id));

  const totalValue = listings.reduce((sum, l) => sum + Number(l?.price || 0), 0);

  const handleAdd = (listingId: string) => {
    const ids = [...listingIds, listingId];
    updatePortfolio.mutate({ id: portfolioData.id, updates: { listing_ids: ids } });
    setShowAdd(false);
  };

  const handleRemove = (listingId: string) => {
    const ids = listingIds.filter((id: string) => id !== listingId);
    updatePortfolio.mutate({ id: portfolioData.id, updates: { listing_ids: ids } });
  };

  return (
    <div className="glass-card rounded-xl overflow-hidden border border-border">
      <div className="p-5 flex items-center justify-between">
        <div>
          {editingId === portfolioData.id ? (
            <div className="flex items-center gap-2">
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="bg-secondary border border-border rounded-xl px-3 py-2 text-sm font-semibold text-foreground outline-none focus:border-primary transition-colors"
              />
              <Button size="sm" className="bg-gradient-primary border-0 text-primary-foreground" onClick={() => onSaveRename(portfolioData.id)}>Save</Button>
              <Button size="sm" variant="outline" className="border-border" onClick={onCancelEdit}>Cancel</Button>
            </div>
          ) : (
            <>
              <h3 className="font-display font-semibold text-lg">{portfolioData.name}</h3>
              <p className="text-sm text-muted-foreground mt-0.5">
                {listingIds.length} properties
                {totalValue > 0 && ` · €${totalValue.toLocaleString()} total`}
              </p>
            </>
          )}
        </div>
        <div className="flex items-center gap-1">
          {editingId !== portfolioData.id && (
            <>
              <Button variant="ghost" size="icon" onClick={() => onRename(portfolioData.id, portfolioData.name)} aria-label="Rename portfolio">
                <Edit2 className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => onDelete(portfolioData.id)} aria-label="Delete portfolio" className="text-destructive hover:text-destructive">
                <Trash2 className="w-4 h-4" />
              </Button>
            </>
          )}
        </div>
      </div>

      {listings.length > 0 && (
        <div className="border-t border-border px-5 py-4">
          <div className="flex items-center gap-2 mb-3">
            <BarChart2 className="w-4 h-4 text-muted-foreground" />
            <h4 className="text-sm font-medium">Properties</h4>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {listings.map((l: PortfolioListing) => (
              <div key={l.id} className="relative">
                <PropertyCard property={dbListingToCard(l)} />
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute top-2 right-2 bg-background/80 backdrop-blur-sm"
                  onClick={() => handleRemove(l.id)}
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="border-t border-border px-5 py-4 bg-muted/30">
        <Button variant="outline" size="sm" onClick={() => setShowAdd(!showAdd)}>
          {showAdd ? "Cancel" : "+ Add from saved"}
        </Button>
        {showAdd && favListings.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {favListings.slice(0, 8).map((l) => (
              <Button key={l.id} variant="secondary" size="sm" onClick={() => handleAdd(l.id)}>
                + {l.title?.slice(0, 25)}...
              </Button>
            ))}
          </div>
        )}
        {showAdd && favListings.length === 0 && (
          <p className="text-xs text-muted-foreground mt-2">
            No saved properties. <Link to="/listings" className="underline text-primary hover:no-underline">Browse listings</Link> and save some to add here.
          </p>
        )}
      </div>
    </div>
  );
};

export default Portfolios;
