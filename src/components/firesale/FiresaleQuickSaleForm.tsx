/**
 * Self-contained multi-step Quick Sale™ form.
 * Manages all form state, validation, photo upload, and AI estimate internally.
 */

import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Flame,
  Check,
  MapPin,
  Shield,
  Euro,
  Loader2,
  Sparkles,
  Hash,
  Upload,
  X,
  ImageIcon,
  BarChart2,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { isSellSideRole } from "@/lib/authUtils";
import { useSubscription } from "@/hooks/useSubscription";
import { isAiUsageLimitError } from "@/lib/aiErrorUtils";
import { toast } from "sonner";
import { logger } from "@/lib/logger";

const propertyTypeOptions = [
  { value: "apartment", label: "🏢 Apartment" },
  { value: "house", label: "🏡 House" },
  { value: "villa", label: "🌴 Villa" },
  { value: "land", label: "🌿 Land / Plot" },
  { value: "office", label: "🖥️ Office" },
  { value: "commercial_shop", label: "🛍️ Retail Shop" },
  { value: "commercial_warehouse", label: "📦 Warehouse / Storage" },
  { value: "commercial_hotel", label: "🏨 Hotel / B&B" },
  { value: "commercial_restaurant", label: "🍽️ Restaurant / Café" },
  { value: "commercial_clinic", label: "🔬 Clinic / Medical" },
  { value: "commercial_industrial", label: "🏗️ Industrial Space" },
  { value: "commercial_showroom", label: "🖼️ Showroom" },
  { value: "commercial_hall", label: "🎪 Hall / Event Space" },
  { value: "commercial_mixed", label: "🔀 Mixed-Use Building" },
];

const NOW_YEAR = new Date().getFullYear();

