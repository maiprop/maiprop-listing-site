import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff, Loader2, CheckCircle, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/Navbar";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { validatePassword } from "@/lib/passwordPolicy";

// skipcq: JS-0067 - React route component is intentionally module-scoped for React Router.
export default function ResetPassword() { // skipcq: JS-R1005 - Password reset route coordinates recovery state, validation, and submit UI.
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [isRecovery, setIsRecovery] = useState(false);

  useEffect(() => {
    // Supabase puts type=recovery in the URL hash after the user clicks the email link
    const hash = window.location.hash;
    if (hash.includes("type=recovery") || hash.includes("access_token")) {
      setIsRecovery(true);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      toast.error("Passwords do not match");
      return;
    }
    const pw = validatePassword(password);
    if (!pw.valid) {
      toast.error(pw.error ?? "Password does not meet the requirements");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      toast.error(error.message);
    } else {
      setDone(true);
      setTimeout(() => navigate("/dashboard"), 2500);
    }
  };

  if (!isRecovery) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center pt-16 px-4">
          <div className="w-full max-w-sm glass-card rounded-2xl p-8 border border-border text-center">
            <ShieldCheck className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="font-display font-bold text-xl mb-2">Invalid Reset Link</h2>
            <p className="text-muted-foreground text-sm mb-6">This link has expired or is invalid. Please request a new password reset.</p>
            <Button className="w-full bg-gradient-primary border-0 text-primary-foreground" onClick={() => navigate("/login")}>
              Back to Sign In
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center pt-16 px-4">
          <div className="w-full max-w-sm glass-card rounded-2xl p-8 border border-border text-center">
            <div className="w-16 h-16 rounded-full bg-primary/10 border border-primary/25 flex items-center justify-center mx-auto mb-5">
              <CheckCircle className="w-8 h-8 text-primary" />
            </div>
            <h2 className="font-display font-bold text-xl mb-2">Password updated!</h2>
            <p className="text-muted-foreground text-sm">Redirecting you to your dashboard…</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <div className="flex-1 flex items-center justify-center pt-16 px-4">
        <div className="w-full max-w-sm">
          <div className="glass-card rounded-2xl p-8 border border-border">
            <div className="text-center mb-6">
              <span className="font-display font-bold text-2xl">mai<span className="gradient-text-cyan">prop</span></span>
              <p className="text-muted-foreground text-sm mt-1">Set your new password</p>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1.5">New Password</label>
                <div className="relative">
                  <input
                    type={showPass ? "text" : "password"}
                    placeholder="Min. 8 characters"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 pr-10 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors"
                  />
                  <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setShowPass(v => !v)}>
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1.5">Confirm Password</label>
                <input
                  type={showPass ? "text" : "password"}
                  placeholder="Repeat your new password"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  required
                  className={`w-full bg-secondary border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-colors ${
                    confirm && confirm !== password ? "border-destructive focus:border-destructive" : "border-border focus:border-primary"
                  }`}
                />
                {confirm && confirm !== password && (
                  <p className="text-xs text-destructive mt-1">Passwords do not match</p>
                )}
              </div>
              <Button
                type="submit"
                className="w-full bg-gradient-primary border-0 text-primary-foreground"
                disabled={loading || !password || !confirm || password !== confirm}
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                Update Password
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
