import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Eye, EyeOff, User, Building2, Wrench, ArrowRight,
  Check, Loader2, Mail, Phone, FileText, Shield, AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/Navbar";
import { useAuth } from "@/contexts/AuthContext";
import { lovable } from "@/integrations/lovable/index";
import { toast } from "sonner";

type Role = "individual" | "agent" | "professional";

const roles = [
  { value: "individual" as Role, icon: User, label: "Individual", desc: "Buying, selling, or renting for personal use" },
  { value: "agent" as Role, icon: Building2, label: "Agent / Agency", desc: "Real estate professionals listing properties" },
  { value: "professional" as Role, icon: Wrench, label: "Service Pro", desc: "Architect, lawyer, contractor, etc." },
];

export default function Signup() {
  const navigate = useNavigate();
  const { signUp } = useAuth();

  const [step, setStep] = useState(1);
  const [role, setRole] = useState<Role | null>(null);
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  const [form, setForm] = useState({
    firstName: "", lastName: "", email: "", password: "",
  });

  // Professional verification fields
  const [proForm, setProForm] = useState({
    businessName: "",
    taxId: "",           // AFM in Greece
    phone: "",
    licenseNumber: "",
    category: "",
  });

  const totalSteps = role === "professional" ? 3 : 2;

  // ── Google OAuth ──────────────────────────────────────────────────────────
  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    const { error } = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (error) {
      toast.error("Google sign-in failed. Please try again.");
      setGoogleLoading(false);
    }
    // On success the page redirects — no need to setLoading(false)
  };

  // ── Step 2 → create account ───────────────────────────────────────────────
  const handleRoleSelect = async () => {
    if (!role) return;
    // For professionals, advance to step 3 first
    if (role === "professional") {
      setStep(3);
      return;
    }
    await doSignUp();
  };

  // ── Step 3 → submit professional details + create account ─────────────────
  const handleProSubmit = async () => {
    if (!proForm.businessName.trim() || !proForm.taxId.trim() || !proForm.phone.trim()) {
      toast.error("Please fill in all required fields");
      return;
    }
    // Basic Greek AFM validation (9 digits)
    if (!/^\d{9}$/.test(proForm.taxId.replace(/\s/g, ""))) {
      toast.error("Tax ID (AFM) must be 9 digits");
      return;
    }
    await doSignUp();
  };

  const doSignUp = async () => {
    setLoading(true);
    const { error } = await signUp(form.email, form.password, {
      full_name: `${form.firstName} ${form.lastName}`.trim(),
      role: role!,
      ...(role === "professional" && {
        business_name: proForm.businessName,
        tax_id: proForm.taxId,
        phone: proForm.phone,
        license_number: proForm.licenseNumber,
      }),
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
    } else {
      setEmailSent(true);
    }
  };

  // ── Email verification sent screen ────────────────────────────────────────
  if (emailSent) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center pt-16 px-4 py-10">
          <div className="w-full max-w-md">
            <div className="glass-card rounded-2xl p-8 border border-border text-center">
              <div className="w-16 h-16 rounded-full bg-primary/10 border border-primary/25 flex items-center justify-center mx-auto mb-5">
                <Mail className="w-8 h-8 text-primary" />
              </div>
              <h2 className="font-display font-bold text-2xl mb-2">Check your inbox</h2>
              <p className="text-muted-foreground text-sm mb-1">We sent a verification link to</p>
              <p className="font-semibold text-foreground mb-5">{form.email}</p>
              <div className="bg-secondary/60 border border-border rounded-xl p-4 text-sm text-muted-foreground text-left mb-6 space-y-2">
                <p className="flex items-start gap-2"><Check className="w-4 h-4 text-primary shrink-0 mt-0.5" /> Click the link in the email to activate your account</p>
                {role === "professional" && (
                  <p className="flex items-start gap-2"><Shield className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" /> Your professional details will be reviewed within 24–48 hours</p>
                )}
                <p className="flex items-start gap-2"><AlertCircle className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" /> Check spam if you don't see it within a few minutes</p>
              </div>
              <Button variant="outline" className="w-full" onClick={() => navigate("/login")}>
                Back to Sign In
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <div className="flex-1 flex items-center justify-center pt-16 px-4 py-10">
        <div className="w-full max-w-md">
          <div className="glass-card rounded-2xl p-8 border border-border">

            {/* Header */}
            <div className="text-center mb-6">
              <span className="font-display font-bold text-2xl">mai<span className="gradient-text-cyan">prop</span></span>
              <p className="text-muted-foreground text-sm mt-1">
                {step === 1 ? "Create your account" : step === 2 ? "Choose your role" : "Professional Verification"}
              </p>
            </div>

            {/* Progress bar */}
            <div className="flex items-center gap-1.5 mb-6">
              {Array.from({ length: totalSteps }).map((_, i) => (
                <div key={i} className={`flex-1 h-1 rounded-full transition-all duration-300 ${i + 1 <= step ? "bg-gradient-primary" : "bg-secondary"}`} />
              ))}
            </div>

            {/* ── STEP 1: Email & Password ── */}
            {step === 1 && (
              <div className="space-y-4">
                {/* Google button */}
                <button
                  onClick={handleGoogleSignIn}
                  disabled={googleLoading}
                  className="w-full flex items-center justify-center gap-3 bg-secondary hover:bg-secondary/80 border border-border rounded-xl px-4 py-3 text-sm font-semibold transition-colors disabled:opacity-60"
                >
                  {googleLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4"/>
                      <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853"/>
                      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="#FBBC05"/>
                      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z" fill="#EA4335"/>
                    </svg>
                  )}
                  Continue with Google
                </button>

                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-xs text-muted-foreground">or with email</span>
                  <div className="flex-1 h-px bg-border" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1.5">First Name</label>
                    <input type="text" placeholder="Nikos" value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))}
                      className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1.5">Last Name</label>
                    <input type="text" placeholder="Papadopoulos" value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))}
                      className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors" />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1.5">Email</label>
                  <input type="email" placeholder="you@example.com" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1.5">Password</label>
                  <div className="relative">
                    <input type={showPass ? "text" : "password"} placeholder="Min. 6 characters" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                      className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 pr-10 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors" />
                    <button className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setShowPass(!showPass)}>
                      {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <Button className="w-full bg-gradient-primary border-0 text-primary-foreground"
                  disabled={!form.email || !form.password || form.password.length < 6}
                  onClick={() => setStep(2)}>
                  Continue <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  Already have an account?{" "}
                  <Link to="/login" className="text-primary hover:underline">Sign in</Link>
                </p>
              </div>
            )}

            {/* ── STEP 2: Role Selection ── */}
            {step === 2 && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground mb-4">Select the option that best describes you:</p>
                {roles.map(r => (
                  <button key={r.value} onClick={() => setRole(r.value)}
                    className={`w-full p-4 rounded-xl border text-left transition-all flex items-center gap-4 ${role === r.value ? "border-primary bg-primary/10" : "border-border hover:border-border/80 bg-secondary"}`}>
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${role === r.value ? "bg-gradient-primary" : "bg-background"}`}>
                      <r.icon className={`w-5 h-5 ${role === r.value ? "text-primary-foreground" : "text-muted-foreground"}`} />
                    </div>
                    <div>
                      <div className="font-semibold text-sm">{r.label}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{r.desc}</div>
                    </div>
                    {role === r.value && <Check className="w-4 h-4 text-primary ml-auto" />}
                  </button>
                ))}
                <Button className="w-full bg-gradient-primary border-0 text-primary-foreground mt-2" disabled={!role || loading} onClick={handleRoleSelect}>
                  {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  {role === "professional" ? "Continue to Verification" : "Create Account"}
                  {role === "professional" && <ArrowRight className="w-4 h-4 ml-2" />}
                </Button>
                <button className="w-full text-xs text-muted-foreground hover:text-foreground text-center" onClick={() => setStep(1)}>← Back</button>
              </div>
            )}

            {/* ── STEP 3: Professional Verification ── */}
            {step === 3 && (
              <div className="space-y-4">
                {/* Badge */}
                <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/25 rounded-xl px-3 py-2.5">
                  <Shield className="w-4 h-4 text-amber-400 shrink-0" />
                  <p className="text-xs text-amber-300 font-medium">Business verification required for Service Professionals</p>
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1.5">
                    Business / Company Name <span className="text-destructive">*</span>
                  </label>
                  <div className="relative">
                    <FileText className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input type="text" placeholder="e.g. Papadopoulos Architecture Ltd." value={proForm.businessName}
                      onChange={e => setProForm(f => ({ ...f, businessName: e.target.value }))}
                      className="w-full bg-secondary border border-border rounded-xl pl-9 pr-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors" />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1.5">
                    Tax ID (ΑΦΜ) <span className="text-destructive">*</span>
                  </label>
                  <div className="relative">
                    <Shield className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input type="text" placeholder="9-digit Greek AFM" value={proForm.taxId}
                      onChange={e => setProForm(f => ({ ...f, taxId: e.target.value.replace(/\D/g, "").slice(0, 9) }))}
                      maxLength={9}
                      className="w-full bg-secondary border border-border rounded-xl pl-9 pr-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors font-mono tracking-widest" />
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">Used for business identity verification only</p>
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1.5">
                    Phone Number <span className="text-destructive">*</span>
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input type="tel" placeholder="+30 69X XXX XXXX" value={proForm.phone}
                      onChange={e => setProForm(f => ({ ...f, phone: e.target.value }))}
                      className="w-full bg-secondary border border-border rounded-xl pl-9 pr-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors" />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1.5">
                    License / Registration Number <span className="text-muted-foreground font-normal">(optional)</span>
                  </label>
                  <input type="text" placeholder="e.g. ΤΕΕ-12345 or ΑΜΤΕ-67890" value={proForm.licenseNumber}
                    onChange={e => setProForm(f => ({ ...f, licenseNumber: e.target.value }))}
                    className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors" />
                </div>

                <div className="bg-secondary/40 border border-border/50 rounded-xl p-3 text-xs text-muted-foreground space-y-1">
                  <p className="font-medium text-foreground/70 flex items-center gap-1.5"><Shield className="w-3.5 h-3.5" /> What happens next:</p>
                  <p>• Your email will be verified immediately</p>
                  <p>• Business details reviewed within 24–48h</p>
                  <p>• Verified badge added to your profile upon approval</p>
                </div>

                <Button className="w-full bg-gradient-primary border-0 text-primary-foreground" disabled={loading} onClick={handleProSubmit}>
                  {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Shield className="w-4 h-4 mr-2" />}
                  Submit & Verify
                </Button>
                <button className="w-full text-xs text-muted-foreground hover:text-foreground text-center" onClick={() => setStep(2)}>← Back</button>
              </div>
            )}
          </div>

          <p className="text-xs text-muted-foreground text-center mt-4">
            By creating an account you agree to our{" "}
            <Link to="/terms-of-service" className="text-primary hover:underline">Terms</Link> and{" "}
            <Link to="/privacy-policy" className="text-primary hover:underline">Privacy Policy</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
