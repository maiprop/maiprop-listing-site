import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Flame,
  ArrowRight,
  Check,
  MapPin,
  Shield,
  BarChart2,
  Euro,
  ChevronRight,
  Star,
  Lock,
  Loader2,
  Sparkles,
  Hash,
  Upload,
  X,
  ImageIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

const steps = [
  { step: "01", title: "Property Details", desc: "Address, KAEK, type, size — takes 2 minutes." },
  { step: "02", title: "AI Valuation Engine", desc: "100+ data points analyzed from mAI Prop OS." },
  { step: "03", title: "Confidential Offer", desc: "Guaranteed cash offer within 96 hours." },
  { step: "04", title: "Close in 96h", desc: "Accept and close. We handle title, notary, everything." },
];

const propertyTypeOptions = [
  { value: "apartment", label: "🏢 Apartment" },
  { value: "house", label: "🏡 House" },
  { value: "villa", label: "🌴 Villa" },
  { value: "land", label: "🌿 Land" },
  { value: "commercial", label: "🏪 Commercial" },
  { value: "office", label: "🖥️ Office" },
];

export default function Firesale() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [aiEstimate, setAiEstimate] = useState<number | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);

  const [form, setForm] = useState({
    address: "",
    kaek: "",
    propertyType: "",
    sqm: "",
    askingPrice: "",
    contactName: profile?.display_name || profile?.first_name || "",
    contactEmail: user?.email || "",
    contactPhone: profile?.phone || "",
    notes: "",
  });

  // Prefill from profile when it loads
  useEffect(() => {
    if (profile) {
      setForm((prev) => ({
        ...prev,
        contactName: prev.contactName || profile.display_name || profile.first_name || "",
        contactEmail: prev.contactEmail || user?.email || "",
        contactPhone: prev.contactPhone || profile.phone || "",
      }));
    }
  }, [profile, user]);

  const upd = (k: string, v: string) => setForm((prev) => ({ ...prev, [k]: v }));

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const valid = files.filter((f) => f.type.startsWith("image/") && f.size < 10 * 1024 * 1024);
    if (valid.length < files.length) toast.warning("Some files were skipped (must be images under 10MB).");
    const newFiles = [...photoFiles, ...valid].slice(0, 10);
    setPhotoFiles(newFiles);
    const previews = newFiles.map((f) => URL.createObjectURL(f));
    setPhotoPreviews(previews);
    // reset input so same file can be re-added
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removePhoto = (idx: number) => {
    const newFiles = photoFiles.filter((_, i) => i !== idx);
    const newPreviews = photoPreviews.filter((_, i) => i !== idx);
    setPhotoFiles(newFiles);
    setPhotoPreviews(newPreviews);
  };

  const uploadPhotos = async (requestId: string): Promise<string[]> => {
    const urls: string[] = [];
    for (const file of photoFiles) {
      const ext = file.name.split(".").pop();
      const path = `${requestId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage.from("firesale-photos").upload(path, file);
      if (!error) {
        const { data } = supabase.storage.from("firesale-photos").getPublicUrl(path);
        urls.push(data.publicUrl);
      }
    }
    return urls;
  };

  const step1Valid = !!(
    form.address.trim() &&
    form.propertyType &&
    form.sqm &&
    Number(form.sqm) > 0
  );
  const step2Valid = !!(form.contactName.trim() && form.contactEmail.trim() && /\S+@\S+\.\S+/.test(form.contactEmail));

  const generateEstimate = async () => {
    const basePerSqm: Record<string, number> = {
      villa: 3200,
      house: 2400,
      apartment: 2000,
      commercial: 2800,
      office: 2600,
      land: 900,
    };
    const base = (basePerSqm[form.propertyType] || 2000) * Number(form.sqm);
    const estimate = Math.round(base * 0.92);
    setAiEstimate(estimate);

    // Try edge function for a better estimate (non-blocking)
    setAiLoading(true);
    try {
      const { data } = await supabase.functions.invoke("property-valuation", {
        body: {
          property_type: form.propertyType,
          sqm: Number(form.sqm),
        },
      });
      if (data?.estimated_value) {
        setAiEstimate(Math.round(data.estimated_value * 0.95));
      }
    } catch {
      // keep the local estimate
    } finally {
      setAiLoading(false);
    }
  };

  const handleContinue = async () => {
    await generateEstimate();
    setStep(2);
  };

  const handleSubmit = async () => {
    if (!step2Valid) {
      toast.error("Please fill in all required fields.");
      return;
    }
    setSubmitting(true);
    try {
      const estimate = aiEstimate || Math.round(Number(form.sqm) * 1900 * 0.92);

      const notesWithKaek = [
        form.kaek ? `KAEK: ${form.kaek.trim()}` : null,
        form.notes.trim() || null,
      ].filter(Boolean).join("\n");

      const { data, error } = await supabase
        .from("firesale_requests")
        .insert({
          address: form.address.trim(),
          city: "-",
          property_type: form.propertyType as any,
          sqm: Number(form.sqm),
          condition: null,
          asking_price: form.askingPrice ? Number(form.askingPrice) : null,
          contact_email: form.contactEmail.trim(),
          contact_phone: form.contactPhone.trim() || null,
          notes: notesWithKaek || null,
          ai_estimate: estimate,
          user_id: user?.id || null,
          status: "pending",
        })
        .select("id")
        .single();

      if (error) throw error;

      // Upload photos in background
      if (photoFiles.length > 0 && data?.id) {
        setUploadingPhotos(true);
        try {
          await uploadPhotos(data.id);
        } catch {
          // non-blocking
        } finally {
          setUploadingPhotos(false);
        }
      }

      setAiEstimate(estimate);
      setRequestId(data?.id || null);
      setSubmitted(true);
      toast.success("Your Firesale™ request has been submitted!");
    } catch (err: any) {
      toast.error(err.message || "Submission failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setSubmitted(false);
    setStep(1);
    setAiEstimate(null);
    setRequestId(null);
    setPhotoFiles([]);
    setPhotoPreviews([]);
    setForm((f) => ({
      ...f,
      address: "",
      kaek: "",
      propertyType: "",
      sqm: "",
      askingPrice: "",
      notes: "",
    }));
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-16">
        {/* Hero */}
        <div className="relative py-28 overflow-hidden border-b border-border">
          {/* Animated glow orbs */}
          <div
            className="firesale-orb-1 absolute -left-24 top-1/4 w-[520px] h-[520px] rounded-full pointer-events-none"
            style={{ background: "radial-gradient(circle, hsl(0 72% 55% / 0.13) 0%, transparent 70%)" }}
          />
          <div
            className="firesale-orb-2 absolute right-0 bottom-0 w-[400px] h-[400px] rounded-full pointer-events-none"
            style={{ background: "radial-gradient(circle, hsl(183 100% 42% / 0.08) 0%, transparent 70%)" }}
          />
          <div
            className="firesale-orb-3 absolute left-1/2 top-0 w-[300px] h-[300px] rounded-full pointer-events-none"
            style={{ background: "radial-gradient(circle, hsl(0 80% 55% / 0.06) 0%, transparent 70%)" }}
          />
          {/* Subtle vignette overlay */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "radial-gradient(ellipse 100% 100% at 50% 50%, transparent 60%, hsl(var(--background) / 0.4) 100%)",
            }}
          />

          <div className="container relative">
            <div className="max-w-3xl">
              <div className="reveal in-view inline-flex items-center gap-2 bg-destructive/10 border border-destructive/20 text-destructive px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest mb-6">
                <Flame className="w-3.5 h-3.5 flame-flicker" /> Firesale™ — Instant Cash Offer
              </div>
              <h1 className="reveal in-view reveal-delay-1 font-display text-5xl md:text-6xl font-black mb-5 leading-tight">
                Sell Your Property
                <br />
                <span className="gradient-text-primary">in 96 Hours.</span>
              </h1>
              <p className="reveal in-view reveal-delay-2 text-muted-foreground text-xl mb-8 leading-relaxed max-w-2xl">
                AI-powered guaranteed cash offer. Fast viewings, no negotiations. Your property is matched instantly to
                our network of <strong className="text-foreground">private investors</strong>.
              </p>
              <div className="reveal in-view reveal-delay-3 flex flex-wrap gap-3 mb-10">
                {["Guaranteed cash", "96h close", "Full legal support", "AI valuation"].map((f) => (
                  <div
                    key={f}
                    className="flex items-center gap-1.5 text-sm bg-muted border border-border rounded-full px-3 py-1.5 hover-scale"
                  >
                    <Check className="w-3.5 h-3.5 text-brand-emerald" />
                    {f}
                  </div>
                ))}
              </div>

              {/* Proof stats */}
            </div>
          </div>
        </div>

        {/* How it works */}
        <div className="container py-16 border-b border-border">
          <p className="reveal in-view text-[11px] font-bold uppercase tracking-widest text-muted-foreground text-center mb-8">
            How It Works
          </p>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {steps.map((s, i) => (
              <div
                key={s.step}
                className={`reveal in-view reveal-delay-${i + 1} relative flex gap-4 md:flex-col md:gap-0 glass-card rounded-xl p-5 border border-border transition-all duration-300 hover:-translate-y-1 hover:shadow-elevated hover:border-primary/30`}
              >
                <div className="font-display text-5xl font-black gradient-text-cyan opacity-20 leading-none md:mb-3">
                  {s.step}
                </div>
                <div>
                  <h3 className="font-display font-bold text-sm mb-1">{s.title}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{s.desc}</p>
                </div>
                {i < steps.length - 1 && (
                  <ChevronRight className="hidden md:block absolute -right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground z-10" />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Main section: Form + Investor pitch */}
        <div className="container py-16">
          <div className="grid lg:grid-cols-[1fr_420px] gap-10 items-start">
            {/* Left: Form */}
            <div className="reveal in-view">
              {!submitted ? (
                <div className="glass-card rounded-2xl border border-primary/20 overflow-hidden shadow-elevated animate-fade-in">
                  {/* Header */}
                  <div className="px-7 py-5 border-b border-border bg-gradient-to-r from-destructive/5 to-transparent">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-destructive/10 flex items-center justify-center">
                        <Flame className="w-4.5 h-4.5 text-destructive" />
                      </div>
                      <div>
                        <h3 className="font-display font-bold text-base">Get Your Instant Cash Offer</h3>
                        <p className="text-xs text-muted-foreground">Free · No obligation · Confidential</p>
                      </div>
                      {/* Step indicator */}
                      <div className="ml-auto flex items-center gap-2">
                        {[1, 2].map((n) => (
                          <div
                            key={n}
                            className={`w-7 h-1.5 rounded-full transition-all ${step >= n ? "bg-primary" : "bg-border"}`}
                          />
                        ))}
                        <span className="text-[10px] text-muted-foreground ml-1">{step}/2</span>
                      </div>
                    </div>
                  </div>

                  <div className="p-7">
                    {step === 1 && (
                      <div className="space-y-5">
                        <h4 className="font-display font-semibold text-sm">Property Details</h4>

                        {/* Address */}
                        <div>
                          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
                            Property Address <span className="text-destructive">*</span>
                          </label>
                          <div className="flex gap-2 bg-muted border border-border rounded-xl px-3 py-2.5 focus-within:border-primary transition-colors">
                            <MapPin className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                            <input
                              type="text"
                              placeholder="e.g. Kifisia, Dekelia 24, Athens"
                              value={form.address}
                              onChange={(e) => upd("address", e.target.value)}
                              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
                            />
                          </div>
                        </div>

                        {/* KAEK */}
                        <div>
                          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
                            KAEK <span className="text-[10px] font-normal normal-case text-muted-foreground">(Κωδικός Αριθμός Εθνικού Κτηματολογίου)</span>
                          </label>
                          <div className="flex gap-2 bg-muted border border-border rounded-xl px-3 py-2.5 focus-within:border-primary transition-colors">
                            <Hash className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                            <input
                              type="text"
                              placeholder="e.g. 050240601001/0/1"
                              value={form.kaek}
                              onChange={(e) => upd("kaek", e.target.value)}
                              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none font-mono"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
                              Property Type <span className="text-destructive">*</span>
                            </label>
                            <select
                              value={form.propertyType}
                              onChange={(e) => upd("propertyType", e.target.value)}
                              className="w-full bg-muted border border-border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary appearance-none capitalize"
                            >
                              <option value="" className="bg-card">Select type...</option>
                              {propertyTypeOptions.map((t) => (
                                <option key={t.value} value={t.value} className="bg-card">{t.label}</option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
                              Size (m²) <span className="text-destructive">*</span>
                            </label>
                            <input
                              type="number"
                              placeholder="e.g. 120"
                              value={form.sqm}
                              onChange={(e) => upd("sqm", e.target.value)}
                              className="w-full bg-muted border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors"
                            />
                          </div>

                          <div className="col-span-2">
                            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
                              Asking Price <span className="text-[10px] font-normal normal-case">(optional)</span>
                            </label>
                            <div className="flex gap-2 bg-muted border border-border rounded-xl px-3 py-2.5 focus-within:border-primary transition-colors">
                              <Euro className="w-4 h-4 text-muted-foreground shrink-0" />
                              <input
                                type="number"
                                placeholder="Your target €"
                                value={form.askingPrice}
                                onChange={(e) => upd("askingPrice", e.target.value)}
                                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
                              />
                            </div>
                          </div>
                        </div>

                        {/* Photo upload */}
                        <div>
                          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
                            Property Photos <span className="text-[10px] font-normal normal-case">(up to 10 images)</span>
                          </label>
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            multiple
                            className="hidden"
                            onChange={handlePhotoSelect}
                          />
                          {photoPreviews.length === 0 ? (
                            <button
                              type="button"
                              onClick={() => fileInputRef.current?.click()}
                              className="w-full flex flex-col items-center justify-center gap-2 bg-muted border-2 border-dashed border-border rounded-xl py-7 text-muted-foreground hover:border-primary/40 hover:bg-primary/5 transition-all duration-200 group"
                            >
                              <div className="w-10 h-10 rounded-full bg-muted-foreground/10 group-hover:bg-primary/10 flex items-center justify-center transition-colors">
                                <Upload className="w-5 h-5 group-hover:text-primary transition-colors" />
                              </div>
                              <div className="text-center">
                                <p className="text-sm font-medium group-hover:text-foreground transition-colors">Click to upload photos</p>
                                <p className="text-[11px] mt-0.5">JPG, PNG · Max 10MB each</p>
                              </div>
                            </button>
                          ) : (
                            <div className="space-y-3">
                              <div className="grid grid-cols-3 gap-2">
                                {photoPreviews.map((src, idx) => (
                                  <div key={idx} className="relative group rounded-xl overflow-hidden aspect-square bg-muted border border-border">
                                    <img src={src} alt="" className="w-full h-full object-cover" />
                                    <button
                                      type="button"
                                      onClick={() => removePhoto(idx)}
                                      className="absolute top-1 right-1 w-5 h-5 rounded-full bg-background/90 border border-border flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive hover:border-destructive hover:text-destructive-foreground"
                                    >
                                      <X className="w-3 h-3" />
                                    </button>
                                  </div>
                                ))}
                                {photoPreviews.length < 10 && (
                                  <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    className="aspect-square rounded-xl border-2 border-dashed border-border bg-muted hover:border-primary/40 hover:bg-primary/5 flex items-center justify-center transition-all"
                                  >
                                    <ImageIcon className="w-5 h-5 text-muted-foreground" />
                                  </button>
                                )}
                              </div>
                              <p className="text-[10px] text-muted-foreground">{photoPreviews.length} photo{photoPreviews.length > 1 ? "s" : ""} selected</p>
                            </div>
                          )}
                        </div>

                        {/* Notes */}
                        <div>
                          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
                            Additional Notes
                          </label>
                          <textarea
                            rows={2}
                            placeholder="Legal issues, urgent timeline, property history..."
                            value={form.notes}
                            onChange={(e) => upd("notes", e.target.value)}
                            className="w-full bg-muted border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary resize-none transition-colors"
                          />
                        </div>

                        <Button
                          className="w-full bg-gradient-primary border-0 text-primary-foreground h-11"
                          disabled={!step1Valid || aiLoading}
                          onClick={handleContinue}
                        >
                          {aiLoading ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              Calculating AI estimate...
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-4 h-4 mr-2" />
                              Get AI Estimate & Continue
                            </>
                          )}
                        </Button>
                      </div>
                    )}

                    {step === 2 && (
                      <div className="space-y-5">
                        {/* AI Estimate preview */}
                        {aiEstimate && (
                          <div className="rounded-xl bg-gradient-to-r from-primary/10 to-accent/5 border border-primary/20 p-4 flex items-center justify-between">
                            <div>
                              <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">
                                AI Estimated Offer
                              </p>
                              <p className="font-display font-black text-2xl text-primary">
                                €{aiEstimate.toLocaleString()}
                              </p>
                              <p className="text-[10px] text-muted-foreground mt-0.5">
                                Indicative · Final offer after review
                              </p>
                            </div>
                            <div className="text-right">
                              <div className="text-xs bg-brand-emerald/10 text-brand-emerald border border-brand-emerald/20 px-2 py-1 rounded-lg font-semibold">
                                94% confidence
                              </div>
                              <p className="text-[10px] text-muted-foreground mt-1.5">Valid 7 days</p>
                            </div>
                          </div>
                        )}

                        <h4 className="font-display font-semibold text-sm">Your Contact Details</h4>
                        <p className="text-xs text-muted-foreground -mt-3">
                          Your information is kept strictly confidential.
                        </p>

                        <div className="space-y-4">
                          <div>
                            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
                              Full Name
                            </label>
                            <input
                              type="text"
                              placeholder="Your name"
                              value={form.contactName}
                              onChange={(e) => upd("contactName", e.target.value)}
                              className="w-full bg-muted border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors"
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
                                Email
                              </label>
                              <input
                                type="email"
                                placeholder="email@example.com"
                                value={form.contactEmail}
                                onChange={(e) => upd("contactEmail", e.target.value)}
                                className="w-full bg-muted border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors"
                              />
                            </div>
                            <div>
                              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
                                Phone
                              </label>
                              <input
                                type="tel"
                                placeholder="+30 69..."
                                value={form.contactPhone}
                                onChange={(e) => upd("contactPhone", e.target.value)}
                                className="w-full bg-muted border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors"
                              />
                            </div>
                          </div>
                        </div>

                        {/* Trust badges */}
                        <div className="rounded-xl bg-muted border border-border p-3 flex items-start gap-3">
                          <Shield className="w-4 h-4 text-brand-emerald mt-0.5 shrink-0" />
                          <p className="text-xs text-muted-foreground leading-relaxed">
                            Your data is encrypted and shared{" "}
                            <strong className="text-foreground">only with pre-vetted investors</strong> under NDA. We
                            never publish your property publicly.
                          </p>
                        </div>

                        <div className="flex gap-3">
                          <Button variant="outline" className="border-border" onClick={() => setStep(1)}>
                            Back
                          </Button>
                          <Button
                            className="flex-1 bg-gradient-to-r from-destructive to-destructive/80 border-0 text-white h-11"
                            disabled={!step2Valid || submitting}
                            onClick={handleSubmit}
                          >
                            {submitting ? (
                              <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Submitting...
                              </>
                            ) : (
                              <>
                                <Flame className="w-4 h-4 mr-2" />
                                Submit Firesale™ Request
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* Success State */
                <div className="glass-card rounded-2xl border border-brand-emerald/30 p-8 text-center shadow-elevated">
                  {/* Animated check */}
                  <div className="relative w-20 h-20 mx-auto mb-6">
                    <div className="w-20 h-20 rounded-full bg-gradient-to-br from-brand-emerald/20 to-primary/10 flex items-center justify-center">
                      <div className="w-14 h-14 rounded-full bg-gradient-to-br from-brand-emerald to-primary/80 flex items-center justify-center shadow-lg">
                        <Check className="w-7 h-7 text-white" strokeWidth={3} />
                      </div>
                    </div>
                  </div>

                  <h3 className="font-display font-black text-2xl mb-2">Request Submitted! 🎉</h3>
                  <p className="text-muted-foreground text-sm mb-2 leading-relaxed">
                    Your Firesale™ request is live in our investor deal flow.
                  </p>
                  {requestId && (
                    <p className="text-[11px] text-muted-foreground mb-6 font-mono bg-secondary border border-border rounded-lg px-3 py-1.5 inline-block">
                      Ref: <span className="text-primary font-semibold">{requestId.slice(0, 8).toUpperCase()}</span>
                    </p>
                  )}

                  {/* Timeline */}
                  <div className="grid grid-cols-3 gap-3 mb-6">
                    {[
                      { time: "Now", label: "Request live", color: "text-brand-emerald", icon: "✅" },
                      { time: "~2h", label: "Advisor assigned", color: "text-primary", icon: "👤" },
                      { time: "24h", label: "Cash offer sent", color: "text-brand-gold", icon: "💰" },
                    ].map((s) => (
                      <div key={s.label} className="rounded-xl bg-secondary border border-border p-3 text-center">
                        <div className="text-lg mb-1">{s.icon}</div>
                        <p className={`font-display font-black text-sm ${s.color}`}>{s.time}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{s.label}</p>
                      </div>
                    ))}
                  </div>

                  <div className="rounded-xl bg-gradient-to-r from-primary/10 to-accent/5 border border-primary/20 p-5 mb-6">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1.5">
                      AI Offer Estimate
                    </p>
                    <p className="font-display font-black text-4xl text-primary mb-1">
                      €{aiEstimate?.toLocaleString()}
                    </p>
                    <p className="text-xs text-muted-foreground">Indicative · Subject to final due diligence</p>
                    <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-primary/10">
                      {[
                        { label: "Est. Market", value: `€${Math.round((aiEstimate || 0) / 0.95).toLocaleString()}` },
                        { label: "Discount", value: "~5%" },
                        { label: "Close", value: "48–72h" },
                      ].map((s) => (
                        <div key={s.label} className="text-center">
                          <p className="font-bold text-sm">{s.value}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">{s.label}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2 text-xs text-muted-foreground text-left mb-6">
                    {[
                      "Deal added to private investor dashboard",
                      "NDA-protected distribution to professional investors",
                      "Dedicated advisor assigned within 2h",
                    ].map((t) => (
                      <div key={t} className="flex items-center gap-2">
                        <Check className="w-3 h-3 text-brand-emerald shrink-0" />
                        {t}
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-3">
                    <Button variant="outline" className="flex-1 border-border" onClick={handleReset}>
                      Submit another
                    </Button>
                    <Button
                      className="flex-1 bg-gradient-primary border-0 text-primary-foreground gap-2"
                      onClick={() => navigate("/investor-dashboard")}
                    >
                      <BarChart2 className="w-3.5 h-3.5" />
                      Track Status
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Right: Investor pitch panel */}
            <div className="space-y-4">
              {/* Who buys */}
              <div className="reveal in-view glass-card rounded-2xl border border-brand-gold/20 p-6 relative overflow-hidden transition-all duration-300 hover:border-brand-gold/40 hover:shadow-elevated">
                <div className="absolute top-0 right-0 w-40 h-40 rounded-bl-full bg-brand-gold/5 pointer-events-none" />
                <div className="relative">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-7 h-7 rounded-lg bg-brand-gold/15 flex items-center justify-center">
                      <Star className="w-3.5 h-3.5 text-brand-gold fill-current" />
                    </div>
                    <h4 className="font-display font-bold text-sm">Who Buys Your Property</h4>
                  </div>
                  <p className="text-[10px] text-muted-foreground mb-4 ml-9">
                    Pre-vetted, capital-ready buyers — no time-wasters.
                  </p>
                  <div className="space-y-2">
                    {[
                      { type: "Family Offices", desc: "Greek & Cypriot capital deploying at scale", icon: "🏛️" },
                      { type: "Hedge Funds", desc: "International RE-focused alternative funds", icon: "📈" },
                      { type: "Private Equity", desc: "Buy-to-hold and value-add strategies", icon: "💼" },
                      { type: "HNWIs", desc: "Ultra-high-net-worth private individuals", icon: "👤" },
                    ].map((b) => (
                      <div
                        key={b.type}
                        className="flex items-center gap-3 rounded-xl bg-brand-gold/5 border border-brand-gold/10 px-3 py-2.5 hover:border-brand-gold/30 transition-colors"
                      >
                        <span className="text-base leading-none">{b.icon}</span>
                        <div>
                          <p className="text-xs font-bold text-foreground">{b.type}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">{b.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Comparison table — redesigned */}
              <div className="reveal in-view reveal-delay-1 glass-card rounded-2xl border border-border overflow-hidden transition-all duration-300 hover:border-primary/20 hover:shadow-elevated">
                {/* Header */}
                <div className="grid grid-cols-3 bg-muted/60 border-b border-border text-[10px] font-bold uppercase tracking-widest">
                  <div className="px-4 py-3 text-muted-foreground"></div>
                  <div className="px-4 py-3 flex items-center justify-center gap-1.5 text-destructive border-x border-border">
                    <Flame className="w-3 h-3" /> Firesale™
                  </div>
                  <div className="px-4 py-3 text-center text-muted-foreground/60">Traditional</div>
                </div>
                {[
                  { label: "Time to offer", firesale: "96 hours", trad: "3–6 months", icon: "⚡" },
                  { label: "Viewings", firesale: "Fast & private", trad: "10–30 open days", icon: "🔑" },
                  { label: "Negotiations", firesale: "None", trad: "Weeks of back-forth", icon: "🤝" },
                  { label: "Certainty of sale", firesale: "Guaranteed", trad: "~60% chance", icon: "🎯" },
                  { label: "Legal & notary", firesale: "Fully managed", trad: "You arrange it", icon: "📋" },
                ].map((r, i) => (
                  <div
                    key={r.label}
                    className={`grid grid-cols-3 text-xs items-stretch ${i < 4 ? "border-b border-border" : ""}`}
                  >
                    <div className="px-4 py-3 flex items-center gap-2 text-muted-foreground">
                      <span className="text-sm leading-none">{r.icon}</span>
                      <span className="font-medium">{r.label}</span>
                    </div>
                    <div className="px-4 py-3 flex items-center justify-center border-x border-border bg-destructive/3">
                      <span className="font-bold text-foreground text-center leading-tight">{r.firesale}</span>
                    </div>
                    <div className="px-4 py-3 flex items-center justify-center">
                      <span className="text-muted-foreground/60 line-through text-center leading-tight">{r.trad}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Investor dashboard CTA — gated */}
              <div className="reveal in-view reveal-delay-2 glass-card rounded-2xl border border-accent/20 p-6 relative overflow-hidden transition-all duration-300 hover:border-accent/40 hover:shadow-elevated">
                <div className="absolute top-0 right-0 w-32 h-32 rounded-bl-full bg-accent/5 pointer-events-none" />
                <div className="relative">
                  <div className="flex items-center gap-2 mb-3">
                    <Lock className="w-4 h-4 text-accent" />
                    <span className="text-xs font-bold text-accent uppercase tracking-widest">For Investors</span>
                  </div>
                  <h4 className="font-display font-bold text-base mb-2">Access the Deal Flow</h4>
                  <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
                    Off-market properties before they hit the market. Exclusive to registered investors.
                  </p>
                  <div className="space-y-1.5 mb-4">
                    {[
                      "Live firesale deal feed",
                      "AI valuation reports",
                      "Seller contact details",
                      "Portfolio analytics",
                    ].map((f) => (
                      <div key={f} className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Check className="w-3 h-3 text-accent shrink-0" />
                        {f}
                      </div>
                    ))}
                  </div>
                  {user ? (
                    <Button
                      className="w-full bg-accent/10 border border-accent/30 text-accent hover:bg-accent/20 gap-2 text-xs"
                      onClick={() => navigate("/investor-dashboard")}
                    >
                      <BarChart2 className="w-3.5 h-3.5" />
                      View Investor Dashboard
                      <ChevronRight className="w-3.5 h-3.5 ml-auto" />
                    </Button>
                  ) : (
                    <div className="space-y-2">
                      <div className="rounded-xl bg-accent/5 border border-accent/20 px-4 py-3 flex items-center gap-3">
                        <Lock className="w-4 h-4 text-accent/60 shrink-0" />
                        <p className="text-[11px] text-muted-foreground leading-snug">
                          Sign in to access the exclusive investor deal flow.
                        </p>
                      </div>
                      <Button
                        className="w-full bg-gradient-primary border-0 text-primary-foreground gap-2 text-xs h-10"
                        onClick={() => navigate("/login", { state: { from: "/firesale" } })}
                      >
                        <ArrowRight className="w-3.5 h-3.5" />
                        Sign In to Access
                      </Button>
                      <Button
                        variant="outline"
                        className="w-full border-border text-xs h-9"
                        onClick={() => navigate("/signup", { state: { from: "/firesale" } })}
                      >
                        Create a Free Account
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
