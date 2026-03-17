import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { lazy, Suspense, useState } from "react";
import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowRight, Phone, Search, Scale, Pen, Plane,
  Fingerprint, BadgeCheck, Star, Clock, Users,
  ShieldCheck, Headphones, ChevronRight, ChevronDown,
  CheckCircle2, FileText, AlertCircle } from
"lucide-react";
import { LeadBotProvider, useLeadBot } from "@/components/LeadBotProvider";
import { useTranslation } from "@/contexts/TranslationContext";
const LeadCaptureBot = lazy(() => import("@/components/LeadCaptureBot"));

const BASE_URL = "https://properties.maiprop.co";
const PAGE_URL = `${BASE_URL}/process/`;

const breadcrumbLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
  { "@type": "ListItem", "position": 1, "name": "Home", "item": `${BASE_URL}/` },
  { "@type": "ListItem", "position": 2, "name": "How We Work", "item": PAGE_URL }]

};

const howToLd = {
  "@context": "https://schema.org",
  "@type": "HowTo",
  "name": "How mAI Investments Guides You to a Greek Golden Visa",
  "description": "End-to-end advisory process — from your first consultation call to receiving your Golden Visa residency card.",
  "url": PAGE_URL,
  "totalTime": "P9M",
  "supply": [{ "@type": "HowToSupply", "name": "Minimum €250,000 investment capital" }],
  "step": [
  { "@type": "HowToStep", "position": 1, "name": "Discovery Call", "text": "30-minute call to understand your goals, budget, and timeline. No commitment required." },
  { "@type": "HowToStep", "position": 2, "name": "Investment Strategy", "text": "We build a personalised investment plan: zone selection, yield projection, and Golden Visa threshold confirmation." },
  { "@type": "HowToStep", "position": 3, "name": "Curated Property Shortlist", "text": "We send you 3–5 pre-vetted, compliant properties matching your criteria within 48 hours." },
  { "@type": "HowToStep", "position": 4, "name": "Legal Team Introduction", "text": "We connect you with our trusted Athens notary and lawyer. Due diligence is conducted in parallel." },
  { "@type": "HowToStep", "position": 5, "name": "Purchase Coordination", "text": "We coordinate your Greek tax number (AFM), bank account opening, and notarial deed signing remotely where possible." },
  { "@type": "HowToStep", "position": 6, "name": "Visa File Submission", "text": "We compile and submit the full residency application. You receive a 180-day temporary permit immediately." },
  { "@type": "HowToStep", "position": 7, "name": "One Trip — Biometrics", "text": "A single trip to Greece. Your whole family attends together. Typically 1–2 days." },
  { "@type": "HowToStep", "position": 8, "name": "Permit Issued + Rental Setup", "text": "5-year Golden Visa issued. We immediately set up property management and rental optimisation if desired." }]

};

const faqLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
  {
    "@type": "Question",
    "name": "How long does the entire Golden Visa process take with mAI?",
    "acceptedAnswer": { "@type": "Answer", "text": "From your first call to permit issuance: typically 6–9 months. Property selection and legal coordination take 1–3 months; visa application and biometrics take a further 3–6 months. We operate faster than the market average because our legal partners are already briefed on mAI portfolio properties." }
  },
  {
    "@type": "Question",
    "name": "Do I need to travel to Greece during the process?",
    "acceptedAnswer": { "@type": "Answer", "text": "Only once — for the biometrics appointment. Everything else (property review, legal coordination, document preparation, and even some purchase steps) can be handled remotely or via power of attorney." }
  },
  {
    "@type": "Question",
    "name": "What does mAI Investments charge for the advisory service?",
    "acceptedAnswer": { "@type": "Answer", "text": "Our advisory and coordination fee is built into the property transaction. There is no separate retainer. The fee covers property sourcing, legal coordination, full visa file preparation, and post-purchase rental management setup." }
  },
  {
    "@type": "Question",
    "name": "Can mAI manage my property after the Golden Visa is issued?",
    "acceptedAnswer": { "@type": "Answer", "text": "Yes. We offer full rental management for short-term and long-term lets. Typical net yields on mAI portfolio properties run 4–7% annually. You receive monthly reports and rental income transfers automatically." }
  },
  {
    "@type": "Question",
    "name": "What happens if my Golden Visa application is rejected?",
    "acceptedAnswer": { "@type": "Answer", "text": "We only submit applications we are confident will be approved. Our pre-submission compliance review checks every document. In the rare event of a rejection, we cover the resubmission and legal costs at no charge to you." }
  }]

};

