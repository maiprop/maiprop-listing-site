import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

export default {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}", "./index.html"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        display: ["Plus Jakarta Sans", "sans-serif"],
        body: ["DM Sans", "sans-serif"],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
        brand: {
          // Primary brand colours — from brand book
          cyan: "hsl(var(--brand-cyan))",
          "cyan-glow": "hsl(var(--brand-cyan-glow))",
          "cyan-soft": "hsl(var(--brand-cyan-soft))",
          /* AA-contrast variant for backgrounds under white text. */
          "cyan-deep": "hsl(var(--brand-cyan-deep))",
          purple: "hsl(var(--brand-purple))",
          "purple-dark": "hsl(var(--brand-purple-dark))",
          "purple-soft": "hsl(var(--brand-purple-soft))",
          navy: "hsl(var(--brand-navy))",
          "navy-mid": "hsl(var(--brand-navy-mid))",
          indigo: "hsl(var(--brand-indigo))",
          slate: "hsl(var(--brand-slate))",
          // Auction subtle tones
          auction: "hsl(var(--brand-auction))",
          "auction-soft": "hsl(var(--brand-auction-soft))",
          // Retained legacy aliases
          gold: "hsl(var(--brand-gold))",
          emerald: "hsl(var(--brand-emerald))",
          sky: "hsl(var(--brand-sky))",
          amber: "hsl(var(--brand-amber))",
          "amber-glow": "hsl(var(--brand-amber-glow))",
          coral: "hsl(var(--brand-coral))",
          "coral-dark": "hsl(var(--brand-coral-dark))",
          surface1: "hsl(var(--brand-surface-1))",
          surface2: "hsl(var(--brand-surface-2))",
          surface3: "hsl(var(--brand-surface-3))",
          surface4: "hsl(var(--brand-surface-4))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        xl: "calc(var(--radius) + 4px)",
        "2xl": "calc(var(--radius) + 8px)",
      },
      backgroundImage: {
        "gradient-primary": "var(--gradient-primary)",
        "gradient-accent": "var(--gradient-accent)",
        "gradient-gold": "var(--gradient-gold)",
        "gradient-hero": "var(--gradient-hero)",
        "gradient-card": "var(--gradient-card)",
        "gradient-emerald": "var(--gradient-emerald)",
        "gradient-warm": "var(--gradient-warm)",
      },
      boxShadow: {
        "glow-cyan": "var(--shadow-glow-amber)",
        "glow-amber": "var(--shadow-glow-amber)",
        "glow-purple": "var(--shadow-glow-coral)",
        card: "var(--shadow-card)",
        elevated: "var(--shadow-elevated)",
        warm: "var(--shadow-warm)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-in-up": {
          from: { opacity: "0", transform: "translateY(24px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "slide-in-left": {
          from: { opacity: "0", transform: "translateX(-20px)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
        "counter-up": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          from: { backgroundPosition: "200% 0" },
          to: { backgroundPosition: "-200% 0" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-8px)" },
        },
        "scan-line": {
          from: { top: "0%" },
          to: { top: "100%" },
        },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(24px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "cookie-banner-up": {
          from: { opacity: "0", transform: "translate(-50%, 24px)" },
          to: { opacity: "1", transform: "translate(-50%, 0)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in-up": "fade-in-up 0.6s ease-out forwards",
        "fade-in": "fade-in 0.4s ease-out forwards",
        "slide-in-left": "slide-in-left 0.5s ease-out forwards",
        shimmer: "shimmer 3s linear infinite",
        float: "float 4s ease-in-out infinite",
        "slide-up": "slide-up 0.4s ease-out forwards",
        "cookie-banner-up": "cookie-banner-up 0.4s ease-out forwards",
      },
    },
  },
  plugins: [tailwindcssAnimate],
} satisfies Config;
