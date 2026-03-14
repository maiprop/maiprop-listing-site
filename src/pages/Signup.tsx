import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Eye, EyeOff, Loader2, ArrowRight, Home, Users, TrendingUp, UserCheck, Globe2, Building2, Briefcase, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/Navbar";
import { useAuth } from "@/contexts/AuthContext";
import { lovable } from "@/integrations/lovable/index";
import { toast } from "sonner";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import logoImg from "@/assets/logo.png";
import logoDarkImg from "@/assets/logo-dark.png";

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4"/>
    <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853"/>
    <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="#FBBC05"/>
    <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z" fill="#EA4335"/>
  </svg>
);

type ParticipantId = "buyer" | "seller" | "investor" | "agent" | "institutional" | "developer" | "professional";

const PARTICIPANT_TYPES: {
  id: ParticipantId;
  label: string;
  sublabel: string;
  icon: React.ElementType;
  accent: string;
  accentBg: string;
  accentBorder: string;
}[] = [
  { id: "buyer",         label: "Buyer / Renter",      sublabel: "Browse, search & book viewings",         icon: Home,       accent: "text-brand-gold",  accentBg: "bg-brand-gold/10",  accentBorder: "border-brand-gold/40" },
  { id: "seller",        label: "Seller / Landlord",   sublabel: "List & manage your property",            icon: Users,      accent: "text-violet-400",  accentBg: "bg-violet-500/10",  accentBorder: "border-violet-500/40" },
  { id: "investor",      label: "Investor",             sublabel: "Deal flow, auctions & AI valuations",    icon: TrendingUp, accent: "text-destructive",  accentBg: "bg-destructive/10", accentBorder: "border-destructive/30" },
  { id: "agent",         label: "Agent",                sublabel: "Listings, CRM & client management",      icon: UserCheck,  accent: "text-cyan-400",    accentBg: "bg-cyan-500/10",    accentBorder: "border-cyan-500/40" },
  { id: "institutional", label: "Institutional / Fund", sublabel: "Portfolio tools & deal pipeline",        icon: Globe2,     accent: "text-amber-400",   accentBg: "bg-amber-500/10",   accentBorder: "border-amber-500/40" },
  { id: "developer",     label: "Developer",            sublabel: "Project showcases & pre-sale management", icon: Building2, accent: "text-orange-400",  accentBg: "bg-orange-500/10",  accentBorder: "border-orange-500/40" },
  { id: "professional",  label: "Professional",         sublabel: "Directory listing, leads & bookings",    icon: Briefcase,  accent: "text-rose-400",    accentBg: "bg-rose-500/10",    accentBorder: "border-rose-500/40" },
];