// ── Requirements data embedded in steps ─────────────────────────────────────
const eligibilityCriteria = [
"Non-EU / non-EEA national (any nationality)",
"Minimum age: 18 years old",
"Clean criminal record (from country of origin and residence)",
"Valid travel document / passport",
"Proof of health insurance covering Greece",
"No prior illegal entry or overstay in Greece"];


const investmentTiers = [
{ tier: "€250,000", zones: "All areas outside high-demand zones", desc: "Commercial property converted to residential, or any residential property outside Greater Athens, Thessaloniki, Mykonos, Santorini, and South Athens coast." },
{ tier: "€800,000", zones: "High-demand zones", desc: "Residential property in Greater Athens, Thessaloniki, Mykonos, Santorini, or South Athens coast. Single residential unit of at least 120 m²." }];


const requiredDocuments = [
"Passport copies (valid for at least 12 months)",
"Recent passport-size photographs",
"Proof of property ownership (notarial deed)",
"Property purchase receipt / bank transfer confirmation",
"Health insurance policy covering Greece (min €30,000 coverage)",
"Criminal record certificate (apostilled, translated to Greek)",
"Greek tax number (AFM) certificate",
"Marriage certificate (for spousal applications, apostilled)",
"Birth certificates for dependent children (apostilled)",
"Application form (signed by each family member)"];


