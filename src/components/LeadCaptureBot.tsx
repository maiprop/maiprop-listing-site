import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Bot, Send, ChevronLeft, Check, X, Sparkles, ShieldCheck, ExternalLink, Home } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { motion, AnimatePresence } from "framer-motion";
import { useLeadBot } from "@/components/LeadBotProvider";
import { Property } from "@/data/properties";

const CALENDLY_URL = "https://calendly.com/maipropos/consultation";
const TURNSTILE_SITE_KEY = "0x4AAAAAACmEa8xMGdIJZT2a";

const STEPS = [
  {
    key: "intent",
    label: "How can I help you today?",
    type: "select",
    options: ["Explore investment options", "Book a free consultation"],
    emoji: "👋",
  },
  { key: "full_name", label: "What's your full name?", type: "text", placeholder: "John Doe", emoji: "👤" },
  {
    key: "phone",
    label: "Your phone number (international format)",
    type: "tel",
    placeholder: "+351 912 345 678",
    emoji: "📱",
  },
  { key: "email", label: "What's your email address?", type: "email", placeholder: "john@example.com", emoji: "✉️" },
  {
    key: "nationality",
    label: "What's your nationality?",
    type: "text",
    placeholder: "e.g. United States",
    emoji: "🌍",
  },
  {
    key: "investment_budget",
    label: "What's your investment budget in EUR?",
    type: "select",
    options: ["€250,000", "€500,000", "€800,000", "€1M+"],
    emoji: "💰",
  },
  {
    key: "preferred_location",
    label: "Where would you like to invest?",
    type: "select",
    options: ["Greek City Center", "Greek Islands", "Greek Countryside"],
    emoji: "📍",
  },
  {
    key: "property_type",
    label: "What type of property interests you?",
    type: "select",
    options: ["Apartment", "Villa"],
    emoji: "🏠",
  },
  {
    key: "investment_timeline",
    label: "When are you planning to invest?",
    type: "select",
    options: ["0-6 months", "6-12 months"],
    emoji: "📅",
  },
] as const;

type FormData = {
  intent: string;
  full_name: string;
  phone: string;
  email: string;
  nationality: string;
  investment_budget: string;
  preferred_location: string;
  property_type: string;
  investment_timeline: string;
};

const initial: FormData = {
  intent: "",
  full_name: "",
  phone: "",
  email: "",
  nationality: "",
  investment_budget: "",
  preferred_location: "",
  property_type: "",
  investment_timeline: "",
};

// Re-export useLeadBot for backward compatibility
export { useLeadBot } from "@/components/LeadBotProvider";

type ChatMessage =
  | { role: "bot" | "user"; text: string; type?: "text" }
  | { role: "bot"; type: "properties"; properties: Property[] };

const TypingIndicator = () => (
  <motion.div
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -4 }}
    className="flex justify-start"
  >
    <div className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-muted px-4 py-3">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="block h-2 w-2 rounded-full bg-muted-foreground/50"
          animate={{ y: [0, -4, 0] }}
          transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }}
        />
      ))}
    </div>
  </motion.div>
);

const budgetToNumber = (val: string): number => {
  const map: Record<string, number> = { "€250,000": 250000, "€500,000": 500000, "€800,000": 800000, "€1M+": 1000000 };
  return map[val] || Number(val.replace(/[^0-9]/g, "")) || 250000;
};

/** Return matching available properties within 30% above budget */
const getMatchingProperties = (properties: Property[], budget: string): Property[] => {
  const num = budgetToNumber(budget);
  const ceiling = budget === "€1M+" ? Infinity : num * 1.3;
  return properties.filter(
    (p) =>
      p.status === "available" &&
      p.project_type === "new" &&
      p.price !== null &&
      p.price >= num * 0.5 &&
      p.price <= ceiling,
  ).slice(0, 3);
};

