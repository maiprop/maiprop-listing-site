import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Building2, MapPin } from "lucide-react";
import { useSubmitContactForm } from "@/hooks/useContactSubmissions";

export default function Contact() {
  const { t } = useTranslation();
  const [form, setForm] = useState({ name: "", email: "", company: "", message: "" });
  const submitContactForm = useSubmitContactForm();
  const loading = submitContactForm.isPending;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.message) {
      toast.error(t("common.required"));
      return;
    }
    try {
      await submitContactForm.mutateAsync({
        type: "contact",
        name: form.name,
        email: form.email,
        company: form.company || null,
        message: form.message,
      });
      toast.success(t("contact.successMessage"));
      setForm({ name: "", email: "", company: "", message: "" });
    } catch (_err: unknown) {
      toast.error("Failed to send message. Please try again or email us directly.");
    }
  };

  return (
    <div className="min-h-screen bg-background pb-bottom-nav lg:pb-0">
      <Navbar />
      <div className="pt-28 pb-20">
        <div className="container max-w-5xl">
          <div className="mb-10">
            <h1 className="font-display text-4xl font-bold mb-3">{t("contact.title")}</h1>
            <p className="text-muted-foreground text-lg">
              {t("contact.subtitle")}
            </p>
          </div>

          <div className="grid md:grid-cols-5 gap-10">
            {/* Contact info */}
            <div className="md:col-span-2 space-y-6">
              <div className="rounded-xl border border-border p-5 space-y-4">
                <h2 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">{t("contact.getInTouch")}</h2>
                <div className="flex items-start gap-3">
                  <Building2 className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium text-sm">mAI prop</p>
                    <p className="text-sm text-muted-foreground">Data Estate PC</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <MapPin className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium text-sm">{t("contact.registeredAddress")}</p>
                    <p className="text-sm text-muted-foreground">Akadimias 32, 106 72, Athens, Greece</p>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-border p-5 space-y-3 bg-muted/30">
                <h2 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">{t("contact.suitableFor")}</h2>
                {[
                  t("contact.orgTypes.banks"),
                  t("contact.orgTypes.reits"),
                  t("contact.orgTypes.law"),
                  t("contact.orgTypes.government"),
                  t("contact.orgTypes.proptech"),
                ].map((item) => (
                  <p key={item} className="text-sm text-muted-foreground flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary/60 shrink-0" />
                    {item}
                  </p>
                ))}
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="md:col-span-3 space-y-5">
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="name">{t("contact.name")} *</Label>
                  <Input
                    id="name"
                    placeholder={t("contact.namePlaceholder")}
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email">{t("contact.email")} *</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder={t("contact.emailPlaceholder")}
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="company">{t("contact.company")}</Label>
                <Input
                  id="company"
                  placeholder={t("contact.companyPlaceholder")}
                  value={form.company}
                  onChange={(e) => setForm({ ...form, company: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="message">{t("contact.message")} *</Label>
                <Textarea
                  id="message"
                  placeholder={t("contact.messagePlaceholder")}
                  rows={6}
                  value={form.message}
                  onChange={(e) => setForm({ ...form, message: e.target.value })}
                />
              </div>
              <Button type="submit" disabled={loading} className="w-full sm:w-auto">
                {loading ? t("contact.sending") : t("contact.send")}
              </Button>
            </form>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
