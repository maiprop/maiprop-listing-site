import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { lazy, Suspense, useEffect, useState } from "react";
import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { ArrowRight, BookOpen, Clock, TrendingUp, Landmark, DollarSign, FileText, Loader2, MessageCircle, ChevronRight } from "lucide-react";
import { LeadBotProvider, useLeadBot } from "@/components/LeadBotProvider";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "@/contexts/TranslationContext";
const LeadCaptureBot = lazy(() => import("@/components/LeadCaptureBot"));

const BASE_URL = "https://properties.maiprop.co";
const PAGE_URL = `${BASE_URL}/guides/`;

// Fallback static guides shown while DB loads or if DB is empty
const STATIC_GUIDES = [
{
  slug: "benefits-greek-golden-visa-non-eu-citizens",
  title: "Benefits of Greek Golden Visa for Non-EU Citizens",
  meta_description: "Discover why the Greek Golden Visa is one of Europe's most attractive residency-by-investment programs — Schengen access, no minimum stay, full family coverage, and strong rental yields.",
  category: "Golden Visa",
  read_time: "6 min read"
},
{
  slug: "athens-vs-thessaloniki-where-to-invest",
  title: "Athens vs. Thessaloniki: Where to Invest in Greek Real Estate",
  meta_description: "A data-driven comparison of Greece's two largest cities for real estate investors — price per sqm, rental yields, Golden Visa eligibility, market liquidity, and growth trajectory.",
  category: "Market Analysis",
  read_time: "7 min read"
},
{
  slug: "how-to-calculate-roi-greek-rental-properties",
  title: "How to Calculate ROI on Greek Rental Properties",
  meta_description: "A practical step-by-step guide to calculating gross yield, net yield, and total return on Greek investment properties — with real Athens market examples and tax considerations.",
  category: "Investment Strategy",
  read_time: "8 min read"
}];


const CATEGORY_ICONS: Record<string, React.ElementType> = {
  "Golden Visa": TrendingUp,
  "Market Analysis": BookOpen,
  "Investment Strategy": DollarSign,
  "Legal & Tax": Landmark,
  "Lifestyle": FileText
};

const CATEGORY_TAGS: Record<string, string> = {
  "Golden Visa": "Most Popular",
  "Market Analysis": "Market Insight",
  "Investment Strategy": "Investor Guide",
  "Legal & Tax": "Expert Guide",
  "Lifestyle": "Lifestyle"
};

interface ArticleRow {
  id: string;
  slug: string;
  title: string;
  meta_description: string;
  category: string;
  read_time: string;
  updated_at: string;
  published: boolean;
}

const breadcrumbLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
  { "@type": "ListItem", position: 1, name: "Home", item: BASE_URL + "/" },
  { "@type": "ListItem", position: 2, name: "Guides", item: PAGE_URL }]
};

const faqLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "What is the minimum investment for a Greek Golden Visa?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "The minimum investment for a Greek Golden Visa is €250,000 in qualifying real estate. Properties in Athens, Piraeus, Glyfada, and the Athenian Riviera are pre-verified and eligible under this threshold."
      }
    },
    {
      "@type": "Question",
      name: "How long does the Greek Golden Visa process take?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "The Greek Golden Visa process typically takes 6–9 months from initial consultation to residency permit approval, including property purchase, legal registration, and biometrics appointment."
      }
    },
    {
      "@type": "Question",
      name: "Which countries can I travel to with a Greek Golden Visa?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "A Greek Golden Visa grants the right to live in Greece and travel freely across all 27 Schengen Area countries without additional visas."
      }
    },
    {
      "@type": "Question",
      name: "Can I rent out my Golden Visa property in Greece?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. Golden Visa properties in Greece can be rented out. Properties sourced for the program are renovated and stabilised with tenants in place, targeting average net yields of 3–5% annually through mid-term and long-term rental strategies."
      }
    },
    {
      "@type": "Question",
      name: "Do I need to live in Greece to maintain the Golden Visa?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "No. The Greek Golden Visa does not require a minimum stay in Greece. You can maintain the residency permit simply by keeping the qualifying real estate investment."
      }
    },
    {
      "@type": "Question",
      name: "What is the ROI on Greek Golden Visa investment properties?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Greek Golden Visa investment properties in Athens typically yield 3–5% net annually. Total return includes rental income plus capital appreciation, which has averaged 8–12% per year in prime Athens neighbourhoods since 2019."
      }
    }
  ]
};

