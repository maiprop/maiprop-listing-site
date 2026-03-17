import { useState } from "react";
import { ChevronDown, Home, Clock, Globe, TrendingUp, ShieldCheck, Star } from "lucide-react";
import { ScrollReveal } from "@/components/ScrollReveal";
import { motion, AnimatePresence } from "framer-motion";
import { useIsMobile } from "@/hooks/use-mobile";

const faqs = [
  {
    icon: Home,
    number: "01",
    q: "What is the minimum investment for a Greek Golden Visa?",
    a: "The minimum investment for a Greek Golden Visa is €250,000 in qualifying real estate. mAI Investments offers pre-verified properties starting at this threshold, covering Athens, Piraeus, Glyfada, and the Athenian Riviera.",
    category: "Investment",
    highlight: "€250,000 minimum"
  },
  {
    icon: Clock,
    number: "02",
    q: "How long does the Greek Golden Visa process take?",
    a: "The Greek Golden Visa process typically takes 6–9 months from initial consultation to residency permit approval, including property purchase, legal registration, and biometrics appointment.",
    category: "Timeline",
    highlight: "6–9 months"
  },
  {
    icon: Globe,
    number: "03",
    q: "Which countries can I access with a Greek Golden Visa?",
    a: "A Greek Golden Visa grants the right to live in Greece and travel freely across all 27 Schengen Area countries without additional visas.",
    category: "Benefits",
    highlight: "27 Schengen countries"
  },
  {
    icon: TrendingUp,
    number: "04",
    q: "Can I rent out my Golden Visa property?",
    a: "Yes. Golden Visa properties in Greece can be rented out. mAI Investments' portfolio is specifically designed for rental income — properties are sourced, renovated, and stabilised with tenants in place, targeting average net yields of 3–5% annually through a mix of mid-term and long-term rental strategies.",
    category: "Returns",
    highlight: "3–5% net yield"
  },
  {
    icon: ShieldCheck,
    number: "05",
    q: "Do I need to live in Greece to keep the Golden Visa?",
    a: "No. The Greek Golden Visa does not require a minimum stay in Greece. You can maintain the residency permit simply by keeping the qualifying real estate investment.",
    category: "Residency",
    highlight: "No minimum stay"
  },
  {
    icon: Star,
    number: "06",
    q: "Can I become a Greek citizen through the Golden Visa?",
    a: "Yes. After 7 years of legal residency in Greece, Golden Visa holders can apply for Greek citizenship — one of the most valuable passports in the world. Greek citizenship grants full EU citizenship rights, the ability to live, work, and study anywhere in the EU, and visa-free access to 185+ countries. The path requires a basic language test and proof of integration, but does not require continuous physical residence.",
    category: "Citizenship",
    highlight: "EU citizenship in 7 years"
  }
];

const categoryColors: Record<string, string> = {
  Investment: "text-primary border-primary/40 bg-primary/10",
  Timeline: "text-secondary border-secondary/40 bg-secondary/10",
  Benefits: "text-primary border-primary/40 bg-primary/10",
  Returns: "text-secondary border-secondary/40 bg-secondary/10",
  Residency: "text-primary border-primary/40 bg-primary/10",
  Citizenship: "text-secondary border-secondary/40 bg-secondary/10"
};

