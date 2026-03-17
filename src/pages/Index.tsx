import { lazy, Suspense, useEffect } from "react";
import { Helmet } from "react-helmet-async";
import { useLocation } from "react-router-dom";
import Navbar from "@/components/Navbar";
import HeroSection from "@/components/HeroSection";
import SectionDivider from "@/components/SectionDivider";
import { LeadBotProvider } from "@/components/LeadBotProvider";

const CookieConsent = lazy(() => import("@/components/CookieConsent"));

// Lazy-load below-the-fold sections
const GoldenVisaStats = lazy(() => import("@/components/GoldenVisaStats"));
const InvestmentOpportunities = lazy(() => import("@/components/InvestmentOpportunities"));
const DeliveredProjects = lazy(() => import("@/components/DeliveredProjects"));

const PlatformReference = lazy(() => import("@/components/PlatformReference"));
const JourneySection = lazy(() => import("@/components/JourneySection"));
const ContactSection = lazy(() => import("@/components/ContactSection"));
const FaqSection = lazy(() => import("@/components/FaqSection"));
const GuidesTeaser = lazy(() => import("@/components/GuidesTeaser"));
const LeadCaptureBot = lazy(() => import("@/components/LeadCaptureBot"));

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "What is the minimum investment for a Greek Golden Visa?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "The minimum investment for a Greek Golden Visa is €250,000 in qualifying real estate. mAI Investments offers pre-verified properties starting at this threshold, covering Athens, Piraeus, Glyfada, and the Athenian Riviera.",
      },
    },
    {
      "@type": "Question",
      name: "How long does the Greek Golden Visa process take?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "The Greek Golden Visa process typically takes 6–9 months from initial consultation to residency permit approval, including property purchase, legal registration, and biometrics appointment.",
      },
    },
    {
      "@type": "Question",
      name: "Which countries can I access with a Greek Golden Visa?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "A Greek Golden Visa grants the right to live in Greece and travel freely across all 27 Schengen Area countries without additional visas.",
      },
    },
    {
      "@type": "Question",
      name: "Can I rent out my Golden Visa property?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. Golden Visa properties in Greece can be rented out. mAI Investments' portfolio is specifically designed for rental income — properties are sourced, renovated, and stabilised with tenants in place, targeting average net yields of 3–5% annually through a mix of mid-term and long-term rental strategies.",
      },
    },
    {
      "@type": "Question",
      name: "Do I need to live in Greece to keep the Golden Visa?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "No. The Greek Golden Visa does not require a minimum stay in Greece. You can maintain the residency permit simply by keeping the qualifying real estate investment.",
      },
    },
    {
      "@type": "Question",
      name: "Can I become a Greek citizen through the Golden Visa?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. After 7 years of legal residency in Greece, Golden Visa holders can apply for Greek citizenship — one of the most valuable passports in the world. Greek citizenship grants full EU citizenship rights, the ability to live, work, and study anywhere in the EU, and visa-free access to 185+ countries. The path requires a basic language test and proof of integration, but does not require continuous physical residence.",
      },
    },
  ],
};

const BASE_URL = "https://properties.maiprop.co";

const organizationLd = {
  "@context": "https://schema.org",
  "@type": ["Organization", "RealEstateAgent"],
  "@id": `${BASE_URL}/#organization`,
  "name": "mAI Investments Properties",
  "alternateName": "mAI Prop",
  "url": BASE_URL,
  "logo": {
    "@type": "ImageObject",
    "url": `${BASE_URL}/images/maiprop-logo.webp`,
    "width": 200,
    "height": 60,
  },
  "description": "mAI Investments connects non-EU investors with Golden Visa eligible real estate in Athens and the Greek Riviera. We source, renovate, and manage income-generating properties targeting net yields of 5–7%.",
  "address": {
    "@type": "PostalAddress",
    "addressLocality": "Athens",
    "addressCountry": "GR",
  },
  "areaServed": [
    { "@type": "City", "name": "Athens", "sameAs": "https://www.wikidata.org/wiki/Q1524" },
    { "@type": "City", "name": "Piraeus" },
    { "@type": "City", "name": "Glyfada" },
  ],
  "knowsAbout": ["Greek Golden Visa", "Real Estate Investment Greece", "EU Residency by Investment"],
  "availableLanguage": ["en", "el", "ar", "zh", "ru", "fr", "hi", "he", "tr"],
  "sameAs": [
    "https://www.facebook.com/maiprop",
    "https://www.linkedin.com/company/maiprop",
    "https://www.instagram.com/maiprop",
  ],
};

