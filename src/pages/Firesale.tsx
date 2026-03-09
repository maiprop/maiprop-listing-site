import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Flame, ArrowRight, Check, MapPin, Zap, Clock, Shield, Building2,
  Home, BarChart2, Euro, TrendingDown, ChevronRight, Star, Lock,
  Loader2, Phone, Mail, Hash, AlertCircle, Sparkles
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

const steps = [
  { step: "01", title: "Property Details", desc: "Address, type, size, condition — takes 2 minutes." },
  { step: "02", title: "AI Valuation Engine", desc: "100+ data points analyzed from mAI Prop OS." },
  { step: "03", title: "Confidential Offer", desc: "Guaranteed cash offer within 24 hours." },
  { step: "04", title: "Close in 48h", desc: "Accept and close. We handle title, notary, everything." },
];

const proofStats = [
  { value: "€2.4B+", label: "Deal flow processed", color: "text-primary" },
  { value: "312", label: "Active buyers", color: "text-brand-gold" },
  { value: "94%", label: "AI confidence avg.", color: "text-brand-emerald" },
  { value: "48h", label: "Average close time", color: "text-accent" },
];

const conditionOptions = [
  { value: "excellent", label: "Excellent", sublabel: "Move-in ready", disc: "−3%", emoji: "✨" },
  { value: "good",      label: "Good",      sublabel: "Minor works only", disc: "−7%",  emoji: "👍" },
  { value: "fair",      label: "Fair",      sublabel: "Needs renovation", disc: "−12%", emoji: "🔨" },
  { value: "needs-work",label: "Major Reno", sublabel: "Full renovation req.", disc: "−20%", emoji: "⚠️" },
];

const propertyTypeOptions = [
  { value: "apartment", label: "🏢 Apartment" },
  { value: "house",     label: "🏡 House" },
  { value: "villa",     label: "🌴 Villa" },
  { value: "land",      label: "🌿 Land" },
  { value: "commercial",label: "🏪 Commercial" },
  { value: "office",    label: "🖥️ Office" },
];

