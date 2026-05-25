import { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Eye, EyeOff, Loader2, Mail, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/Navbar";
import { useAuth } from "@/contexts/AuthContext";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { APP_ORIGIN } from "@/lib/config";
import { buildOAuthCallbackRedirectTo } from "@/lib/oauthCallback";
import logoImg from "@/assets/logo.png";

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4"/>
    <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853"/>
    <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="#FBBC05"/>
    <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z" fill="#EA4335"/>
  </svg>
);

export default function Login() { // skipcq: JS-R1005 - Auth route coordinates credential, OAuth, recovery, and redirect states.
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn, user, loading: authLoading } = useAuth();
  const { t } = useTranslation();

  const [view, setView] = useState<"login" | "forgot" | "forgot-sent">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [forgotEmail, setForgotEmail] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [didSignIn, setDidSignIn] = useState(false);
  const [authError, setAuthError] = useState("");

  const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname || "/dashboard";

  // After sign-in, always redirect to the intended destination (never force onboarding)
  useEffect(() => {
    if (authLoading) return;
    if (user) {
      navigate(from, { replace: true });
    }
  }, [authLoading, user, from, navigate]);

  useEffect(() => {
    setAuthError("");
  }, [view]);

  const handleGoogleSignIn = async () => {
    setAuthError("");
    setGoogleLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: buildOAuthCallbackRedirectTo("login", from) },
    });
    if (error) {
      const message = "Google sign-in failed. Please try again.";
      setAuthError(message);
      toast.error(message);
      setGoogleLoading(false);
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    setLoading(true);
    const { error } = await signIn(email, password);
    setLoading(false);
    if (error) {
      const message = "Invalid email or password";
      setAuthError(message);
      toast.error(message);
    } else {
      // signIn triggers onAuthStateChange which sets user → useEffect above redirects
      setDidSignIn(true);
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
      redirectTo: `${APP_ORIGIN}/reset-password`,
    });
    setLoading(false);
    if (error) {
      setAuthError(error.message);
      toast.error(error.message);
    } else {
      setView("forgot-sent");
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <main id="main-content" className="flex-1 flex items-center justify-center pt-16 px-4 pb-40 sm:pb-16">
        <div className="w-full max-w-sm">
          <div className="glass-card rounded-2xl p-8 border border-border">

            {/* ── SIGN IN ── */}
            {view === "login" && (
              <>
                <div className="text-center mb-6">
                  <img
                    src={logoImg}
                    alt="mAI prop"
                    className="h-10 w-auto object-contain mx-auto mb-2"
                  />
                  <h1 className="text-muted-foreground text-sm mt-1 font-normal">{t("loginPage.title")}</h1>
                </div>

                {/* Google */}
                <button onClick={handleGoogleSignIn} disabled={googleLoading}
                  className="w-full flex items-center justify-center gap-3 bg-secondary hover:bg-secondary/80 border border-border rounded-xl px-4 py-3 text-sm font-semibold transition-colors disabled:opacity-60 mb-4">
                  {googleLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <GoogleIcon />}
                  {t("loginPage.googleCta")}
                </button>

                <div className="flex items-center gap-3 mb-4">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-xs text-muted-foreground">{t("loginPage.orEmail")}</span>
                  <div className="flex-1 h-px bg-border" />
                </div>

                <form onSubmit={handleSignIn} className="space-y-4">
                  <div>
                    <label htmlFor="login-email" className="text-xs font-medium text-muted-foreground block mb-1.5">{t("loginPage.email")}</label>
                    <input id="login-email" type="email" placeholder={t("loginPage.emailPlaceholder")} value={email} onChange={e => setEmail(e.target.value)} required
                      className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors" />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label htmlFor="login-password" className="text-xs font-medium text-muted-foreground">{t("loginPage.password")}</label>
                      <button type="button" onClick={() => setView("forgot")} className="text-xs text-primary hover:underline" aria-label={t("loginPage.forgotPassword")}>
                        {t("loginPage.forgotPassword")}
                      </button>
                    </div>
                    <div className="relative">
                      <input id="login-password" type={showPass ? "text" : "password"} placeholder={t("loginPage.passwordPlaceholder")} value={password} onChange={e => setPassword(e.target.value)} required
                        className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 pr-10 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors" />
                      <button type="button" aria-label={showPass ? "Hide password" : "Show password"} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setShowPass(v => !v)}>
                        {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <Button type="submit" className="w-full bg-gradient-primary border-0 text-primary-foreground" disabled={loading || (didSignIn && authLoading)}>
                    {(loading || (didSignIn && authLoading)) && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                    {t("loginPage.signIn")}
                  </Button>
                  {authError && (
                    <p role="alert" aria-live="polite" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                      {authError}
                    </p>
                  )}
                </form>
                <p className="text-xs text-muted-foreground text-center mt-4">
                  {t("loginPage.noAccount")}{" "}
                  <Link to="/signup" className="text-primary underline">{t("loginPage.signUpFree")}</Link>
                </p>
              </>
            )}

            {/* ── FORGOT PASSWORD ── */}
            {view === "forgot" && (
              <>
                <button onClick={() => setView("login")} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-5 transition-colors">
                  <ArrowLeft className="w-3.5 h-3.5" /> {t("loginPage.backToSignIn")}
                </button>
                <div className="text-center mb-6">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/25 flex items-center justify-center mx-auto mb-3">
                    <Mail className="w-6 h-6 text-primary" />
                  </div>
                  <h2 className="font-display font-bold text-xl">{t("loginPage.forgotTitle")}</h2>
                  <p className="text-muted-foreground text-sm mt-1">{t("loginPage.forgotSubtitle")}</p>
                </div>
                <form onSubmit={handleForgot} className="space-y-4">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1.5">{t("loginPage.emailAddress")}</label>
                    <input type="email" placeholder={t("loginPage.emailPlaceholder")} value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} required
                      className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors" />
                  </div>
                  <Button type="submit" className="w-full bg-gradient-primary border-0 text-primary-foreground" disabled={loading || !forgotEmail}>
                    {loading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                    {t("loginPage.sendLink")}
                  </Button>
                  {authError && (
                    <p role="alert" aria-live="polite" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                      {authError}
                    </p>
                  )}
                </form>
              </>
            )}

            {/* ── RESET EMAIL SENT ── */}
            {view === "forgot-sent" && (
              <div className="text-center py-2">
                <div className="w-16 h-16 rounded-full bg-primary/10 border border-primary/25 flex items-center justify-center mx-auto mb-5">
                  <Mail className="w-8 h-8 text-primary" />
                </div>
                <h2 className="font-display font-bold text-xl mb-2">{t("loginPage.checkInbox")}</h2>
                <p className="text-muted-foreground text-sm mb-1">{t("loginPage.resetSentTo")}</p>
                <p className="font-semibold text-foreground mb-5">{forgotEmail}</p>
                <p className="text-xs text-muted-foreground mb-5">{t("loginPage.resetInstructions")}</p>
                <Button variant="outline" className="w-full" onClick={() => setView("login")}>
                  {t("loginPage.backToSignIn")}
                </Button>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
