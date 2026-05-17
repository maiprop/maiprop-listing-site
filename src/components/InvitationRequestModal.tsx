import { useState } from "react";
import { Link } from "react-router-dom";
import {
  MailPlus, Users, Briefcase, BarChart2, MessageCircle, Loader2, X as XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useFocusTrap } from "@/hooks/useFocusTrap";

const INVESTMENT_FOCUS_OPTIONS = [
  { value: "", label: "Select focus" },
  { value: "residential", label: "Residential" },
  { value: "commercial", label: "Commercial" },
  { value: "land", label: "Land & development" },
  { value: "mixed", label: "Mixed portfolio" },
  { value: "distressed", label: "Distressed / opportunistic" },
];

const DEAL_SIZE_OPTIONS = [
  { value: "", label: "Select range" },
  { value: "100k-500k", label: "€100k – €500k" },
  { value: "500k-2m", label: "€500k – €2M" },
  { value: "2m-5m", label: "€2M – €5M" },
  { value: "5m-15m", label: "€5M – €15M" },
  { value: "15m+", label: "€15M+" },
];

const INVESTMENT_VEHICLE_OPTIONS = [
  { value: "", label: "Select vehicle" },
  { value: "personal", label: "Personal / HNWI" },
  { value: "family_office", label: "Family office" },
  { value: "fund", label: "Fund / PE" },
  { value: "institutional", label: "Institutional" },
  { value: "developer", label: "Developer" },
];

const YEARS_EXPERIENCE_OPTIONS = [
  { value: "", label: "Select" },
  { value: "0-2", label: "0 – 2 years" },
  { value: "3-5", label: "3 – 5 years" },
  { value: "6-10", label: "6 – 10 years" },
  { value: "11-20", label: "11 – 20 years" },
  { value: "20+", label: "20+ years" },
];

const AUM_OPTIONS = [
  { value: "", label: "Select (optional)" },
  { value: "under-1m", label: "Under €1M" },
  { value: "1m-10m", label: "€1M – €10M" },
  { value: "10m-50m", label: "€10M – €50M" },
  { value: "50m-200m", label: "€50M – €200M" },
  { value: "200m+", label: "€200M+" },
];

const SOURCE_OPTIONS = [
  { value: "", label: "How did you hear about us?" },
  { value: "referral", label: "Referral" },
  { value: "search", label: "Search / online" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "event", label: "Event / conference" },
  { value: "press", label: "Press / media" },
  { value: "other", label: "Other" },
];

