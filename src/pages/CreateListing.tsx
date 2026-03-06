import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronLeft, ChevronRight, Check, Upload, X, Loader2,
  Home, Building2, Zap, MapPin, DollarSign, Image as ImageIcon
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/Navbar";
import { useCreateListing } from "@/hooks/useListings";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

const PROPERTY_TYPES = ["apartment", "house", "villa", "land", "commercial", "office"] as const;
const LISTING_TYPES = ["sale", "rent", "auction"] as const;
const ENERGY_CLASSES = ["A+", "A", "B+", "B", "C", "D", "E", "F", "G"];

const steps = [
  { id: 1, label: "Type", icon: Home },
  { id: 2, label: "Details", icon: Building2 },
  { id: 3, label: "Features", icon: Zap },
  { id: 4, label: "Location", icon: MapPin },
  { id: 5, label: "Pricing", icon: DollarSign },
  { id: 6, label: "Photos", icon: ImageIcon },
];

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="text-xs text-muted-foreground block mb-1.5 font-medium">{children}</label>;
}

function Input({ ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors"
    />
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

export default function CreateListing() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const createListing = useCreateListing();

  const [step, setStep] = useState(1);
  const [uploading, setUploading] = useState(false);
  const [coverImageUrl, setCoverImageUrl] = useState("");

  const [form, setForm] = useState({
    // Step 1 - Type
    listing_type: "sale" as "sale" | "rent" | "auction",
    property_type: "apartment" as typeof PROPERTY_TYPES[number],
    // Step 2 - Details
    title: "",
    description: "",
    bedrooms: "",
    bathrooms: "",
    sqm: "",
    floor: "",
    total_floors: "",
    year_built: "",
    energy_class: "",
    // Step 3 - Features
    has_parking: false,
    has_elevator: false,
    has_garden: false,
    has_pool: false,
    has_storage: false,
    has_security: false,
    has_smart_home: false,
    has_video_tour: false,
    // Step 4 - Location
    address: "",
    city: "",
    region: "",
    postal_code: "",
    cadastre_number: "",
    // Step 5 - Pricing
    price: "",
    auction_starting_bid: "",
    auction_date: "",
    auction_court: "",
    // Step 6 - Photos (covered by coverImageUrl)
  });

  const set = (key: string, value: unknown) => setForm(f => ({ ...f, [key]: value }));
  const toggle = (key: string) => setForm(f => ({ ...f, [key]: !(f as any)[key] }));

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${user.id}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("listing-images").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from("listing-images").getPublicUrl(path);
      setCoverImageUrl(data.publicUrl);
      toast.success("Image uploaded!");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (asDraft = false) => {
    if (!form.title || !form.city || !form.price || !form.sqm) {
      toast.error("Please fill in all required fields");
      return;
    }
    try {
      const payload: any = {
        title: form.title,
        description: form.description || undefined,
        city: form.city,
        address: form.address || undefined,
        region: form.region || undefined,
        postal_code: form.postal_code || undefined,
        cadastre_number: form.cadastre_number || undefined,
        property_type: form.property_type,
        listing_type: form.listing_type,
        price: Number(form.price),
        sqm: Number(form.sqm),
        bedrooms: form.bedrooms ? Number(form.bedrooms) : undefined,
        bathrooms: form.bathrooms ? Number(form.bathrooms) : undefined,
        floor: form.floor ? Number(form.floor) : undefined,
        total_floors: form.total_floors ? Number(form.total_floors) : undefined,
        year_built: form.year_built ? Number(form.year_built) : undefined,
        energy_class: form.energy_class || undefined,
        has_parking: form.has_parking,
        has_elevator: form.has_elevator,
        has_garden: form.has_garden,
        has_pool: form.has_pool,
        has_storage: form.has_storage,
        has_security: form.has_security,
        has_smart_home: form.has_smart_home,
        has_video_tour: form.has_video_tour,
        cover_image_url: coverImageUrl || undefined,
        price_per_sqm: Math.round(Number(form.price) / Number(form.sqm)),
      };
      if (form.listing_type === "auction") {
        if (form.auction_starting_bid) payload.auction_starting_bid = Number(form.auction_starting_bid);
        if (form.auction_date) payload.auction_date = form.auction_date;
        if (form.auction_court) payload.auction_court = form.auction_court;
      }

      // Create with draft or active status
      const { data, error } = await supabase
        .from("listings")
        .insert({ ...payload, owner_id: user!.id, status: asDraft ? "draft" : "active" } as any)
        .select()
        .single();
      if (error) throw error;
      toast.success(asDraft ? "Listing saved as draft!" : "Listing published successfully!");
      navigate(`/property/${data.id}`);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const features = [
    { key: "has_parking", label: "Parking", emoji: "🚗" },
    { key: "has_elevator", label: "Elevator", emoji: "🛗" },
    { key: "has_garden", label: "Garden", emoji: "🌿" },
    { key: "has_pool", label: "Pool", emoji: "🏊" },
    { key: "has_storage", label: "Storage", emoji: "📦" },
    { key: "has_security", label: "Security", emoji: "🔒" },
    { key: "has_smart_home", label: "Smart Home", emoji: "🏡" },
    { key: "has_video_tour", label: "Video Tour", emoji: "🎥" },
  ];

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
            {/* Step 1 - Type */}
            {step === 1 && (
              <div className="space-y-6">
                <h2 className="font-display text-xl font-semibold">What are you listing?</h2>
                <div>
                  <FieldLabel>Listing Type</FieldLabel>
                  <div className="grid grid-cols-3 gap-3">
                    {LISTING_TYPES.map(t => (
                      <button
                        key={t}
                        onClick={() => set("listing_type", t)}
                        className={`p-4 rounded-xl border text-sm font-medium transition-all capitalize ${
                          form.listing_type === t
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-secondary text-muted-foreground hover:text-foreground hover:border-primary/50"
                        }`}
                      >
                        {t === "sale" ? "🏷️ For Sale" : t === "rent" ? "🔑 For Rent" : "⚖️ Auction"}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <FieldLabel>Property Type</FieldLabel>
                  <div className="grid grid-cols-3 gap-3">
                    {PROPERTY_TYPES.map(t => (
                      <button
                        key={t}
                        onClick={() => set("property_type", t)}
                        className={`p-3 rounded-xl border text-sm font-medium transition-all capitalize ${
                          form.property_type === t
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-secondary text-muted-foreground hover:text-foreground hover:border-primary/50"
                        }`}
                      >
                        {t === "apartment" ? "🏢" : t === "house" ? "🏠" : t === "villa" ? "🏡" :
                          t === "land" ? "🌾" : t === "commercial" ? "🏪" : "🏗️"} {t}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Step 2 - Details */}
            {step === 2 && (
              <div className="space-y-4">
                <h2 className="font-display text-xl font-semibold">Property Details</h2>
                <div>
                  <FieldLabel>Title *</FieldLabel>
                  <Input placeholder="e.g. Modern 2-bed apartment in Kolonaki" value={form.title} onChange={e => set("title", e.target.value)} />
                </div>
                <div>
                  <FieldLabel>Description</FieldLabel>
                  <Textarea placeholder="Describe the property..." value={form.description} onChange={e => set("description", e.target.value)} rows={4} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><FieldLabel>Bedrooms</FieldLabel><Input type="number" placeholder="2" value={form.bedrooms} onChange={e => set("bedrooms", e.target.value)} /></div>
                  <div><FieldLabel>Bathrooms</FieldLabel><Input type="number" placeholder="1" value={form.bathrooms} onChange={e => set("bathrooms", e.target.value)} /></div>
                  <div><FieldLabel>Area (m²) *</FieldLabel><Input type="number" placeholder="85" value={form.sqm} onChange={e => set("sqm", e.target.value)} /></div>
                  <div><FieldLabel>Year Built</FieldLabel><Input type="number" placeholder="2010" value={form.year_built} onChange={e => set("year_built", e.target.value)} /></div>
                  <div><FieldLabel>Floor</FieldLabel><Input type="number" placeholder="3" value={form.floor} onChange={e => set("floor", e.target.value)} /></div>
                  <div><FieldLabel>Total Floors</FieldLabel><Input type="number" placeholder="6" value={form.total_floors} onChange={e => set("total_floors", e.target.value)} /></div>
                </div>
                <div>
                  <FieldLabel>Energy Class</FieldLabel>
                  <div className="flex gap-2 flex-wrap">
                    {ENERGY_CLASSES.map(c => (
                      <button key={c} onClick={() => set("energy_class", c)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                          form.energy_class === c ? "bg-brand-emerald/20 border border-brand-emerald text-brand-emerald" : "bg-secondary border border-border text-muted-foreground"
                        }`}>{c}</button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Step 3 - Features */}
            {step === 3 && (
              <div className="space-y-6">
                <h2 className="font-display text-xl font-semibold">Features & Amenities</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {features.map(f => (
                    <button
                      key={f.key}
                      onClick={() => toggle(f.key)}
                      className={`p-4 rounded-xl border text-sm transition-all ${
                        (form as any)[f.key]
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-secondary text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <div className="text-2xl mb-1">{f.emoji}</div>
                      <div className="text-xs font-medium">{f.label}</div>
                      {(form as any)[f.key] && <Check className="w-3 h-3 mx-auto mt-1" />}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Step 4 - Location */}
            {step === 4 && (
              <div className="space-y-4">
                <h2 className="font-display text-xl font-semibold">Location</h2>
                <div>
                  <FieldLabel>City *</FieldLabel>
                  <Input placeholder="e.g. Athens" value={form.city} onChange={e => set("city", e.target.value)} />
                </div>
                <div>
                  <FieldLabel>Address</FieldLabel>
                  <Input placeholder="Street address" value={form.address} onChange={e => set("address", e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><FieldLabel>Region</FieldLabel><Input placeholder="Attica" value={form.region} onChange={e => set("region", e.target.value)} /></div>
                  <div><FieldLabel>Postal Code</FieldLabel><Input placeholder="10674" value={form.postal_code} onChange={e => set("postal_code", e.target.value)} /></div>
                </div>
                <div>
                  <FieldLabel>Cadastre Number</FieldLabel>
                  <Input placeholder="Optional" value={form.cadastre_number} onChange={e => set("cadastre_number", e.target.value)} />
                </div>
              </div>
            )}

            {/* Step 5 - Pricing */}
            {step === 5 && (
              <div className="space-y-4">
                <h2 className="font-display text-xl font-semibold">Pricing</h2>
                <div>
                  <FieldLabel>
                    {form.listing_type === "rent" ? "Monthly Rent (€) *" : "Price (€) *"}
                  </FieldLabel>
                  <Input type="number" placeholder={form.listing_type === "rent" ? "800" : "250000"} value={form.price} onChange={e => set("price", e.target.value)} />
                  {form.sqm && form.price && (
                    <p className="text-xs text-muted-foreground mt-1">
                      €{Math.round(Number(form.price) / Number(form.sqm)).toLocaleString()}/m²
                    </p>
                  )}
                </div>
                {form.listing_type === "auction" && (
                  <>
                    <div>
                      <FieldLabel>Starting Bid (€)</FieldLabel>
                      <Input type="number" value={form.auction_starting_bid} onChange={e => set("auction_starting_bid", e.target.value)} />
                    </div>
                    <div>
                      <FieldLabel>Auction Date</FieldLabel>
                      <Input type="datetime-local" value={form.auction_date} onChange={e => set("auction_date", e.target.value)} />
                    </div>
                    <div>
                      <FieldLabel>Court / Platform</FieldLabel>
                      <Input placeholder="e.g. Athens Court of First Instance" value={form.auction_court} onChange={e => set("auction_court", e.target.value)} />
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Step 6 - Photos */}
            {step === 6 && (
              <div className="space-y-6">
                <h2 className="font-display text-xl font-semibold">Cover Photo</h2>
                <div className="border-2 border-dashed border-border rounded-2xl p-8 text-center hover:border-primary/50 transition-colors relative">
                  {coverImageUrl ? (
                    <div className="relative">
                      <img src={coverImageUrl} alt="Cover" className="w-full h-48 object-cover rounded-xl" />
                      <button
                        onClick={() => setCoverImageUrl("")}
                        className="absolute top-2 right-2 p-1.5 rounded-full bg-destructive text-destructive-foreground"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <Upload className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                      <p className="font-medium text-sm">Upload cover photo</p>
                      <p className="text-xs text-muted-foreground mt-1">JPG, PNG up to 10MB</p>
                    </>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                </div>
                {uploading && (
                  <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" /> Uploading...
                  </div>
                )}
                {/* Summary */}
                <div className="bg-secondary rounded-xl p-4 space-y-2 text-sm">
                  <h3 className="font-semibold text-xs text-muted-foreground uppercase tracking-wider mb-3">Summary</h3>
                  <div className="flex justify-between"><span className="text-muted-foreground">Type</span><span className="capitalize font-medium">{form.listing_type} · {form.property_type}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Title</span><span className="font-medium truncate max-w-[200px]">{form.title || "—"}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">City</span><span className="font-medium">{form.city || "—"}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Price</span><span className="font-medium text-primary">€{Number(form.price).toLocaleString()}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Area</span><span className="font-medium">{form.sqm} m²</span></div>
                </div>
              </div>
            )}

            {/* Navigation */}
            <div className="flex items-center justify-between mt-8 pt-6 border-t border-border">
              <Button
                variant="outline"
                className="border-border gap-2"
                onClick={() => step > 1 ? setStep(step - 1) : navigate("/dashboard")}
              >
                <ChevronLeft className="w-4 h-4" />
                {step === 1 ? "Cancel" : "Back"}
              </Button>

              <div className="flex gap-2">
                {step === 6 && (
                  <Button
                    variant="outline"
                    className="border-border"
                    onClick={() => handleSubmit(true)}
                    disabled={createListing.isPending}
                  >
                    Save as Draft
                  </Button>
                )}
                {step < 6 ? (
                  <Button
                    className="bg-gradient-primary border-0 text-primary-foreground gap-2"
                    onClick={() => setStep(step + 1)}
                  >
                    Next <ChevronRight className="w-4 h-4" />
                  </Button>
                ) : (
                  <Button
                    className="bg-gradient-primary border-0 text-primary-foreground gap-2"
                    onClick={() => handleSubmit(false)}
                    disabled={createListing.isPending || uploading}
                  >
                    {createListing.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    Publish Listing
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