/** A compact property card rendered inside the chat bubble */
const PropertyChatCard = ({
  property,
  onSelect,
}: {
  property: Property;
  onSelect: (p: Property) => void;
}) => (
  <button
    onClick={() => onSelect(property)}
    className="group w-full overflow-hidden rounded-xl border border-border/60 bg-card text-left transition-all hover:border-primary/50 hover:shadow-[0_4px_20px_hsl(var(--primary)/0.15)]"
  >
    {property.images?.[0] && (
      <div className="relative h-28 w-full overflow-hidden">
        <img
          src={property.images[0]}
          alt={property.title}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
        {property.status === "available" && (
          <span className="absolute top-2 left-2 rounded-full bg-primary/90 px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">
            Available
          </span>
        )}
      </div>
    )}
    <div className="p-3">
      <p className="line-clamp-1 text-xs font-semibold text-foreground">{property.title}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{property.location}</p>
      <div className="mt-2 flex items-center justify-between">
        <span className="text-xs font-bold text-primary">
          {property.price ? `€${property.price.toLocaleString()}` : "POA"}
        </span>
        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <Home className="h-3 w-3" />
          {property.size ? `${property.size} m²` : ""}
          {property.bedrooms ? ` · ${property.bedrooms} bed` : ""}
        </span>
      </div>
      {property.yield && (
        <p className="mt-1 text-[10px] text-secondary font-medium">📈 {property.yield} yield</p>
      )}
    </div>
  </button>
);