interface Props {
  user: { id: string; email?: string } | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function InvitationRequestModal({ user, onClose, onSuccess }: Props) {
  const dialogRef = useFocusTrap<HTMLDivElement>({ onEscape: onClose });
  const [email, setEmail] = useState(user?.email ?? "");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [company, setCompany] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [companyWebsite, setCompanyWebsite] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [investmentFocus, setInvestmentFocus] = useState("");
  const [dealSizeRange, setDealSizeRange] = useState("");
  const [geographicFocus, setGeographicFocus] = useState("");
  const [investmentVehicle, setInvestmentVehicle] = useState("");
  const [yearsExperience, setYearsExperience] = useState("");
  const [aumRange, setAumRange] = useState("");
  const [source, setSource] = useState("");
  const [message, setMessage] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [loading, setLoading] = useState(false);

  const inputCls = "w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors";
  const selectCls = "w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary transition-colors appearance-none";
  const textareaCls = "w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors resize-none";
  const labelCls = "block text-xs text-muted-foreground mb-1.5";

  const FormSection = ({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) => (
    <div className="glass-card rounded-xl border border-border p-5">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Icon className="w-3.5 h-3.5 text-primary" />
        </div>
        <div className="w-1 h-3.5 rounded-full bg-primary" />
        <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">{title}</p>
        <div className="flex-1 h-px bg-border" />
      </div>
      {children}
    </div>
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) { toast.error("Please enter your email"); return; }
    if (!fullName.trim()) { toast.error("Please enter your full name"); return; }
    if (!termsAccepted) { toast.error("Please accept the terms and privacy policy"); return; }
    setLoading(true);
    try {
       
      const { error } = await supabase.from("invitation_requests").insert({
        email: trimmedEmail,
        full_name: fullName.trim() || null,
        phone: phone.trim() || null,
        company: company.trim() || null,
        job_title: jobTitle.trim() || null,
        company_website: companyWebsite.trim() || null,
        linkedin_url: linkedinUrl.trim() || null,
        investment_focus: investmentFocus || null,
        deal_size_range: dealSizeRange || null,
        geographic_focus: geographicFocus.trim() || null,
        investment_vehicle: investmentVehicle || null,
        years_experience: yearsExperience || null,
        aum_range: aumRange || null,
        source: source || null,
        message: message.trim() || null,
        terms_accepted: termsAccepted,
        user_id: user?.id ?? null,
      });
      if (error) throw error;
      onSuccess();
    } catch (err: unknown) {
      toast.error((err as Error)?.message ?? "Could not submit request");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-md p-4" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Request Quick Sale access"
        tabIndex={-1}
        className="w-full max-w-2xl max-h-[90vh] flex flex-col glass-card rounded-2xl border border-border shadow-elevated overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="shrink-0 px-6 py-5 border-b border-border bg-card/80">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <MailPlus className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="font-display text-xl font-bold">
                  Request <span className="gradient-text-primary">Quick Sale™</span> Access
                </h3>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Exclusive investor deal flow — by invitation only.
                </p>
              </div>
            </div>
            <button type="button" onClick={onClose} className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors shrink-0">
              <XIcon className="w-4 h-4" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

            <div className="rounded-xl border border-border bg-card/50 p-4">
              <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Custom Quick Sale™ Access</p>
              <p className="text-sm text-foreground font-medium">Investor dashboard access is reviewed and priced individually.</p>
              <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                After your application is approved, our team sends a custom payment link that matches your deal flow needs, verification level, and access scope. There are no public fixed monthly tiers.
              </p>
            </div>

            <FormSection icon={Users} title="Contact information">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Email address *</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" className={inputCls} required />
                </div>
                <div>
                  <label className={labelCls}>Full name *</label>
                  <input type="text" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="John Smith" className={inputCls} required />
                </div>
                <div>
                  <label className={labelCls}>Phone number</label>
                  <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+30 210 123 4567" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>LinkedIn profile</label>
                  <input type="url" value={linkedinUrl} onChange={e => setLinkedinUrl(e.target.value)} placeholder="https://linkedin.com/in/..." className={inputCls} />
                </div>
              </div>
            </FormSection>

            <FormSection icon={Briefcase} title="Professional profile">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Company / fund name *</label>
                  <input type="text" value={company} onChange={e => setCompany(e.target.value)} placeholder="Acme Capital Partners" className={inputCls} required />
                </div>
                <div>
                  <label className={labelCls}>Job title / role</label>
                  <input type="text" value={jobTitle} onChange={e => setJobTitle(e.target.value)} placeholder="Managing Partner, Investment Director" className={inputCls} />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelCls}>Company website</label>
                  <input type="url" value={companyWebsite} onChange={e => setCompanyWebsite(e.target.value)} placeholder="https://..." className={inputCls} />
                </div>
              </div>
            </FormSection>

            <FormSection icon={BarChart2} title="Investment profile">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Primary investment focus</label>
                  <select value={investmentFocus} onChange={e => setInvestmentFocus(e.target.value)} className={selectCls}>
                    {INVESTMENT_FOCUS_OPTIONS.map(o => <option key={o.value || "empty"} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Typical deal size</label>
                  <select value={dealSizeRange} onChange={e => setDealSizeRange(e.target.value)} className={selectCls}>
                    {DEAL_SIZE_OPTIONS.map(o => <option key={o.value || "empty"} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Investment vehicle</label>
                  <select value={investmentVehicle} onChange={e => setInvestmentVehicle(e.target.value)} className={selectCls}>
                    {INVESTMENT_VEHICLE_OPTIONS.map(o => <option key={o.value || "empty"} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Years of RE experience</label>
                  <select value={yearsExperience} onChange={e => setYearsExperience(e.target.value)} className={selectCls}>
                    {YEARS_EXPERIENCE_OPTIONS.map(o => <option key={o.value || "empty"} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>AUM range (optional)</label>
                  <select value={aumRange} onChange={e => setAumRange(e.target.value)} className={selectCls}>
                    {AUM_OPTIONS.map(o => <option key={o.value || "empty"} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>How did you hear about us?</label>
                  <select value={source} onChange={e => setSource(e.target.value)} className={selectCls}>
                    {SOURCE_OPTIONS.map(o => <option key={o.value || "empty"} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className={labelCls}>Geographic focus / target markets</label>
                  <input type="text" value={geographicFocus} onChange={e => setGeographicFocus(e.target.value)} placeholder="e.g. Athens, Greek mainland, Balkans, Europe" className={inputCls} />
                </div>
              </div>
            </FormSection>

            <FormSection icon={MessageCircle} title="Additional information">
              <div>
                <label className={labelCls}>Tell us about your investment strategy and why you are interested in Quick Sale™ (optional)</label>
                <textarea value={message} onChange={e => setMessage(e.target.value)} rows={4} placeholder="E.g. focus on distressed residential, value-add commercial, off-market deals, target yields..." className={textareaCls} />
              </div>
            </FormSection>

            <div className="glass-card rounded-xl border border-primary/20 bg-primary/5 p-4">
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" checked={termsAccepted} onChange={e => setTermsAccepted(e.target.checked)} className="mt-1 rounded border-border text-primary focus:ring-primary w-4 h-4" />
                <span className="text-xs text-muted-foreground">
                  I confirm that the information provided is accurate. I agree to the{" "}
                  <Link to="/privacy-policy" target="_blank" className="text-primary hover:underline">Privacy Policy</Link>
                  {" "}and{" "}
                  <Link to="/terms-of-service" target="_blank" className="text-primary hover:underline">Terms of Service</Link>
                  . I understand that Quick Sale™ access is discretionary and that mAI Prop may contact me regarding this request.
                </span>
              </label>
            </div>
          </div>

          <div className="shrink-0 px-6 py-4 border-t border-border bg-card/60 flex gap-3">
            <Button type="submit" className="flex-1 h-11 font-semibold bg-gradient-primary border-0 text-primary-foreground" disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Submit request"}
            </Button>
            <Button type="button" variant="outline" onClick={onClose} className="h-11 border-border">
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