export function FiresaleQuickSaleForm() {
  const { user, profile } = useAuth();
  const { isPro: _isPro } = useSubscription();
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
  const [addressSuggestions, setAddressSuggestions] = useState<string[]>([]);
  const [addressLoading, setAddressLoading] = useState(false);
  const addressAbortRef = useRef<AbortController | null>(null);

  const canSubmitQuickSale = !!user && isSellSideRole(profile);

  const [form, setForm] = useState({
    address: "",
    kaek: "",
    propertyType: "",
    sqm: "",
    askingPrice: "",
    constructionYear: "",
    contactName: profile?.display_name || profile?.first_name || "",
    contactEmail: user?.email || "",
    contactPhone: profile?.phone || "",
    notes: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

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
  const normalizeKaek = (raw: string) => raw.replace(/\s+/g, "").trim();

  const validateStep1 = () => {
    const next: Record<string, string> = {};
    if (!form.address.trim() || form.address.trim().length < 5)
      next.address = "Please enter a full address (min 5 characters).";
    const kaek = normalizeKaek(form.kaek);
    if (!kaek) next.kaek = "KAEK is required.";
    else if (!/^\d{12}(\/\d{1,2})?(\/\d{1,2})?$/.test(kaek))
      next.kaek = "KAEK format looks invalid (e.g. 050240601001/0/1).";
    if (!form.propertyType) next.propertyType = "Property type is required.";
    const sqm = Number(form.sqm);
    if (!form.sqm || Number.isNaN(sqm)) next.sqm = "Size (m²) is required.";
    else if (sqm < 10 || sqm > 5000) next.sqm = "Size (m²) must be between 10 and 5000.";
    const asking = Number(form.askingPrice);
    if (!form.askingPrice || Number.isNaN(asking)) next.askingPrice = "Asking price is required.";
    else if (asking < 5_000 || asking > 100_000_000)
      next.askingPrice = "Asking price must be between €5,000 and €100,000,000.";
    const year = Number(form.constructionYear);
    if (!form.constructionYear || Number.isNaN(year)) next.constructionYear = "Construction year is required.";
    else if (year < 1800 || year > NOW_YEAR + 1)
      next.constructionYear = `Construction year must be between 1800 and ${NOW_YEAR + 1}.`;
    if (photoFiles.length < 5) next.photos = "Please upload at least 5 property photos.";
    if (!form.notes.trim() || form.notes.trim().length < 10)
      next.notes = "Please add a short note (min 10 characters).";
    return next;
  };

  const validateStep2 = () => {
    const next: Record<string, string> = {};
    if (!form.contactName.trim() || form.contactName.trim().length < 2)
      next.contactName = "Full name is required.";
    if (!form.contactEmail.trim()) next.contactEmail = "Email is required.";
    else if (!/\S+@\S+\.\S+/.test(form.contactEmail)) next.contactEmail = "Email looks invalid.";
    const phone = form.contactPhone.replace(/\s+/g, "").trim();
    if (!phone) next.contactPhone = "Phone number is required.";
    else if (!/^\+?[0-9]{8,15}$/.test(phone))
      next.contactPhone = "Phone number looks invalid (use digits, optionally starting with +).";
    return next;
  };

  // Address autocomplete via Nominatim
  useEffect(() => {
    const q = form.address.trim();
    if (addressAbortRef.current) {
      addressAbortRef.current.abort();
      addressAbortRef.current = null;
    }
    if (q.length < 3) {
      setAddressSuggestions([]);
      setAddressLoading(false);
      return;
    }
    const controller = new AbortController();
    addressAbortRef.current = controller;
    setAddressLoading(true);
    const timeout = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=5&q=${encodeURIComponent(q)}`,
          {
            headers: {
              "Accept-Language": "el,en",
              "User-Agent": "maiprop-listing-site-firesale-autocomplete",
            },
            signal: controller.signal,
          },
        );
        const json = await res.json().catch(() => []);
        if (Array.isArray(json)) {
          setAddressSuggestions(json.map((r: { display_name: string }) => r.display_name));
        } else {
          setAddressSuggestions([]);
        }
      } catch (_err: unknown) {
        setAddressSuggestions([]);
      } finally {
        setAddressLoading(false);
      }
    }, 400);
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [form.address]);

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
    const valid = files.filter((f) => ALLOWED_MIME.has(f.type) && f.size < 10 * 1024 * 1024);
    if (valid.length < files.length) toast.warning("Some files were skipped (must be images under 10MB).");
    const newFiles = [...photoFiles, ...valid].slice(0, 10);
    setPhotoFiles(newFiles);
    setPhotoPreviews(newFiles.map((f) => URL.createObjectURL(f)));
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removePhoto = (idx: number) => {
    setPhotoFiles((f) => f.filter((_, i) => i !== idx));
    setPhotoPreviews((p) => p.filter((_, i) => i !== idx));
  };

  const compressImage = (file: File, maxDim = 1600, quality = 0.75): Promise<Blob> =>
    new Promise((resolve) => {
      const img = new Image();
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result !== "string") { resolve(file); return; }
        img.onload = () => {
          try {
            const canvas = document.createElement("canvas");
            let { width, height } = img;
            if (width > height && width > maxDim) { height = (height * maxDim) / width; width = maxDim; }
            else if (height > maxDim) { width = (width * maxDim) / height; height = maxDim; }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext("2d");
            if (!ctx) { resolve(file); return; }
            ctx.drawImage(img, 0, 0, width, height);
            const CANVAS_ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
            const type = file.type && CANVAS_ALLOWED.has(file.type) ? file.type : "image/jpeg";
            canvas.toBlob((blob) => { if (blob) resolve(blob); else resolve(file); }, type, quality);
          } catch (_err: unknown) { resolve(file); }
        };
        img.onerror = () => resolve(file);
        img.src = reader.result;
      };
      reader.onerror = () => resolve(file);
      reader.readAsDataURL(file);
    });

  const uploadPhotos = async (rid: string): Promise<string[]> => {
    const urls: string[] = [];
    for (const file of photoFiles) {
      const ext = file.name.split(".").pop();
      const path = `${rid}/${crypto.randomUUID()}.${ext}`;
      const compressed = await compressImage(file);
      const { error } = await supabase.storage.from("firesale-photos").upload(path, compressed);
      if (error) {
        logger.warn("[Firesale] photo upload failed:", error.message);
        toast.warning("One photo could not be uploaded and was skipped.");
      } else {
        const { data } = supabase.storage.from("firesale-photos").getPublicUrl(path);
        urls.push(data.publicUrl);
      }
    }
    return urls;
  };

  const step1Valid = Object.keys(validateStep1()).length === 0;
  const step2Valid = Object.keys(validateStep2()).length === 0;

  const generateEstimate = async () => {
    const basePerSqm: Record<string, number> = {
      villa: 3200, house: 2400, apartment: 2000,
      commercial: 2800, office: 2600, land: 900,
    };
    setAiEstimate(Math.round((basePerSqm[form.propertyType] || 2000) * Number(form.sqm) * 0.92));
    if (!user) { setAiLoading(false); return; }
    setAiLoading(true);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke("property-valuation", {
        body: { property_type: form.propertyType, sqm: Number(form.sqm) },
      });
      if (data?.estimated_value) {
        setAiEstimate(Math.round(data.estimated_value * 0.95));
      } else if (isAiUsageLimitError(fnErr, data)) {
        toast.error("AI estimate is temporarily unavailable due to usage limits.");
      }
    } catch (e: unknown) {
      if (isAiUsageLimitError(e, null)) toast.error("AI estimate is temporarily unavailable due to usage limits.");
    } finally {
      setAiLoading(false);
    }
  };

  const handleContinue = async () => {
    if (!canSubmitQuickSale) {
      toast.error("To submit a Quick Sale™ request, please sign up as a Seller first.");
      if (!user) { navigate("/signup?type=seller"); }
      else {
        try { sessionStorage.setItem("signup_participant_type", "seller"); localStorage.setItem("signup_participant_type", "seller"); } catch (_err: unknown) { /* ignore */ }
        navigate("/onboarding");
      }
      return;
    }
    const v1 = validateStep1();
    setErrors(v1);
    if (Object.keys(v1).length > 0) { toast.error(Object.values(v1)[0] || "Please fix the highlighted fields."); return; }
    await generateEstimate();
    setStep(2);
  };

  const handleSubmit = async () => {
    if (!user) { toast.error("You must be logged in to submit a Quick Sale™ request."); navigate("/login"); return; }
    if (!canSubmitQuickSale) {
      toast.error("Please complete Seller signup to submit a Quick Sale™ request.");
      try { sessionStorage.setItem("signup_participant_type", "seller"); localStorage.setItem("signup_participant_type", "seller"); } catch (_err: unknown) { /* ignore */ }
      navigate("/onboarding");
      return;
    }
    const v1 = validateStep1();
    const v2 = validateStep2();
    const merged = { ...v1, ...v2 };
    setErrors(merged);
    if (Object.keys(merged).length > 0) { toast.error(Object.values(merged)[0] || "Please fix the highlighted fields."); return; }

    setSubmitting(true);
    try {
      const estimate = aiEstimate || Math.round(Number(form.sqm) * 1900 * 0.92);
      const metaLines: string[] = [];
      if (form.constructionYear.trim()) metaLines.push(`Construction year: ${form.constructionYear.trim()}`);
      if (photoFiles.length > 0) {
        const count = photoFiles.length;
        const grade = count >= 8 ? 9 : count >= 5 ? 7 : count >= 3 ? 5 : 3;
        metaLines.push(`Photo condition grade (1–10): ${grade}`);
      }
      if (form.kaek.trim()) metaLines.push(`KAEK: ${normalizeKaek(form.kaek)}`);
      if (form.notes.trim()) metaLines.push(form.notes.trim());

      const { data, error } = await supabase
        .from("firesale_requests")
        .insert({
          address: form.address.trim(),
          city: form.address.split(",").pop()?.trim() || "",
          property_type: form.propertyType as "apartment" | "house" | "villa" | "land" | "office",
          sqm: Number(form.sqm),
          condition: null,
          asking_price: Number(form.askingPrice),
          contact_email: form.contactEmail.trim(),
          contact_phone: form.contactPhone.trim() || null,
          notes: metaLines.join("\n") || null,
          ai_estimate: estimate,
          user_id: user.id,
          status: "pending",
        })
        .select("id")
        .single();

      if (error) throw error;

      if (photoFiles.length > 0 && data?.id) {
        setUploadingPhotos(true);
        try { await uploadPhotos(data.id); } catch (_err: unknown) { /* non-blocking */ } finally { setUploadingPhotos(false); }
      }

      setAiEstimate(estimate);
      setRequestId(data?.id || null);
      setSubmitted(true);
      toast.success("Your Quick Sale™ request has been submitted!");
    } catch (err: unknown) {
      toast.error((err instanceof Error ? err.message : null) || "Submission failed. Please try again.");
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
    setForm((f) => ({ ...f, address: "", kaek: "", propertyType: "", sqm: "", askingPrice: "", notes: "" }));
  };

  if (submitted) {
    return (
      <div className="glass-card rounded-2xl border border-primary/30 p-8 text-center shadow-elevated">
        <div className="relative w-20 h-20 mx-auto mb-6">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary/20 to-accent/10 flex items-center justify-center">
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-primary to-accent/80 flex items-center justify-center shadow-lg">
              <Check className="w-7 h-7 text-primary-foreground" strokeWidth={3} />
            </div>
          </div>
        </div>
        <h3 className="font-display font-black text-2xl mb-2">Request Submitted! 🎉</h3>
        <p className="text-muted-foreground text-sm mb-2 leading-relaxed">
          Your Quick Sale™ request is live in our investor deal flow.
        </p>
        {requestId && (
          <p className="text-[11px] text-muted-foreground mb-6 font-mono bg-secondary border border-border rounded-lg px-3 py-1.5 inline-block">
            Ref: <span className="text-primary font-semibold">{requestId.slice(0, 8).toUpperCase()}</span>
          </p>
        )}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { time: "Now", label: "Request live", color: "text-primary", icon: "✅" },
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
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1.5">AI Offer Estimate</p>
          <p className="font-display font-black text-4xl text-primary mb-1">€{aiEstimate?.toLocaleString()}</p>
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
              <Check className="w-3 h-3 text-primary shrink-0" /> {t}
            </div>
          ))}
        </div>
        <div className="flex gap-3">
          <Button variant="outline" className="flex-1 border-border" onClick={handleReset}>Submit another</Button>
          <Button
            className="flex-1 bg-gradient-primary border-0 text-primary-foreground gap-2"
            onClick={() => navigate("/investor-dashboard")}
          >
            <BarChart2 className="w-3.5 h-3.5" /> Track Status
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card rounded-2xl border border-primary/20 overflow-hidden shadow-elevated animate-fade-in">
      {/* Header */}
      <div className="px-5 sm:px-7 py-5 border-b border-border bg-gradient-to-r from-destructive/5 to-transparent">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-destructive/10 flex items-center justify-center">
            <Flame className="w-4.5 h-4.5 text-destructive" />
          </div>
          <div>
            <h3 className="font-display font-bold text-base">Get Your Instant Cash Offer</h3>
            <p className="text-xs text-muted-foreground">Free · No obligation · Confidential</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {[1, 2].map((n) => (
              <div key={n} className={`w-7 h-1.5 rounded-full transition-all ${step >= n ? "bg-primary" : "bg-border"}`} />
            ))}
            <span className="text-[10px] text-muted-foreground ml-1">{step}/2</span>
          </div>
        </div>
      </div>

      <div className="p-5 sm:p-7">
        {step === 1 && (
          <div className="space-y-5">
            <h4 className="font-display font-semibold text-sm">Property Details</h4>

            {!canSubmitQuickSale && (
              <div className="rounded-xl bg-muted border border-border p-3 flex items-start gap-3">
                <Lock className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">Seller account required</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    To submit a Quick Sale™ request, you must have a Seller profile. It's free — Pro is not required.
                  </p>
                  <div className="mt-2">
                    <Button
                      size="sm"
                      className="bg-gradient-primary border-0 text-primary-foreground"
                      onClick={() => {
                        if (!user) { navigate("/signup?type=seller"); return; }
                        try { sessionStorage.setItem("signup_participant_type", "seller"); localStorage.setItem("signup_participant_type", "seller"); } catch (_err: unknown) { /* ignore */ }
                        navigate("/onboarding");
                      }}
                    >
                      {user ? "Become a Seller" : "Sign up as Seller"}
                    </Button>
                  </div>
                </div>
              </div>
            )}

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
              {errors.address && <p className="mt-1 text-xs text-destructive">{errors.address}</p>}
              {addressLoading && <p className="mt-1 text-[10px] text-muted-foreground">Searching address suggestions…</p>}
              {!addressLoading && addressSuggestions.length > 0 && (
                <div className="mt-1 bg-background border border-border rounded-xl shadow-md text-sm max-h-40 overflow-auto">
                  {addressSuggestions.map((s) => (
                    <button key={s} type="button" onClick={() => { upd("address", s); setAddressSuggestions([]); }}
                      className="w-full text-left px-3 py-1.5 hover:bg-muted/80">
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* KAEK */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
                KAEK <span className="text-destructive">*</span>{" "}
                <span className="text-[10px] font-normal normal-case text-muted-foreground">(Κωδικός Αριθμός Εθνικού Κτηματολογίου)</span>
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
              {errors.kaek && <p className="mt-1 text-xs text-destructive">{errors.kaek}</p>}
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
                {errors.propertyType && <p className="mt-1 text-xs text-destructive">{errors.propertyType}</p>}
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
                {errors.sqm && <p className="mt-1 text-xs text-destructive">{errors.sqm}</p>}
              </div>
              <div className="col-span-2">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
                  Asking Price <span className="text-destructive">*</span>
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
                {errors.askingPrice && <p className="mt-1 text-xs text-destructive">{errors.askingPrice}</p>}
              </div>
              <div className="col-span-2">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
                  Construction Year <span className="text-destructive">*</span>
                </label>
                <input
                  type="number"
                  placeholder="e.g. 1998"
                  value={form.constructionYear}
                  onChange={(e) => upd("constructionYear", e.target.value)}
                  className="w-full bg-muted border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors"
                />
                {errors.constructionYear && <p className="mt-1 text-xs text-destructive">{errors.constructionYear}</p>}
              </div>
            </div>

            {/* Photo upload */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
                Property Photos <span className="text-destructive">*</span>{" "}
                <span className="text-[10px] font-normal normal-case text-muted-foreground">(min 5, up to 10 images)</span>
              </label>
              <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoSelect} />
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
                  <p className="text-[10px] text-muted-foreground">
                    {photoPreviews.length} photo{photoPreviews.length !== 1 ? "s" : ""} selected
                    {photoPreviews.length < 5 && " · add at least 5 photos to continue"}
                  </p>
                  {errors.photos && <p className="text-xs text-destructive">{errors.photos}</p>}
                </div>
              )}
            </div>

            {/* Notes */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
                Additional Notes <span className="text-destructive">*</span>
              </label>
              <textarea
                rows={2}
                placeholder="Legal issues, urgent timeline, property history..."
                value={form.notes}
                onChange={(e) => upd("notes", e.target.value)}
                className="w-full bg-muted border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary resize-none transition-colors"
              />
              {errors.notes && <p className="mt-1 text-xs text-destructive">{errors.notes}</p>}
            </div>

            <Button
              className="w-full bg-gradient-primary border-0 text-primary-foreground h-11"
              disabled={!step1Valid || aiLoading}
              onClick={handleContinue}
            >
              {aiLoading ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Calculating AI estimate...</>
              ) : (
                <><Sparkles className="w-4 h-4 mr-2" />Get AI Estimate &amp; Continue</>
              )}
            </Button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            {aiEstimate && (
              <div className="rounded-xl bg-gradient-to-r from-primary/10 to-accent/5 border border-primary/20 p-4 flex items-center justify-between">
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">AI Estimated Offer</p>
                  <p className="font-display font-black text-2xl text-primary">€{aiEstimate.toLocaleString()}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Indicative · Final offer after review</p>
                </div>
                <div className="text-right">
                  <div className="text-xs bg-primary/10 text-primary border border-primary/20 px-2 py-1 rounded-lg font-semibold">94% confidence</div>
                  <p className="text-[10px] text-muted-foreground mt-1.5">Valid 7 days</p>
                </div>
              </div>
            )}

            <h4 className="font-display font-semibold text-sm">Your Contact Details</h4>
            <p className="text-xs text-muted-foreground -mt-3">Your information is kept strictly confidential.</p>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
                  Full Name <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Your name"
                  value={form.contactName}
                  onChange={(e) => upd("contactName", e.target.value)}
                  className="w-full bg-muted border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors"
                />
                {errors.contactName && <p className="mt-1 text-xs text-destructive">{errors.contactName}</p>}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
                    Email <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="email"
                    placeholder="email@example.com"
                    value={form.contactEmail}
                    onChange={(e) => upd("contactEmail", e.target.value)}
                    className="w-full bg-muted border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors"
                  />
                  {errors.contactEmail && <p className="mt-1 text-xs text-destructive">{errors.contactEmail}</p>}
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
                    Phone <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="tel"
                    placeholder="+30 69..."
                    value={form.contactPhone}
                    onChange={(e) => upd("contactPhone", e.target.value)}
                    className="w-full bg-muted border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors"
                  />
                  {errors.contactPhone && <p className="mt-1 text-xs text-destructive">{errors.contactPhone}</p>}
                </div>
              </div>
            </div>

            <div className="rounded-xl bg-muted border border-border p-3 flex items-start gap-3">
              <Shield className="w-4 h-4 text-brand-emerald mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground leading-relaxed">
                Your data is encrypted and shared{" "}
                <strong className="text-foreground">only with pre-vetted investors</strong> under NDA. We never publish
                your property publicly.
              </p>
            </div>

            <div className="flex gap-3">
              <Button variant="outline" className="border-border" onClick={() => setStep(1)}>Back</Button>
              <Button
                className="flex-1 bg-gradient-to-r from-destructive to-destructive/80 border-0 text-destructive-foreground h-11"
                disabled={!step2Valid || submitting}
                onClick={handleSubmit}
              >
                {submitting ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{uploadingPhotos ? "Uploading photos..." : "Submitting..."}</>
                ) : (
                  <><Flame className="w-4 h-4 mr-2" />Submit Quick Sale™ Request</>
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