const phases = [
{
  phase: "01",
  icon: Phone,
  title: "Discovery Call",
  subtitle: "30 minutes · Free · No commitment",
  desc: "We start by listening. Your goals, your timeline, your family situation. We confirm your eligibility and explain exactly which investment threshold applies to you — €250K or €800K.",
  detail: "Within 24h of enquiry",
  learnMore: {
    label: "Eligibility requirements",
    content:
    <div className="space-y-3">
          <p className="text-sm text-muted-foreground mb-4">To qualify for the Greek Golden Visa, you must meet all of the following criteria before we proceed to property selection:</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {eligibilityCriteria.map((item) =>
        <div key={item} className="flex items-start gap-2.5 rounded-lg border border-border/60 bg-background/60 px-3 py-2.5">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                <span className="text-xs text-muted-foreground leading-relaxed">{item}</span>
              </div>
        )}
          </div>
        </div>

  }
},
{
  phase: "02",
  icon: Search,
  title: "Investment Strategy",
  subtitle: "Personalised to your profile",
  desc: "Our team builds a written investment brief: zone recommendation (Athens, Thessaloniki, or islands), projected yield, capital appreciation scenario, and total-cost-of-acquisition breakdown including taxes and fees.",
  detail: "Delivered within 48h",
  learnMore: {
    label: "Investment thresholds",
    content:
    <div className="space-y-3">
          <p className="text-sm text-muted-foreground mb-4">Greece uses a two-tier threshold system. The zone where the property is located determines your minimum investment:</p>
          <div className="space-y-3">
            {investmentTiers.map((tier) =>
        <div key={tier.tier} className="rounded-lg border border-border/60 bg-background/60 p-4 flex items-start gap-4">
                <span className="shrink-0 text-xl font-bold text-primary">{tier.tier}</span>
                <div>
                  <p className="text-xs font-semibold text-foreground mb-1">{tier.zones}</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">{tier.desc}</p>
                </div>
              </div>
        )}
          </div>
          <div className="flex items-start gap-2.5 rounded-lg border border-secondary/30 bg-secondary/5 px-3 py-2.5">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-secondary" />
            <p className="text-xs text-muted-foreground">Always confirm zoning classification with your legal advisor. We do this for you as part of the due diligence step.</p>
          </div>
        </div>

  }
},
{
  phase: "03",
  icon: Star,
  title: "Curated Property Shortlist",
  subtitle: "3–5 pre-vetted options",
  desc: "You receive a shortlist of Golden Visa-compliant properties that have passed our internal due diligence — title check, planning status, yield verification, and renovation quality assessment. No noise. Only match.",
  detail: "Presented within 72h"
},
{
  phase: "04",
  icon: Scale,
  title: "Legal & Due Diligence",
  subtitle: "Trusted Athens legal partners",
  desc: "We introduce you to our vetted notary and lawyer network. They run a full title search, tax clearance, and encumbrance check in parallel with your decision. No delays waiting for legal to 'catch up'.",
  detail: "Runs in parallel — 2–4 weeks"
},
{
  phase: "05",
  icon: Pen,
  title: "Purchase Coordination",
  subtitle: "AFM · Bank account · Notarial deed",
  desc: "We coordinate every administrative step: Greek tax number (AFM) registration, bank account opening, and notarial deed signing. Much of this can be done remotely via power of attorney if you prefer.",
  detail: "2–4 weeks after legal sign-off"
},
{
  phase: "06",
  icon: Plane,
  title: "Visa File Submission",
  subtitle: "Full application handled by our team",
  desc: "We compile your complete residency dossier — every document, every apostille, every certified translation — and submit on your behalf. A 180-day temporary permit is issued immediately, keeping your status clean while the full permit is processed.",
  detail: "4–6 weeks",
  learnMore: {
    label: "Required documents checklist",
    content:
    <div className="space-y-3">
          <p className="text-sm text-muted-foreground mb-4">All foreign documents must be apostilled and accompanied by a certified Greek translation. We coordinate the full document collection on your behalf:</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {requiredDocuments.map((doc) =>
        <div key={doc} className="flex items-start gap-2.5 rounded-lg border border-border/60 bg-background/60 px-3 py-2.5">
                <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                <span className="text-xs text-muted-foreground leading-relaxed">{doc}</span>
              </div>
        )}
          </div>
        </div>

  }
},
{
  phase: "07",
  icon: Fingerprint,
  title: "Biometrics — One Trip",
  subtitle: "Your entire family, together",
  desc: "This is the only moment you need to be physically present in Greece. We schedule all family members for the same appointment slot and provide a full logistics briefing. Most clients complete this in a single day.",
  detail: "1–2 days in Greece"
},
{
  phase: "08",
  icon: BadgeCheck,
  title: "Permit Issued + Property Activated",
  subtitle: "5-year renewable Golden Visa",
  desc: "Your residency cards arrive. Simultaneously, we activate your property for rental if that's part of your plan — onboarding it with management partners, listing optimisation, and revenue reporting from day one.",
  detail: "2–4 months post-biometrics"
}];


const whyUs = [
{ icon: Clock, stat: "6–9 months", label: "Average end-to-end timeline" },
{ icon: Plane, stat: "1 trip", label: "Only one visit to Greece required" },
{ icon: Users, stat: "Family", label: "Spouse, children & parents included" },
{ icon: ShieldCheck, stat: "100%", label: "Compliance-checked portfolio" },
{ icon: Headphones, stat: "Dedicated", label: "Single advisor from day one" },
{ icon: Star, stat: "4–7%", label: "Net rental yield on managed stock" }];


// ── Step card with expandable "Learn more" ────────────────────────────────────
type Phase = typeof phases[number];

