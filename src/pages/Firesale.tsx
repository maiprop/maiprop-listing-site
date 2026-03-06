import { useState } from "react";
import { Flame, ArrowRight, Check, Home, MapPin, Calendar, TrendingUp, Zap, Clock, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";

const steps = [
  { step: "01", title: "Enter Property Details", desc: "Address, size, condition, and basic info. Takes under 2 minutes." },
  { step: "02", title: "AI Valuation", desc: "Our AI analyzes 100+ data points from mAI Prop OS to generate your offer." },
  { step: "03", title: "Receive Cash Offer", desc: "Get a guaranteed cash offer within 24 hours. No obligation." },
  { step: "04", title: "Close in 48 Hours", desc: "Accept the offer and close in as little as 48 hours. We handle everything." },
];

export default function Firesale() {
  const [step, setStep] = useState(1);
  const [address, setAddress] = useState("");
  const [size, setSize] = useState("");
  const [condition, setCondition] = useState("");
  const [offerGenerated, setOfferGenerated] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleGetOffer = () => {
    setLoading(true);
    setTimeout(() => { setLoading(false); setOfferGenerated(true); }, 2000);
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-16">
        {/* Hero */}
        <div className="relative py-20 overflow-hidden bg-card border-b border-border">
          <div className="absolute inset-0 opacity-10" style={{ background: "radial-gradient(circle at 30% 50%, hsl(0 72% 55%), transparent 60%)" }} />
          <div className="container relative">
            <div className="max-w-2xl">
              <div className="flex items-center gap-2 mb-4">
                <Flame className="w-5 h-5 text-destructive" />
                <span className="text-xs font-bold text-destructive uppercase tracking-widest">Firesale™ Instant Offer</span>
              </div>
              <h1 className="font-display text-5xl font-bold mb-4">
                Sell Your Property <br />
                <span className="gradient-text-primary">in 48 Hours</span>
              </h1>
              <p className="text-muted-foreground text-lg mb-8">
                Get a guaranteed all-cash offer powered by AI valuation. No agent fees, no showings, no waiting.
              </p>
              <div className="flex flex-wrap gap-4">
                {["Zero agent commission", "Guaranteed cash offer", "Close in 48 hours", "AI-powered valuation"].map(item => (
                  <div key={item} className="flex items-center gap-2 text-sm">
                    <Check className="w-4 h-4 text-brand-emerald" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Steps */}
        <div className="container py-16">
          <h2 className="font-display text-2xl font-bold text-center mb-10">How It Works</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-16">
            {steps.map((s, i) => (
              <div key={s.step} className="glass-card rounded-xl p-6 relative">
                <div className="font-display text-4xl font-bold gradient-text-cyan opacity-30 mb-3">{s.step}</div>
                <h3 className="font-display font-semibold mb-2">{s.title}</h3>
                <p className="text-sm text-muted-foreground">{s.desc}</p>
                {i < steps.length - 1 && (
                  <ArrowRight className="hidden md:block absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 text-muted-foreground" />
                )}
              </div>
            ))}
          </div>

          {/* Form */}
          <div className="max-w-xl mx-auto">
            <div className="glass-card rounded-2xl p-8 border border-primary/20">
              <h3 className="font-display text-xl font-bold mb-6 text-center">
                {offerGenerated ? "🎉 Your AI Offer is Ready" : "Get Your Instant Offer"}
              </h3>

              {offerGenerated ? (
                <div className="text-center space-y-6">
                  <div className="bg-gradient-primary rounded-2xl p-8">
                    <div className="text-sm text-primary-foreground/70 mb-1">Guaranteed Cash Offer</div>
                    <div className="font-display text-5xl font-bold text-primary-foreground">€348,000</div>
                    <div className="text-sm text-primary-foreground/70 mt-2">Valid for 7 days · AI confidence: 94%</div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {[{ label: "Market Value", value: "€365k" }, { label: "Offer vs Mkt", value: "-4.7%" }, { label: "Close Time", value: "48–72h" }].map(item => (
                      <div key={item.label} className="glass-card rounded-xl p-3 text-center">
                        <div className="font-bold text-sm">{item.value}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">{item.label}</div>
                      </div>
                    ))}
                  </div>
                  <Button size="lg" className="w-full bg-gradient-primary border-0 text-primary-foreground">
                    Accept Offer — Start Process
                  </Button>
                  <button className="text-sm text-muted-foreground hover:text-foreground" onClick={() => setOfferGenerated(false)}>
                    Request revised offer
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium block mb-1.5">Property Address</label>
                    <div className="flex gap-2 bg-secondary border border-border rounded-xl px-3 py-2.5 focus-within:border-primary transition-colors">
                      <MapPin className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                      <input
                        type="text"
                        placeholder="e.g. Kifisia, Dekelia 24"
                        value={address}
                        onChange={e => setAddress(e.target.value)}
                        className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-sm font-medium block mb-1.5">Size (m²)</label>
                      <input
                        type="number"
                        placeholder="e.g. 120"
                        value={size}
                        onChange={e => setSize(e.target.value)}
                        className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium block mb-1.5">Condition</label>
                      <select
                        value={condition}
                        onChange={e => setCondition(e.target.value)}
                        className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary appearance-none"
                      >
                        <option value="" className="bg-card">Select...</option>
                        <option value="excellent" className="bg-card">Excellent</option>
                        <option value="good" className="bg-card">Good</option>
                        <option value="fair" className="bg-card">Fair</option>
                        <option value="needs-work" className="bg-card">Needs Work</option>
                      </select>
                    </div>
                  </div>
                  <Button
                    size="lg"
                    className="w-full bg-gradient-primary border-0 text-primary-foreground"
                    disabled={!address || !size || !condition || loading}
                    onClick={handleGetOffer}
                  >
                    {loading ? (
                      <span className="flex items-center gap-2">
                        <span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                        Analyzing with AI...
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <Zap className="w-4 h-4" />
                        Get Instant AI Offer
                      </span>
                    )}
                  </Button>
                  <p className="text-xs text-muted-foreground text-center">No obligation. Free instant valuation.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
