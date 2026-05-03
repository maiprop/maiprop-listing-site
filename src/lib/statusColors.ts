/**
 * Centralised Tailwind class maps for status/type badge colouring.
 * Import from here — never define local duplicates.
 */

/** Lead CRM pipeline stages */
export const LEAD_STAGE_COLORS: Record<string, string> = {
  new: "bg-brand-gold/15 text-brand-gold border-brand-gold/20",
  contacted: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  qualified: "bg-primary/15 text-primary border-primary/20",
  proposal: "bg-accent/15 text-accent border-accent/20",
  negotiation: "bg-amber-500/15 text-amber-400 border-amber-500/20",
  won: "bg-brand-emerald/15 text-brand-emerald border-brand-emerald/20",
  lost: "bg-muted text-muted-foreground border-border",
};

/** Display label for each LEAD_STAGE_COLORS key. Single source of truth so
 * ContactsCRM and any future leads UI render the same labels. */
export const LEAD_STAGE_LABELS: Record<string, string> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  proposal: "Proposal",
  negotiation: "Negotiation",
  won: "Won",
  lost: "Lost",
};

/** Invitation-request / access-request status */
export const REQUEST_STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-500/15 text-amber-600 border-amber-500/20",
  approved: "bg-emerald-500/15 text-emerald-600 border-emerald-500/20",
  rejected: "bg-muted/60 text-muted-foreground border-border",
};

/** Property type dot / pill */
export const PROPERTY_TYPE_COLORS: Record<string, string> = {
  apartment: "bg-primary",
  villa: "bg-brand-gold",
  commercial: "bg-accent",
  house: "bg-brand-emerald",
  land: "bg-destructive",
  office: "bg-primary",
};

/** Firesale / deal urgency badge */
export const URGENCY_COLORS: Record<string, string> = {
  HIGH: "bg-destructive/15 text-destructive border-destructive/20",
  MEDIUM: "bg-brand-gold/15 text-brand-gold border-brand-gold/20",
  LOW: "bg-brand-emerald/15 text-brand-emerald border-brand-emerald/20",
};

/** Viewing / booking status pill */
export const VIEWING_STATUS_COLORS: Record<string, string> = {
  pending: "bg-brand-gold/20 text-brand-gold",
  reviewed: "bg-brand-purple/20 text-brand-purple",
  confirmed: "bg-primary/20 text-primary",
  cancelled: "bg-muted text-muted-foreground",
};

/** AI service match urgency (lowercase keys) */
export const SERVICE_URGENCY_COLORS: Record<string, string> = {
  high: "bg-destructive/15 text-destructive border-destructive/30",
  medium: "bg-brand-gold/15 text-brand-gold border-brand-gold/30",
  low: "bg-brand-emerald/15 text-brand-emerald border-brand-emerald/30",
};

/** Subscription status pill (admin subscribers) */
export const SUBSCRIPTION_STATUS_COLORS: Record<string, string> = {
  active: "text-brand-emerald border-brand-emerald/20 bg-brand-emerald/10",
  trial: "text-brand-gold border-brand-gold/20 bg-brand-gold/10",
  cancelled: "text-destructive border-destructive/20 bg-destructive/10",
  expired: "text-muted-foreground border-border bg-muted",
};

/** Professional category badge — display-name keyed (ProfessionalVerificationPanel) */
export const PROFESSIONAL_DISPLAY_CATEGORY_COLORS: Record<string, string> = {
  "Real Estate Agent": "bg-primary/10 text-primary border-primary/20",
  "Notary": "bg-brand-gold/10 text-brand-gold border-brand-gold/20",
  "Civil Engineer": "bg-accent/10 text-accent border-accent/20",
  "Lawyer": "bg-purple-500/10 text-purple-500 border-purple-500/20",
  "Architect": "bg-orange-500/10 text-orange-500 border-orange-500/20",
  "Financial Advisor": "bg-brand-emerald/10 text-brand-emerald border-brand-emerald/20",
  "Property Valuer": "bg-cyan-500/10 text-cyan-500 border-cyan-500/20",
};

/** Energy performance certificate class — hex colour per EU scale */
export const ENERGY_CLASS_COLORS: Record<string, string> = {
  "A+": "#1a9e3f", A: "#4db848", "B+": "#8dc63f", B: "#c5d92d",
  C: "#f7ec0f", D: "#f6a817", E: "#f26522", F: "#ec1c24", G: "#b31b1b",
};

/**
 * Tailwind class tokens for the segmented Energy class selector — paired with
 * a foreground colour so high-luminosity bands (B/C) get black text and the
 * dark bands get white. Used by ListingsAdvancedFilters; centralised here
 * so the colour scale is the single source of truth for both compare drawers
 * and filter UIs.
 */
export const ENERGY_CLASS_BUTTON_COLORS: Record<
  string,
  { bg: string; text: string }
> = {
  "A+": { bg: "bg-[#00a550]", text: "text-white" },
  "A":  { bg: "bg-[#50b848]", text: "text-white" },
  "B+": { bg: "bg-[#8dc63f]", text: "text-white" },
  "B":  { bg: "bg-[#c3d600]", text: "text-black" },
  "C":  { bg: "bg-[#ffcc00]", text: "text-black" },
  "D":  { bg: "bg-[#f7941e]", text: "text-white" },
  "E":  { bg: "bg-[#f15a22]", text: "text-white" },
  "F":  { bg: "bg-[#ed1c24]", text: "text-white" },
  "G":  { bg: "bg-[#be1e2d]", text: "text-white" },
};

/** Professional category badge — slug keyed (ProVerificationComponents) */
export const PROFESSIONAL_CATEGORY_COLORS: Record<string, string> = {
  architect: "bg-orange-500/10 text-orange-500 border-orange-500/20",
  lawyer: "bg-purple-500/10 text-purple-500 border-purple-500/20",
  notary: "bg-brand-gold/10 text-brand-gold border-brand-gold/20",
  agent: "bg-primary/10 text-primary border-primary/20",
  engineer: "bg-accent/10 text-accent border-accent/20",
  notary_public: "bg-brand-gold/10 text-brand-gold border-brand-gold/20",
};
