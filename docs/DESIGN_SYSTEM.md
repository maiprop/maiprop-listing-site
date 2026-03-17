# maiProp Design System

Quick reference for consistent UI across all modules.

## Layout

- **Page wrapper**: `min-h-screen bg-background` or `min-h-screen flex flex-col bg-background`
- **Main content (with fixed Navbar)**: `pt-16` to offset 64px header
- **Container**: `container max-w-5xl mx-auto px-4` for content pages

## Typography

- **Page title**: `font-display text-2xl font-bold` (Plus Jakarta Sans)
- **Subheading**: `text-sm text-muted-foreground mt-1`
- **Section title**: `font-display font-semibold` or `font-display font-semibold text-lg`
- **Form labels**: `text-xs text-muted-foreground block mb-1.5`

## Cards

- **Standard card**: `glass-card rounded-xl p-4` or `p-6` with optional `border border-border`
- **Empty state**: `glass-card rounded-xl p-12 text-center` with icon `w-10 h-10` or `w-12 h-12 text-muted-foreground mx-auto mb-3`

## Buttons

- **Primary CTA**: `bg-gradient-primary border-0 text-primary-foreground`
- **Secondary / Outline**: `variant="outline" className="border-border"`
- ** destructive**: `text-destructive hover:text-destructive` for icon buttons

## Inputs

- **Text input / textarea**: `w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors`
- **Resize-none** for textareas where appropriate

## Colors (semantic)

- **Success / completed**: `bg-brand-emerald/20 text-brand-emerald` (NOT `bg-green-500/10 text-green-600`)
- **Warning / pending**: `bg-brand-gold/20 text-brand-gold` or `bg-amber-500/20 text-amber-400`
- **Active / primary**: `bg-primary/10 text-primary`

## Section structure

- **Header block**: flex justify-between with title + optional CTA
- **Spacing**: `space-y-6` between major blocks, `space-y-4` for forms
- **Loader**: `Loader2 className="w-6 h-6 animate-spin text-primary"` centered in container

## Components

- Use `Navbar` and `Footer` on all full pages (except Messages / chat layouts)
- Use `Button` from `@/components/ui/button`
- Use `glass-card` for elevated surfaces