const StepCard = ({ p, t }: {p: Phase;t: (s: string) => string;}) => {
  const [open, setOpen] = useState(false);
  const Icon = p.icon;

  return (
    <div className="relative flex gap-6 sm:gap-8 group">
      {/* Icon bubble */}
      <div className="relative shrink-0 z-10">
        <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-primary/40 bg-background shadow-[0_0_20px_hsl(179_90%_63%/0.12)] group-hover:border-primary/70 transition-colors">
          <Icon className="h-5 w-5 text-primary" />
        </div>
      </div>

      {/* Card */}
      <div className="flex-1">
        <div className={`rounded-xl border bg-background/40 transition-colors ${open ? "border-primary/40" : "border-border hover:border-primary/30"}`}>
          {/* Header row */}
          <div className="p-6">
            <div className="flex items-start justify-between gap-4 flex-wrap mb-3">
              <div>
                <span className="text-xs font-bold text-primary/50 tracking-widest">{t("STEP")} {p.phase}</span>
                <h3 className="mt-0.5 font-semibold text-base">{t(p.title)}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{t(p.subtitle)}</p>
              </div>
              <span className="shrink-0 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs text-primary whitespace-nowrap">
                {t(p.detail)}
              </span>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">{t(p.desc)}</p>

            {/* Learn more toggle — only for steps with extra content */}
            {p.learnMore &&
            <button
              onClick={() => setOpen((v) => !v)}
              className="mt-4 flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary/80 transition-colors">

                {open ? t("Hide details") : t(p.learnMore.label)}
                <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
              </button>
            }
          </div>

          {/* Expandable panel */}
          {p.learnMore && open &&
          <div className="border-t border-border/60 px-6 py-5 bg-background/20 rounded-b-xl">
              {p.learnMore.content}
            </div>
          }
        </div>
      </div>
    </div>);

};

