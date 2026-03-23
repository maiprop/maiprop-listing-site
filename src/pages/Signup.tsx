import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Eye, EyeOff, Loader2, ArrowRight, Home, Briefcase, ChevronLeft, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/Navbar";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import logoImg from "@/assets/logo.webp";
import logoDarkImg from "@/assets/logo-dark.webp";

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4"/>
    <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853"/>
    <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="#FBBC05"/>
    <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z" fill="#EA4335"/>
  </svg>
);

/** Top-level signup choices — refined further in Onboarding */
type SignupTopType = "participant" | "market_pro";

type ParticipantTypeEntry = {
  id: SignupTopType;
  label: string;
  sublabel: string;
  desc: string;
  icon: React.ElementType;
  accent: string;
  accentBg: string;
  accentBorder: string;
  features: string[];
};

export default function Signup() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { signUp, updateProfile, user, loading: authLoading } = useAuth();
  const { theme } = useTheme();
  const { t } = useTranslation();

  const PARTICIPANT_TYPES: ParticipantTypeEntry[] = [
    {
      id: "participant",
      label: t("signupPage.lookingForProperty.title"),
      sublabel: t("signupPage.lookingForProperty.subtitle"),
      desc: "Search listings, book viewings, save searches, and get alerts on new properties.",
      icon: Home,
      accent: "text-brand-gold",
      accentBg: "bg-brand-gold/10",
      accentBorder: "border-brand-gold/40",
      features: [
        t("signupPage.lookingForProperty.features.1"),
        t("signupPage.lookingForProperty.features.2"),
        t("signupPage.lookingForProperty.features.3"),
        t("signupPage.lookingForProperty.features.4"),
      ],
    },
    {
      id: "market_pro",
      label: t("signupPage.workInRealEstate.title"),
      sublabel: t("signupPage.workInRealEstate.subtitle"),
      desc: "List properties for clients, manage leads, or offer professional services in the market.",
      icon: Briefcase,
      accent: "text-brand-purple",
      accentBg: "bg-brand-purple/10",
      accentBorder: "border-brand-purple/40",
      features: [
        t("signupPage.workInRealEstate.features.1"),
        t("signupPage.workInRealEstate.features.2"),
        t("signupPage.workInRealEstate.features.3"),
        t("signupPage.workInRealEstate.features.4"),
      ],
    },
  ];

  const isProfessionalIntent = searchParams.get("role") === "professional" || searchParams.get("type") === "professional";

  const [step, setStep] = useState<"role" | "details">(isProfessionalIntent ? "details" : "role");
  const [selectedType, setSelectedType] = useState<SignupTopType | null>(isProfessionalIntent ? "market_pro" : null);
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [didSignUp, setDidSignUp] = useState(false);

  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", password: "" });

  // After signup, write the bio __type: tag then go to onboarding
  useEffect(() => {
    if (authLoading || !didSignUp) return;
    if (!user) return;
    let cancelled = false;
    (async () => {
      if (selectedType) {
        const { error } = await updateProfile({ bio: `__type:${selectedType}` });
        if (cancelled) return;
        if (error) {
          toast.error("Could not save your profile. Please try again.");
          return;
        }
      }
      navigate("/onboarding", { replace: true });
    })();
    return () => { cancelled = true; };
  }, [authLoading, user, didSignUp, selectedType, navigate, updateProfile]);

  const handleGoogleSignIn = async () => {
    if (!selectedType) return;
    // Persist type for post-OAuth so Onboarding can apply it (both storage types for robustness)
    try {
      sessionStorage.setItem("signup_participant_type", selectedType);
      localStorage.setItem("signup_participant_type", selectedType);
    } catch { /* ignore storage errors */ }
    setGoogleLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/onboarding` },
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
                  <p className="text-muted-foreground text-sm mt-1">{t("auth.signup.subtitle")}</p>
                </div>

                <div className="grid grid-cols-1 gap-3 mb-6">
                  {PARTICIPANT_TYPES.map(type => {
                    const Icon = type.icon;
                    const isSelected = selectedType === type.id;
                    return (
                      <button
                        key={type.id}
                        type="button"
                        onClick={() => setSelectedType(type.id)}
                        className={cn(
                          "flex items-start gap-4 rounded-2xl px-5 py-4 border text-left transition-all",
                          isSelected
                            ? `${type.accentBg} ${type.accentBorder} border shadow-sm`
                            : "bg-secondary/50 border-border hover:border-muted-foreground/30 hover:bg-secondary/70"
                        )}
                      >
                        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5", type.accentBg)}>
                          <Icon className={cn("w-5 h-5", type.accent)} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={cn("text-sm font-bold leading-tight", isSelected ? type.accent : "text-foreground")}>
                            {type.label}
                          </p>
                          <p className={cn("text-xs font-medium mt-0.5", isSelected ? type.accent : "text-muted-foreground")}>{type.sublabel}</p>
                          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{type.desc}</p>
                          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                            {type.features.map(f => (
                              <div key={f} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                <Check className={cn("w-3 h-3 shrink-0", type.accent)} /> {f}
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className={cn(
                          "w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 mt-1 transition-all",
                          isSelected ? type.accentBorder : "border-border"
                        )}>
                          {isSelected && <div className={cn("w-2 h-2 rounded-full", type.accent.replace("text-", "bg-"))} />}
                        </div>
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
                  {t("auth.signup.haveAccount")}{" "}
                  <Link to="/login" className="text-primary hover:underline">{t("auth.signup.signIn")}</Link>
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
                  <h1 className="font-display font-bold text-xl">{t("auth.signup.title")}</h1>
                  <p className="text-muted-foreground text-sm mt-1">Start free — upgrade anytime</p>
                </div>

                {/* Google */}
                <button
                  onClick={handleGoogleSignIn}
                  disabled={googleLoading}
                  className="w-full flex items-center justify-center gap-3 bg-secondary hover:bg-secondary/80 border border-border rounded-xl px-4 py-3 text-sm font-semibold transition-colors disabled:opacity-60 mb-4"
                >
                  {googleLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <GoogleIcon />}
                  {t("auth.signup.google")}
                </button>

                <div className="flex items-center gap-3 mb-4">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-xs text-muted-foreground">{t("auth.signup.orContinueWith")}</span>
                  <div className="flex-1 h-px bg-border" />
                </div>

                <form onSubmit={handleSignUp} className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground block mb-1.5">{t("auth.signup.firstName")}</label>
                      <input
                        type="text"
                        placeholder="Nikos"
                        value={form.firstName}
                        onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))}
                        className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground block mb-1.5">{t("auth.signup.lastName")}</label>
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
                    <label className="text-xs font-medium text-muted-foreground block mb-1.5">{t("auth.signup.email")}</label>
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
                    <label className="text-xs font-medium text-muted-foreground block mb-1.5">{t("auth.signup.password")}</label>
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
                    {t("auth.signup.createAccount")} <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </form>

                <p className="text-xs text-muted-foreground text-center mt-4">
                  {t("auth.signup.haveAccount")}{" "}
                  <Link to="/login" className="text-primary hover:underline">{t("auth.signup.signIn")}</Link>
                </p>

                <p className="text-xs text-muted-foreground text-center mt-3">
                  {t("auth.signup.agreeToTerms")}{" "}
                  <Link to="/terms-of-service" className="text-primary hover:underline">{t("auth.signup.terms")}</Link> {t("auth.signup.and")}{" "}
                  <Link to="/privacy-policy" className="text-primary hover:underline">{t("auth.signup.privacy")}</Link>
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