export default function Firesale() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [aiEstimate, setAiEstimate] = useState<number | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [requestId, setRequestId] = useState<string | null>(null);

  const [form, setForm] = useState({
    address: "",
    city: "",
    propertyType: "",
    sqm: "",
    bedrooms: "",
    condition: "",
    askingPrice: "",
    contactName: profile?.display_name || profile?.first_name || "",
    contactEmail: user?.email || "",
    contactPhone: profile?.phone || "",
    notes: "",
  });

  // Prefill from profile when it loads
  useEffect(() => {
    if (profile) {
      setForm(prev => ({
        ...prev,
        contactName: prev.contactName || profile.display_name || profile.first_name || "",
        contactEmail: prev.contactEmail || user?.email || "",
        contactPhone: prev.contactPhone || profile.phone || "",
      }));
    }
  }, [profile, user]);

  const upd = (k: string, v: string) => setForm(prev => ({ ...prev, [k]: v }));

  const step1Valid = !!(form.address.trim() && form.city.trim() && form.propertyType && form.sqm && Number(form.sqm) > 0 && form.condition);
  const step2Valid = !!(form.contactName.trim() && form.contactEmail.trim() && /\S+@\S+\.\S+/.test(form.contactEmail));

  const generateEstimate = async () => {
    const basePerSqm: Record<string, number> = {
      villa: 3200, house: 2400, apartment: 2000, commercial: 2800, office: 2600, land: 900,
    };
    const condDiscount: Record<string, number> = {
      excellent: 0.97, good: 0.93, fair: 0.87, "needs-work": 0.80,
    };
    const base = (basePerSqm[form.propertyType] || 2000) * Number(form.sqm);
    const estimate = Math.round(base * (condDiscount[form.condition] || 0.90) * 0.95);
    setAiEstimate(estimate);

    // Try edge function for a better estimate (non-blocking)
    setAiLoading(true);
    try {
      const { data } = await supabase.functions.invoke("property-valuation", {
        body: {
          city: form.city,
          property_type: form.propertyType,
          sqm: Number(form.sqm),
          bedrooms: form.bedrooms ? Number(form.bedrooms) : undefined,
          condition: form.condition,
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
    if (!step2Valid) { toast.error("Please fill in all required fields."); return; }
    setSubmitting(true);
    try {
      const estimate = aiEstimate || Math.round(Number(form.sqm) * 1900 * 0.92);

      const { data, error } = await supabase.from("firesale_requests").insert({
        address: form.address.trim(),
        city: form.city.trim(),
        property_type: form.propertyType as any,
        sqm: Number(form.sqm),
        bedrooms: form.bedrooms ? Number(form.bedrooms) : null,
        condition: form.condition,
        asking_price: form.askingPrice ? Number(form.askingPrice) : null,
        contact_email: form.contactEmail.trim(),
        contact_phone: form.contactPhone.trim() || null,
        notes: form.notes.trim() || null,
        ai_estimate: estimate,
        user_id: user?.id || null,
        status: "pending",
      }).select("id").single();

      if (error) throw error;

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
    setForm(f => ({
      ...f,
      address: "", city: "", propertyType: "", sqm: "", bedrooms: "",
      condition: "", askingPrice: "", notes: "",
    }));
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-16">

        {/* Hero */}
        <div className="relative py-24 overflow-hidden border-b border-border">
          <div className="absolute inset-0" style={{
            background: "radial-gradient(ellipse 80% 60% at 20% 50%, hsl(0 72% 55% / 0.08), transparent 70%), radial-gradient(ellipse 60% 80% at 80% 30%, hsl(183 100% 42% / 0.05), transparent 60%)"
          }} />
          <div className="container relative">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 bg-destructive/10 border border-destructive/20 text-destructive px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest mb-6">
                <Flame className="w-3.5 h-3.5" /> Firesale™ — Instant Cash Offer
              </div>
              <h1 className="font-display text-5xl md:text-6xl font-black mb-5 leading-tight">
                Sell Your Property<br />
                <span className="gradient-text-primary">in 48 Hours.</span>
              </h1>
              <p className="text-muted-foreground text-xl mb-8 leading-relaxed max-w-2xl">
                AI-powered guaranteed cash offer. No agent fees, no viewings, no negotiations.
                Your property is matched instantly to our network of <strong className="text-foreground">312 vetted private investors</strong>.
              </p>
              <div className="flex flex-wrap gap-3 mb-10">
                {["Zero commission", "Guaranteed cash", "48h close", "Full legal support", "AI valuation"].map(f => (
                  <div key={f} className="flex items-center gap-1.5 text-sm bg-muted border border-border rounded-full px-3 py-1.5">
                    <Check className="w-3.5 h-3.5 text-brand-emerald" />{f}
                  </div>
                ))}
              </div>

              {/* Proof stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {proofStats.map(s => (
                  <div key={s.label} className="glass-card rounded-xl p-4 border border-border text-center">
                    <div className={`font-display font-black text-2xl ${s.color}`}>{s.value}</div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* How it works */}
        <div className="container py-16 border-b border-border">
          <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground text-center mb-8">How It Works</p>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {steps.map((s, i) => (
              <div key={s.step} className="relative flex gap-4 md:flex-col md:gap-0 glass-card rounded-xl p-5 border border-border">
                <div className="font-display text-5xl font-black gradient-text-cyan opacity-20 leading-none md:mb-3">{s.step}</div>
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
            <div>
              {!submitted ? (
                <div className="glass-card rounded-2xl border border-primary/20 overflow-hidden shadow-elevated">
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
                        {[1, 2].map(n => (
                          <div key={n} className={`w-7 h-1.5 rounded-full transition-all ${step >= n ? "bg-primary" : "bg-border"}`} />
                        ))}
                        <span className="text-[10px] text-muted-foreground ml-1">{step}/2</span>
                      </div>
                    </div>
                  </div>

                  <div className="p-7">
                    {step === 1 && (
                      <div className="space-y-5">
                        <h4 className="font-display font-semibold text-sm">Property Details</h4>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="col-span-2">
                            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">Property Address</label>
                            <div className="flex gap-2 bg-muted border border-border rounded-xl px-3 py-2.5 focus-within:border-primary transition-colors">
                              <MapPin className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                              <input
                                type="text"
                                placeholder="e.g. Kifisia, Dekelia 24"
                                value={form.address}
                                onChange={e => upd("address", e.target.value)}
                                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
                              />
                            </div>
                          </div>

                          <div>
                            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">City</label>
                            <input
                              type="text"
                              placeholder="e.g. Athens"
                              value={form.city}
                              onChange={e => upd("city", e.target.value)}
                              className="w-full bg-muted border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors"
                            />
                          </div>

                          <div>
                            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">Property Type</label>
                            <select
                              value={form.propertyType}
                              onChange={e => upd("propertyType", e.target.value)}
                              className="w-full bg-muted border border-border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary appearance-none capitalize"
                            >
                              <option value="" className="bg-card">Select type...</option>
                              {propertyTypeOptions.map(t => (
                                <option key={t.value} value={t.value} className="bg-card">{t.label}</option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">Size (m²)</label>
                            <input
                              type="number"
                              placeholder="e.g. 120"
                              value={form.sqm}
                              onChange={e => upd("sqm", e.target.value)}
                              className="w-full bg-muted border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors"
                            />
                          </div>

                          <div>
                            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">Bedrooms</label>
                            <select
                              value={form.bedrooms}
                              onChange={e => upd("bedrooms", e.target.value)}
                              className="w-full bg-muted border border-border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary appearance-none"
                            >
                              <option value="" className="bg-card">—</option>
                              {[1,2,3,4,5,6].map(n => <option key={n} value={n} className="bg-card">{n}</option>)}
                              <option value="7" className="bg-card">7+</option>
                            </select>
                          </div>

                          <div>
                            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">Asking Price (optional)</label>
                            <div className="flex gap-2 bg-muted border border-border rounded-xl px-3 py-2.5 focus-within:border-primary transition-colors">
                              <Euro className="w-4 h-4 text-muted-foreground shrink-0" />
                              <input
                                type="number"
                                placeholder="Your target €"
                                value={form.askingPrice}
                                onChange={e => upd("askingPrice", e.target.value)}
                                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
                              />
                            </div>
                          </div>
                        </div>

                        {/* Condition selector */}
                        <div>
                          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-3">Property Condition</label>
                          <div className="grid grid-cols-2 gap-2">
                            {conditionOptions.map(opt => (
                              <button
                                key={opt.value}
                                onClick={() => upd("condition", opt.value)}
                                className={`text-left p-3.5 rounded-xl border transition-all duration-200 ${
                                  form.condition === opt.value
                                    ? "border-primary bg-primary/10 text-foreground"
                                    : "border-border bg-muted hover:border-primary/40 text-muted-foreground"
                                }`}
                              >
                                <p className="text-xs font-semibold">{opt.label}</p>
                                <p className="text-[10px] text-muted-foreground mt-0.5">Discount: {opt.disc}</p>
                              </button>
                            ))}
                          </div>
                        </div>

                        <div>
                          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">Additional Notes</label>
                          <textarea
                            rows={2}
                            placeholder="Legal issues, urgent timeline, renovation details..."
                            value={form.notes}
                            onChange={e => upd("notes", e.target.value)}
                            className="w-full bg-muted border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary resize-none transition-colors"
                          />
                        </div>

                        <Button
                          className="w-full bg-gradient-primary border-0 text-primary-foreground h-11"
                          disabled={!step1Valid}
                          onClick={() => { generateEstimate(); setStep(2); }}
                        >
                          <Zap className="w-4 h-4 mr-2" />
                          Continue to Contact Details
                        </Button>
                      </div>
                    )}

                    {step === 2 && (
                      <div className="space-y-5">
                        {/* AI Estimate preview */}
                        {aiEstimate && (
                          <div className="rounded-xl bg-gradient-to-r from-primary/10 to-accent/5 border border-primary/20 p-4 flex items-center justify-between">
                            <div>
                              <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">AI Estimated Offer</p>
                              <p className="font-display font-black text-2xl text-primary">€{aiEstimate.toLocaleString()}</p>
                              <p className="text-[10px] text-muted-foreground mt-0.5">Indicative · Final offer after review</p>
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
                        <p className="text-xs text-muted-foreground -mt-3">Your information is kept strictly confidential.</p>

                        <div className="space-y-4">
                          <div>
                            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">Full Name</label>
                            <input
                              type="text"
                              placeholder="Your name"
                              value={form.contactName}
                              onChange={e => upd("contactName", e.target.value)}
                              className="w-full bg-muted border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors"
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">Email</label>
                              <input
                                type="email"
                                placeholder="email@example.com"
                                value={form.contactEmail}
                                onChange={e => upd("contactEmail", e.target.value)}
                                className="w-full bg-muted border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors"
                              />
                            </div>
                            <div>
                              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">Phone</label>
                              <input
                                type="tel"
                                placeholder="+30 69..."
                                value={form.contactPhone}
                                onChange={e => upd("contactPhone", e.target.value)}
                                className="w-full bg-muted border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors"
                              />
                            </div>
                          </div>
                        </div>

                        {/* Trust badges */}
                        <div className="rounded-xl bg-muted border border-border p-3 flex items-start gap-3">
                          <Shield className="w-4 h-4 text-brand-emerald mt-0.5 shrink-0" />
                          <p className="text-xs text-muted-foreground leading-relaxed">
                            Your data is encrypted and shared <strong className="text-foreground">only with pre-vetted investors</strong> under NDA. We never publish your property publicly.
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
                              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Submitting...</>
                            ) : (
                              <><Flame className="w-4 h-4 mr-2" />Submit Firesale™ Request</>
                            )}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* Success State */
                <div className="glass-card rounded-2xl border border-primary/30 p-8 text-center shadow-elevated">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-primary flex items-center justify-center mx-auto mb-5">
                    <Check className="w-8 h-8 text-primary-foreground" />
                  </div>
                  <h3 className="font-display font-black text-2xl mb-2">Request Submitted!</h3>
                  <p className="text-muted-foreground text-sm mb-6 leading-relaxed">
                    Your Firesale™ request is now live in our investor deal flow.<br />
                    Expect contact within <strong className="text-foreground">4–24 hours</strong>.
                  </p>

                  <div className="rounded-xl bg-gradient-to-r from-primary/10 to-accent/5 border border-primary/20 p-5 mb-6">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1.5">Your AI Offer Estimate</p>
                    <p className="font-display font-black text-4xl text-primary mb-1">€{aiEstimate?.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">Indicative · Subject to final due diligence</p>
                    <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-primary/10">
                      {[
                        { label: "Market Value", value: `€${Math.round((aiEstimate || 0) / 0.95).toLocaleString()}` },
                        { label: "vs Market", value: "-5%" },
                        { label: "Close Target", value: "48–72h" },
                      ].map(s => (
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
                      "NDA-protected distribution to 312 buyers",
                      "Dedicated advisor assigned within 2h",
                    ].map(t => (
                      <div key={t} className="flex items-center gap-2">
                        <Check className="w-3 h-3 text-brand-emerald shrink-0" />{t}
                      </div>
                    ))}
                  </div>

                  <Button variant="outline" className="border-border" onClick={() => { setSubmitted(false); setStep(1); setForm(f => ({ ...f, address: "", sqm: "", notes: "" })); }}>
                    Submit another property
                  </Button>
                </div>
              )}
            </div>

            {/* Right: Investor pitch panel */}
            <div className="space-y-4">
              {/* Who buys */}
              <div className="glass-card rounded-2xl border border-brand-gold/20 p-6">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-7 h-7 rounded-lg bg-brand-gold/10 flex items-center justify-center">
                    <Star className="w-3.5 h-3.5 text-brand-gold fill-current" />
                  </div>
                  <h4 className="font-display font-semibold text-sm">Who Buys Your Property</h4>
                </div>
                <div className="space-y-3">
                  {[
                    { type: "Family Offices", desc: "Greek & Cypriot family offices deploying capital", share: "38%" },
                    { type: "Hedge Funds", desc: "International RE-focused alternative funds", share: "27%" },
                    { type: "Private Equity", desc: "Buy-to-hold and value-add strategies", share: "22%" },
                    { type: "HNWIs", desc: "Ultra-high-net-worth private individuals", share: "13%" },
                  ].map(b => (
                    <div key={b.type} className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <p className="text-xs font-semibold">{b.type}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{b.desc}</p>
                      </div>
                      <span className="text-xs font-black text-brand-gold shrink-0">{b.share}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Speed advantage */}
              <div className="glass-card rounded-2xl border border-border p-6">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Clock className="w-3.5 h-3.5 text-primary" />
                  </div>
                  <h4 className="font-display font-semibold text-sm">Firesale™ vs Traditional</h4>
                </div>
                <div className="space-y-3">
                  {[
                    { label: "Time to offer", firesale: "24h", trad: "3–6 months" },
                    { label: "Agent commission", firesale: "0%", trad: "2–3%" },
                    { label: "Viewings required", firesale: "None", trad: "10–30" },
                    { label: "Certainty of sale", firesale: "Guaranteed", trad: "~60%" },
                  ].map(r => (
                    <div key={r.label} className="grid grid-cols-3 gap-2 text-xs items-center">
                      <span className="text-muted-foreground">{r.label}</span>
                      <span className="font-bold text-brand-emerald text-center">{r.firesale}</span>
                      <span className="text-muted-foreground text-right line-through opacity-60">{r.trad}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Investor dashboard CTA */}
              <div className="glass-card rounded-2xl border border-accent/20 p-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 rounded-bl-full bg-accent/5" />
                <div className="relative">
                  <div className="flex items-center gap-2 mb-3">
                    <Lock className="w-4 h-4 text-accent" />
                    <span className="text-xs font-bold text-accent uppercase tracking-widest">For Investors</span>
                  </div>
                  <h4 className="font-display font-bold text-base mb-2">Access the Deal Flow</h4>
                  <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
                    Off-market properties before they hit the market. Exclusive to institutional subscribers.
                  </p>
                  <div className="space-y-1.5 mb-4">
                    {["Live firesale deal feed", "AI valuation reports", "Seller contact details", "Portfolio analytics"].map(f => (
                      <div key={f} className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Check className="w-3 h-3 text-accent shrink-0" />{f}
                      </div>
                    ))}
                  </div>
                  <Button
                    className="w-full bg-accent/10 border border-accent/30 text-accent hover:bg-accent/20 gap-2 text-xs"
                    onClick={() => navigate("/investor-dashboard")}
                  >
                    <BarChart2 className="w-3.5 h-3.5" />
                    View Investor Dashboard
                    <ChevronRight className="w-3.5 h-3.5 ml-auto" />
                  </Button>
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
