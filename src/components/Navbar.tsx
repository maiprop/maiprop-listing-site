import { useState, useEffect } from "react";
import { useLocation, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Menu, X } from "lucide-react";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useTranslation } from "@/contexts/TranslationContext";
import maipropLogo from "@/assets/maiprop-logo-dark.png";

const navLinks = [
  { label: "Benefits", href: "#overview" },
  { label: "Opportunities", href: "#opportunities" },
  { label: "Track Record", href: "#delivered" },
  { label: "Platform", href: "#platform" },
  { label: "Process", href: "#journey" },
  { label: "FAQ", href: "#faq" },
  { label: "Resources", href: "#resources" },
];

const whatsappMessage = [
  "Hello! I would like to explore investment opportunities under the Greek Golden Visa program.",
  "",
  "Please share the following details:",
  "",
  "1. Full Name:",
  "2. Phone (International format):",
  "3. Email:",
  "4. Nationality (Country of citizenship):",
  "5. Investment Budget (in EUR - minimum 250000):",
  "6. Preferred Property Location:",
  "7. Property Type (Apartment or Villa):",
  "8. When are you planning to invest (0-6 months or 6-12 months):",
].join("\n");
const WHATSAPP_URL = `https://wa.me/306971853470?text=${encodeURIComponent(whatsappMessage)}`;

const Navbar = ({ forceScrolled = false }: { forceScrolled?: boolean }) => {
  const { t } = useTranslation();
  const location = useLocation();
  const isHome = location.pathname === "/";
  const [scrolled, setScrolled] = useState(forceScrolled);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (forceScrolled) return;
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, [forceScrolled]);

  const handleClick = (href: string) => {
    setMobileOpen(false);
    if (isHome) {
      const el = document.querySelector(href);
      el?.scrollIntoView({ behavior: "smooth" });
    }
    // if not home, the <a href> handles navigation natively
  };

  return (
    <header
      className={`fixed left-0 right-0 top-0 z-50 transition-all duration-300 ${
        scrolled
          ? "border-b border-border/30 bg-background/40 backdrop-blur-xl shadow-lg"
          : "bg-transparent backdrop-blur-none"
      }`}
    >
      <div className="container mx-auto flex items-center justify-between px-6 py-4 text-sidebar-primary bg-transparent">
        <a href="/" className="flex items-center gap-2">
          <img
            alt="mAI properties"
            width={340}
            height={160}
            className="h-20 w-auto object-contain transition-all duration-300"
            src={maipropLogo}
            loading="eager"
          />
        </a>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-8 md:flex">
          {navLinks.map((l) =>
            (l as any).isPage ? (
              <Link
                key={l.href}
                to={l.href}
                className="text-sm font-medium transition-colors text-secondary-foreground hover:text-foreground"
              >
                {t(l.label)}
              </Link>
            ) : (l as any).isExternal ? (
              <a key={l.href} href={l.href} className="text-sm font-medium transition-colors text-secondary-foreground">
                {t(l.label)}
              </a>
            ) : isHome ? (
              <button
                key={l.href}
                onClick={() => handleClick(l.href)}
                className="text-sm font-medium transition-colors text-secondary-foreground"
              >
                {t(l.label)}
              </button>
            ) : (
              <a
                key={l.href}
                href={`/${l.href}`}
                className="text-sm font-medium transition-colors text-secondary-foreground"
              >
                {t(l.label)}
              </a>
            ),
          )}
          <LanguageSwitcher />
          <Button
            size="sm"
            className="rounded-full px-6"
            onClick={() => {
              if (isHome) {
                const el = document.querySelector("#contact");
                el?.scrollIntoView({ behavior: "smooth" });
              } else {
                window.location.href = "/#contact";
              }
            }}
          >
            {t("Get Started")}
          </Button>
        </nav>

        {/* Mobile toggle */}
        <button className="md:hidden" onClick={() => setMobileOpen(!mobileOpen)}>
          {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="border-t border-border bg-background/95 backdrop-blur-xl md:hidden">
          <nav className="container mx-auto flex flex-col gap-1 px-6 py-4">
            {navLinks.map((l) =>
              (l as any).isPage ? (
                <Link
                  key={l.href}
                  to={l.href}
                  onClick={() => setMobileOpen(false)}
                  className="rounded-lg px-3 py-2.5 text-left text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  {t(l.label)}
                </Link>
              ) : (l as any).isExternal ? (
                <a
                  key={l.href}
                  href={l.href}
                  onClick={() => setMobileOpen(false)}
                  className="rounded-lg px-3 py-2.5 text-left text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  {t(l.label)}
                </a>
              ) : isHome ? (
                <button
                  key={l.href}
                  onClick={() => handleClick(l.href)}
                  className="rounded-lg px-3 py-2.5 text-left text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  {t(l.label)}
                </button>
              ) : (
                <a
                  key={l.href}
                  href={`/${l.href}`}
                  onClick={() => setMobileOpen(false)}
                  className="rounded-lg px-3 py-2.5 text-left text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  {t(l.label)}
                </a>
              ),
            )}
            <LanguageSwitcher />
            <Button
              size="sm"
              className="mt-2 rounded-full"
              onClick={() => {
                setMobileOpen(false);
                if (isHome) {
                  const el = document.querySelector("#contact");
                  el?.scrollIntoView({ behavior: "smooth" });
                } else {
                  window.location.href = "/#contact";
                }
              }}
            >
              {t("Get Started")}
            </Button>
          </nav>
        </div>
      )}
    </header>
  );
};

export default Navbar;