const FaqSection = () => {
  const [open, setOpen] = useState<number | null>(0);
  const isMobile = useIsMobile();

  return (
    <section id="faq" className="relative bg-background py-20 overflow-hidden">
      {/* Background decoration */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-40 top-1/4 h-96 w-96 rounded-full bg-primary/5 blur-[100px]" />
        <div className="absolute -right-40 bottom-1/4 h-96 w-96 rounded-full bg-secondary/5 blur-[100px]" />
      </div>

      <div className="container relative mx-auto px-4 sm:px-6">
        {/* Header */}
        <ScrollReveal>
          <div className="mb-12 flex flex-col items-center text-center">
            <span className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-primary">
              FAQ
            </span>
            <h2 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">
              Your questions,{" "}
              <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                answered
              </span>
            </h2>
            <p className="max-w-xl text-muted-foreground text-sm">
              Everything you need to know about the Greek Golden Visa and investing with mAI.
            </p>
          </div>
        </ScrollReveal>

        {/* Mobile: accordion layout */}
        {isMobile ? (
          <div className="mx-auto max-w-2xl flex flex-col gap-3">
            {faqs.map((faq, i) => {
              const isOpen = open === i;
              const Icon = faq.icon;
              return (
                <ScrollReveal key={i}>
                  <div className={`rounded-2xl border transition-all duration-300 overflow-hidden ${
                    isOpen
                      ? "border-primary/40 bg-card shadow-lg shadow-primary/10"
                      : "border-border bg-card"
                  }`}>
                    {/* Trigger */}
                    <button
                      onClick={() => setOpen(isOpen ? null : i)}
                      className="w-full flex items-center gap-3 px-4 py-4 text-left"
                    >
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-all ${
                        isOpen
                          ? "bg-primary text-primary-foreground shadow-md shadow-primary/40"
                          : "bg-muted text-muted-foreground"
                      }`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex flex-1 flex-col gap-0.5 min-w-0">
                        <span className={`text-[10px] font-semibold uppercase tracking-wider ${isOpen ? "text-primary" : "text-muted-foreground"}`}>
                          {faq.category}
                        </span>
                        <span className="text-sm font-semibold leading-snug">
                          {faq.q}
                        </span>
                      </div>
                      <ChevronDown className={`h-4 w-4 shrink-0 transition-transform duration-300 ${isOpen ? "rotate-180 text-primary" : "text-muted-foreground"}`} />
                    </button>

                    {/* Expandable answer */}
                    <AnimatePresence initial={false}>
                      {isOpen && (
                        <motion.div
                          key="content"
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.28, ease: "easeInOut" }}
                          className="overflow-hidden"
                        >
                          <div className="px-4 pb-5 pt-1 border-t border-border/50">
                            <p className="text-sm leading-relaxed text-muted-foreground mb-4">
                              {faq.a}
                            </p>
                            <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5">
                              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                              <span className="text-xs font-semibold text-primary">{faq.highlight}</span>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </ScrollReveal>
              );
            })}
          </div>
        ) : (
          /* Desktop: two-column layout */
          <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[1fr_1.6fr]">
            {/* Left: question list */}
            <ScrollReveal>
              <div className="flex flex-col gap-4 lg:sticky lg:top-24">
                {faqs.map((faq, i) => {
                  const isOpen = open === i;
                  const Icon = faq.icon;
                  return (
                    <button
                      key={i}
                      onClick={() => setOpen(isOpen ? null : i)}
                      className={`group flex items-center gap-4 rounded-2xl border px-5 py-4 text-left transition-all duration-300 ${
                        isOpen
                          ? "border-primary/50 bg-primary/10 shadow-lg shadow-primary/10"
                          : "border-border bg-card hover:border-primary/30 hover:bg-primary/5"
                      }`}
                    >
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all ${
                        isOpen
                          ? "bg-primary text-primary-foreground shadow-md shadow-primary/40"
                          : "bg-muted text-muted-foreground group-hover:bg-primary/20 group-hover:text-primary"
                      }`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex flex-1 flex-col gap-0.5 min-w-0">
                        <span className={`text-xs font-semibold uppercase tracking-wider ${isOpen ? "text-primary" : "text-muted-foreground"}`}>
                          {faq.category}
                        </span>
                        <span className="text-sm font-medium leading-snug line-clamp-1">
                          {faq.q}
                        </span>
                      </div>
                      <ChevronDown className={`h-4 w-4 shrink-0 transition-transform duration-300 ${isOpen ? "rotate-180 text-primary" : "text-muted-foreground"}`} />
                    </button>
                  );
                })}
              </div>
            </ScrollReveal>

            {/* Right: answer panel */}
            <ScrollReveal>
              <div className="relative min-h-[320px]">
                <AnimatePresence mode="wait">
                  {open !== null && (
                    <motion.div
                      key={open}
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -16 }}
                      transition={{ duration: 0.3, ease: "easeInOut" }}
                      className="rounded-3xl border border-primary/20 bg-card p-8 shadow-xl shadow-primary/5"
                    >
                      <div className="mb-6 flex items-center gap-4">
                        <span className="text-5xl font-black text-primary/20 leading-none">
                          {faqs[open].number}
                        </span>
                        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${categoryColors[faqs[open].category]}`}>
                          {faqs[open].category}
                        </span>
                      </div>
                      <h3 className="mb-5 text-xl font-bold leading-snug">
                        {faqs[open].q}
                      </h3>
                      <p className="mb-8 text-base leading-relaxed text-muted-foreground">
                        {faqs[open].a}
                      </p>
                      <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                        <span className="text-sm font-semibold text-primary">{faqs[open].highlight}</span>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
                <div className="pointer-events-none absolute -inset-4 rounded-3xl bg-primary/5 blur-2xl -z-10" />
              </div>
            </ScrollReveal>
          </div>
        )}
      </div>
    </section>
  );
};

export default FaqSection;
