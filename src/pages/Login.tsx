import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/Navbar";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);

  const from = (location.state as any)?.from?.pathname || "/dashboard";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await signIn(email, password);
    setLoading(false);
    if (error) {
      toast.error("Invalid email or password");
    } else {
      toast.success("Welcome back!");
      navigate(from, { replace: true });
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <div className="flex-1 flex items-center justify-center pt-16 px-4">
        <div className="w-full max-w-sm">
          <div className="glass-card rounded-2xl p-8 border border-border">
            <div className="text-center mb-6">
              <span className="font-display font-bold text-2xl">mai<span className="gradient-text-cyan">prop</span></span>
              <p className="text-muted-foreground text-sm mt-1">Sign in to your account</p>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1.5">Email</label>
                <input type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} required
                  className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1.5">Password</label>
                <div className="relative">
                  <input type={showPass ? "text" : "password"} placeholder="Your password" value={password} onChange={e => setPassword(e.target.value)} required
                    className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 pr-10 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors" />
                  <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setShowPass(!showPass)}>
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <Button type="submit" className="w-full bg-gradient-primary border-0 text-primary-foreground" disabled={loading}>
                {loading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                Sign In
              </Button>
            </form>
            <p className="text-xs text-muted-foreground text-center mt-4">
              Don't have an account?{" "}
              <Link to="/signup" className="text-primary hover:underline">Sign up free</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