const Inner = () => {
  const { openWithLocation } = useLeadBot();
  const { t } = useTranslation();
  const [articles, setArticles] = useState<ArticleRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchArticles = async () => {
      const { data, error } = await supabase.
      from("articles" as any).
      select("id, slug, title, meta_description, category, read_time, updated_at, published").
      eq("published", true).
      order("updated_at", { ascending: false });

      if (!error && data && (data as any[]).length > 0) {
        setArticles(data as unknown as ArticleRow[]);
      } else {
        // Fallback to static list if DB is empty or unavailable
        setArticles(STATIC_GUIDES as any);
      }
      setLoading(false);
    };
    fetchArticles();
  }, []);

  // Google Ads remarketing — guides index page
  useEffect(() => {
    if (typeof window !== "undefined" && (window as any).gtag) {
      (window as any).gtag("event", "page_view", {
        send_to: "AW-17031338731",
        content_type: "guides_index",
        content_id: "guides",
      });
    }
  }, []);

  // Merge: DB articles take priority; add static ones that aren't in DB yet
  const displayGuides = loading ?
  STATIC_GUIDES :
  articles.length > 0 ?
  articles :
  STATIC_GUIDES;

  // CollectionPage JSON-LD — built from live article list
  const collectionPageLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `${PAGE_URL}#collectionpage`,
    name: "Greek Golden Visa Investment Guides & Research",
    description: "Expert guides on Greek Golden Visa rules, Athens real estate ROI, and property investment strategy for non-EU investors.",
    url: PAGE_URL,
    isPartOf: { "@id": `${BASE_URL}/#website` },
    author: { "@id": `${BASE_URL}/#organization` },
    publisher: { "@id": `${BASE_URL}/#organization` },
    inLanguage: "en",
    hasPart: displayGuides.map((g) => ({
      "@type": "Article",
      "@id": `${BASE_URL}/guides/${g.slug}/#article`,
      headline: g.title,
      description: g.meta_description,
      url: `${BASE_URL}/guides/${g.slug}/`,
      articleSection: g.category,
      author: { "@id": `${BASE_URL}/#organization` },
      publisher: { "@id": `${BASE_URL}/#organization` },
      inLanguage: "en",
      ...(g.read_time ? { timeRequired: `PT${g.read_time.replace(" min read", "M")}` } : {}),
    })),
  };

  return (
    <main className="min-h-screen bg-background">
      <Helmet>
        <title>Greek Golden Visa Investment Guides & Research — mAI Investments</title>
        <meta name="description" content="Expert guides on Greek Golden Visa rules, Athens real estate ROI, and property investment strategy for non-EU investors. Research-stage resources for serious investors." />
        <meta name="keywords" content="Greek Golden Visa guide, Athens real estate guide, Greece property investment guide, Golden Visa eligibility, how to invest in Greece, Athens ROI, Greece residency by investment articles" />
        <meta name="robots" content="index, follow" />
        <link rel="canonical" href={PAGE_URL} />
        <link rel="alternate" hrefLang="en"        href={PAGE_URL} />
        <link rel="alternate" hrefLang="en-US"     href={PAGE_URL} />
        <link rel="alternate" hrefLang="en-GB"     href={PAGE_URL} />
        <link rel="alternate" hrefLang="el"        href={`${PAGE_URL}?lang=el`} />
        <link rel="alternate" hrefLang="ar"        href={`${PAGE_URL}?lang=ar`} />
        <link rel="alternate" hrefLang="ar-AE"     href={`${PAGE_URL}?lang=ar`} />
        <link rel="alternate" hrefLang="zh"        href={`${PAGE_URL}?lang=zh`} />
        <link rel="alternate" hrefLang="zh-CN"     href={`${PAGE_URL}?lang=zh`} />
        <link rel="alternate" hrefLang="ru"        href={`${PAGE_URL}?lang=ru`} />
        <link rel="alternate" hrefLang="fr"        href={`${PAGE_URL}?lang=fr`} />
        <link rel="alternate" hrefLang="hi"        href={`${PAGE_URL}?lang=hi`} />
        <link rel="alternate" hrefLang="he"        href={`${PAGE_URL}?lang=he`} />
        <link rel="alternate" hrefLang="tr"        href={`${PAGE_URL}?lang=tr`} />
        <link rel="alternate" hrefLang="x-default" href={PAGE_URL} />
        <meta property="og:type" content="website" />
        <meta property="og:locale" content="en_US" />
        <meta property="og:locale:alternate" content="ar_AE" />
        <meta property="og:locale:alternate" content="zh_CN" />
        <meta property="og:locale:alternate" content="ru_RU" />
        <meta property="og:locale:alternate" content="tr_TR" />
        <meta property="og:url" content={PAGE_URL} />
        <meta property="og:title" content="Greek Golden Visa Investment Guides & Research — mAI Investments" />
        <meta property="og:description" content="Expert guides on Greek Golden Visa and real estate investment strategy for non-EU investors." />
        <meta property="og:image" content={`${BASE_URL}/og-image.png`} />
        <meta property="og:image:alt" content="mAI Investments — Greek Golden Visa investment guides and research" />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionPageLd) }} />
      </Helmet>

      <Navbar forceScrolled />

      {/* Breadcrumb */}
      <nav className="mt-[64px] border-b border-border/40 bg-background/80 backdrop-blur-sm" aria-label="Breadcrumb">
        <div className="container mx-auto px-6 py-4">
          <ol className="flex items-center gap-2 text-xs text-muted-foreground">
            <li><Link to="/" className="hover:text-primary transition-colors">{t("Home")}</Link></li>
            <li className="text-muted-foreground/50 select-none">›</li>
            <li className="text-foreground font-medium">{t("Guides")}</li>
          </ol>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden pt-12 pb-16">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-secondary/5" />
        <div className="container mx-auto px-6 relative text-center">
          <span className="mb-4 inline-block rounded-full border border-primary/40 bg-primary/10 px-5 py-1.5 text-xs font-semibold uppercase tracking-widest text-primary">
            {t("Investor Resources")}
          </span>
          <h1 className="mx-auto max-w-3xl text-4xl font-bold leading-tight sm:text-5xl">
            {t("Greek Golden Visa Investment")}{" "}
            <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
              {t("Guides & Research")}
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
            {t("Everything you need to make an informed decision — from Golden Visa program mechanics to city-by-city yield comparisons and ROI calculators.")}
          </p>
        </div>
      </section>

      {/* Guides Grid */}
      <section className="py-16">
        <div className="container mx-auto px-6">
          {loading ?
          <div className="flex items-center justify-center gap-3 py-20 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <span className="text-sm">{t("Loading guides…")}</span>
            </div> :

          <>
              {/* Category filter summary */}
              {displayGuides.length > 3 &&
            <div className="mb-8 flex flex-wrap gap-2">
                  {Array.from(new Set(displayGuides.map((g) => g.category))).map((cat) =>
              <span key={cat} className="rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
                      {cat}
                    </span>
              )}
                </div>
            }

              <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
                {displayGuides.map((guide, idx) => {
                const Icon = CATEGORY_ICONS[guide.category] ?? BookOpen;
                const tag = CATEGORY_TAGS[guide.category] ?? "Guide";
                const isNew = !!(guide as any).updated_at &&
                new Date((guide as any).updated_at) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

                return (
                  <Link
                    key={guide.slug}
                    to={`/guides/${guide.slug}`}
                    className="group flex flex-col rounded-2xl border border-border bg-background/40 p-8 hover:border-primary/40 hover:shadow-[0_0_40px_hsl(179_90%_63%/0.08)] transition-all duration-300">

                      <div className="mb-5 flex items-center justify-between">
                        <span className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                          {guide.category}
                        </span>
                        <span className="rounded-full bg-secondary/60 px-3 py-1 text-xs font-medium text-secondary-foreground">
                          {isNew ? "New" : tag}
                        </span>
                      </div>

                      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                        <Icon className="h-6 w-6 text-primary" />
                      </div>

                      <h3 className="mb-3 text-xl font-bold leading-snug group-hover:text-primary transition-colors">
                        {t(guide.title)}
                      </h3>
                      <p className="flex-1 text-sm text-muted-foreground leading-relaxed line-clamp-3">
                        {t(guide.meta_description)}
                      </p>

                      <div className="mt-6 flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Clock className="h-3.5 w-3.5" />
                          {guide.read_time || t("7 min read")}
                        </span>
                        <span className="flex items-center gap-1 text-sm font-medium text-primary group-hover:gap-2 transition-all">
                          {t("Read")} {guide.title} <ArrowRight className="h-4 w-4" />
                        </span>
                      </div>
                    </Link>);

              })}
              </div>
            </>
          }
        </div>
      </section>

      {/* CTA Banner */}
      <section className="py-20 bg-background/50">
        <div className="container mx-auto px-6">
          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-8 text-center max-w-3xl mx-auto">
            <h2 className="text-2xl font-bold mb-2">{t("Is there anything specific you'd like us to clarify?")}</h2>
            <p className="text-muted-foreground mb-6">{t("Start your journey today — we're here to guide you.")}</p>
            <Button size="lg" className="gap-2" onClick={() => openWithLocation("consultation")}>
              <MessageCircle className="h-4 w-4" />
              {t("Contact Us")}
            </Button>
          </div>
        </div>
      </section>

      <footer className="border-t border-border bg-background text-center py-4">
        <p className="text-sm text-muted-foreground">© {new Date().getFullYear()} mAI Prop. All rights reserved.</p>
      </footer>
      <Suspense fallback={null}><LeadCaptureBot /></Suspense>
    </main>);

};

const Guides = () =>
<LeadBotProvider>
    <Inner />
  </LeadBotProvider>;


export default Guides;