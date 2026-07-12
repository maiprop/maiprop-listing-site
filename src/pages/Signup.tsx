import { useState, useEffect, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Eye, EyeOff, Loader2, ArrowRight, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/Navbar";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { trackAnalyticsEvent } from "@/lib/analytics";
import { buildOAuthCallbackRedirectTo } from "@/lib/oauthCallback";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import logoImg from "@/assets/logo.png";
import { validatePassword } from "@/lib/passwordPolicy";
import { PasswordRequirements } from "@/components/auth/PasswordRequirements";

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4"/>
    <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853"/>
    <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="#FBBC05"/>
    <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z" fill="#EA4335"/>
  </svg>
);

export default function Signup() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signUp, user, loading: authLoading } = useAuth();
  const { t } = useTranslation();

  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // "confirm" = waiting for email click; "done" = session established, navigating
  const [view, setView] = useState<"form" | "confirm">("form");
  const [submittedEmail, setSubmittedEmail] = useState("");
  const showedOAuthNoticeRef = useRef(false);

  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", password: "" });
  const passwordValidation = validatePassword(form.password);

  useEffect(() => {
    const state = location.state as { oauthRedirectReason?: string } | null;
    if (showedOAuthNoticeRef.current || state?.oauthRedirectReason !== "account_required") return;
    showedOAuthNoticeRef.current = true;
    toast.info("Create an account to continue with Google.");
  }, [location.state]);

  // When session arrives (after email confirmation link is clicked), navigate to onboarding.
  // Also handles already-logged-in users landing on /signup.
  useEffect(() => {
    if (!authLoading && user) navigate("/onboarding", { replace: true });
  }, [authLoading, user, navigate]);

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    trackAnalyticsEvent("oauth_started", { provider: "google", source: "signup" });
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: buildOAuthCallbackRedirectTo("signup", "/onboarding") },
    });
    if (error) {
      trackAnalyticsEvent("oauth_error", { provider: "google" });
      toast.error("Google sign-in failed. Please try again.");
      setGoogleLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setSubmitMessage(null);
    if (!form.email || !form.password) {
      const message = "Please fill in your email and password.";
      setSubmitError(message);
      toast.error(message);
      return;
    }
    if (!passwordValidation.valid) {
      const message = "Check the password requirements below.";
      setSubmitError(message);
      toast.error(message);
      return;
    }
    trackAnalyticsEvent("signup_submitted", { method: "password" });
    setLoading(true);
    setSubmitMessage("Creating your account...");
    try {
      const { error, needsEmailConfirm } = await signUp(form.email, form.password, {
        full_name: `${form.firstName} ${form.lastName}`.trim(),
      });
    if (error) {
      const msg = error.message?.toLowerCase() ?? "";
      if (msg.includes("rate limit") || msg.includes("over_email_send_rate_limit") || msg.includes("too many")) {
        const message = "Too many attempts. Please wait a few minutes before trying again.";
        setSubmitMessage(null);
        setSubmitError(message);
        toast.error(message);
      } else if (msg.includes("already registered") || msg.includes("user already exists")) {
        const message = "An account with this email already exists.";
        setSubmitMessage(null);
        setSubmitError(message);
        toast.error(message, {
          description: "Try signing in instead.",
          action: { label: "Sign in", onClick: () => { window.location.href = "/login"; } },
        });
      } else {
        setSubmitMessage(null);
        setSubmitError(error.message);
        toast.error(error.message);
      }
      trackAnalyticsEvent("signup_error", { method: "password" });
    } else if (needsEmailConfirm) {
      trackAnalyticsEvent("signup_email_confirmation_required", { method: "password" });
      // Email confirmation required — show "check your inbox" screen.
      // The confirmation link (emailRedirectTo) points to /onboarding, so after the
      // user clicks the link, they land there with a live session automatically.
      setSubmittedEmail(form.email);
      setView("confirm");
    } else {
      trackAnalyticsEvent("signup_completed", { method: "password" });
      setSubmitMessage("Account created. Taking you to setup...");
      navigate("/onboarding", { replace: true });
      // Email confirmation disabled — session exists immediately.
      // The useEffect above will fire when user is set and navigate to /onboarding.
    }
    } catch (err) {
      const message = err instanceof Error && err.message
        ? err.message
        : "Could not create your account. Please try again.";
      setSubmitMessage(null);
      setSubmitError(message);
      toast.error(message);
      trackAnalyticsEvent("signup_error", { method: "password" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <main id="main-content" className="flex-1 flex items-center justify-center pt-16 px-4 py-10">
        <div className="w-full max-w-md">
          <div className="glass-card rounded-2xl p-8 border border-border">

            {/* ── CHECK YOUR EMAIL ── */}
            {view === "confirm" && (
              <div className="text-center py-2">
                <div className="w-16 h-16 rounded-full bg-primary/10 border border-primary/25 flex items-center justify-center mx-auto mb-5">
                  <Mail className="w-8 h-8 text-primary" />
                </div>
                <h2 className="font-display font-bold text-xl mb-2">Check your inbox</h2>
                <p className="text-muted-foreground text-sm mb-1">We sent a confirmation link to</p>
                <p className="font-semibold text-foreground mb-4">{submittedEmail}</p>
                <p className="text-xs text-muted-foreground mb-6">
                  Click the link in that email to activate your account and set up your profile.
                  The link expires in 24 hours.
                </p>
                <Button variant="outline" className="w-full mb-3" onClick={() => setView("form")}>
                  Use a different email
                </Button>
                <p className="text-xs text-muted-foreground">
                  Already have an account?{" "}
                  <Link to="/login" className="text-primary hover:underline">Sign in</Link>
                </p>
              </div>
            )}

            {/* ── SIGNUP FORM ── */}
            {view === "form" && (
              <>
                <div className="text-center mb-6">
                  <img
                    src={logoImg}
                    alt="mAI prop"
                    className="h-9 w-auto object-contain mx-auto mb-3"
                  />
                  <h1 className="font-display font-bold text-xl">{t("auth.signup.title")}</h1>
                  <p className="text-muted-foreground text-sm mt-1">Start free — set your profile in the next step</p>
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
                        placeholder="Min. 8 characters"
                        value={form.password}
                        onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                        required
                        className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 pr-10 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors"
                      />
                      <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setShowPass(v => !v)}>
                        {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <PasswordRequirements password={form.password} />
                  </div>

                  <Button
                    type="submit"
                    className="w-full bg-gradient-primary border-0 text-primary-foreground"
                    disabled={loading || googleLoading || !form.email || !form.password || !passwordValidation.valid}
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    {loading ? "Creating account..." : t("auth.signup.createAccount")}
                    {!loading && <ArrowRight className="w-4 h-4 ml-2" />}
                  </Button>
                  {(submitMessage || submitError) && (
                    <div
                      role={submitError ? "alert" : "status"}
                      className={`rounded-xl border px-3 py-2.5 text-sm ${
                        submitError
                          ? "border-destructive/25 bg-destructive/10 text-destructive"
                          : "border-primary/15 bg-primary/5 text-primary"
                      }`}
                    >
                      {submitError ?? submitMessage}
                    </div>
                  )}
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
      </main>
    </div>
  );
}