export default function Signup() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { signUp, updateProfile, user, loading: authLoading } = useAuth();
  const { theme } = useTheme();

  const isProfessionalIntent = searchParams.get("role") === "professional" || searchParams.get("type") === "professional";

  const [step, setStep] = useState<"role" | "details">(isProfessionalIntent ? "details" : "role");
  const [selectedType, setSelectedType] = useState<ParticipantId | null>(isProfessionalIntent ? "professional" : null);
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [didSignUp, setDidSignUp] = useState(false);

  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", password: "" });

  // After signup, write the bio __type: tag then go to onboarding
  useEffect(() => {
    if (authLoading || !didSignUp) return;
    if (user) {
      // Save the chosen participant type to bio so onboarding/dashboard knows
      if (selectedType) {
        updateProfile({ bio: `__type:${selectedType}` }).catch(() => {});
      }
      navigate("/onboarding", { replace: true });
    }
  }, [authLoading, user, didSignUp, selectedType, navigate, updateProfile]);

  const handleGoogleSignIn = async () => {
    if (!selectedType) return;
    // Persist type for post-OAuth so Onboarding can apply it
    try {
      sessionStorage.setItem("signup_participant_type", selectedType);
    } catch (_) {}
    setGoogleLoading(true);
    const { error } = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: `${window.location.origin}/onboarding`,
    });
    if (error) {
      toast.error("Google sign-in failed. Please try again.");
      setGoogleLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.email || !form.password || form.password.length < 6) {
      toast.error("Please fill in all fields (min 6 chars password)");
      return;
    }
    setLoading(true);
    const { error } = await signUp(form.email, form.password, {
      full_name: `${form.firstName} ${form.lastName}`.trim(),
      role: "individual",
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
    } else {
      setDidSignUp(true);
    }
  };

  const selected = PARTICIPANT_TYPES.find(t => t.id === selectedType);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <div className="flex-1 flex items-center justify-center pt-16 px-4 py-10">
        <div className="w-full max-w-lg">
          <div className="glass-card rounded-2xl p-8 border border-border">

            {/* ── STEP 1: ROLE PICKER ── */}
            {step === "role" && (
              <>
                <div className="text-center mb-6">
                  <img
                    src={theme === "dark" ? logoDarkImg : logoImg}
                    alt="maiProp"
                    className="h-9 w-auto object-contain mx-auto mb-3"
                  />
                  <h1 className="font-display font-bold text-xl">Who are you on maiProp?</h1>
                  <p className="text-muted-foreground text-sm mt-1">Choose your participant type to personalise your dashboard</p>
                </div>

                <div className="grid grid-cols-1 gap-2 mb-6">
                  {PARTICIPANT_TYPES.map(type => {
                    const Icon = type.icon;
                    const isSelected = selectedType === type.id;
                    return (
                      <button
                        key={type.id}
                        type="button"
                        onClick={() => setSelectedType(type.id)}
                        className={cn(
                          "flex items-center gap-3 rounded-xl px-4 py-3 border text-left transition-all",
                          isSelected
                            ? `${type.accentBg} ${type.accentBorder} border`
                            : "bg-secondary/50 border-border hover:border-muted-foreground/30"
                        )}
                      >
                        <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", type.accentBg)}>
                          <Icon className={cn("w-4 h-4", type.accent)} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={cn("text-sm font-semibold leading-tight", isSelected ? type.accent : "text-foreground")}>
                            {type.label}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">{type.sublabel}</p>
                        </div>
                        {isSelected && (
                          <div className={cn("w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0", type.accentBorder)}>
                            <div className={cn("w-2 h-2 rounded-full", type.accent.replace("text-", "bg-"))} />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>

                <Button
                  className="w-full bg-gradient-primary border-0 text-primary-foreground"
                  disabled={!selectedType}
                  onClick={() => setStep("details")}
                >
                  Continue <ArrowRight className="w-4 h-4 ml-2" />
                </Button>

                <p className="text-xs text-muted-foreground text-center mt-4">
                  Already have an account?{" "}
                  <Link to="/login" className="text-primary hover:underline">Sign in</Link>
                </p>
              </>
            )}

            {/* ── STEP 2: ACCOUNT DETAILS ── */}
            {step === "details" && (
              <>
                <button
                  onClick={() => setStep("role")}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-5 transition-colors"
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> Back
                </button>

                <div className="text-center mb-5">
                  {selected && (
                    <div className={cn("inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold mb-3", selected.accentBg, selected.accent, "border", selected.accentBorder)}>
                      <selected.icon className="w-3.5 h-3.5" />
                      {selected.label}
                    </div>
                  )}
                  <h1 className="font-display font-bold text-xl">Create your account</h1>
                  <p className="text-muted-foreground text-sm mt-1">Start free — upgrade anytime</p>
                </div>

                {/* Google */}
                <button
                  onClick={handleGoogleSignIn}
                  disabled={googleLoading}
                  className="w-full flex items-center justify-center gap-3 bg-secondary hover:bg-secondary/80 border border-border rounded-xl px-4 py-3 text-sm font-semibold transition-colors disabled:opacity-60 mb-4"
                >
                  {googleLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <GoogleIcon />}
                  Continue with Google
                </button>

                <div className="flex items-center gap-3 mb-4">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-xs text-muted-foreground">or with email</span>
                  <div className="flex-1 h-px bg-border" />
                </div>

                <form onSubmit={handleSignUp} className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground block mb-1.5">First Name</label>
                      <input
                        type="text"
                        placeholder="Nikos"
                        value={form.firstName}
                        onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))}
                        className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground block mb-1.5">Last Name</label>
                      <input
                        type="text"
                        placeholder="Papadopoulos"
                        value={form.lastName}
                        onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))}
                        className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1.5">Email</label>
                    <input
                      type="email"
                      placeholder="you@example.com"
                      value={form.email}
                      onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                      required
                      className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1.5">Password</label>
                    <div className="relative">
                      <input
                        type={showPass ? "text" : "password"}
                        placeholder="Min. 6 characters"
                        value={form.password}
                        onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                        required
                        className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 pr-10 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors"
                      />
                      <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setShowPass(v => !v)}>
                        {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <Button
                    type="submit"
                    className="w-full bg-gradient-primary border-0 text-primary-foreground"
                    disabled={loading || !form.email || !form.password}
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    Create Account <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </form>

                <p className="text-xs text-muted-foreground text-center mt-4">
                  Already have an account?{" "}
                  <Link to="/login" className="text-primary hover:underline">Sign in</Link>
                </p>

                <p className="text-xs text-muted-foreground text-center mt-3">
                  By signing up you agree to our{" "}
                  <Link to="/terms-of-service" className="text-primary hover:underline">Terms</Link> and{" "}
                  <Link to="/privacy-policy" className="text-primary hover:underline">Privacy Policy</Link>
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
