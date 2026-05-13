/**
 * Types and constants for the Onboarding flow.
 * Extracted from Onboarding.tsx so Shell/DoneScreen components can import them.
 */
import { User, Building2, Wrench, Home, Briefcase } from "lucide-react";
import type { ServiceTemplate, PricingModel } from "@/lib/professionalServiceCatalog";

// ── Types ─────────────────────────────────────────────────────────────────────

export type RoleKey = "buyer" | "seller" | "agent" | "professional" | "developer";

export type OnboardingStep =
  | "pick-type"
  | "pick-participant-goal"
  | "pick-pro-type"
  | "developer-setup"
  | "pro-category"
  | "pro-verify"
  | "pro-services"
  | "pro-availability"
  | "pro-video"
  | "done";

export interface ParticipantType {
  id: string;
  role: RoleKey;
  icon: React.ElementType;
  label: string;
  tagline: string;
  desc: string;
  color: string;
  features: string[];
  isPro?: boolean;
  section?: string;
  nextStep?: OnboardingStep;
}

export interface SelectedService {
  template: ServiceTemplate;
  pricingModel: PricingModel;
  rate: string;
  videoEnabled: boolean;
}

export interface DayAvailability {
  enabled: boolean;
  start: string;
  end: string;
}

// ── Participant catalog ───────────────────────────────────────────────────────

export const participants: ParticipantType[] = [
  {
    id: "participant", role: "buyer", icon: Home, color: "blue",
    label: "Looking for Property", tagline: "Buy, rent, or sell privately",
    desc: "Searching for a home or listing your own property",
    features: ["Browse listings", "Book viewings", "List your property", "Search alerts"],
    section: "Private",
    nextStep: "pick-participant-goal",
  },
  {
    id: "market_pro", role: "agent", icon: Briefcase, color: "cyan",
    label: "Market Professional", tagline: "Agent, developer, or service provider",
    desc: "Agent, developer, architect, lawyer, and more",
    features: ["Manage listings", "CRM & leads", "Professional directory", "Client tools"],
    section: "Professional",
    nextStep: "pick-pro-type",
  },
  {
    id: "buyer", role: "buyer", icon: Home, color: "blue",
    label: "Home Buyer / Renter", tagline: "Find your perfect property",
    desc: "Searching to buy or rent a home for personal use",
    features: [
      "Save listings & saved searches",
      "Request viewings",
      "AI property match",
      "Search & auction alerts",
      "Neighbourhood report",
      "Mortgage calculator",
    ],
    section: "Private",
  },
  {
    id: "seller", role: "seller", icon: User, color: "violet",
    label: "Private Seller / Landlord", tagline: "List & manage your property",
    desc: "Sell or rent out your own property directly",
    features: [
      "List & manage properties",
      "Manage viewing requests",
      "AI listing description assist",
      "Listing dashboard & analytics",
      "Message buyers directly",
      "Pro selling add-ons available",
    ],
    section: "Private",
  },
  {
    id: "agent", role: "agent", icon: Building2, color: "cyan",
    label: "Real Estate Agent / Agency", tagline: "Scale your business",
    desc: "Licensed professional listing properties for clients",
    features: [
      "Unlimited property listings",
      "CRM & contacts management",
      "Inquiry & lead management",
      "Analytics & performance dashboard",
    ],
    section: "Real estate agents",
  },
  {
    id: "professional", role: "professional", icon: Wrench, color: "rose",
    label: "Service Professional", tagline: "Grow your practice",
    desc: "Architect, lawyer, notary, contractor & more",
    features: [
      "Professional directory listing",
      "AI property & service tools",
      "Client leads & consultation requests",
      "Verified badge",
      "Service catalog with pricing",
      "Weekly availability scheduling",
    ],
    isPro: true,
    section: "Services",
  },
  {
    id: "developer", role: "developer", icon: Briefcase, color: "orange",
    label: "Developer / Builder", tagline: "Showcase new projects",
    desc: "Real estate developer launching projects",
    features: [
      "Unlimited property listings",
      "Project showcase pages",
      "Pre-sale listing management",
      "Bulk inquiry management",
      "Performance analytics",
    ],
    section: "Development",
  },
];

// ── Color map ─────────────────────────────────────────────────────────────────

