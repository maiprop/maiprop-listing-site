# Marketing-specific files to remove from maiprop-listing-site (Platform)

These files are relevant to maiprop-properties (marketing) and should be removed from the platform repo.

## ✅ Removed (pages, components, contexts, data)
- src/pages/Admin.tsx, PropertyPage.tsx
- src/components/GoldenVisaStats, InvestmentOpportunities, DeliveredProjects, GuidesTeaser, JourneySection, ContactSection, FaqSection, HeroSection, ValueSection, PlatformReference, LeadBotProvider, LeadCaptureBot, ScrollReveal, PropertyModal, LanguageSwitcher, SectionDivider, CrmTab, ImageUpload, FileUpload
- src/contexts/PropertyContext.tsx, TranslationContext.tsx
- src/data/properties.ts

## ✅ Removed (Supabase functions, assets)
- supabase/functions: contact-lead, followup-lead, submit-lead, scheduled-followups, notify-new-lead, generate-article, generate-description, translate, location-poi, og-meta, sitemap
- src/assets: brand-1.png, brand-2.png, brand-light.png, brand-os.jpg, brand-os.png, listing-hero.jpg, platform-listing.png

Note: _redirects updated so /sitemap-dynamic.xml serves /sitemap.xml (Supabase sitemap function removed).
