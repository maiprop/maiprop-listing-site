import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Loader2, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useMyProfessional, useUpdateProfessional } from "@/hooks/useProfessionalServices";
import { LocationAutocompleteInput } from "@/components/location/LocationAutocompleteInput";

const getSaveErrorMessage = (error: unknown) => {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return "Could not save profile.";
};

export function ProfessionalProfileEditor({
  onSwitchToSettings,
}: {
  onSwitchToSettings?: () => void;
}) {
  const { data: pro, isLoading } = useMyProfessional();
  const updatePro = useUpdateProfessional();
  type ProForm = { title: string; bio: string; city: string; hourly_rate: string; license_number: string; experience_years: string; website_url: string; specialties: string; languages: string };
  const [form, setForm] = useState<ProForm>({
    title: "", bio: "", city: "", hourly_rate: "", license_number: "",
    experience_years: "", website_url: "", specialties: "", languages: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (pro) {
      setForm({
        title:            pro.title || "",
        bio:              pro.bio || "",
        city:             pro.city || "",
        hourly_rate:      pro.hourly_rate ? String(pro.hourly_rate) : "",
        license_number:   pro.license_number || "",
        experience_years: pro.experience_years ? String(pro.experience_years) : "",
        website_url:      pro.website_url || "",
        specialties:      Array.isArray(pro.specialties) ? pro.specialties.join(", ") : "",
        languages:        Array.isArray(pro.languages) ? pro.languages.join(", ") : "",
      });
    }
  }, [pro]);

  const handleSave = async () => {
    if (!pro) return;
    setSaving(true);
    try {
      await updatePro.mutateAsync({
        id: pro.id,
        updates: {
          title:            form.title || pro.title,
          bio:              form.bio || null,
          city:             form.city || null,
          hourly_rate:      form.hourly_rate ? parseFloat(form.hourly_rate) : null,
          license_number:   form.license_number || null,
          experience_years: form.experience_years ? parseInt(form.experience_years, 10) : null,
          website_url:      form.website_url || null,
          specialties:      form.specialties ? form.specialties.split(",").map((s: string) => s.trim()).filter(Boolean) : null,
          languages:        form.languages ? form.languages.split(",").map((s: string) => s.trim()).filter(Boolean) : null,
        },
      });
    } catch (e: unknown) {
      toast.error(getSaveErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  if (isLoading || !pro) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  const rating = Number(pro.rating) || 0;
  const reviewsCount = pro.reviews_count || 0;

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold">Professional Profile</h1>
        <Button variant="outline" size="sm" asChild>
          <Link to={`/professionals/${pro.id}`}>View public profile</Link>
        </Button>
      </div>

      <div className="glass-card rounded-xl p-6 space-y-4">
        <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Profile details</h2>
        {([
          ["Professional Title",              "title",            "e.g. Licensed Architect"          ],
          ["City",                            "city",             "e.g. Athens"                      ],
          ["Bio / About",                     "bio",              "Brief description for clients", "textarea"],
          ["Hourly Rate (€)",                 "hourly_rate",      "e.g. 80",                      "number"  ],
          ["License Number",                  "license_number",   ""                                 ],
          ["Years of Experience",             "experience_years", "e.g. 10",                      "number"  ],
          ["Specialties (comma-separated)",   "specialties",      "e.g. Renovation, Permits"         ],
          ["Languages (comma-separated)",     "languages",        "e.g. English, Greek"              ],
          ["Website URL",                     "website_url",      "https://..."                      ],
        ] as const).map(([label, key, placeholder, type]) => (
          <div key={key}>
            <label className="text-xs font-medium text-muted-foreground block mb-1.5">{label}</label>
            {key === "city" ? (
              <LocationAutocompleteInput
                mode="city"
                aria-label={label}
                value={form.city}
                onChange={(value) => setForm(f => ({ ...f, city: value }))}
                placeholder={placeholder}
                inputClassName="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm"
              />
            ) : type === "textarea" ? (
              <textarea
                value={form[key as keyof ProForm]}
                onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                rows={4}
                placeholder={placeholder}
                className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm resize-none"
              />
            ) : (
              <input
                type={type || "text"}
                value={form[key as keyof ProForm]}
                onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                placeholder={placeholder}
                className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm"
              />
            )}
          </div>
        ))}
        {onSwitchToSettings && (
          <p className="text-xs text-muted-foreground">
            To change participant type, go to{" "}
            <button type="button" onClick={onSwitchToSettings} className="text-primary hover:underline">
              Settings
            </button>{" "}
            → Switch Participant Type.
          </p>
        )}
        <Button
          className="bg-gradient-primary border-0 text-primary-foreground w-full"
          disabled={saving}
          onClick={handleSave}
        >
          {(saving || updatePro.isPending) && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
          Save Changes
        </Button>
      </div>

      <div className="glass-card rounded-xl p-6">
        <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-4">Reviews</h2>
        <div className="flex items-start gap-6">
          <div className="text-center shrink-0">
            <div className="font-display text-4xl font-bold text-brand-gold">
              {rating > 0 ? rating.toFixed(1) : "—"}
            </div>
            <div className="flex gap-0.5 justify-center mt-1">
              {[1, 2, 3, 4, 5].map(i => (
                <Star
                  key={i}
                  className={`w-4 h-4 ${i <= Math.floor(rating) ? "fill-brand-gold text-brand-gold" : "text-muted-foreground/30"}`}
                />
              ))}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {reviewsCount} review{reviewsCount !== 1 ? "s" : ""}
            </div>
          </div>
          <div className="flex-1">
            <p className="text-sm text-muted-foreground">
              {reviewsCount > 0
                ? "Client reviews from completed consultations appear here."
                : "Reviews from clients will appear here once you complete consultations."}
            </p>
            <Button variant="outline" size="sm" className="mt-3 border-border" asChild>
              <Link to={`/professionals/${pro.id}`}>View your public profile</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