const Index = () => {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const lang = params.get("lang");
  // Noindex ?lang= parameter variants to protect crawl budget
  const isLangVariant = !!lang;
  const canonicalUrl = `${BASE_URL}/`;
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash) return;
    // Use a fixed delay to allow all lazy sections to render before scrolling
    const timer = setTimeout(() => {
      const el = document.querySelector(hash);
      el?.scrollIntoView({ behavior: "smooth" });
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  return (
  <main
    className="min-h-screen bg-background overflow-x-hidden"
    role="main"
    itemScope
    itemType="https://schema.org/WebPage"
  >
    {/* Crawl budget: canonical always points to clean URL; noindex ?lang= variants */}
    <Helmet>
      <title>Greek Golden Visa Real Estate — EU Residency from €250K | mAI Investments</title>
      <meta name="description" content="Invest in Golden Visa eligible Greek real estate from €250,000. EU residency, Schengen access, and 5–7% net rental yields. Pre-verified properties in Athens & the Greek Riviera." />
      <meta name="keywords" content="Greek Golden Visa, Greece real estate investment, EU residency investment, Athens property investment, Golden Visa property Greece, Greece Golden Visa €250000, Schengen residency, buy property Greece" />
      <meta name="robots" content={isLangVariant ? "noindex, follow" : "index, follow"} />
      <link rel="canonical" href={canonicalUrl} />
      {/* Hreflang — all supported languages */}
      <link rel="alternate" hrefLang="en"      href={canonicalUrl} />
      <link rel="alternate" hrefLang="en-US"   href={canonicalUrl} />
      <link rel="alternate" hrefLang="en-GB"   href={canonicalUrl} />
      <link rel="alternate" hrefLang="el"      href={`${canonicalUrl}?lang=el`} />
      <link rel="alternate" hrefLang="ar"      href={`${canonicalUrl}?lang=ar`} />
      <link rel="alternate" hrefLang="ar-AE"   href={`${canonicalUrl}?lang=ar`} />
      <link rel="alternate" hrefLang="zh"      href={`${canonicalUrl}?lang=zh`} />
      <link rel="alternate" hrefLang="zh-CN"   href={`${canonicalUrl}?lang=zh`} />
      <link rel="alternate" hrefLang="ru"      href={`${canonicalUrl}?lang=ru`} />
      <link rel="alternate" hrefLang="fr"      href={`${canonicalUrl}?lang=fr`} />
      <link rel="alternate" hrefLang="hi"      href={`${canonicalUrl}?lang=hi`} />
      <link rel="alternate" hrefLang="he"      href={`${canonicalUrl}?lang=he`} />
      <link rel="alternate" hrefLang="tr"      href={`${canonicalUrl}?lang=tr`} />
      <link rel="alternate" hrefLang="x-default" href={canonicalUrl} />
      {/* Open Graph */}
      <meta property="og:type" content="website" />
      <meta property="og:url" content={canonicalUrl} />
      <meta property="og:locale" content="en_US" />
      <meta property="og:locale:alternate" content="ar_AE" />
      <meta property="og:locale:alternate" content="zh_CN" />
      <meta property="og:locale:alternate" content="ru_RU" />
      <meta property="og:locale:alternate" content="tr_TR" />
      <meta property="og:site_name" content="mAI Investments" />
      <meta property="og:title" content="Greek Golden Visa Real Estate — EU Residency from €250K | mAI Investments" />
      <meta property="og:description" content="Invest in Golden Visa eligible Greek real estate from €250,000. EU residency, Schengen access, and 5–7% net rental yields." />
      <meta property="og:image" content={`${BASE_URL}/og-image.png`} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:image:alt" content="mAI Investments — Greek Golden Visa real estate platform" />
      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:site" content="@maiprop" />
      <meta name="twitter:title" content="Greek Golden Visa Real Estate — EU Residency from €250K | mAI Investments" />
      <meta name="twitter:description" content="Pre-verified Golden Visa properties in Athens from €250,000. EU residency, Schengen access, rental income." />
      <meta name="twitter:image" content={`${BASE_URL}/og-image.png`} />
      <meta name="twitter:image:alt" content="mAI Investments — Greek Golden Visa real estate platform" />
    </Helmet>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationLd) }} />
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
      "@context": "https://schema.org",
      "@type": "WebSite",
      "@id": `${BASE_URL}/#website`,
      "name": "mAI Investments Properties",
      "url": BASE_URL,
      "description": "Greek Golden Visa real estate investment platform — pre-verified properties in Athens from €250,000.",
      "publisher": { "@id": `${BASE_URL}/#organization` },
      "potentialAction": {
        "@type": "SearchAction",
        "target": `${BASE_URL}/properties/?q={search_term_string}`,
        "query-input": "required name=search_term_string"
      },
      "inLanguage": ["en", "el", "ar", "zh", "ru", "fr", "hi", "he", "tr"]
    }) }} />
    <LeadBotProvider>
      <Navbar />
      <HeroSection />
      <SectionDivider />
      <Suspense fallback={<div className="min-h-[300px]" />}>
        <GoldenVisaStats />
      </Suspense>
      <SectionDivider />
      <Suspense fallback={<div className="min-h-[1200px]" />}>
        <InvestmentOpportunities />
      </Suspense>
      <SectionDivider />
      <Suspense fallback={<div className="min-h-[600px]" />}>
        <DeliveredProjects />
      </Suspense>
      <SectionDivider />
      <Suspense fallback={<div className="min-h-[500px]" />}>
        <PlatformReference />
      </Suspense>
      <SectionDivider />
      <Suspense fallback={<div className="min-h-[600px]" />}>
        <JourneySection />
      </Suspense>
      <SectionDivider />
      <Suspense fallback={<div className="min-h-[600px]" />}>
        <FaqSection />
      </Suspense>
      <SectionDivider />
      <Suspense fallback={<div className="min-h-[400px]" />}>
        <GuidesTeaser />
      </Suspense>
      <SectionDivider />
      <Suspense fallback={<div className="min-h-[500px]" />}>
        <ContactSection />
      </Suspense>
      <footer className="border-t border-border bg-background py-6" role="contentinfo">
        <div className="container mx-auto flex flex-col items-center gap-5 px-6">
          {/* Social icons */}
          <div className="flex items-center gap-6">
            <a href="https://www.facebook.com/maiprop" target="_blank" rel="noopener noreferrer" aria-label="Facebook" className="text-muted-foreground hover:text-foreground transition-colors">
              <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" /></svg>
            </a>
            <a href="https://www.instagram.com/maipropos/" target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="text-muted-foreground hover:text-foreground transition-colors">
              <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" /></svg>
            </a>
            <a href="https://www.linkedin.com/company/mai-prop/" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn" className="text-muted-foreground hover:text-foreground transition-colors">
              <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" /></svg>
            </a>
            <a href="https://www.youtube.com/@maipropos" target="_blank" rel="noopener noreferrer" aria-label="YouTube" className="text-muted-foreground hover:text-foreground transition-colors">
              <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" /></svg>
            </a>
          </div>

          {/* Product switcher bar */}
          <div className="flex flex-wrap items-center justify-center gap-1.5 rounded-xl border border-border/60 bg-muted/30 px-3 py-2">
            <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mr-2">Our Products</span>
            <a
              href="https://os.maiprop.co"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-border/50 bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-all hover:border-secondary/50 hover:bg-secondary/5"
            >
              <svg className="h-3.5 w-3.5 text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
              <span>mAI Prop OS</span>
              <span className="text-muted-foreground">Operator platform</span>
              <svg className="h-3 w-3 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M7 17L17 7M7 7h10v10"/></svg>
            </a>
            <a
              href="https://maiprop.co"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-border/50 bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-all hover:border-primary/50 hover:bg-primary/5"
            >
              <svg className="h-3.5 w-3.5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
              <span>mAI Prop</span>
              <span className="text-muted-foreground">Real estate listing portal</span>
              <svg className="h-3 w-3 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M7 17L17 7M7 7h10v10"/></svg>
            </a>
            <div className="inline-flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
              <span>mAI Properties</span>
              <span className="text-primary/70">You are here</span>
            </div>
          </div>

          <p className="text-sm text-muted-foreground">© {new Date().getFullYear()} mAI Prop. All rights reserved.</p>
        </div>
      </footer>
      <Suspense fallback={null}>
        <LeadCaptureBot />
      </Suspense>
      <Suspense fallback={null}>
        <CookieConsent />
      </Suspense>
    </LeadBotProvider>
  </main>
  );
};

export default Index;
