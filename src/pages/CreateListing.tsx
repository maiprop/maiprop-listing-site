import { useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronLeft, ChevronRight, Check, Upload, X, Loader2,
  Home, Building2, Zap, MapPin, DollarSign, Image as ImageIcon,
  Info, GripVertical, Star, ChevronDown
} from "lucide-react";
import { PROPERTY_TYPES, PROPERTY_TYPE_MAP, type PropertyTypeKey } from "@/lib/propertyTypes";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/Navbar";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

// ─── Constants ────────────────────────────────────────────────────────────────

const PROPERTY_TYPES = ["apartment", "house", "villa", "land", "commercial", "office"] as const;
type PropertyType = typeof PROPERTY_TYPES[number];
const LISTING_TYPES = ["sale", "rent", "auction"] as const;
type ListingType = typeof LISTING_TYPES[number];
const ENERGY_CLASSES = ["A+", "A", "B+", "B", "C", "D", "E", "F", "G", "Exempt"];
const HEATING_SYSTEMS = ["autonomous", "central", "floor", "none", "other"];
const CONSTRUCTION_STATUSES = ["new", "under_construction", "renovated", "needs_renovation", "unfinished", "preserved", "neoclassical"];
const SLOPES = ["flat", "slight", "steep"];
const ZONE_TYPES = ["residential", "agricultural", "tourist", "industrial", "commercial", "mixed"];
const ROAD_TYPES = ["asphalt", "paved", "dirt"];
const COMMERCIAL_SUBTYPES = ["shop", "office", "warehouse", "hotel", "restaurant", "showroom", "clinic", "industrial", "other"];

const steps = [
  { id: 1, label: "Type", icon: Home },
  { id: 2, label: "Details", icon: Building2 },
  { id: 3, label: "Features", icon: Zap },
  { id: 4, label: "Location", icon: MapPin },
  { id: 5, label: "Pricing", icon: DollarSign },
  { id: 6, label: "Photos", icon: ImageIcon },
];

// ─── Image Types ──────────────────────────────────────────────────────────────

interface UploadedImage {
  id: string;
  url: string;
  file?: File;
  uploading?: boolean;
  error?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const isResidential = (t: PropertyType) => ["apartment", "house", "villa"].includes(t);
const isLand = (t: PropertyType) => t === "land";
const isCommercial = (t: PropertyType) => ["commercial", "office"].includes(t);

// ─── Small UI Components ──────────────────────────────────────────────────────

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="text-xs text-muted-foreground block mb-1.5 font-medium">
      {children}{required && <span className="text-destructive ml-1">*</span>}
    </label>
  );
}

function Input({ ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors"
    />
  );
}

function Select({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary transition-colors appearance-none"
    >
      {children}
    </select>
  );
}

function Textarea({ ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors resize-none"
    />
  );
}

function ToggleChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
        active ? "border-primary bg-primary/10 text-primary" : "border-border bg-secondary text-muted-foreground hover:text-foreground"
      }`}
    >
      {active && <Check className="w-3 h-3 inline mr-1" />}{children}
    </button>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3 mt-5 first:mt-0">{children}</h3>;
}

// ─── Image Gallery Component ──────────────────────────────────────────────────

function ImageGallery({
  images,
  coverImageId,
  onSetCover,
  onRemove,
  onReorder,
}: {
  images: UploadedImage[];
  coverImageId: string | null;
  onSetCover: (id: string) => void;
  onRemove: (id: string) => void;
  onReorder: (from: number, to: number) => void;
}) {
  const dragIdx = useRef<number | null>(null);
  const dragOverIdx = useRef<number | null>(null);

  const handleDragStart = (idx: number) => { dragIdx.current = idx; };
  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    dragOverIdx.current = idx;
  };
  const handleDrop = () => {
    if (dragIdx.current !== null && dragOverIdx.current !== null && dragIdx.current !== dragOverIdx.current) {
      onReorder(dragIdx.current, dragOverIdx.current);
    }
    dragIdx.current = null;
    dragOverIdx.current = null;
  };

  if (images.length === 0) return null;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4">
      {images.map((img, idx) => {
        const isCover = img.id === coverImageId;
        return (
          <div
            key={img.id}
            draggable
            onDragStart={() => handleDragStart(idx)}
            onDragOver={e => handleDragOver(e, idx)}
            onDrop={handleDrop}
            className={`relative group rounded-xl overflow-hidden border-2 transition-all cursor-grab active:cursor-grabbing ${
              isCover ? "border-primary shadow-lg shadow-primary/20" : "border-border hover:border-primary/40"
            }`}
          >
            {/* Image */}
            <div className="aspect-[4/3] bg-secondary">
              {img.uploading ? (
                <div className="w-full h-full flex items-center justify-center">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                </div>
              ) : img.error ? (
                <div className="w-full h-full flex items-center justify-center text-destructive text-xs p-2 text-center">
                  Upload failed
                </div>
              ) : (
                <img src={img.url} alt="" className="w-full h-full object-cover" />
              )}
            </div>

            {/* Cover badge */}
            {isCover && (
              <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 bg-primary text-primary-foreground rounded-full text-xs font-bold">
                <Star className="w-3 h-3 fill-current" /> Cover
              </div>
            )}

            {/* Drag handle */}
            <div className="absolute top-2 right-8 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded bg-background/70">
              <GripVertical className="w-3 h-3 text-muted-foreground" />
            </div>

            {/* Remove */}
            <button
              onClick={() => onRemove(img.id)}
              className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-full bg-destructive text-destructive-foreground"
            >
              <X className="w-3 h-3" />
            </button>

            {/* Set as cover (bottom overlay) */}
            {!isCover && !img.uploading && !img.error && (
              <button
                onClick={() => onSetCover(img.id)}
                className="absolute bottom-0 inset-x-0 py-1.5 bg-background/80 backdrop-blur-sm text-xs text-foreground font-medium opacity-0 group-hover:opacity-100 transition-opacity hover:bg-primary/20 hover:text-primary"
              >
                Set as cover
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function CreateListing() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [step, setStep] = useState(1);
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [coverImageId, setCoverImageId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    listing_type: "sale" as ListingType,
    property_type: "apartment" as PropertyType,
    title: "",
    description: "",
    sqm: "",
    year_built: "",
    energy_class: "",
    bedrooms: "",
    bathrooms: "",
    wc_count: "",
    kitchens: "",
    living_rooms: "",
    floor: "",
    total_floors: "",
    levels: "",
    heating_system: "",
    construction_status: "",
    commercial_subtype: "",
    plot_surface: "",
    floor_height: "",
    has_elevator: false, has_ac: false, has_solar_water: false, has_storage: false,
    has_secure_door: false, has_alarm: false, has_cctv: false, has_security: false,
    has_smart_home: false, has_fireplace: false, has_underfloor_heating: false,
    has_furnished: false, has_internal_staircase: false, has_double_glazing: false,
    has_window_screens: false, has_night_power: false, has_attic: false,
    has_satellite: false, has_painted: false,
    has_parking: false, has_balcony: false, has_garden: false, has_pool: false,
    has_view: false, has_facade: false, has_awning: false, has_disability_access: false,
    is_corner: false, is_penthouse: false, is_neoclassical: false, is_preserved: false,
    has_virtual_tour: false, has_video_tour: false,
    suitable_student: false, suitable_holiday: false, suitable_investment: false, suitable_commercial_use: false,
    has_three_phase_power: false, has_loading_dock: false, has_structured_cabling: false, has_equipped: false,
    is_buildable: false, within_city_plan: false, within_settlement: false,
    has_water_supply: false, has_electricity_supply: false, has_land_concession: false,
    coverage_ratio: "", building_allowance: "", facade_length: "", plot_depth: "",
    slope: "", zone_type: "", road_type: "", land_use: "",
    distance_from_sea: "", distance_from_city: "",
    address: "", city: "", region: "", postal_code: "",
    cadastre_number: "", enfia_zone: "",
    price: "", auction_starting_bid: "", auction_date: "", auction_court: "",
    deposit_months: "", monthly_expenses: "", agent_fee_included: false,
    pets_allowed: false, short_term_rental: false, available_from: "", min_rental_months: "",
  });

  const set = (key: string, value: unknown) => setForm(f => ({ ...f, [key]: value }));
  const toggle = (key: string) => setForm(f => ({ ...f, [key]: !(f as any)[key] }));

  const pt = form.property_type;
  const lt = form.listing_type;

  // ── Image Upload ──────────────────────────────────────────────────────────

  const uploadImage = useCallback(async (file: File): Promise<UploadedImage> => {
    if (!user) throw new Error("Must be logged in");
    const ext = file.name.split(".").pop();
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const path = `${user.id}/${id}.${ext}`;
    const { error } = await supabase.storage.from("listing-images").upload(path, file, { upsert: true });
    if (error) throw error;
    const { data } = supabase.storage.from("listing-images").getPublicUrl(path);
    return { id, url: data.publicUrl };
  }, [user]);

  const handleFilesSelected = async (files: FileList | null) => {
    if (!files || !user) return;
    const newFiles = Array.from(files).slice(0, 20 - images.length);
    if (newFiles.length === 0) return;

    // Add placeholders
    const placeholders: UploadedImage[] = newFiles.map(file => ({
      id: `placeholder-${Date.now()}-${Math.random()}`,
      url: URL.createObjectURL(file),
      file,
      uploading: true,
    }));
    setImages(prev => [...prev, ...placeholders]);

    // Upload each
    for (let i = 0; i < newFiles.length; i++) {
      const placeholder = placeholders[i];
      try {
        const uploaded = await uploadImage(newFiles[i]);
        setImages(prev => prev.map(img =>
          img.id === placeholder.id
            ? { ...uploaded, uploading: false }
            : img
        ));
        // Auto-set first uploaded as cover
        if (i === 0) {
          setCoverImageId(prev => prev ?? uploaded.id);
        }
      } catch (err: any) {
        setImages(prev => prev.map(img =>
          img.id === placeholder.id
            ? { ...img, uploading: false, error: err.message }
            : img
        ));
        toast.error(`Failed to upload ${newFiles[i].name}`);
      }
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    handleFilesSelected(e.dataTransfer.files);
  };

  const handleReorder = (fromIdx: number, toIdx: number) => {
    setImages(prev => {
      const next = [...prev];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      return next;
    });
  };

  const handleRemove = (id: string) => {
    setImages(prev => prev.filter(img => img.id !== id));
    setCoverImageId(prev => prev === id ? (images.find(img => img.id !== id)?.id ?? null) : prev);
  };

  // ── Submit ────────────────────────────────────────────────────────────────

  const handleSubmit = async (asDraft = false) => {
    if (!form.title || !form.city || !form.price || !form.sqm) {
      toast.error("Please fill in all required fields");
      return;
    }
    setSubmitting(true);
    try {
      const coverImg = images.find(img => img.id === coverImageId);
      const coverImageUrl = coverImg?.url || undefined;

      const payload: any = {
        title: form.title,
        description: form.description || undefined,
        city: form.city,
        address: form.address || undefined,
        region: form.region || undefined,
        postal_code: form.postal_code || undefined,
        cadastre_number: form.cadastre_number || undefined,
        enfia_zone: form.enfia_zone || undefined,
        property_type: form.property_type,
        listing_type: form.listing_type,
        price: Number(form.price),
        sqm: Number(form.sqm),
        year_built: form.year_built ? Number(form.year_built) : undefined,
        energy_class: form.energy_class || undefined,
        heating_system: form.heating_system || undefined,
        construction_status: form.construction_status || undefined,
        cover_image_url: coverImageUrl,
        price_per_sqm: form.price && form.sqm ? Math.round(Number(form.price) / Number(form.sqm)) : undefined,
        ...(isResidential(pt) && {
          bedrooms: form.bedrooms ? Number(form.bedrooms) : undefined,
          bathrooms: form.bathrooms ? Number(form.bathrooms) : undefined,
          wc_count: form.wc_count ? Number(form.wc_count) : undefined,
          kitchens: form.kitchens ? Number(form.kitchens) : undefined,
          living_rooms: form.living_rooms ? Number(form.living_rooms) : undefined,
          floor: form.floor ? Number(form.floor) : undefined,
          total_floors: form.total_floors ? Number(form.total_floors) : undefined,
          levels: form.levels ? Number(form.levels) : undefined,
        }),
        ...(isCommercial(pt) && {
          commercial_subtype: form.commercial_subtype || undefined,
          plot_surface: form.plot_surface ? Number(form.plot_surface) : undefined,
          floor_height: form.floor_height ? Number(form.floor_height) : undefined,
          floor: form.floor ? Number(form.floor) : undefined,
          total_floors: form.total_floors ? Number(form.total_floors) : undefined,
          wc_count: form.wc_count ? Number(form.wc_count) : undefined,
        }),
        ...(isLand(pt) && {
          coverage_ratio: form.coverage_ratio ? Number(form.coverage_ratio) : undefined,
          building_allowance: form.building_allowance ? Number(form.building_allowance) : undefined,
          facade_length: form.facade_length ? Number(form.facade_length) : undefined,
          plot_depth: form.plot_depth ? Number(form.plot_depth) : undefined,
          slope: form.slope || undefined,
          zone_type: form.zone_type || undefined,
          road_type: form.road_type || undefined,
          land_use: form.land_use || undefined,
          distance_from_sea: form.distance_from_sea ? Number(form.distance_from_sea) : undefined,
          distance_from_city: form.distance_from_city ? Number(form.distance_from_city) : undefined,
        }),
        ...(lt === "rent" && {
          deposit_months: form.deposit_months ? Number(form.deposit_months) : undefined,
          monthly_expenses: form.monthly_expenses ? Number(form.monthly_expenses) : undefined,
          agent_fee_included: form.agent_fee_included,
          pets_allowed: form.pets_allowed,
          short_term_rental: form.short_term_rental,
          available_from: form.available_from || undefined,
          min_rental_months: form.min_rental_months ? Number(form.min_rental_months) : undefined,
        }),
        ...(lt === "auction" && {
          auction_starting_bid: form.auction_starting_bid ? Number(form.auction_starting_bid) : undefined,
          auction_date: form.auction_date || undefined,
          auction_court: form.auction_court || undefined,
        }),
        has_elevator: form.has_elevator, has_ac: form.has_ac, has_solar_water: form.has_solar_water,
        has_storage: form.has_storage, has_secure_door: form.has_secure_door, has_alarm: form.has_alarm,
        has_cctv: form.has_cctv, has_security: form.has_security, has_smart_home: form.has_smart_home,
        has_fireplace: form.has_fireplace, has_underfloor_heating: form.has_underfloor_heating,
        has_furnished: form.has_furnished, has_internal_staircase: form.has_internal_staircase,
        has_double_glazing: form.has_double_glazing, has_window_screens: form.has_window_screens,
        has_night_power: form.has_night_power, has_attic: form.has_attic, has_satellite: form.has_satellite,
        has_painted: form.has_painted, has_parking: form.has_parking, has_balcony: form.has_balcony,
        has_garden: form.has_garden, has_pool: form.has_pool, has_view: form.has_view,
        has_facade: form.has_facade, has_awning: form.has_awning,
        has_disability_access: form.has_disability_access, is_corner: form.is_corner,
        is_penthouse: form.is_penthouse, is_neoclassical: form.is_neoclassical, is_preserved: form.is_preserved,
        has_virtual_tour: form.has_virtual_tour, has_video_tour: form.has_video_tour,
        suitable_student: form.suitable_student, suitable_holiday: form.suitable_holiday,
        suitable_investment: form.suitable_investment, suitable_commercial_use: form.suitable_commercial_use,
        is_buildable: form.is_buildable, within_city_plan: form.within_city_plan,
        within_settlement: form.within_settlement, has_water_supply: form.has_water_supply,
        has_electricity_supply: form.has_electricity_supply, has_land_concession: form.has_land_concession,
        has_three_phase_power: form.has_three_phase_power, has_loading_dock: form.has_loading_dock,
        has_structured_cabling: form.has_structured_cabling, has_equipped: form.has_equipped,
      };

      const { data, error } = await supabase
        .from("listings")
        .insert({ ...payload, owner_id: user!.id, status: asDraft ? "draft" : "active" } as any)
        .select()
        .single();
      if (error) throw error;

      // Insert additional images into listing_images table
      const additionalImages = images.filter(img => img.url !== coverImageUrl && !img.uploading && !img.error);
      if (additionalImages.length > 0) {
        await supabase.from("listing_images").insert(
          additionalImages.map((img, idx) => ({
            listing_id: data.id,
            url: img.url,
            sort_order: idx + 1,
          }))
        );
      }

      toast.success(asDraft ? "Listing saved as draft!" : "Listing published successfully!");
      navigate(`/property/${data.id}`);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-16">
        <div className="border-b border-border bg-card py-6">
          <div className="container">
            <h1 className="font-display text-2xl font-bold">Create New Listing</h1>
            <p className="text-muted-foreground text-sm mt-1">Fill in your property details step by step</p>
          </div>
        </div>

        <div className="container py-8 max-w-3xl">
          {/* Progress */}
          <div className="flex items-center gap-1 mb-8 overflow-x-auto pb-2">
            {steps.map((s, i) => (
              <div key={s.id} className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => step > s.id && setStep(s.id)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                    step === s.id
                      ? "bg-primary text-primary-foreground"
                      : step > s.id
                      ? "bg-primary/20 text-primary cursor-pointer hover:bg-primary/30"
                      : "bg-secondary text-muted-foreground"
                  }`}
                >
                  {step > s.id ? <Check className="w-3 h-3" /> : <s.icon className="w-3 h-3" />}
                  {s.label}
                </button>
                {i < steps.length - 1 && <div className={`w-4 h-0.5 ${step > s.id ? "bg-primary" : "bg-border"}`} />}
              </div>
            ))}
          </div>

          <div className="glass-card rounded-2xl p-6 md:p-8">

            {/* ── STEP 1: Type ── */}
            {step === 1 && (
              <div className="space-y-6">
                <h2 className="font-display text-xl font-semibold">What are you listing?</h2>
                <div>
                  <FieldLabel>Listing Type</FieldLabel>
                  <div className="grid grid-cols-3 gap-3">
                    {([
                      { v: "sale", label: "🏷️ For Sale" },
                      { v: "rent", label: "🔑 For Rent" },
                      { v: "auction", label: "⚖️ Auction" },
                    ] as const).map(({ v, label }) => (
                      <button key={v} onClick={() => set("listing_type", v)}
                        className={`p-4 rounded-xl border text-sm font-medium transition-all ${
                          lt === v ? "border-primary bg-primary/10 text-primary" : "border-border bg-secondary text-muted-foreground hover:text-foreground hover:border-primary/50"
                        }`}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <FieldLabel>Property Type</FieldLabel>
                  <div className="grid grid-cols-3 gap-3">
                    {([
                      { v: "apartment", label: "🏢 Apartment" },
                      { v: "house", label: "🏠 House" },
                      { v: "villa", label: "🏡 Villa" },
                      { v: "land", label: "🌾 Land / Plot" },
                      { v: "commercial", label: "🏪 Commercial" },
                      { v: "office", label: "🏗️ Office" },
                    ] as const).map(({ v, label }) => (
                      <button key={v} onClick={() => set("property_type", v)}
                        className={`p-3 rounded-xl border text-sm font-medium transition-all ${
                          pt === v ? "border-primary bg-primary/10 text-primary" : "border-border bg-secondary text-muted-foreground hover:text-foreground hover:border-primary/50"
                        }`}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── STEP 2: Details ── */}
            {step === 2 && (
              <div className="space-y-4">
                <h2 className="font-display text-xl font-semibold">Property Details</h2>
                <div>
                  <FieldLabel required>Title</FieldLabel>
                  <Input placeholder="e.g. Modern 2-bed apartment in Kolonaki" value={form.title} onChange={e => set("title", e.target.value)} />
                </div>
                <div>
                  <FieldLabel>Description</FieldLabel>
                  <Textarea placeholder="Describe the property..." value={form.description} onChange={e => set("description", e.target.value)} rows={4} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><FieldLabel required>Area (m²)</FieldLabel><Input type="number" placeholder="85" value={form.sqm} onChange={e => set("sqm", e.target.value)} /></div>
                  <div><FieldLabel>Year Built</FieldLabel><Input type="number" placeholder="2010" value={form.year_built} onChange={e => set("year_built", e.target.value)} /></div>
                </div>

                {isResidential(pt) && (
                  <>
                    <SectionTitle>Rooms</SectionTitle>
                    <div className="grid grid-cols-3 gap-3">
                      <div><FieldLabel>Bedrooms</FieldLabel><Input type="number" placeholder="2" value={form.bedrooms} onChange={e => set("bedrooms", e.target.value)} /></div>
                      <div><FieldLabel>Bathrooms</FieldLabel><Input type="number" placeholder="1" value={form.bathrooms} onChange={e => set("bathrooms", e.target.value)} /></div>
                      <div><FieldLabel>WC</FieldLabel><Input type="number" placeholder="1" value={form.wc_count} onChange={e => set("wc_count", e.target.value)} /></div>
                      <div><FieldLabel>Kitchens</FieldLabel><Input type="number" placeholder="1" value={form.kitchens} onChange={e => set("kitchens", e.target.value)} /></div>
                      <div><FieldLabel>Living Rooms</FieldLabel><Input type="number" placeholder="1" value={form.living_rooms} onChange={e => set("living_rooms", e.target.value)} /></div>
                      <div><FieldLabel>Levels</FieldLabel><Input type="number" placeholder="1" value={form.levels} onChange={e => set("levels", e.target.value)} /></div>
                    </div>
                    <SectionTitle>Floor</SectionTitle>
                    <div className="grid grid-cols-2 gap-3">
                      <div><FieldLabel>Floor</FieldLabel><Input type="number" placeholder="3" value={form.floor} onChange={e => set("floor", e.target.value)} /></div>
                      <div><FieldLabel>Total Floors in Building</FieldLabel><Input type="number" placeholder="6" value={form.total_floors} onChange={e => set("total_floors", e.target.value)} /></div>
                    </div>
                    <SectionTitle>Systems & Construction</SectionTitle>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <FieldLabel>Heating System</FieldLabel>
                        <Select value={form.heating_system} onChange={e => set("heating_system", e.target.value)}>
                          <option value="">Select...</option>
                          {HEATING_SYSTEMS.map(h => <option key={h} value={h} className="capitalize">{h.replace("_", " ")}</option>)}
                        </Select>
                      </div>
                      <div>
                        <FieldLabel>Construction Status</FieldLabel>
                        <Select value={form.construction_status} onChange={e => set("construction_status", e.target.value)}>
                          <option value="">Select...</option>
                          {CONSTRUCTION_STATUSES.map(s => <option key={s} value={s} className="capitalize">{s.replace("_", " ")}</option>)}
                        </Select>
                      </div>
                    </div>
                  </>
                )}

                {isCommercial(pt) && (
                  <>
                    <SectionTitle>Commercial Details</SectionTitle>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <FieldLabel>Subtype</FieldLabel>
                        <Select value={form.commercial_subtype} onChange={e => set("commercial_subtype", e.target.value)}>
                          <option value="">Select...</option>
                          {COMMERCIAL_SUBTYPES.map(s => <option key={s} value={s} className="capitalize">{s}</option>)}
                        </Select>
                      </div>
                      <div><FieldLabel>Plot Surface (m²)</FieldLabel><Input type="number" placeholder="500" value={form.plot_surface} onChange={e => set("plot_surface", e.target.value)} /></div>
                      <div><FieldLabel>Floor Height (m)</FieldLabel><Input type="number" step="0.1" placeholder="3.5" value={form.floor_height} onChange={e => set("floor_height", e.target.value)} /></div>
                      <div><FieldLabel>WC Count</FieldLabel><Input type="number" placeholder="2" value={form.wc_count} onChange={e => set("wc_count", e.target.value)} /></div>
                      <div><FieldLabel>Floor</FieldLabel><Input type="number" placeholder="0" value={form.floor} onChange={e => set("floor", e.target.value)} /></div>
                      <div><FieldLabel>Total Floors</FieldLabel><Input type="number" placeholder="4" value={form.total_floors} onChange={e => set("total_floors", e.target.value)} /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <FieldLabel>Heating System</FieldLabel>
                        <Select value={form.heating_system} onChange={e => set("heating_system", e.target.value)}>
                          <option value="">Select...</option>
                          {HEATING_SYSTEMS.map(h => <option key={h} value={h}>{h.replace("_", " ")}</option>)}
                        </Select>
                      </div>
                      <div>
                        <FieldLabel>Construction Status</FieldLabel>
                        <Select value={form.construction_status} onChange={e => set("construction_status", e.target.value)}>
                          <option value="">Select...</option>
                          {CONSTRUCTION_STATUSES.map(s => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
                        </Select>
                      </div>
                    </div>
                  </>
                )}

                {isLand(pt) && (
                  <>
                    <SectionTitle>Land Details</SectionTitle>
                    <div className="grid grid-cols-2 gap-3">
                      <div><FieldLabel>Facade Length (m)</FieldLabel><Input type="number" step="0.1" placeholder="21" value={form.facade_length} onChange={e => set("facade_length", e.target.value)} /></div>
                      <div><FieldLabel>Plot Depth (m)</FieldLabel><Input type="number" step="0.1" placeholder="36" value={form.plot_depth} onChange={e => set("plot_depth", e.target.value)} /></div>
                      <div><FieldLabel>Coverage Ratio (%)</FieldLabel><Input type="number" placeholder="50" value={form.coverage_ratio} onChange={e => set("coverage_ratio", e.target.value)} /></div>
                      <div><FieldLabel>Max Building Allowance (m²)</FieldLabel><Input type="number" placeholder="400" value={form.building_allowance} onChange={e => set("building_allowance", e.target.value)} /></div>
                      <div><FieldLabel>Distance from Sea (m)</FieldLabel><Input type="number" placeholder="500" value={form.distance_from_sea} onChange={e => set("distance_from_sea", e.target.value)} /></div>
                      <div><FieldLabel>Distance from City (m)</FieldLabel><Input type="number" placeholder="2000" value={form.distance_from_city} onChange={e => set("distance_from_city", e.target.value)} /></div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <FieldLabel>Slope</FieldLabel>
                        <Select value={form.slope} onChange={e => set("slope", e.target.value)}>
                          <option value="">Select...</option>
                          {SLOPES.map(s => <option key={s} value={s} className="capitalize">{s}</option>)}
                        </Select>
                      </div>
                      <div>
                        <FieldLabel>Zone Type</FieldLabel>
                        <Select value={form.zone_type} onChange={e => set("zone_type", e.target.value)}>
                          <option value="">Select...</option>
                          {ZONE_TYPES.map(z => <option key={z} value={z} className="capitalize">{z}</option>)}
                        </Select>
                      </div>
                      <div>
                        <FieldLabel>Road Type</FieldLabel>
                        <Select value={form.road_type} onChange={e => set("road_type", e.target.value)}>
                          <option value="">Select...</option>
                          {ROAD_TYPES.map(r => <option key={r} value={r} className="capitalize">{r}</option>)}
                        </Select>
                      </div>
                    </div>
                  </>
                )}

                {!isLand(pt) && (
                  <>
                    <SectionTitle>Energy</SectionTitle>
                    <div>
                      <FieldLabel>Energy Class</FieldLabel>
                      <div className="flex gap-2 flex-wrap">
                        {ENERGY_CLASSES.map(c => (
                          <button key={c} type="button" onClick={() => set("energy_class", c)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                              form.energy_class === c ? "bg-primary/20 border border-primary text-primary" : "bg-secondary border border-border text-muted-foreground"
                            }`}>{c}</button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ── STEP 3: Features ── */}
            {step === 3 && (
              <div>
                <h2 className="font-display text-xl font-semibold mb-4">Features & Amenities</h2>

                {!isLand(pt) && (
                  <>
                    <SectionTitle>Internal</SectionTitle>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { k: "has_elevator", l: "🛗 Elevator" },
                        { k: "has_ac", l: "❄️ Air Conditioning" },
                        { k: "has_solar_water", l: "☀️ Solar Water Heating" },
                        { k: "has_storage", l: "📦 Storage Space" },
                        { k: "has_secure_door", l: "🚪 Secure Door" },
                        { k: "has_alarm", l: "🔔 Alarm" },
                        { k: "has_cctv", l: "📷 CCTV" },
                        { k: "has_security", l: "🔒 Security System" },
                        { k: "has_fireplace", l: "🔥 Fireplace" },
                        { k: "has_underfloor_heating", l: "🌡️ Underfloor Heating" },
                        { k: "has_furnished", l: "🛋️ Furnished" },
                        { k: "has_double_glazing", l: "🪟 Double Glazing" },
                        { k: "has_window_screens", l: "🦟 Window Screens" },
                        { k: "has_attic", l: "🏠 Attic" },
                        { k: "has_internal_staircase", l: "🪜 Internal Staircase" },
                        { k: "has_smart_home", l: "🏡 Smart Home" },
                        { k: "has_night_power", l: "⚡ Night Power Rate" },
                        { k: "has_satellite", l: "📡 Satellite Receiver" },
                        { k: "has_painted", l: "🎨 Painted" },
                        ...isCommercial(pt) ? [
                          { k: "has_equipped", l: "🔧 Equipped" },
                          { k: "has_three_phase_power", l: "⚡ 3-Phase Power" },
                          { k: "has_structured_cabling", l: "🔌 Structured Cabling" },
                        ] : [],
                      ].map(({ k, l }) => (
                        <ToggleChip key={k} active={(form as any)[k]} onClick={() => toggle(k)}>{l}</ToggleChip>
                      ))}
                    </div>
                    <SectionTitle>External</SectionTitle>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { k: "has_parking", l: "🚗 Parking" },
                        { k: "has_balcony", l: "🏞️ Balcony" },
                        { k: "has_garden", l: "🌿 Garden" },
                        { k: "has_pool", l: "🏊 Pool" },
                        { k: "has_view", l: "👁️ View" },
                        { k: "has_facade", l: "🏛️ Facade" },
                        { k: "has_awning", l: "⛱️ Awning" },
                        { k: "has_disability_access", l: "♿ Disability Access" },
                        { k: "is_corner", l: "📐 Corner Property" },
                        { k: "is_penthouse", l: "⭐ Penthouse" },
                        ...isCommercial(pt) ? [{ k: "has_loading_dock", l: "🚛 Loading Dock" }] : [],
                      ].map(({ k, l }) => (
                        <ToggleChip key={k} active={(form as any)[k]} onClick={() => toggle(k)}>{l}</ToggleChip>
                      ))}
                    </div>
                    <SectionTitle>Construction Characteristics</SectionTitle>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { k: "is_neoclassical", l: "🏛️ Neoclassical" },
                        { k: "is_preserved", l: "🏺 Preserved Building" },
                        { k: "has_virtual_tour", l: "🥽 Virtual Tour" },
                        { k: "has_video_tour", l: "🎥 Video Tour" },
                      ].map(({ k, l }) => (
                        <ToggleChip key={k} active={(form as any)[k]} onClick={() => toggle(k)}>{l}</ToggleChip>
                      ))}
                    </div>
                    <SectionTitle>Suitable For</SectionTitle>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { k: "suitable_student", l: "🎓 Students" },
                        { k: "suitable_holiday", l: "🌴 Holiday Home" },
                        { k: "suitable_investment", l: "💰 Investment" },
                        { k: "suitable_commercial_use", l: "🏢 Commercial Use" },
                      ].map(({ k, l }) => (
                        <ToggleChip key={k} active={(form as any)[k]} onClick={() => toggle(k)}>{l}</ToggleChip>
                      ))}
                    </div>
                  </>
                )}

                {isLand(pt) && (
                  <>
                    <SectionTitle>Land Classification</SectionTitle>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { k: "is_buildable", l: "🏗️ Buildable" },
                        { k: "within_city_plan", l: "🗺️ Within City Plan" },
                        { k: "within_settlement", l: "🏘️ Within Settlement" },
                        { k: "has_land_concession", l: "📄 Land Concession" },
                        { k: "is_corner", l: "📐 Corner Plot" },
                        { k: "has_view", l: "👁️ View" },
                        { k: "has_facade", l: "🏛️ Facade" },
                      ].map(({ k, l }) => (
                        <ToggleChip key={k} active={(form as any)[k]} onClick={() => toggle(k)}>{l}</ToggleChip>
                      ))}
                    </div>
                    <SectionTitle>Utilities</SectionTitle>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { k: "has_water_supply", l: "💧 Water Supply" },
                        { k: "has_electricity_supply", l: "⚡ Electricity Supply" },
                      ].map(({ k, l }) => (
                        <ToggleChip key={k} active={(form as any)[k]} onClick={() => toggle(k)}>{l}</ToggleChip>
                      ))}
                    </div>
                    <SectionTitle>Suitable For</SectionTitle>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { k: "suitable_holiday", l: "🌴 Tourism Development" },
                        { k: "suitable_investment", l: "💰 Investment" },
                        { k: "suitable_commercial_use", l: "🏢 Commercial" },
                      ].map(({ k, l }) => (
                        <ToggleChip key={k} active={(form as any)[k]} onClick={() => toggle(k)}>{l}</ToggleChip>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ── STEP 4: Location ── */}
            {step === 4 && (
              <div className="space-y-4">
                <h2 className="font-display text-xl font-semibold">Location</h2>
                <div>
                  <FieldLabel required>City</FieldLabel>
                  <Input placeholder="e.g. Athens" value={form.city} onChange={e => set("city", e.target.value)} />
                </div>
                <div>
                  <FieldLabel>Street Address</FieldLabel>
                  <Input placeholder="e.g. Voukourestiou 14" value={form.address} onChange={e => set("address", e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><FieldLabel>Region / Municipality</FieldLabel><Input placeholder="Attica" value={form.region} onChange={e => set("region", e.target.value)} /></div>
                  <div><FieldLabel>Postal Code</FieldLabel><Input placeholder="10674" value={form.postal_code} onChange={e => set("postal_code", e.target.value)} /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><FieldLabel>Cadastre Number</FieldLabel><Input placeholder="Optional" value={form.cadastre_number} onChange={e => set("cadastre_number", e.target.value)} /></div>
                  <div><FieldLabel>ENFIA Zone</FieldLabel><Input placeholder="e.g. Zone 3" value={form.enfia_zone} onChange={e => set("enfia_zone", e.target.value)} /></div>
                </div>
                <div className="flex items-start gap-2 bg-primary/5 border border-primary/20 rounded-xl p-3 text-xs text-muted-foreground">
                  <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <span>Exact coordinates will be requested separately. Address is shown approximately on the map for privacy.</span>
                </div>
              </div>
            )}

            {/* ── STEP 5: Pricing ── */}
            {step === 5 && (
              <div className="space-y-4">
                <h2 className="font-display text-xl font-semibold">Pricing</h2>
                <div>
                  <FieldLabel required>{lt === "rent" ? "Monthly Rent (€)" : "Asking Price (€)"}</FieldLabel>
                  <Input type="number" placeholder={lt === "rent" ? "800" : "250000"} value={form.price} onChange={e => set("price", e.target.value)} />
                  {form.sqm && form.price && (
                    <p className="text-xs text-muted-foreground mt-1">
                      €{Math.round(Number(form.price) / Number(form.sqm)).toLocaleString()}/m²
                    </p>
                  )}
                </div>
                {lt === "rent" && (
                  <>
                    <SectionTitle>Rental Terms</SectionTitle>
                    <div className="grid grid-cols-2 gap-3">
                      <div><FieldLabel>Security Deposit (months)</FieldLabel><Input type="number" placeholder="2" value={form.deposit_months} onChange={e => set("deposit_months", e.target.value)} /></div>
                      <div><FieldLabel>Avg Monthly Shared Expenses (€)</FieldLabel><Input type="number" placeholder="50" value={form.monthly_expenses} onChange={e => set("monthly_expenses", e.target.value)} /></div>
                      <div><FieldLabel>Min Rental Period (months)</FieldLabel><Input type="number" placeholder="12" value={form.min_rental_months} onChange={e => set("min_rental_months", e.target.value)} /></div>
                      <div><FieldLabel>Available From</FieldLabel><Input type="date" value={form.available_from} onChange={e => set("available_from", e.target.value)} /></div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <ToggleChip active={form.agent_fee_included} onClick={() => toggle("agent_fee_included")}>✅ No Agent Fee</ToggleChip>
                      <ToggleChip active={form.pets_allowed} onClick={() => toggle("pets_allowed")}>🐾 Pets Allowed</ToggleChip>
                      <ToggleChip active={form.short_term_rental} onClick={() => toggle("short_term_rental")}>📅 Short-term / Airbnb</ToggleChip>
                    </div>
                  </>
                )}
                {lt === "auction" && (
                  <>
                    <SectionTitle>Auction Details</SectionTitle>
                    <div><FieldLabel>Starting Bid (€)</FieldLabel><Input type="number" value={form.auction_starting_bid} onChange={e => set("auction_starting_bid", e.target.value)} /></div>
                    <div><FieldLabel>Auction Date & Time</FieldLabel><Input type="datetime-local" value={form.auction_date} onChange={e => set("auction_date", e.target.value)} /></div>
                    <div><FieldLabel>Court / Platform</FieldLabel><Input placeholder="e.g. Athens Court of First Instance" value={form.auction_court} onChange={e => set("auction_court", e.target.value)} /></div>
                  </>
                )}
              </div>
            )}

            {/* ── STEP 6: Photos ── */}
            {step === 6 && (
              <div className="space-y-5">
                <div>
                  <h2 className="font-display text-xl font-semibold">Property Photos</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Upload up to 20 photos. Drag to reorder. Click "Set as cover" to choose the main photo.
                  </p>
                </div>

                {/* Drop zone */}
                <div
                  onDragOver={e => e.preventDefault()}
                  onDrop={handleDrop}
                  className="relative border-2 border-dashed border-border rounded-2xl p-8 text-center hover:border-primary/50 transition-colors group"
                >
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="absolute inset-0 opacity-0 cursor-pointer"
                    onChange={e => handleFilesSelected(e.target.files)}
                  />
                  <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2 group-hover:text-primary transition-colors" />
                  <p className="text-sm font-medium">Drop photos here or click to upload</p>
                  <p className="text-xs text-muted-foreground mt-1">JPG, PNG, WEBP — up to 10MB each — max 20 photos</p>
                </div>

                {/* Gallery */}
                {images.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-muted-foreground font-medium">{images.length} photo{images.length !== 1 ? "s" : ""} uploaded</span>
                      <span className="text-xs text-muted-foreground">Drag to reorder</span>
                    </div>
                    <ImageGallery
                      images={images}
                      coverImageId={coverImageId}
                      onSetCover={setCoverImageId}
                      onRemove={handleRemove}
                      onReorder={handleReorder}
                    />
                  </div>
                )}

                {/* Cover preview */}
                {coverImageId && images.find(img => img.id === coverImageId) && (
                  <div className="flex items-center gap-3 p-3 bg-primary/5 border border-primary/20 rounded-xl">
                    <img
                      src={images.find(img => img.id === coverImageId)?.url}
                      alt="Cover"
                      className="w-12 h-12 rounded-lg object-cover"
                    />
                    <div>
                      <p className="text-xs font-semibold text-primary">Cover photo selected</p>
                      <p className="text-xs text-muted-foreground">This image will be the main thumbnail</p>
                    </div>
                  </div>
                )}

                {images.length === 0 && (
                  <div className="flex items-start gap-2 bg-muted/40 border border-border rounded-xl p-3 text-xs text-muted-foreground">
                    <Info className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>Adding photos increases listing visibility by up to 3x. You can still publish without photos.</span>
                  </div>
                )}
              </div>
            )}

            {/* ── Navigation ── */}
            <div className="flex items-center justify-between mt-8 pt-6 border-t border-border">
              <Button variant="outline" onClick={() => step > 1 ? setStep(s => s - 1) : navigate("/dashboard")} className="gap-2">
                <ChevronLeft className="w-4 h-4" />
                {step === 1 ? "Cancel" : "Back"}
              </Button>
              {step < 6 ? (
                <Button onClick={() => setStep(s => s + 1)} className="bg-gradient-primary border-0 text-primary-foreground gap-2">
                  Next <ChevronRight className="w-4 h-4" />
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => handleSubmit(true)} disabled={submitting}>Save Draft</Button>
                  <Button className="bg-gradient-primary border-0 text-primary-foreground" onClick={() => handleSubmit(false)} disabled={submitting}>
                    {submitting ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Publishing...</> : "Publish Listing"}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