const Inner = () => {
  const { openWithLocation } = useLeadBot();
  const { t } = useTranslation();

  return (
    <main className="min-h-screen bg-background">
      <Helmet>
        <title>How We Work — Greek Golden Visa Advisory Process | mAI Investments</title>
        <meta name="description" content="See exactly how mAI Investments guides you from first call to Golden Visa permit — 8 advisory steps, one trip to Greece, 6–9 months end-to-end. Full-service, no surprises." />
        <meta name="keywords" content="Greek Golden Visa advisory, how to get Golden Visa Greece, mAI Investments process, Golden Visa investment service, Greece residency investment advisor" />
        <meta name="robots" content="index, follow" />
        <link rel="canonical" href={PAGE_URL} />
        <link rel="alternate" hrefLang="en" href={PAGE_URL} />
        <link rel="alternate" hrefLang="en-US" href={PAGE_URL} />
        <link rel="alternate" hrefLang="en-GB" href={PAGE_URL} />
        <link rel="alternate" hrefLang="el" href={`${PAGE_URL}?lang=el`} />
        <link rel="alternate" hrefLang="ar" href={`${PAGE_URL}?lang=ar`} />
        <link rel="alternate" hrefLang="ar-AE" href={`${PAGE_URL}?lang=ar`} />
        <link rel="alternate" hrefLang="zh" href={`${PAGE_URL}?lang=zh`} />
        <link rel="alternate" hrefLang="zh-CN" href={`${PAGE_URL}?lang=zh`} />
        <link rel="alternate" hrefLang="ru" href={`${PAGE_URL}?lang=ru`} />
        <link rel="alternate" hrefLang="fr" href={`${PAGE_URL}?lang=fr`} />
        <link rel="alternate" hrefLang="hi" href={`${PAGE_URL}?lang=hi`} />
        <link rel="alternate" hrefLang="he" href={`${PAGE_URL}?lang=he`} />
        <link rel="alternate" hrefLang="tr" href={`${PAGE_URL}?lang=tr`} />
        <link rel="alternate" hrefLang="x-default" href={PAGE_URL} />
        <meta property="og:type" content="article" />
        <meta property="og:url" content={PAGE_URL} />
        <meta property="og:title" content="How We Work — Greek Golden Visa Advisory Process | mAI Investments" />
        <meta property="og:description" content="8 advisory steps from first call to Golden Visa permit. One trip. Full family included. 6–9 months." />
        <meta property="og:image" content={`${BASE_URL}/og-image.png`} />
        <meta property="og:locale" content="en_US" />
        <meta property="og:locale:alternate" content="ar_AE" />
        <meta property="og:locale:alternate" content="zh_CN" />
        <meta property="og:locale:alternate" content="ru_RU" />
        <meta property="og:locale:alternate" content="tr_TR" />
      </Helmet>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(howToLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />

      <Navbar forceScrolled />

      {/* ── BREADCRUMB ────────────────────────────────────────── */}
      <nav className="mt-[64px] border-b border-border/40 bg-background/80 backdrop-blur-sm" aria-label="Breadcrumb">
        <div className="container mx-auto px-6 py-4">
          <ol className="flex items-center gap-2 text-xs text-muted-foreground">
            <li><Link to="/" className="hover:text-primary transition-colors">{t("Home")}</Link></li>
            <li className="text-muted-foreground/50 select-none">›</li>
            <li className="text-foreground font-medium">{t("How We Work")}</li>
          </ol>
        </div>
      </nav>

      {/* ── HERO ─────────────────────────────────────────────── */}
      <section className="relative overflow-hidden pt-20 pb-20">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/8 via-transparent to-secondary/5" />
        <div className="pointer-events-none absolute -top-32 right-0 h-[500px] w-[500px] rounded-full bg-primary/5 blur-[120px]" />

        <div className="container mx-auto px-6 relative text-center">

          <span className="mb-4 inline-block rounded-full border border-primary/40 bg-primary/10 px-5 py-1.5 text-xs font-semibold uppercase tracking-widest text-primary">
            {t("Full-Service Advisory")}
          </span>
          <h1 className="max-w-3xl mx-auto text-3xl font-bold leading-tight sm:text-5xl lg:text-6xl">
            {t("From First Call to")}{" "}
            <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
              {t("Golden Visa Permit")}
            </span>
          </h1>
          <p className="mt-6 max-w-2xl mx-auto text-muted-foreground leading-relaxed text-base">
            {t("Eight structured steps. One dedicated advisor. One trip to Greece. This is how mAI Investments takes you from initial enquiry to a 5-year renewable EU residency permit — without surprises.")}
          </p>

          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <Button size="lg" className="rounded-full px-8 gap-2" onClick={() => openWithLocation("process")}>
              {t("Start My Journey")} <ArrowRight className="h-4 w-4" />
            </Button>
            <Button asChild variant="outline" size="lg" className="rounded-full px-8">
              <Link to="/guides">{t("View Guides & Requirements")}</Link>
            </Button>
          </div>

          {/* Stats bar */}
          <div className="mt-14 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6 max-w-4xl mx-auto">
            {whyUs.map((s) => {
              const Icon = s.icon;
              return (
                <div key={s.label} className="flex flex-col items-center text-center gap-1 rounded-xl border border-border/40 bg-background/60 p-4">
                  <Icon className="h-5 w-5 text-primary mb-1" />
                  <p className="text-lg font-bold">{s.stat}</p>
                  <p className="text-xs text-muted-foreground">{t(s.label)}</p>
                </div>
              );






            })}
          </div>
        </div>
      </section>

      {/* ── PHASE TIMELINE ───────────────────────────────────── */}
      <section className="py-20">
        <div className="container mx-auto max-w-4xl px-6">
          <div className="mb-14 text-center">
            <h2 className="text-3xl font-bold sm:text-4xl">{t("Your 8-Step Journey")}</h2>
            <p className="mt-3 text-muted-foreground max-w-xl mx-auto">
              {t("Every step is owned by our team. You make decisions — we handle execution.")}
            </p>
            <div className="mt-4 flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline" className="border-primary/30 text-primary bg-primary/5 gap-1.5">
                <ChevronDown className="h-3 w-3" /> {t("Steps marked with details are expandable")}
              </Badge>
            </div>
          </div>

          <div className="relative">
            {/* Vertical line */}
            <div className="absolute left-[27px] top-4 bottom-4 w-px bg-gradient-to-b from-primary/50 via-secondary/30 to-transparent hidden sm:block" />
            <div className="space-y-8">
              {phases.map((p) =>
              <StepCard key={p.phase} p={p} t={t} />
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── WHAT'S INCLUDED ──────────────────────────────────── */}
      <section className="py-20 bg-background/50">
        <div className="container mx-auto max-w-4xl px-6">
          <div className="grid gap-8 md:grid-cols-2 items-start">
            <div>
              <h2 className="text-3xl font-bold mb-4">{t("What's Included in Our Service")}</h2>
              <p className="text-muted-foreground leading-relaxed mb-6">
                {t("One fee. No hidden charges. Our advisory covers the complete journey — from first call to ongoing rental management after your permit is issued.")}
              </p>
              <Button className="rounded-full px-8 gap-2" onClick={() => openWithLocation("process-included")}>
                {t("Get Full Service Details")} <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-3">
              {[
              "Eligibility assessment & investment strategy session",
              "Pre-vetted property shortlist matched to your criteria",
              "Legal partner introduction & due diligence coordination",
              "Full document preparation & visa file compilation",
              "Family inclusion — spouse, children under 21, parents",
              "Biometrics appointment scheduling & logistics support",
              "Post-visa rental management & monthly yield reporting",
              "Renewal coordination at 5-year mark"].
              map((item) =>
              <div key={item} className="flex items-start gap-3 rounded-lg border border-border bg-background/40 p-4">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span className="text-sm text-muted-foreground">{t(item)}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── INTERNAL LINKS ───────────────────────────────────── */}
      <section className="py-16">
        <div className="container mx-auto max-w-4xl px-6">
          <h2 className="text-2xl font-bold mb-6">{t("Related Guides")}</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
            { href: "/guides", label: "Guides & Requirements", desc: "Investment thresholds, eligibility criteria, and documentation." },
            { href: "/properties", label: "Investment Properties", desc: "Pre-verified properties qualifying at the entry threshold." },
            { href: "/portfolio", label: "Portfolio & Track Record", desc: "Delivered properties and investment results." }].
            map((l) =>
            <Link key={l.href} to={l.href} className="group rounded-xl border border-border bg-background/40 p-5 hover:border-primary/40 transition-colors">
                <p className="font-semibold text-sm mb-1 group-hover:text-primary transition-colors">{t(l.label)}</p>
                <p className="text-xs text-muted-foreground">{t(l.desc)}</p>
                <ChevronRight className="h-4 w-4 text-primary mt-3 group-hover:translate-x-1 transition-transform" />
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────── */}
      













      {/* ── FINAL CTA ────────────────────────────────────────── */}
      <section className="py-24">
        <div className="container mx-auto max-w-2xl px-6 text-center">
          <span className="mb-4 inline-block rounded-full border border-primary/40 bg-primary/10 px-5 py-1.5 text-xs font-semibold uppercase tracking-widest text-primary">
            {t("Start Today")}
          </span>
          <h2 className="text-3xl font-bold mb-4">
            {t("Ready to Begin Your")}{" "}
            <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
              {t("Golden Visa Journey?")}
            </span>
          </h2>
          <p className="text-muted-foreground mb-8 leading-relaxed">
            {t("Book a 30-minute discovery call. We'll confirm your eligibility, explain the thresholds that apply to you, and send a curated shortlist within 48 hours.")}
          </p>
          <div className="flex flex-wrap gap-4 justify-center">
            <Button size="lg" className="rounded-full px-10 gap-2" onClick={() => openWithLocation("process-cta")}>
              {t("Book Discovery Call")} <ArrowRight className="h-4 w-4" />
            </Button>
            <Button asChild variant="outline" size="lg" className="rounded-full px-10">
              <Link to="/properties/">{t("Browse Properties")}</Link>
            </Button>
          </div>
        </div>
      </section>

      <Suspense fallback={null}>
        <LeadCaptureBot />
      </Suspense>
    </main>);

};

export default function ProcessPage() {
  return (
    <LeadBotProvider>
      <Inner />
    </LeadBotProvider>);

}