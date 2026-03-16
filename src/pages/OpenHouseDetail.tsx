import { useState, useEffect, useMemo } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  MapPin, Bed, Bath, Square, Calendar, ChevronLeft, Eye,
  Pencil, Pause, Play, Trash2, Loader2, MessageCircle, Euro, Users
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import OpenHouseRegistrationDialog from "@/components/OpenHouseRegistrationDialog";
import OpenHouseAssetControlPanel from "@/components/OpenHouseAssetControlPanel";
import OpenHouseOfferDialog from "@/components/OpenHouseOfferDialog";
import { useListing } from "@/hooks/useListings";
import { useAuth } from "@/contexts/AuthContext";
import { useUpdateListing, useDeleteListing } from "@/hooks/useListings";
import { useOpenHouseSettings, useOpenHouseRegistrations, useOpenHouseOffers } from "@/hooks/useOpenHouseAssetControl";
import { toast } from "sonner";

/**
 * Open House detail page — clean, fast UI for NPL managers (ad owners).
 * Streamlined view for managing open house listings.
 */
export default function OpenHouseDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isMock = !!id && ["mock-open-1", "mock-open-2", "mock-open-3"].includes(id);
  const { data: listing, isLoading } = useListing(isMock ? "" : (id || ""));
  const updateListing = useUpdateListing();
  const deleteListing = useDeleteListing();
  const [regOpen, setRegOpen] = useState(false);
  const [offerOpen, setOfferOpen] = useState(false);
  const [editingDate, setEditingDate] = useState(false);
  const [dateInput, setDateInput] = useState("");

  const { data: assetSettings } = useOpenHouseSettings(id || undefined);
  const { data: registrations = [] } = useOpenHouseRegistrations(id || undefined, false);
  const { data: offers = [] } = useOpenHouseOffers(id || undefined);
  const hasAssetControl = !!assetSettings;

  const mockListing = useMemo(() => {
    if (!isMock || !id) return null;
    const base = {
      listing_type: "open_house",
      status: "active",
      views_count: 132,
      bedrooms: 2,
      bathrooms: 2,
      sqm: 135,
      year_built: 2015,
      description: "Bright modern apartment with large balcony, close to Kifisia center and metro. Ideal for couples or small families looking for quiet living with quick access to the city.",
    };
    if (id === "mock-open-1") {
      return {
        id,
        title: "Modern 2BR in Kifisia",
        address: "Kifisia Center",
        city: "Athens",
        price: 420000,
        cover_image_url: "https://images.unsplash.com/photo-1505691938895-1758d7feb511?w=800&q=60",
        open_house_date: new Date().toISOString(),
        ...base,
      };
    }
    if (id === "mock-open-2") {
      return {
        id,
        title: "Sea-view Villa in Vouliagmeni",
        address: "Panorama Vouliagmeni",
        city: "Athens Riviera",
        price: 1450000,
        cover_image_url: "https://images.unsplash.com/photo-1507089947368-19c1da9775ae?w=800&q=60",
        open_house_date: new Date().toISOString(),
        bedrooms: 4,
        bathrooms: 4,
        sqm: 280,
        year_built: 2020,
        views_count: 89,
        description: "Luxury villa with unobstructed sea views, infinity pool, and generous outdoor spaces — perfect for entertaining and weekend escapes.",
        listing_type: "open_house",
        status: "active",
      };
    }
    if (id === "mock-open-3") {
      return {
        id,
        title: "Loft Near Aristotelous Square",
        address: "City Center",
        city: "Thessaloniki",
        price: 310000,
        cover_image_url: "https://images.unsplash.com/photo-1502672023488-70e25813eb80?w=800&q=60",
        open_house_date: new Date().toISOString(),
        bedrooms: 1,
        bathrooms: 1,
        sqm: 107,
        year_built: 2010,
        views_count: 54,
        description: "Industrial-style loft a short walk from Aristotelous Square — ideal pied-à-terre or investment in Thessaloniki's city center.",
        listing_type: "open_house",
        status: "active",
      };
    }
    return null;
  }, [id, isMock]);

  const db = (isMock ? mockListing : listing) as any;
  const myReg = registrations.find((r: any) => r.requester_id === user?.id);
  const myOffer = offers.find((o: any) => o.bidder_id === user?.id);
  const isOwner = !isMock && user?.id && db?.owner_id === user.id;

  useEffect(() => {
    if (isMock) return;
    if (db?.listing_type === "open_house") return;
    if (db?.listing_type && db.listing_type !== "open_house") {
      navigate(`/property/${id}`, { replace: true });
    }
  }, [db?.listing_type, id, navigate, isMock]);

  useEffect(() => {
    if (db?.open_house_date) {
      const d = new Date(db.open_house_date);
      setDateInput(d.toISOString().slice(0, 16));
    }
  }, [db?.open_house_date]);

  const saveDate = async () => {
    if (!id || !dateInput) return;
    try {
      await updateListing.mutateAsync({
        id,
        updates: { open_house_date: new Date(dateInput).toISOString() },
      });
      setEditingDate(false);
      toast.success("Open house date updated");
    } catch {
      toast.error("Could not update date");
    }
  };

  const toggleStatus = () => {
    if (!id) return;
    const next = db?.status === "active" ? "paused" : "active";
    updateListing.mutate({ id, updates: { status: next } });
    toast.success(next === "active" ? "Listing activated" : "Listing paused");
  };

  const handleDelete = () => {
    if (!id || !confirm("Delete this open house listing?")) return;
    deleteListing.mutate(id);
    toast.success("Listing deleted");
    navigate("/open-houses");
  };

  if (!isMock && (isLoading || !db)) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const price = Number(db.price ?? 0);
  const sqm = Number(db.sqm ?? 0);
  const imgs: string[] = db.cover_image_url ? [db.cover_image_url] : [];
  if (db.listing_images?.length) {
    const sorted = [...db.listing_images].sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0));
    sorted.forEach((img: any) => imgs.push(img.url));
  }
  const openHouseDate = db.open_house_date ? new Date(db.open_house_date) : null;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-16">
        <div className="container max-w-4xl py-6">
          {/* Back */}
          <Link to="/open-houses" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4">
            <ChevronLeft className="w-4 h-4" /> Back to Open Houses
          </Link>

          {/* Owner quick actions */}
          {isOwner && (
            <div className="flex flex-wrap gap-2 mb-6 p-4 rounded-xl bg-card border border-border">
              <span className="text-xs font-semibold text-muted-foreground uppercase self-center mr-2">Manage</span>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setEditingDate(!editingDate)}>
                <Pencil className="w-3.5 h-3.5" /> Edit date
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={toggleStatus}>
                {db.status === "active" ? <><Pause className="w-3.5 h-3.5" /> Pause</> : <><Play className="w-3.5 h-3.5" /> Activate</>}
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5 text-destructive border-destructive/40 hover:bg-destructive/10" onClick={handleDelete}>
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </Button>
              <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
                <Eye className="w-3.5 h-3.5" /> {db.views_count ?? 0} views
              </span>
            </div>
          )}

          {/* Owner: Asset Control panel inline */}
          {isOwner && id && (
            <div className="mb-6">
              <OpenHouseAssetControlPanel listingId={id} isOwner={true} />
            </div>
          )}

          {/* Edit date inline */}
          {isOwner && editingDate && (
            <div className="flex flex-wrap items-center gap-2 mb-4 p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
              <input
                type="datetime-local"
                value={dateInput}
                onChange={(e) => setDateInput(e.target.value)}
                className="px-3 py-2 rounded-lg border border-border bg-background text-sm"
              />
              <Button size="sm" onClick={saveDate} disabled={updateListing.isPending}>
                {updateListing.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditingDate(false)}>Cancel</Button>
            </div>
          )}

          <div className="grid md:grid-cols-3 gap-6">
            {/* Main content */}
            <div className="md:col-span-2 space-y-6">
              {/* Image */}
              <div className="aspect-[4/3] rounded-xl overflow-hidden bg-secondary">
                {imgs[0] ? (
                  <img src={imgs[0]} alt={db.title} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                    <MapPin className="w-12 h-12 opacity-30" />
                  </div>
                )}
              </div>

              {/* Open house date — prominent */}
              {openHouseDate && (
                <div className="flex items-center gap-4 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/25">
                  <Calendar className="w-10 h-10 text-emerald-600 shrink-0" />
                  <div>
                    <div className="text-xs font-bold text-emerald-700 uppercase tracking-wider">Open House</div>
                    <div className="font-display text-lg font-bold text-foreground">
                      {openHouseDate.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {openHouseDate.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                      {hasAssetControl ? " — Pre-register to book a timeslot" : " — No appointment needed"}
                    </div>
                  </div>
                </div>
              )}

              {/* Title & key details */}
              <div>
                <h1 className="font-display text-xl sm:text-2xl font-bold mb-2">{db.title}</h1>
                {db.address && <p className="flex items-center gap-1.5 text-muted-foreground text-sm"><MapPin className="w-4 h-4 shrink-0" />{db.address}, {db.city}</p>}
              </div>

              {/* Specs row */}
              <div className="flex flex-wrap gap-4 text-sm">
                {db.bedrooms != null && <span className="flex items-center gap-1.5"><Bed className="w-4 h-4 text-muted-foreground" /> {db.bedrooms} bed</span>}
                {db.bathrooms != null && <span className="flex items-center gap-1.5"><Bath className="w-4 h-4 text-muted-foreground" /> {db.bathrooms} bath</span>}
                {sqm > 0 && <span className="flex items-center gap-1.5"><Square className="w-4 h-4 text-muted-foreground" /> {sqm} m²</span>}
              </div>

              {db.description && (
                <p className="text-sm text-muted-foreground leading-relaxed">{db.description}</p>
              )}
            </div>

          {/* Sidebar */}
            <div className="space-y-4">
              <div className="glass-card rounded-xl p-5 border border-border">
                <div className="font-display text-2xl font-bold text-primary mb-1">
                  €{price.toLocaleString()}
                </div>
                {sqm > 0 && <p className="text-xs text-muted-foreground">€{Math.round(price / sqm).toLocaleString()}/m²</p>}

                {/* Real listing: full registration / offer flow */}
                {!isMock && !isOwner && user && (
                  <div className="mt-4 space-y-2">
                    {myReg && (
                      <div className={`rounded-lg px-3 py-2 text-xs font-medium ${
                        myReg.status === "approved" ? "bg-emerald-500/15 text-emerald-700" :
                        myReg.status === "pending" ? "bg-amber-500/15 text-amber-700" :
                        "bg-muted text-muted-foreground"
                      }`}>
                        {myReg.status === "approved" ? "✓ Approved to attend" : myReg.status === "pending" ? "⏳ Registration pending" : `Status: ${myReg.status}`}
                      </div>
                    )}
                    <Button className="w-full gap-2" onClick={() => setRegOpen(true)} variant={myReg ? "outline" : "default"}>
                      <Users className="w-4 h-4" /> {myReg ? "View registration" : "Pre-register for Open House"}
                    </Button>
                    {myOffer ? (
                      <button
                        type="button"
                        onClick={() => setOfferOpen(true)}
                        className="w-full rounded-lg px-3 py-2 text-left text-xs bg-secondary/50 hover:bg-secondary border border-border transition-colors"
                      >
                        Your offer: {myOffer.status === "submitted" ? "Sealed" : `€${Number(myOffer.amount).toLocaleString()}`} · View
                      </button>
                    ) : (
                      <Button variant="outline" className="w-full gap-2" onClick={() => setOfferOpen(true)}>
                        <Euro className="w-4 h-4" /> Submit Offer
                      </Button>
                    )}
                    <Button variant="outline" className="w-full gap-2" asChild>
                      <Link to={`/messages`} state={{ openConversationId: null }}>
                        <MessageCircle className="w-4 h-4" /> Contact
                      </Link>
                    </Button>
                  </div>
                )}
                {!isMock && !isOwner && !user && (
                  <Button className="w-full mt-4 gap-2" asChild>
                    <Link to="/login">Sign in to contact</Link>
                  </Button>
                )}

                {/* Mock listing: explain the flow without hitting backend */}
                {isMock && (
                  <div className="mt-4 space-y-2 text-xs text-muted-foreground">
                    <p className="font-semibold text-foreground">Demo only</p>
                    <p>
                      This is a sample open house property page. In a real listing you would see:
                    </p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>Buttons to pre-register for a timeslot</li>
                      <li>The status of your registration and offer</li>
                      <li>Actions to submit a sealed offer after the visit</li>
                      <li>A direct messaging link with the listing agent or owner</li>
                    </ul>
                    <p className="mt-1">
                      Use the Open Houses dashboard section to test the full asset control, registrations, and offers flow on real data.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <OpenHouseRegistrationDialog
        open={regOpen}
        onClose={() => setRegOpen(false)}
        listingId={id!}
        listingTitle={db.title}
        hasAssetControl={hasAssetControl}
      />
      <OpenHouseOfferDialog
        open={offerOpen}
        onClose={() => setOfferOpen(false)}
        listingId={id!}
        listingTitle={db.title}
        listingPrice={price}
      />

      <Footer />
    </div>
  );
}
