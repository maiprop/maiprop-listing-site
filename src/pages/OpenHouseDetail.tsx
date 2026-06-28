import { useState, useEffect } from "react";
import { useModal } from "@/hooks/useModal";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  MapPin, Calendar, ChevronLeft, ChevronRight, Eye,
  Pencil, Pause, Play, Trash2, Loader2, MessageCircle, Euro, Users, LayoutDashboard,
  Home, Wrench, Lock, ExternalLink, Heart, Share2,
  Check,
} from "lucide-react";
import { walkScoreLabel, walkScoreColour } from "@/lib/walkScore";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import OpenHouseRegistrationDialog from "@/components/OpenHouseRegistrationDialog";
import OpenHouseAssetControlPanel from "@/components/OpenHouseAssetControlPanel";
import OpenHouseOfferDialog from "@/components/OpenHouseOfferDialog";
import PropertyMiniMap from "@/components/PropertyMiniMap";
import PropertyValuation from "@/components/PropertyValuation";
import NeighbourhoodReport from "@/components/NeighbourhoodReport";
import { PropertyReportCard } from "@/components/property/PropertyReportCard";
import { useListing, useTrackListingView, useUpdateListing, useDeleteListing, type ListingWithJoins } from "@/hooks/useListings";
import { useAuth } from "@/contexts/AuthContext";
import { useFavorites, useToggleFavorite } from "@/hooks/useFavorites";
import { useOpenHouseSettings, useOpenHouseRegistrations, useOpenHouseOffers } from "@/hooks/useOpenHouseAssetControl";
import { useStartConversation } from "@/hooks/useMessages";
import { useSubscription } from "@/hooks/useSubscription";
import { toast } from "sonner";
import { getStreetViewProxyUrl } from "@/lib/config";
import { Section, SectionHeader, FeatureSection } from "@/components/property/DetailPrimitives";
import { buildPropertyFeatureGroups, buildDetailGroups } from "@/lib/propertyFeatures";
import { PropertyDetailsAndEnergy } from "@/components/property/PropertyDetailsAndEnergy";
import { PropertyDescriptionSection } from "@/components/property/PropertyDescriptionSection";
import { PropertyAIInsightsSection } from "@/components/property/PropertyAIInsightsSection";
import { getPlanLimitErrorMessage } from "@/lib/planLimitErrors";
import { PropertyValuationLockedCard } from "@/components/property/PropertyValuationLockedCard";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { usePropertyAIInsights } from "@/hooks/usePropertyAIInsights";
import { PropertyHeroSpecsBar } from "@/components/property/PropertyHeroSpecsBar";
import { buildListingHeroSpecs } from "@/components/property/propertyHeroSpecs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// skipcq: JS-0067 - React route component is intentionally module-scoped for React Router.
export default function OpenHouseDetail() { // skipcq: JS-R1005 - Open-house detail coordinates listing data, registration, offers, and owner controls.
  const { i18n } = useTranslation();
  const isGreek = i18n.language?.toLowerCase().startsWith("el") ?? false;
  const dateLocale = isGreek ? "el-GR" : "en-GB";
  const { id } = useParams();
  const hasValidListingId = Boolean(id && UUID_RE.test(id));
  const listingIdParam = hasValidListingId ? id ?? "" : "";
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isPro } = useSubscription();
  const { data: listing, isLoading } = useListing(listingIdParam, { publicScope: true });
  const trackView = useTrackListingView();
  const updateListing = useUpdateListing();
  const deleteListing = useDeleteListing();
  const modal = useModal<"reg" | "offer">();
  const [editingDate, setEditingDate] = useState(false);
  const [dateInput, setDateInput] = useState("");
  const [currentImage, setCurrentImage] = useState(0);
  const [walkScore, setWalkScore] = useState<number | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const { data: assetSettings } = useOpenHouseSettings(listingIdParam || undefined);
  const { data: registrations = [] } = useOpenHouseRegistrations(listingIdParam || undefined, false);
  const { data: offers = [] } = useOpenHouseOffers(listingIdParam || undefined);
  const hasAssetControl = !!assetSettings;
  const startConversation = useStartConversation();

  useEffect(() => {
    if (listingIdParam && listing) trackView.mutate(listingIdParam);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listingIdParam, !!listing]);

  const db = listing as ListingWithJoins;
  const {
    aiInsightsData,
    aiInsightsLoading,
    aiInsightsLoaded,
    aiInsightsQuota,
    aiInsightsQuotaLoading,
    loadAiInsights,
  } = usePropertyAIInsights(db, user, listingIdParam || undefined, isPro);
  const myReg = registrations.find(r => r.requester_id === user?.id);
  const myOffer = offers.find(o => o.bidder_id === user?.id);
  const isOwner = !!(user?.id && db?.owner_id === user.id);
  const { data: favorites = [] } = useFavorites();
  const toggleFav = useToggleFavorite();
  const isFavorited = !!listingIdParam && favorites.some(f => f.listing_id === listingIdParam);
  const handleFavorite = () => {
    if (!user) { toast.error(isGreek ? "Συνδεθείτε για να αποθηκεύσετε ακίνητα" : "Sign in to save properties"); return; }
    if (listingIdParam) toggleFav.mutate({ listing_id: listingIdParam, isFavorited });
  };
  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) { try { await navigator.share({ title: db?.title, url }); } catch (_err: unknown) { /* share cancelled or not supported */ } }
    else { await navigator.clipboard.writeText(url); toast.success(isGreek ? "Ο σύνδεσμος αντιγράφηκε" : "Link copied"); }
  };

  // UX: Contact only after approval; Offer only after attended + open house date passed
  const openHouseDate = db?.open_house_date ? new Date(db.open_house_date) : null;
  const ohDatePassed = openHouseDate ? openHouseDate < new Date() : false;
  const registrationClosed = !myReg && (ohDatePassed || db?.status !== "active");
  const canContact = !!myReg && ["approved", "attended"].includes(myReg.status);
  const pofVerifiedForOffer = !assetSettings?.require_proof_of_funds || myReg?.pof_verified_status === "verified";
  const canSubmitOffer = !!myReg && myReg.status === "attended" && ohDatePassed && pofVerifiedForOffer;

  const handleContact = async () => { // skipcq: JS-R1005 - Contact action checks registration and conversation fallback paths.
    const ownerId = db?.owner_id;
    if (!user || !ownerId || !listingIdParam) return;
    try {
      const convId = await startConversation.mutateAsync({ other_user_id: ownerId, listing_id: listingIdParam });
      navigate("/messages", { state: { openConversationId: convId } });
    } catch (err: unknown) {
      toast.error(getPlanLimitErrorMessage(err) ?? (isGreek ? "Δεν ήταν δυνατή η έναρξη συνομιλίας" : "Could not start conversation"));
    }
  };

  useEffect(() => {
    // Redirect if not an open house listing
    if (db?.listing_type && db.listing_type !== "open_house") {
      navigate(`/property/${listingIdParam}`, { replace: true });
    }
  }, [db?.listing_type, listingIdParam, navigate]);

  useEffect(() => {
    if (db?.open_house_date) {
      const d = new Date(db.open_house_date);
      setDateInput(d.toISOString().slice(0, 16));
    }
  }, [db?.open_house_date]);

  const saveDate = async () => {
    if (!listingIdParam || !dateInput) return;
    try {
      await updateListing.mutateAsync({
        id: listingIdParam,
        updates: { open_house_date: new Date(dateInput).toISOString() },
      });
      setEditingDate(false);
      toast.success(isGreek ? "Η ημερομηνία της ανοιχτής επίσκεψης ενημερώθηκε" : "Open house date updated");
    } catch (_err: unknown) {
      toast.error(isGreek ? "Δεν ήταν δυνατή η ενημέρωση της ημερομηνίας" : "Could not update date");
    }
  };

  const toggleStatus = () => {
    if (!listingIdParam) return;
    const next = db?.status === "active" ? "paused" : "active";
    updateListing.mutate({ id: listingIdParam, updates: { status: next } });
    toast.success(next === "active" ? (isGreek ? "Η αγγελία ενεργοποιήθηκε" : "Listing activated") : (isGreek ? "Η αγγελία τέθηκε σε παύση" : "Listing paused"));
  };

  const handleDelete = () => {
    setDeleteConfirmOpen(true);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!hasValidListingId || !db) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center px-4 pt-20 pb-12">
          <div className="text-center max-w-md">
            <h2 className="font-display font-bold text-xl mb-3">{isGreek ? "Η αγγελία δεν βρέθηκε" : "Listing not found"}</h2>
            <p className="text-muted-foreground text-sm mb-6">
              {isGreek ? "Η συγκεκριμένη ανοιχτή επίσκεψη δεν υπάρχει ή έχει αφαιρεθεί." : "This open house listing does not exist or has been removed."}
            </p>
            <Button variant="outline" asChild>
              <Link to="/open-houses">
                <ChevronLeft className="w-4 h-4 mr-1" />
                {isGreek ? "Πίσω στις ανοιχτές επισκέψεις" : "Back to Open Houses"}
              </Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const listingId = db.id;
  const price = Number(db.price ?? 0);
  const sqm = Number(db.sqm ?? 0);
  const address = db.address ?? db.city;
  let imgs: string[] = db.cover_image_url ? [db.cover_image_url] : [];
  if (db.listing_images?.length) {
    const sorted = [...db.listing_images].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    sorted.forEach((img) => imgs.push(img.url));
  }
  const streetViewFallback = (db.latitude != null && db.longitude != null)
    ? getStreetViewProxyUrl({ lat: Number(db.latitude), lng: Number(db.longitude) })
    : (db.address || db.city) ? getStreetViewProxyUrl({ location: `${db.address ?? ""} ${db.city ?? ""}`.trim() }) : null;
  if (!imgs.length && streetViewFallback) imgs = [streetViewFallback];

  const pricePerSqm = sqm > 0 ? Math.round(price / sqm) : null;
  const isRentalOpenHouse = db.open_house_transaction_type === "rent";
  const rentalPriceSuffix = isRentalOpenHouse ? (isGreek ? "/μήνα" : "/mo") : "";
  const isLandType = ["land", "plot"].includes(db.property_type ?? "");
  const detailGroups = buildDetailGroups(db, price, sqm, pricePerSqm, isLandType);
  const heroSpecs = buildListingHeroSpecs(db);
  const { internalFeatures, externalFeatures, constructionFeatures, suitabilityFeatures } = buildPropertyFeatureGroups(db);
  const city = db.city || "";

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-16">
        {/* Breadcrumb — same as PropertyDetail */}
        <div className="container py-2 sm:py-3">
          <div className="flex items-center gap-1 sm:gap-1.5 text-xs text-muted-foreground overflow-x-auto scrollbar-none">
            <Link to="/" className="hover:text-foreground transition-colors shrink-0">{isGreek ? "Αρχική" : "Home"}</Link>
            <ChevronRight className="w-3 h-3 shrink-0" />
            <Link to="/open-houses" className="hover:text-foreground transition-colors shrink-0">{isGreek ? "Ανοιχτές επισκέψεις" : "Open Houses"}</Link>
            <ChevronRight className="w-3 h-3 shrink-0" />
            <span className="text-foreground truncate font-medium">{db.title}</span>
          </div>
        </div>

        <div className="container pb-24 lg:pb-10">
          {/* Owner manage bar */}
          {isOwner && (
            <div className="flex flex-wrap gap-2 mb-6 p-4 rounded-xl bg-card border border-border">
              <span className="text-xs font-semibold text-muted-foreground uppercase self-center mr-2">{isGreek ? "Διαχείριση" : "Manage"}</span>
              <Button size="sm" variant="outline" className="gap-1.5" asChild>
                <Link to={`/listings/${id}/edit`}>
                  <Pencil className="w-3.5 h-3.5" /> {isGreek ? "Επεξεργασία αγγελίας" : "Edit listing"}
                </Link>
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setEditingDate(!editingDate)}>
                <Calendar className="w-3.5 h-3.5" /> {isGreek ? "Αλλαγή ημερομηνίας" : "Edit date"}
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={toggleStatus}>
                {db.status === "active" ? <><Pause className="w-3.5 h-3.5" /> {isGreek ? "Παύση" : "Pause"}</> : <><Play className="w-3.5 h-3.5" /> {isGreek ? "Ενεργοποίηση" : "Activate"}</>}
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5 text-destructive border-destructive/40 hover:bg-destructive/10" onClick={handleDelete}>
                <Trash2 className="w-3.5 h-3.5" /> {isGreek ? "Διαγραφή" : "Delete"}
              </Button>
              {isOwner && editingDate && (
                <div className="flex flex-wrap items-center gap-2 w-full mt-2 p-3 rounded-lg bg-primary/5 border border-primary/20">
                  <input type="datetime-local" value={dateInput} onChange={(e) => setDateInput(e.target.value)} className="px-3 py-2 rounded-lg border border-border bg-background text-sm" />
                  <Button size="sm" onClick={saveDate} disabled={updateListing.isPending}>{updateListing.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : (isGreek ? "Αποθήκευση" : "Save")}</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingDate(false)}>{isGreek ? "Άκυρο" : "Cancel"}</Button>
                </div>
              )}
            </div>
          )}

          {/* Owner: Asset Control panel */}
          {isOwner && id && (
            <div className="mb-6">
              <OpenHouseAssetControlPanel
                listingId={id}
                isOwner={true}
                listingPrice={db?.price ?? null}
                openHouseTransactionType={isRentalOpenHouse ? "rent" : "sale"}
              />
            </div>
          )}

          <div className="grid lg:grid-cols-[1fr_340px] gap-6 lg:gap-8">
            {/* Left column — same structure as PropertyDetail */}
            <div className="space-y-5">
              {/* Gallery — 16:9 like buy property */}
              <div className="relative rounded-2xl overflow-hidden aspect-[16/9] bg-secondary group shadow-elevated">
                {imgs[0] ? (
                  <img src={imgs[currentImage] || imgs[0]} alt={db.title} className="w-full h-full object-cover transition-opacity duration-300" />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-secondary">
                    <Home className="w-12 h-12 text-muted-foreground/30" />
                    <p className="text-xs text-muted-foreground">{isGreek ? "Δεν υπάρχουν φωτογραφίες" : "No photos"}</p>
                  </div>
                )}
                <div className="absolute top-4 left-4 flex gap-2">
                  <span className="bg-gradient-primary text-primary-foreground text-xs font-bold px-3 py-1.5 rounded-full shadow-sm">
                    {isGreek ? "ΑΝΟΙΧΤΗ ΕΠΙΣΚΕΨΗ" : "OPEN HOUSE"}
                  </span>
                </div>
                {imgs.length > 1 && (
                  <>
                    <button className="absolute left-3 top-1/2 -translate-y-1/2 min-h-[44px] min-w-[44px] flex items-center justify-center p-2.5 rounded-full bg-background/70 backdrop-blur-md hover:bg-background/90 transition-all shadow-lg" onClick={() => setCurrentImage((p) => (p - 1 + imgs.length) % imgs.length)} aria-label={isGreek ? "Προηγούμενη" : "Previous"}>
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button className="absolute right-3 top-1/2 -translate-y-1/2 min-h-[44px] min-w-[44px] flex items-center justify-center p-2.5 rounded-full bg-background/70 backdrop-blur-md hover:bg-background/90 transition-all shadow-lg" onClick={() => setCurrentImage((p) => (p + 1) % imgs.length)} aria-label={isGreek ? "Επόμενη" : "Next"}>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </>
                )}
                <div className="absolute top-4 right-4 flex gap-2">
                  <button className={`min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full backdrop-blur-md shadow transition-all ${isFavorited ? "bg-destructive text-white" : "bg-background/70 hover:bg-background/90"}`} onClick={handleFavorite} aria-label={isFavorited ? (isGreek ? "Αφαίρεση από αποθηκευμένα" : "Remove from saved") : (isGreek ? "Αποθήκευση ακινήτου" : "Save property")}>
                    <Heart className={`w-4 h-4 ${isFavorited ? "fill-white" : ""}`} />
                  </button>
                  <button onClick={handleShare} className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full bg-background/70 backdrop-blur-md hover:bg-background/90 shadow transition-all" aria-label={isGreek ? "Κοινοποίηση" : "Share"}>
                    <Share2 className="w-4 h-4" />
                  </button>
                </div>
                {imgs.length > 0 && (
                  <>
                    <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-background/60 to-transparent pointer-events-none" />
                    <div className="absolute bottom-3 right-4 bg-background/70 backdrop-blur-md px-2.5 py-1 rounded-full text-xs font-medium">{currentImage + 1} / {imgs.length}</div>
                    <div className="absolute bottom-3 left-4 flex items-center gap-1.5 bg-background/70 backdrop-blur-md px-2.5 py-1 rounded-full text-xs"><Eye className="w-3 h-3 text-muted-foreground" />{db.views_count || 0} {isGreek ? "προβολές" : "views"}</div>
                  </>
                )}
              </div>
              {imgs.length > 1 && (
                <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-0.5">
                  {imgs.map((img, i) => (
                    <button key={i} onClick={() => setCurrentImage(i)} className={`shrink-0 min-h-[44px] min-w-[44px] w-16 h-11 rounded-lg overflow-hidden transition-all ${currentImage === i ? "ring-2 ring-primary ring-offset-2 ring-offset-background opacity-100" : "opacity-50 hover:opacity-80"}`}>
                      <img src={img} alt="" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}

              {/* Title + Price hero — same as PropertyDetail */}
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-6 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground bg-muted px-2 py-0.5 rounded-full border border-border capitalize">{db.property_type}</span>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/30">
                        {isRentalOpenHouse
                          ? (isGreek ? "Ανοιχτή επίσκεψη ενοικίασης" : "Open House Rental")
                          : (isGreek ? "Ανοιχτή επίσκεψη πώλησης" : "Open House Sale")}
                      </span>
                    </div>
                    <h1 className="font-display text-2xl md:text-3xl font-bold leading-tight">{db.title}</h1>
                    <div className="flex items-center gap-1.5 mt-2 text-sm text-muted-foreground">
                      <MapPin className="w-3.5 h-3.5 shrink-0" />
                      <span>{address && address !== city ? `${address}, ${city}` : city}{db.region ? ` · ${db.region}` : ""}</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-display text-3xl font-black text-foreground">
                      €{price.toLocaleString()}{rentalPriceSuffix && <span className="text-base font-normal text-muted-foreground">{rentalPriceSuffix}</span>}
                    </div>
                    {!!pricePerSqm && <div className="text-xs text-muted-foreground mt-0.5">€{pricePerSqm.toLocaleString()} {isGreek ? "ανά τ.μ." : "per m²"}</div>}
                  </div>
                </div>
                <PropertyHeroSpecsBar items={heroSpecs} />
              </div>

              {/* Open House date Section */}
              {openHouseDate && (
                <Section>
                  <SectionHeader icon={Calendar} title={isGreek ? "Ανοιχτή επίσκεψη" : "Open House"} />
                  <div className="p-6">
                    <div className="flex items-center gap-4">
                      <Calendar className="w-12 h-12 text-emerald-600 shrink-0" />
                      <div>
                        <p className="font-display text-lg font-bold text-foreground">
                          {openHouseDate.toLocaleDateString(dateLocale, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                        </p>
                        <p className="text-sm text-muted-foreground mt-0.5">
                          {openHouseDate.toLocaleTimeString(dateLocale, { hour: "2-digit", minute: "2-digit" })}
                          {hasAssetControl
                            ? (isGreek ? " — Απαιτείται προεγγραφή για κράτηση ώρας" : " — Pre-register to book a timeslot")
                            : (isGreek ? " — Δεν απαιτείται ραντεβού" : " — No appointment needed")}
                        </p>
                      </div>
                    </div>
                  </div>
                </Section>
              )}

              <PropertyAIInsightsSection
                user={user}
                isPro={isPro}
                loading={aiInsightsLoading}
                data={aiInsightsData}
                quota={aiInsightsQuota}
                quotaLoading={aiInsightsQuotaLoading}
                hasRequested={aiInsightsLoaded}
                onLoad={loadAiInsights}
              />

              {/* Description */}
              <PropertyDescriptionSection description={db.description} />

              {/* Property Details + Energy Performance Certificate */}
              {detailGroups.length > 0 && (
                <PropertyDetailsAndEnergy detailGroups={detailGroups} energyClass={db.energy_class} />
              )}

              {/* Features & Amenities */}
              {(() => {
                const total = internalFeatures.length + externalFeatures.length + constructionFeatures.length + suitabilityFeatures.length;
                if (total === 0) return null;
                return (
                  <Section>
                  <SectionHeader icon={Check} title={isGreek ? "Χαρακτηριστικά & παροχές" : "Features & Amenities"} badge={
                      <span className="text-[10px] bg-muted text-muted-foreground px-2 py-0.5 rounded-full border border-border">{total} {isGreek ? "χαρακτηριστικά" : "features"}</span>
                    } />
                    <div className="p-6 space-y-6">
                      <FeatureSection title={isGreek ? "Εσωτερικά" : "Internal"} features={internalFeatures} accent="bg-primary" />
                      <FeatureSection title={isGreek ? "Εξωτερικά" : "External"} features={externalFeatures} accent="bg-brand-emerald" />
                      <FeatureSection title={isGreek ? "Κατασκευή" : "Construction"} features={constructionFeatures} accent="bg-accent" />
                      <FeatureSection title={isGreek ? "Κατάλληλο για" : "Suitable For"} features={suitabilityFeatures} accent="bg-brand-gold" />
                    </div>
                  </Section>
                );
              })()}

              {/* Mini map */}
              <div className="rounded-2xl overflow-hidden">
                <PropertyMiniMap
                  address={db.address ?? city}
                  city={city}
                  title={db.title}
                  latitude={db.latitude}
                  longitude={db.longitude}
                  onWalkScoreChange={setWalkScore}
                />
              </div>

              {/* Neighbourhood Report */}
              {db.address && (
                <NeighbourhoodReport
                  city={city}
                  address={db.address}
                  region={db.region}
                  lat={db.latitude != null ? Number(db.latitude) : undefined}
                  lng={db.longitude != null ? Number(db.longitude) : undefined}
                  listingId={id ?? undefined}
                />
              )}

              {/* Professionals */}
              <Section>
                <SectionHeader icon={Wrench} title={isGreek ? "Υπηρεσίες επαγγελματιών" : "Professional Add-ons"} />
                <div className="p-5">
                  <p className="text-xs text-muted-foreground mb-3">{isGreek ? "Επίσημες εκθέσεις εκτίμησης, νομικός έλεγχος και έλεγχοι νομιμότητας κτιρίου." : "Formal valuation reports, legal due diligence, and building legality checks."}</p>
                  <Link to={`/professionals${city ? `?search=${encodeURIComponent(city)}` : ""}`} className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline">
                    {isGreek ? "Βρείτε επαγγελματίες" : "Find professionals"} <ExternalLink className="w-4 h-4" />
                  </Link>
                </div>
              </Section>
            </div>

            {/* Right sidebar — same structure as PropertyDetail */}
            <div className="space-y-4 lg:sticky lg:top-24 self-start">
              <div className="glass-card rounded-xl p-5 border border-border">
                <div className="font-display text-2xl font-bold text-primary mb-1">
                  €{price.toLocaleString()}{rentalPriceSuffix && <span className="text-sm font-normal text-muted-foreground">{rentalPriceSuffix}</span>}
                </div>
                {sqm > 0 && <p className="text-xs text-muted-foreground">€{Math.round(price / sqm).toLocaleString()}/{isGreek ? "τ.μ." : "m²"}</p>}

                {/* Registration / offer flow — gate by approval & attendance */}
                {!isOwner && user && (
                  <div className="mt-4 space-y-2">
                    {!canSubmitOffer && myReg?.status === "attended" && !ohDatePassed && openHouseDate && (
                      <p className="text-[11px] text-muted-foreground">
                        {isGreek ? "Η υποβολή προσφορών ανοίγει μετά τις" : "Offer submission opens after"} {openHouseDate.toLocaleDateString(dateLocale)} {openHouseDate.toLocaleTimeString(dateLocale, { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    )}
                    {!canSubmitOffer && myReg?.status === "attended" && ohDatePassed && assetSettings?.require_proof_of_funds && myReg.pof_verified_status !== "verified" && (
                      <p className="text-[11px] text-muted-foreground">
                        {isGreek ? "Η βεβαίωση διαθέσιμων κεφαλαίων πρέπει να επαληθευτεί πριν υποβάλετε προσφορά." : "Proof of funds must be verified before you can submit an offer."}
                      </p>
                    )}
                    {/* Pre-register — hidden once an offer is submitted */}
                    {!myOffer && (
                      myReg ? (
                        <button
                          type="button"
                          onClick={() => modal.open("reg")}
                          className="w-full rounded-lg px-3 py-2 text-left text-xs bg-secondary/50 hover:bg-secondary border border-border transition-colors flex items-center gap-2"
                        >
                          <Users className="w-3.5 h-3.5 shrink-0" />
                          {isGreek ? "Εγγραφή" : "Registration"} {myReg.status === "approved" ? (isGreek ? "εγκρίθηκε ✓" : "approved ✓") : myReg.status === "attended" ? (isGreek ? "παρουσία ✓" : "attended ✓") : (isGreek ? "σε αναμονή ⏳" : "pending ⏳")} · {isGreek ? "Λεπτομέρειες" : "View details"}
                        </button>
                      ) : registrationClosed ? (
                        <div className="rounded-lg px-3 py-2 text-[11px] text-muted-foreground border border-border bg-muted/30 flex items-center gap-1.5">
                          <Lock className="w-3 h-3 shrink-0" />
                          {isGreek ? "Η προεγγραφή έχει κλείσει για αυτή την ανοικτή επίσκεψη." : "Registration closed for this open house."}
                        </div>
                      ) : (
                        <Button className="w-full gap-2" onClick={() => modal.open("reg")}>
                          <Users className="w-4 h-4" /> {isGreek ? "Προεγγραφή για ανοιχτή επίσκεψη" : "Pre-register for Open House"}
                        </Button>
                      )
                    )}
                    {/* Offer — show current offer or submit button */}
                    {myOffer ? (
                      <button
                        type="button"
                        onClick={() => modal.open("offer")}
                        className="w-full rounded-lg px-3 py-2 text-left text-xs bg-emerald-500/10 hover:bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 transition-colors flex items-center gap-2"
                      >
                        <Euro className="w-3.5 h-3.5 shrink-0" />
                        {isGreek ? "Προσφορά υποβλήθηκε" : "Offer submitted"} ({myOffer.status === "submitted" ? (isGreek ? "σφραγισμένη" : "sealed") : `€${Number(myOffer.amount).toLocaleString()}`}) · {isGreek ? "Προβολή" : "View"}
                      </button>
                    ) : (
                      <Button
                        variant="outline"
                        className="w-full gap-2"
                        onClick={() => modal.open("offer")}
                        disabled={!canSubmitOffer}
                      >
                        <Euro className="w-4 h-4" /> {isGreek ? "Υποβολή προσφοράς" : "Submit Offer"}
                        {!canSubmitOffer && <Lock className="w-3 h-3 opacity-50" />}
                      </Button>
                    )}
                    {canContact ? (
                      <Button variant="outline" className="w-full gap-2" onClick={handleContact} disabled={startConversation.isPending}>
                        {startConversation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageCircle className="w-4 h-4" />}
                        {isGreek ? "Επικοινωνία" : "Contact"}
                      </Button>
                    ) : (
                      <div className="rounded-lg px-3 py-2 text-[11px] text-muted-foreground border border-border bg-muted/30 flex items-center gap-1.5">
                        <Lock className="w-3 h-3 shrink-0" />
                        {!myReg
                          ? (isGreek ? "Προεγγραφείτε πρώτα για επικοινωνία" : "Pre-register first to contact")
                          : myReg.status === "pending"
                            ? (isGreek ? "Η επικοινωνία ανοίγει μετά την έγκριση" : "Contact unlocks after approval")
                            : (isGreek ? "Η επικοινωνία ανοίγει μετά την επίσκεψη" : "Attend first to contact")}
                      </div>
                    )}
                  </div>
                )}
                {!isOwner && !user && (
                  <Button className="w-full mt-4 gap-2" asChild>
                    <Link to="/login">{isGreek ? "Σύνδεση για επικοινωνία" : "Sign in to contact"}</Link>
                  </Button>
                )}

                {/* Owner: dashboard shortcut */}
                {isOwner && (
                  <div className="mt-4 space-y-2">
                    <Button className="w-full gap-2" asChild>
                      <Link to="/dashboard?tab=open-houses">
                        <LayoutDashboard className="w-4 h-4" /> {isGreek ? "Διαχείριση στον πίνακα" : "Manage in Dashboard"}
                      </Link>
                    </Button>
                    <p className="text-xs text-muted-foreground text-center">
                      {isGreek ? "Δείτε εγγραφές, εγκρίνετε επισκέπτες και διαχειριστείτε σφραγισμένες προσφορές" : "View registrations, approve visitors & manage sealed offers"}
                    </p>
                  </div>
                )}

              </div>

              {/* Walk Score */}
              {(walkScore !== null || db?.walkability_score != null) && (() => {
                const score = walkScore ?? Number(db?.walkability_score);
                const colour = walkScoreColour(score);
                const label = walkScoreLabel(score);
                const r = 20, c = 2 * Math.PI * r;
                return (
                  <div className="glass-card rounded-2xl p-4 border border-border flex items-center gap-4">
                    <svg width="52" height="52" viewBox="0 0 56 56" className="shrink-0">
                      <circle cx="28" cy="28" r={r} fill="none" stroke="hsl(var(--border))" strokeWidth="4" />
                      <circle cx="28" cy="28" r={r} fill="none"
                        stroke={colour} strokeWidth="4"
                        strokeDasharray={`${c * score / 100} ${c * (1 - score / 100)}`}
                        strokeLinecap="round"
                        transform="rotate(-90 28 28)" />
                      <text x="28" y="33" textAnchor="middle" fontSize="13" fontWeight="900" fill={colour}>{score}</text>
                    </svg>
                    <div>
                      <p className="text-sm font-bold" style={{ color: colour }}>{label}</p>
                      <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">{isGreek ? "Βαθμός πεζής πρόσβασης" : "Walk Score"}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{isGreek ? "Με βάση κοντινές παροχές" : "Based on nearby amenities"}</p>
                    </div>
                  </div>
                );
              })()}

              {/* Safety & Noise */}
              {(db?.safety_score != null || db?.noise_score != null) && (
                <div className="glass-card rounded-2xl p-4 border border-border flex items-center gap-6">
                  {db?.safety_score != null && (() => {
                    const s = Number(db.safety_score);
                    const colour = s >= 70 ? "#22c55e" : s >= 40 ? "#f59e0b" : "#ef4444";
                    const safetyLabel = s >= 70 ? (isGreek ? "Ασφαλής περιοχή" : "Safe area") : s >= 40 ? (isGreek ? "Μέτρια" : "Moderate") : (isGreek ? "Προσοχή" : "Caution");
                    const r = 20, c = 2 * Math.PI * r;
                    return (
                      <div className="flex items-center gap-3">
                        <svg width="52" height="52" viewBox="0 0 56 56" className="shrink-0">
                          <circle cx="28" cy="28" r={r} fill="none" stroke="hsl(var(--border))" strokeWidth="4" />
                          <circle cx="28" cy="28" r={r} fill="none" stroke={colour} strokeWidth="4"
                            strokeDasharray={`${c * s / 100} ${c * (1 - s / 100)}`}
                            strokeLinecap="round" transform="rotate(-90 28 28)" />
                          <text x="28" y="33" textAnchor="middle" fontSize="13" fontWeight="900" fill={colour}>{s}</text>
                        </svg>
                        <div>
                          <p className="text-sm font-bold" style={{ color: colour }}>{safetyLabel}</p>
                          <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">{isGreek ? "Δείκτης ασφάλειας" : "Safety Score"}</p>
                        </div>
                      </div>
                    );
                  })()}
                  {db?.noise_score != null && (() => {
                    const n = Number(db.noise_score);
                    const colour = n <= 3 ? "#22c55e" : n <= 6 ? "#f59e0b" : "#ef4444";
                    const noiseLabel = n <= 3 ? (isGreek ? "Ήσυχα" : "Quiet") : n <= 6 ? (isGreek ? "Μέτρια" : "Moderate") : (isGreek ? "Θορυβώδης" : "Noisy");
                    return (
                      <div className="flex items-center gap-3">
                        <div className="w-[52px] h-[52px] rounded-full border-4 flex items-center justify-center shrink-0" style={{ borderColor: colour }}>
                          <span className="text-sm font-black" style={{ color: colour }}>{n}</span>
                        </div>
                        <div>
                          <p className="text-sm font-bold" style={{ color: colour }}>{noiseLabel}</p>
                          <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">{isGreek ? "Επίπεδο θορύβου" : "Noise Level"}</p>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* AI Valuation + Property Report, matching the main listing detail sidebar */}
              {id && isPro ? (
                <PropertyValuation
                  listingId={id}
                  title={db.title}
                  city={city}
                  address={db.address ?? undefined}
                  price={price}
                  sqm={sqm}
                  bedrooms={db.bedrooms}
                  bathrooms={db.bathrooms}
                  propertyType={db.property_type}
                  listingType={isRentalOpenHouse ? "rent" : db.listing_type}
                  floor={db.floor}
                  totalFloors={db.total_floors}
                  yearBuilt={db.year_built}
                  heatingSystem={db.heating_system}
                  energyClass={db.energy_class}
                  pricePerSqm={pricePerSqm}
                  hasParking={db.has_parking}
                  hasPool={db.has_pool}
                  hasElevator={db.has_elevator}
                  hasGarden={db.has_garden}
                  hasStorage={db.has_storage}
                  hasBalcony={db.has_balcony}
                  hasView={db.has_view}
                  hasFurnished={db.has_furnished}
                  region={db.region}
                  description={db.description}
                  tags={db.tags}
                  plotSurface={db.plot_surface}
                  condition={db.construction_status ?? undefined}
                  isNeoclassical={db.is_neoclassical}
                  isPreserved={db.is_preserved}
                  distanceFromSea={db.distance_from_sea}
                  withinCityPlan={db.within_city_plan}
                  withinSettlement={db.within_settlement}
                  buildingAllowance={db.building_allowance}
                  coverageRatio={db.coverage_ratio}
                  isBuildable={db.is_buildable}
                  cadastreNumber={db.cadastre_number}
                  hasLandConcession={db.has_land_concession}
                  landUse={db.land_use}
                  latitude={db.latitude != null ? Number(db.latitude) : undefined}
                  longitude={db.longitude != null ? Number(db.longitude) : undefined}
                />
              ) : (
                <PropertyValuationLockedCard />
              )}

              {id && <PropertyReportCard listingId={id} listing={db} />}
            </div>
          </div>
        </div>
      </div>

      <OpenHouseRegistrationDialog
        open={modal.isOpen("reg")}
        onClose={() => modal.close()}
        listingId={listingId}
        listingTitle={db.title}
        hasAssetControl={hasAssetControl}
        listingPrice={price}
        openHouseTransactionType={isRentalOpenHouse ? "rent" : "sale"}
      />
      <OpenHouseOfferDialog
        open={modal.isOpen("offer")}
        onClose={() => modal.close()}
        listingId={listingId}
        listingTitle={db.title}
        listingPrice={price}
        canSubmit={canSubmitOffer}
        offerBlockedReason={
          !myReg ? (isGreek ? "Προεγγραφείτε και λάβετε έγκριση πρώτα" : "Pre-register and get approved first") :
          myReg.status === "pending" ? (isGreek ? "Αναμονή έγκρισης" : "Awaiting approval") :
          myReg.status !== "attended" ? (isGreek ? "Παρακολουθήστε την ανοιχτή επίσκεψη για να ανοίξει η προσφορά" : "Attend the open house to unlock offer submission") :
          assetSettings?.require_proof_of_funds && myReg.pof_verified_status !== "verified" ? (isGreek ? "Πρέπει να επαληθευτεί η βεβαίωση διαθέσιμων κεφαλαίων πριν υποβάλετε προσφορά" : "Proof of funds must be verified before you can submit an offer") :
          !ohDatePassed ? (isGreek ? `Οι προσφορές ανοίγουν μετά τις ${openHouseDate?.toLocaleString(dateLocale)}` : `Offers open after ${openHouseDate?.toLocaleString("en-GB")}`) : undefined
        }
      />
      <ConfirmDialog
        open={deleteConfirmOpen}
        title={isGreek ? "Διαγραφή ανοιχτής επίσκεψης" : "Delete open house listing"}
        description={isGreek ? "Να διαγραφεί αυτή η ανοιχτή επίσκεψη και να αφαιρεθεί από την αναζήτηση;" : "Delete this open house listing and remove it from open house discovery?"}
        confirmLabel={isGreek ? "Διαγραφή" : "Delete"}
        onConfirm={() => {
          if (!id) return;
          deleteListing.mutate(id, {
            onSuccess: () => {
              toast.success(isGreek ? "Η αγγελία διαγράφηκε" : "Listing deleted");
              navigate("/open-houses");
            },
          });
          setDeleteConfirmOpen(false);
        }}
        onCancel={() => setDeleteConfirmOpen(false)}
      />

      <Footer />
    </div>
  );
}