const LeadCaptureBot = () => {
  const { isOpen: open, setIsOpen, pendingLocation } = useLeadBot();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormData>(initial);
  const [submitted, setSubmitted] = useState(false);
  const [isConsultation, setIsConsultation] = useState(false);
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [typing, setTyping] = useState(false);
  const [showCaptcha, setShowCaptcha] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [captchaError, setCaptchaError] = useState(false);
  const [suggestedProperties, setSuggestedProperties] = useState<Property[]>([]);
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const turnstileRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  // Load Turnstile script once
  useEffect(() => {
    if (document.getElementById("cf-turnstile-script")) return;
    const script = document.createElement("script");
    script.id = "cf-turnstile-script";
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
  }, []);

  // Render Turnstile widget when captcha step is shown
  useEffect(() => {
    if (!showCaptcha || !turnstileRef.current) return;
    const tryRender = () => {
      if (!(window as any).turnstile) { setTimeout(tryRender, 200); return; }
      if (widgetIdRef.current) return;
      widgetIdRef.current = (window as any).turnstile.render(turnstileRef.current, {
        sitekey: TURNSTILE_SITE_KEY,
        theme: "auto",
        callback: (token: string) => { setTurnstileToken(token); setCaptchaError(false); },
        "error-callback": () => { setTurnstileToken(null); setCaptchaError(true); },
        "expired-callback": () => { setTurnstileToken(null); },
      });
    };
    tryRender();
    return () => {
      if (widgetIdRef.current && (window as any).turnstile) {
        (window as any).turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [showCaptcha]);

  useEffect(() => {
    const shown = sessionStorage.getItem("lead_bot_shown");
    if (shown) return;
    // Don't auto-open on mobile
    const isMobile = window.innerWidth < 640;
    if (isMobile) return;
    const timer = setTimeout(() => {
      setIsOpen(true);
      sessionStorage.setItem("lead_bot_shown", "1");
    }, 8000);
    return () => clearTimeout(timer);
  }, [setIsOpen]);

  // Reset form when opened with a location
  useEffect(() => {
    if (open && pendingLocation !== undefined) {
      const isConsult = pendingLocation === "consultation";
      setForm({ ...initial, preferred_location: isConsult ? "" : pendingLocation });
      setStep(0);
      setSubmitted(false);
      setIsConsultation(false);
      setMessages([]);
      setShowCaptcha(false);
      setTurnstileToken(null);
      setCaptchaError(false);
      setSuggestedProperties([]);
      setSelectedProperty(null);
    }
  }, [open, pendingLocation]);

  // Initialize first bot message with typing indicator
  useEffect(() => {
    if (open && messages.length === 0 && !submitted) {
      setTyping(true);
      const timer = setTimeout(() => {
        setTyping(false);
        setMessages([
          { role: "bot", text: `${STEPS[0].emoji} Hello! I'm your investment assistant. ${STEPS[0].label}` },
        ]);
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [open, messages.length, submitted]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, step, typing]);

  const showBotMessage = (text: string, onDone?: () => void) => {
    setTyping(true);
    setTimeout(
      () => {
        setTyping(false);
        setMessages((prev) => [...prev, { role: "bot", text }]);
        onDone?.();
      },
      700 + Math.random() * 400,
    );
  };

  const showBotProperties = (props: Property[], onDone?: () => void) => {
    setTyping(true);
    setTimeout(() => {
      setTyping(false);
      setMessages((prev) => [...prev, { role: "bot", type: "properties", properties: props }]);
      onDone?.();
    }, 900);
  };

  const currentStep = STEPS[step];
  const currentValue = form[currentStep?.key as keyof FormData] || "";

  const validate = (): string | null => {
    const v = currentValue.trim();
    if (!v) return "This field is required";
    if (currentStep.key === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return "Please enter a valid email";
    if (currentStep.key === "phone" && !/^\+?[\d\s\-()]{7,20}$/.test(v)) return "Please enter a valid phone number";
    return null;
  };

  /** After budget selection, fetch matching properties and insert them into the chat */
  const showMatchingProperties = useCallback(async (budget: string) => {
    const { data } = await supabase
      .from("properties")
      .select("*")
      .eq("status", "available")
      .eq("project_type", "new")
      .order("sort_order", { ascending: true });

    if (!data || data.length === 0) return null;
    const matched = getMatchingProperties(data as Property[], budget);
    if (matched.length === 0) return null;
    setSuggestedProperties(matched);
    return matched;
  }, []);

  const handlePropertySelect = (p: Property) => {
    setSelectedProperty(p);
    setMessages((prev) => [...prev, { role: "user", text: `I'm interested in: ${p.title}` }]);
    const nextStep = STEPS[step + 1];
    showBotMessage(
      `🏡 Great choice! "${p.title}" is a fantastic option. ${nextStep.emoji} ${nextStep.label}`,
    );
    setStep(step + 1);
  };

  const advanceStep = () => {
    const error = validate();
    if (error) {
      toast.error(error);
      return;
    }

    const displayValue = currentValue;
    setMessages((prev) => [...prev, { role: "user", text: displayValue }]);

    if (step < STEPS.length - 1) {
      const nextStep = STEPS[step + 1];

      // After budget — show matching properties inline
      if (currentStep.key === "investment_budget") {
        showBotMessage(
          "🔍 Let me check our available properties that match your budget…",
          async () => {
            const matched = await showMatchingProperties(currentValue);
            if (matched && matched.length > 0) {
              showBotMessage(
                `✨ Here are ${matched.length} properties I found for you! Tap one to learn more, or skip to continue.`,
                () => {
                  showBotProperties(matched, () => {
                    // After showing properties, also queue the next question but wait for selection or skip
                  });
                },
              );
            } else {
              showBotMessage(`${nextStep.emoji} ${nextStep.label}`);
              setStep(step + 1);
            }
          },
        );
        return;
      }

      showBotMessage(`${nextStep.emoji} ${nextStep.label}`);
      setStep(step + 1);
    } else {
      // All steps done — show CAPTCHA before submitting
      showBotMessage("🛡️ Almost there! Please complete the quick verification below to send your inquiry.", () => {
        setShowCaptcha(true);
      });
    }
  };

  // After budget step with properties shown, skip allows user to continue without selecting
  const handleSkipPropertySelection = () => {
    setSuggestedProperties([]);
    const nextStep = STEPS[step + 1];
    showBotMessage(`${nextStep.emoji} ${nextStep.label}`);
    setStep(step + 1);
  };

  const goBack = () => {
    if (step > 0) {
      setMessages((prev) => prev.slice(0, -2));
      setStep(step - 1);
    }
  };

  // Called after all conversation steps — show CAPTCHA before DB insert
  const handleSubmit = async (token: string) => {
    setLoading(true);
    const leadData = {
      full_name: form.full_name.trim(),
      phone: form.phone.trim(),
      email: form.email.trim(),
      nationality: form.nationality.trim(),
      investment_budget: budgetToNumber(form.investment_budget),
      preferred_location: form.preferred_location.trim(),
      property_type: form.property_type,
      investment_timeline: form.investment_timeline,
    };

    const { data, error } = await supabase.functions.invoke("submit-lead", {
      body: {
        lead: leadData,
        turnstileToken: token,
        ...(selectedProperty ? { interested_property_id: selectedProperty.id, interested_property_title: selectedProperty.title } : {}),
      },
    });
    setLoading(false);

    if (error || data?.error) {
      toast.error(data?.error || "Something went wrong. Please try again.");
      // Reset Turnstile so user can retry
      setTurnstileToken(null);
      if (widgetIdRef.current && (window as any).turnstile) {
        (window as any).turnstile.reset(widgetIdRef.current);
      }
      return;
    }

    if (form.intent === "Book a free consultation") setIsConsultation(true);
    setSubmitted(true);
    setShowCaptcha(false);
    // Google Ads conversion tracking
    if (typeof (window as any).gtag === "function") {
      const budget = budgetToNumber(form.investment_budget);
      (window as any).gtag("event", "conversion", {
        send_to: "AW-17031338731/OAyuCMKFiP0bEOu1lrk_",
        value: budget,
        currency: "EUR",
      });
      try {
        const guideReads = JSON.parse(sessionStorage.getItem("mai_guide_reads") || "[]");
        const viewedProperty = sessionStorage.getItem("mai_viewed_property") === "1";
        if (guideReads.length > 0 && viewedProperty) {
          (window as any).gtag("event", "high_intent_funnel_complete", {
            send_to: "AW-17031338731",
            value: budget,
            currency: "EUR",
            prior_guide_reads: guideReads.length,
            last_guide_category: sessionStorage.getItem("mai_last_guide_category") ?? undefined,
            viewed_property_id: sessionStorage.getItem("mai_last_property_id") ?? undefined,
          });
        }
      } catch (_) { /* sessionStorage unavailable */ }
    }
    supabase.functions.invoke("notify-new-lead", { body: { email: form.email.trim() } }).catch(() => {});
  };

  const handleClose = () => {
    setIsOpen(false);
    if (submitted) {
      setStep(0);
      setForm(initial);
      setSubmitted(false);
      setIsConsultation(false);
      setMessages([]);
      setShowCaptcha(false);
      setTurnstileToken(null);
      setSuggestedProperties([]);
      setSelectedProperty(null);
    }
  };

  const handleReset = () => {
    setForm(initial);
    setStep(0);
    setSubmitted(false);
    setIsConsultation(false);
    setMessages([]);
    setShowCaptcha(false);
    setTurnstileToken(null);
    setSuggestedProperties([]);
    setSelectedProperty(null);
    setIsOpen(true);
  };

  // Are we in the "showing properties" interstitial (budget answered but next step not yet advanced)
  const isShowingProperties = suggestedProperties.length > 0 && currentStep?.key === "investment_budget" && !!form.investment_budget;

  const progress = ((step + 1) / STEPS.length) * 100;

  return (
    <>
      {/* Floating trigger */}
      <AnimatePresence>
        {!open && (
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <motion.button
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  transition={{ delay: 0.5, type: "spring", stiffness: 260, damping: 20 }}
                  onClick={handleReset}
                  className="fixed bottom-24 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_8px_30px_hsl(var(--primary)/0.4)] transition-all hover:scale-110 hover:shadow-[0_8px_40px_hsl(var(--primary)/0.6)] max-sm:bottom-[4.5rem] max-sm:right-3"
                  aria-label="Open inquiry form"
                >
                  <Bot className="h-6 w-6" />
                  <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-secondary opacity-75" />
                    <span className="relative inline-flex h-4 w-4 rounded-full bg-secondary" />
                  </span>
                </motion.button>
              </TooltipTrigger>
              <TooltipContent side="left" className="border-border bg-card text-foreground">
                Start an inquiry
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </AnimatePresence>

      {/* Chat widget */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.9 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="fixed bottom-6 right-6 z-50 flex w-[420px] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-[0_25px_60px_-12px_hsl(var(--primary)/0.25)] max-sm:bottom-0 max-sm:right-0 max-sm:left-0 max-sm:w-full max-sm:rounded-none max-sm:rounded-t-2xl max-sm:max-h-[90dvh]"
          >
            {/* Header */}
            <div className="relative bg-gradient-to-r from-primary/15 via-primary/10 to-secondary/10 px-5 py-4">
              <button
                onClick={handleClose}
                className="absolute top-3 right-3 flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20">
                  <Sparkles className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Investment Assistant</h3>
                  <p className="text-[11px] text-muted-foreground">Typically replies instantly</p>
                </div>
              </div>
              {!submitted && (
                <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-muted/50">
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-primary to-secondary"
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                  />
                </div>
              )}
            </div>

            {/* Chat area */}
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto px-4 py-4 space-y-3"
              style={{ maxHeight: "420px", minHeight: "260px" }}
            >
              <AnimatePresence mode="popLayout">
                {messages.map((msg, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, delay: msg.role === "bot" ? 0.15 : 0 }}
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    {msg.type === "properties" ? (
                      <div className="w-full space-y-2">
                        <div className="grid gap-2">
                          {msg.properties.map((p) => (
                            <PropertyChatCard
                              key={p.id}
                              property={p}
                              onSelect={handlePropertySelect}
                            />
                          ))}
                        </div>
                        {isShowingProperties && (
                          <div className="flex items-center gap-2 pt-1">
                            <button
                              onClick={handleSkipPropertySelection}
                              className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors"
                            >
                              Skip — I'll decide later
                            </button>
                            <a
                              href="/properties"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-xs text-primary hover:underline"
                            >
                              View all <ExternalLink className="h-3 w-3" />
                            </a>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div
                        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                          msg.role === "user"
                            ? "rounded-br-md bg-primary text-primary-foreground"
                            : "rounded-bl-md bg-muted text-foreground"
                        }`}
                      >
                        {(msg as any).text}
                      </div>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>

              <AnimatePresence>{typing && <TypingIndicator />}</AnimatePresence>

              {submitted && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex flex-col items-center gap-3 py-6 text-center"
                >
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/20">
                    <Check className="h-7 w-7 text-primary" />
                  </div>
                  <div>
                    <h4 className="text-base font-semibold text-foreground">
                      Thank you, {form.full_name.split(" ")[0]}!
                    </h4>
                    {selectedProperty && (
                      <p className="mt-1 text-xs text-primary font-medium">
                        📌 Enquiry submitted for: {selectedProperty.title}
                      </p>
                    )}
                    {isConsultation ? (
                      <>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Book your free consultation slot below — pick a time that works for you.
                        </p>
                        <a
                          href={CALENDLY_URL}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-4 inline-flex items-center justify-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow-[0_0_30px_hsl(var(--primary)/0.4)] transition-all hover:bg-primary/90 hover:shadow-[0_0_50px_hsl(var(--primary)/0.6)]"
                        >
                          📅 Book a Consultation
                        </a>
                      </>
                    ) : (
                      <p className="mt-1 text-sm text-muted-foreground">
                        We'll reach out within 24 hours with tailored options.
                      </p>
                    )}
                  </div>
                  <Button onClick={handleClose} size="sm" variant="outline" className="mt-1 rounded-full">
                    Close
                  </Button>
                </motion.div>
              )}
            </div>

            {/* Turnstile CAPTCHA panel */}
            {!submitted && showCaptcha && (
              <div className="border-t border-border bg-background/50 px-4 py-4 flex flex-col items-center gap-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                  <span>Quick spam check — this only takes a second</span>
                </div>
                <div ref={turnstileRef} className="cf-turnstile" />
                {captchaError && (
                  <p className="text-xs text-destructive">Verification failed. Please refresh and try again.</p>
                )}
                <button
                  onClick={() => turnstileToken && handleSubmit(turnstileToken)}
                  disabled={!turnstileToken || loading}
                  className="w-full rounded-full bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-40 flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                  ) : (
                    <>
                      <Check className="h-4 w-4" />
                      Submit Inquiry
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Input area — hidden while showing property selection interstitial */}
            {!submitted && !showCaptcha && currentStep && !isShowingProperties && (
              <div className="border-t border-border bg-background/50 px-4 py-3">
                {currentStep.type === "select" ? (
                  <div className="flex flex-wrap gap-2">
                    {currentStep.options.map((opt) => (
                      <button
                        key={opt}
                        onClick={() => {
                          const updatedForm = { ...form, [currentStep.key]: opt };
                          setForm(updatedForm);
                          setMessages((prev) => [...prev, { role: "user", text: opt }]);

                          // If user chose consultation at step 0, shortcut the flow
                          if (currentStep.key === "intent" && opt === "Book a free consultation") {
                            setIsConsultation(true);
                            showBotMessage(
                              `✨ Great! To personalise your session, let me gather a few quick details first. ${STEPS[1].emoji} ${STEPS[1].label}`,
                            );
                            setStep(1);
                            return;
                          }

                          // After budget — fetch matching properties
                          if (currentStep.key === "investment_budget") {
                            showBotMessage(
                              "🔍 Let me check our available properties that match your budget…",
                              async () => {
                                const matched = await showMatchingProperties(opt);
                                if (matched && matched.length > 0) {
                                  showBotMessage(
                                    `✨ Here are ${matched.length} hand-picked properties that match your budget! Tap one to enquire, or skip to continue.`,
                                    () => {
                                      showBotProperties(matched);
                                    },
                                  );
                                } else {
                                  const nextStep = STEPS[step + 1];
                                  showBotMessage(`${nextStep.emoji} ${nextStep.label}`);
                                  setStep(step + 1);
                                }
                              },
                            );
                            return;
                          }

                          if (step < STEPS.length - 1) {
                            const nextStep = STEPS[step + 1];
                            showBotMessage(`${nextStep.emoji} ${nextStep.label}`);
                            setStep(step + 1);
                          } else {
                            // Show CAPTCHA before submitting
                            showBotMessage("🛡️ Almost there! Please complete the quick verification below to send your inquiry.", () => {
                              setShowCaptcha(true);
                            });
                          }
                        }}
                        className={`rounded-full border px-4 py-2 text-sm font-medium transition-all ${
                          currentValue === opt
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-muted/50 text-foreground hover:border-primary/50 hover:bg-primary/5"
                        }`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    {step > 0 && (
                      <button
                        onClick={goBack}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                    )}
                    <Input
                      type={currentStep.type}
                      placeholder={currentStep.placeholder}
                      value={currentValue}
                      onChange={(e) => setForm({ ...form, [currentStep.key]: e.target.value })}
                      onKeyDown={(e) => e.key === "Enter" && advanceStep()}
                      autoFocus
                      className="flex-1 rounded-full border-border/50 bg-muted/30 px-4 text-sm focus-visible:ring-primary/30"
                    />
                    <button
                      onClick={advanceStep}
                      disabled={loading || !currentValue.trim()}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-40"
                    >
                      {loading ? (
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default LeadCaptureBot;
