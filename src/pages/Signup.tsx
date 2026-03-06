import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff, User, Building2, Wrench, ArrowRight, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/Navbar";
import { useAuth } from "@/contexts/AuthContext";
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
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", password: "" });

  const handleContinue = async () => {
    if (!role) return;
    setLoading(true);
    const { error } = await signUp(form.email, form.password, {
      full_name: `${form.firstName} ${form.lastName}`.trim(),
      role,
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Account created! Welcome to maiProp.");
      navigate("/dashboard");
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <div className="flex-1 flex items-center justify-center pt-16 px-4 py-10">
        <div className="w-full max-w-md">
          <div className="glass-card rounded-2xl p-8 border border-border">
            <div className="text-center mb-6">
              <span className="font-display font-bold text-2xl">mai<span className="gradient-text-cyan">prop</span></span>
              <p className="text-muted-foreground text-sm mt-1">
                {step === 1 ? "Create your account" : "Choose your role"}
              </p>
            </div>

            <div className="flex items-center gap-2 mb-6">
              {[1, 2].map(s => (
                <div key={s} className={`flex-1 h-1 rounded-full transition-all ${s <= step ? "bg-gradient-primary" : "bg-secondary"}`} />
              ))}
            </div>

            {step === 1 && (
              <div className="space-y-4">
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

            {step === 2 && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground mb-4">Select the option that best describes you:</p>
                {roles.map(r => (
                  <button key={r.value} onClick={() => setRole(r.value)}
                    className={`w-full p-4 rounded-xl border text-left transition-all flex items-center gap-4 ${role === r.value ? "border-primary bg-primary/10" : "border-border hover:border-border/80 bg-secondary"}`}>
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${role === r.value ? "bg-gradient-primary" : "bg-background"}`}>
                      <r.icon className={`w-5 h-5 ${role === r.value ? "text-primary-foreground" : "text-muted-foreground"}`} />
                    </div>
                    <div><div className="font-semibold text-sm">{r.label}</div><div className="text-xs text-muted-foreground mt-0.5">{r.desc}</div></div>
                    {role === r.value && <Check className="w-4 h-4 text-primary ml-auto" />}
                  </button>
                ))}
                <Button className="w-full bg-gradient-primary border-0 text-primary-foreground mt-2" disabled={!role || loading} onClick={handleContinue}>
                  {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Create Account
                </Button>
                <button className="w-full text-xs text-muted-foreground hover:text-foreground text-center" onClick={() => setStep(1)}>← Back</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