export const colorMap: Record<string, { bg: string; border: string; text: string; iconBg: string }> = {
  blue:    { bg: "bg-blue-500/10",    border: "border-blue-500/40",    text: "text-blue-400",    iconBg: "bg-blue-500/20" },
  violet:  { bg: "bg-violet-500/10",  border: "border-violet-500/40",  text: "text-violet-400",  iconBg: "bg-violet-500/20" },
  emerald: { bg: "bg-emerald-500/10", border: "border-emerald-500/40", text: "text-emerald-400", iconBg: "bg-emerald-500/20" },
  cyan:    { bg: "bg-brand-purple/10", border: "border-brand-purple/40", text: "text-brand-purple", iconBg: "bg-brand-purple/20" },
  amber:   { bg: "bg-amber-500/10",   border: "border-amber-500/40",   text: "text-amber-400",   iconBg: "bg-amber-500/20" },
  rose:    { bg: "bg-rose-500/10",    border: "border-rose-500/40",    text: "text-rose-400",    iconBg: "bg-rose-500/20" },
  orange:  { bg: "bg-orange-500/10",  border: "border-orange-500/40",  text: "text-orange-400",  iconBg: "bg-orange-500/20" },
};

// ── Pro categories ────────────────────────────────────────────────────────────

export const PRO_CATEGORIES = [
  { value: "real_estate_agent", label: "Real Estate Agent" },
  { value: "lawyer", label: "Lawyer" },
  { value: "notary", label: "Notary" },
  { value: "financial_advisor", label: "Financial Advisor" },
  { value: "valuer", label: "Valuer" },
  { value: "insurance_broker", label: "Insurance Broker / Insurer" },
  { value: "architect", label: "Architect" },
  { value: "civil_engineer", label: "Civil Engineer" },
  { value: "interior_designer", label: "Interior Designer" },
  { value: "urban_planning_consultant", label: "Urban Planning Consultant" },
  { value: "building_permit_consultant", label: "Building Permit Consultant" },
  { value: "contractor", label: "Contractor" },
  { value: "electrician", label: "Electrician" },
  { value: "plumber", label: "Plumber" },
  { value: "concrete_contractor", label: "Concrete Contractor" },
  { value: "steel_structure_contractor", label: "Steel Structure Contractor" },
  { value: "carpenter", label: "Carpenter" },
  { value: "tile_installer", label: "Tile Installer" },
  { value: "painter", label: "Painter" },
  { value: "drywall_installer", label: "Drywall Installer" },
  { value: "waterproofing_specialist", label: "Waterproofing Specialist" },
  { value: "insulation_contractor", label: "Insulation Contractor" },
  { value: "roofing_contractor", label: "Roofing Contractor" },
  { value: "window_aluminum_installer", label: "Window / Aluminum Installer" },
  { value: "elevator_installer", label: "Elevator Installer" },
  { value: "smart_home_installer", label: "Smart Home Systems Installer" },
  { value: "utility_certification_provider", label: "Utility & Technical Certification" },
  { value: "esg_sustainability_consultant", label: "ESG / Sustainability Consultant" },
  { value: "legalization_specialist", label: "Legalization of Illegal Structures" },
  { value: "energy_certificate_inspector", label: "Energy Certificate Inspector (ΠΕΑ)" },
  { value: "building_regulation_consultant", label: "Building Regulation Compliance" },
  { value: "fire_protection_consultant", label: "Fire Protection Consultant" },
  { value: "property_manager", label: "Property Manager" },
  { value: "facility_manager", label: "Facility Manager" },
  { value: "short_term_rental_operator", label: "Short-Term Rental Operator" },
  { value: "hotel_hospitality_operator", label: "Hotel / Hospitality Operator" },
  { value: "relocation_immigration_consultant", label: "Relocation / Immigration Consultant" },
  { value: "marketing_agency", label: "Marketing / Photographer / Media" },
  { value: "crm_listing_data_provider", label: "CRM / Listing Portal / Data Provider" },
];

// ── Availability defaults ─────────────────────────────────────────────────────

export const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const DEFAULT_AVAILABILITY: DayAvailability[] = DAYS.map((_, i) => ({
  enabled: i >= 1 && i <= 5,
  start: "09:00",
  end: "18:00",
}));

// ── Step sequences ────────────────────────────────────────────────────────────

export const PRO_FULL_STEPS: OnboardingStep[] = ["pick-pro-type", "pro-category", "pro-verify", "pro-services", "pro-availability", "pro-video", "done"];
export const PRO_FLAT_STEPS: OnboardingStep[] = ["pick-type", "pro-category", "pro-verify", "pro-services", "pro-availability", "pro-video", "done"];
export const PRO_SIMPLE_STEPS: OnboardingStep[] = ["pick-pro-type", "done"];
export const DEVELOPER_STEPS: OnboardingStep[] = ["pick-type", "developer-setup", "done"];
export const PARTICIPANT_STEPS: OnboardingStep[] = ["pick-participant-goal", "done"];
export const TOP_STEPS: OnboardingStep[] = ["pick-type", "done"];
