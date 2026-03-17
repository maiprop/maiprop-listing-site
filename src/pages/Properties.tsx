import { lazy, Suspense, useState, useEffect } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import Navbar from "@/components/Navbar";
import { useProperties } from "@/contexts/PropertyContext";
import PropertyCard from "@/components/PropertyCard";
import PropertyModal from "@/components/PropertyModal";
import { Property } from "@/data/properties";
import { ScrollReveal, RevealItem } from "@/components/ScrollReveal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Home, ChevronRight, MessageCircle } from "lucide-react";
import { LeadBotProvider, useLeadBot } from "@/components/LeadBotProvider";

const LeadCaptureBot = lazy(() => import("@/components/LeadCaptureBot"));

const BASE_URL = "https://properties.maiprop.co";

const Inner = () => {
  const { properties } = useProperties();
  const [selected, setSelected] = useState<Property | null>(null);
  const { setIsOpen } = useLeadBot();
  const current = properties.filter((p) => p.project_type === "new");

  // Google Ads remarketing — properties listing page
  useEffect(() => {
    if (typeof window !== "undefined" && (window as any).gtag) {
      (window as any).gtag("event", "page_view", {
        send_to: "AW-17031338731",
        content_type: "property_listing",
        content_id: "properties",
      });
    }
  }, []);

  useEffect(() => {
    const openFromHash = () => {
      const hash = window.location.hash;
      if (!hash.startsWith("#property-")) return;
      const id = hash.replace("#property-", "");
      const found = current.find((p) => p.id === id);
      if (found) setSelected(found);
    };
    openFromHash();
    window.addEventListener("hashchange", openFromHash);
    return () => window.removeEventListener("hashchange", openFromHash);
  }, [current]);

  return (
    <>
      <Helmet>
        <title>Golden Visa Properties in Greece — Athens, Piraeus & Riviera | mAI Investments</title>
        <meta name="description" content="Browse all Golden Visa eligible properties in Athens, Piraeus, and the Greek Riviera. Pre-verified, fully compliant, investment-ready from €250,000." />
        <meta name="keywords" content="Golden Visa properties Greece, Athens investment property, Piraeus real estate, Greek Golden Visa property list, buy apartment Athens, Greece property investment, EU residency property" />
        <meta name="robots" content="index, follow" />
        <link rel="canonical" href={`${BASE_URL}/properties/`} />
        <link rel="alternate" hrefLang="en"        href={`${BASE_URL}/properties/`} />
        <link rel="alternate" hrefLang="en-US"     href={`${BASE_URL}/properties/`} />
        <link rel="alternate" hrefLang="en-GB"     href={`${BASE_URL}/properties/`} />
        <link rel="alternate" hrefLang="el"        href={`${BASE_URL}/properties/?lang=el`} />
        <link rel="alternate" hrefLang="ar"        href={`${BASE_URL}/properties/?lang=ar`} />
        <link rel="alternate" hrefLang="zh"        href={`${BASE_URL}/properties/?lang=zh`} />
        <link rel="alternate" hrefLang="ru"        href={`${BASE_URL}/properties/?lang=ru`} />
        <link rel="alternate" hrefLang="fr"        href={`${BASE_URL}/properties/?lang=fr`} />
        <link rel="alternate" hrefLang="hi"        href={`${BASE_URL}/properties/?lang=hi`} />
        <link rel="alternate" hrefLang="he"        href={`${BASE_URL}/properties/?lang=he`} />
        <link rel="alternate" hrefLang="tr"        href={`${BASE_URL}/properties/?lang=tr`} />
        <link rel="alternate" hrefLang="x-default" href={`${BASE_URL}/properties/`} />
        <meta property="og:type" content="website" />
        <meta property="og:locale" content="en_US" />
        <meta property="og:locale:alternate" content="ar_AE" />
        <meta property="og:locale:alternate" content="zh_CN" />
        <meta property="og:locale:alternate" content="ru_RU" />
        <meta property="og:locale:alternate" content="tr_TR" />
        <meta property="og:url" content={`${BASE_URL}/properties/`} />
        <meta property="og:title" content="Golden Visa Properties in Greece — Athens, Piraeus & Riviera | mAI Investments" />
        <meta property="og:description" content="Browse all Golden Visa eligible properties in Athens, Piraeus, and the Greek Riviera. Pre-verified from €250,000." />
        <meta property="og:image" content={`${BASE_URL}/og-image.png`} />
        <meta property="og:image:alt" content="Golden Visa eligible properties in Athens, Greece — mAI Investments" />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          "itemListElement": [
            { "@type": "ListItem", "position": 1, "name": "Home", "item": `${BASE_URL}/` },
            { "@type": "ListItem", "position": 2, "name": "Golden Visa Properties in Greece", "item": `${BASE_URL}/properties/` },
          ]
        }) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          "@id": `${BASE_URL}/properties/#collectionpage`,
          "name": "Golden Visa Properties in Greece",
          "description": "Browse all Golden Visa eligible properties in Athens, Piraeus, and the Greek Riviera. Pre-verified, fully compliant, investment-ready from €250,000.",
          "url": `${BASE_URL}/properties/`,
          "isPartOf": { "@id": `${BASE_URL}/#website` },
          "publisher": { "@id": "https://properties.maiprop.co/#organization" },
          "inLanguage": "en",
          "about": {
            "@type": "Thing",
            "name": "Greek Golden Visa Real Estate Investment"
          },
          ...(current.length > 0 ? {
            "hasPart": current.map((p) => ({ "@id": `${BASE_URL}/property/${p.id}/#apartment` })),
            "offers": {
              "@type": "AggregateOffer",
              "priceCurrency": "EUR",
              "lowPrice": (() => {
                const prices = current.filter(p => p.price).map(p => p.price!);
                return prices.length > 0 ? Math.min(...prices).toString() : "250000";
              })(),
              ...((() => {
                const prices = current.filter(p => p.price).map(p => p.price!);
                return prices.length > 0 ? { "highPrice": Math.max(...prices).toString() } : {};
              })()),
              "offerCount": current.length,
            },
          } : {})
        }) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          "mainEntity": [
            {
              "@type": "Question",
              "name": "What is the minimum investment for a Greek Golden Visa through property?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "The minimum investment is €250,000 for properties in designated zones of Greece, including most of Athens, Piraeus, and the Greek Riviera. This threshold applies to properties purchased through mAI Investments."
              }
            },
            {
              "@type": "Question",
              "name": "Can I rent out my Greek Golden Visa property?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "Yes. All properties listed here are fully licensed for short-term rental and generate 5–7% annual rental yield. mAI Investments manages the full rental cycle so you earn passive income from day one without self-managing."
              }
            },
            {
              "@type": "Question",
              "name": "How long does the Greek Golden Visa property purchase process take?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "From property selection to visa approval typically takes 4–6 months: 1–2 months for due diligence and legal completion, then 2–4 months for the Greek government to issue the residency permit."
              }
            },
            {
              "@type": "Question",
              "name": "Do I need to live in Greece to keep my Golden Visa?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "No. The Greek Golden Visa has no minimum stay requirement. You can maintain your EU residency permit simply by keeping the property investment. After 7 years of holding the visa you become eligible to apply for Greek citizenship."
              }
            },
            {
              "@type": "Question",
              "name": "Are these properties fully compliant with Golden Visa requirements?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "Yes. Every property on this page has been independently verified by our legal team for Golden Visa compliance — including correct zoning, clear title, and meeting the €250,000 threshold. mAI Investments also handles the full visa application process."
              }
            }
          ]
        }) }} />
      </Helmet>

      <main className="min-h-screen bg-background">
        <Navbar forceScrolled />

        {/* Breadcrumb */}
        <nav className="mt-[64px] border-b border-border/40 bg-background/80 backdrop-blur-sm" aria-label="Breadcrumb">
          <div className="container mx-auto px-6 py-4">
            <ol className="flex items-center gap-2 text-xs text-muted-foreground" itemScope itemType="https://schema.org/BreadcrumbList">
              <li itemProp="itemListElement" itemScope itemType="https://schema.org/ListItem">
                <Link to="/" className="hover:text-primary transition-colors" itemProp="item">
                  <span itemProp="name">Home</span>
                </Link>
                <meta itemProp="position" content="1" />
              </li>
              <li className="text-muted-foreground/50 select-none">›</li>
              <li itemProp="itemListElement" itemScope itemType="https://schema.org/ListItem">
                <span className="text-foreground font-medium" itemProp="name">Properties</span>
                <meta itemProp="position" content="2" />
              </li>
            </ol>
          </div>
        </nav>

        {/* Hero */}
        <section className="pt-12 pb-16">
          <div className="container mx-auto px-6 text-center">
            <ScrollReveal>
              <Badge className="mb-4 border-primary/30 bg-primary/10 text-primary">
                <Home className="mr-1 h-3 w-3" /> Golden Visa Eligible Properties
              </Badge>
              <h1 className="mb-4 text-4xl font-bold md:text-5xl">
                Golden Visa Properties in Greece
              </h1>
              <p className="mx-auto max-w-2xl text-muted-foreground text-lg">
                Pre-verified Golden Visa properties with full compliance — analyze and compare
                independently. All properties qualify for the Greek Golden Visa program.
              </p>
            </ScrollReveal>
          </div>
        </section>

        {/* Full grid */}
        <section className="pb-24">
          <div className="container mx-auto px-6">
            {current.length === 0 ? (
              <p className="text-center text-muted-foreground">No properties available at the moment.</p>
            ) : (
              <ScrollReveal variant="stagger">
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {current.map((p) => (
                    <RevealItem key={p.id}>
                      <PropertyCard property={p} onClick={() => setSelected(p)} />
                    </RevealItem>
                  ))}
                </div>
              </ScrollReveal>
            )}

            {/* CTA */}
            <ScrollReveal>
              <div className="mt-16 rounded-2xl border border-primary/20 bg-primary/5 p-8 text-center">
                <h2 className="mb-2 text-2xl font-bold">Looking for something specific?</h2>
                <p className="mb-6 text-muted-foreground">
                  Our team sources off-market opportunities tailored to your budget and timeline.
                </p>
                <Button size="lg" className="gap-2" onClick={() => setIsOpen(true)}>
                  <MessageCircle className="h-4 w-4" />
                  Contact Us
                </Button>
              </div>
            </ScrollReveal>
          </div>
        </section>
      </main>

      <PropertyModal property={selected} open={!!selected} onClose={() => setSelected(null)} />
      <Suspense fallback={null}>
        <LeadCaptureBot />
      </Suspense>
    </>
  );
};

const Properties = () => (
  <LeadBotProvider>
    <Inner />
  </LeadBotProvider>
);

export default Properties;
