import type { ElementType } from "react";
import {
  BarChart2,
  Bell,
  Briefcase,
  Crown,
  FileText,
  Globe,
  Layers,
  Mail,
  Star,
  TrendingUp,
  UserCheck,
  Users,
  Zap,
} from "lucide-react";

export type AddonItem = {
  name: string;
  price: string;
  unit: string;
  desc: string;
  icon: ElementType;
  badge?: string;
};
export type AddonSection = { category: string; accent: string; items: AddonItem[] };

export const ADDONS_BY_ROLE: Record<string, AddonSection[]> = {
  buyer: [
    {
      category: "AI Reports — pay as you go",
      accent: "primary",
      items: [
        {
          name: "Single AI Valuation",
          price: "€39",
          unit: "/ report",
          desc: "Full AI valuation with market comparison, yield estimate & confidence score.",
          icon: BarChart2,
        },
        {
          name: "Valuation Bundle × 5",
          price: "€149",
          unit: "bundle",
          desc: "Save 24% vs. single. Ideal when comparing several properties.",
          icon: TrendingUp,
          badge: "Save 24%",
        },
        {
          name: "Property Report",
          price: "€49",
          unit: "/ report",
          desc: "Ownership history, registered liens, legal encumbrances & cadastral data.",
          icon: FileText,
        },
        {
          name: "Neighbourhood Report",
          price: "€19",
          unit: "/ report",
          desc: "Price trends, safety index, POIs, development projects & investment outlook.",
          icon: Globe,
        },
        {
          name: "Neighbourhood Bundle × 3",
          price: "€39",
          unit: "bundle",
          desc: "Save 31% vs. single. Insights on three areas at once.",
          icon: Globe,
          badge: "Save 31%",
        },
      ],
    },
  ],
  seller: [
    {
      category: "Listing Boosts",
      accent: "amber",
      items: [
        {
          name: "Featured Listing",
          price: "€39",
          unit: "/ 30 days",
          desc: "Homepage carousel + search top placement. Avg. 3× more views.",
          icon: Crown,
        },
        {
          name: "Priority Placement",
          price: "€59",
          unit: "/ 30 days",
          desc: "Pinned above all non-priority results for your area and type.",
          icon: Star,
        },
        {
          name: "Featured + Priority",
          price: "€79",
          unit: "/ 30 days",
          desc: "Both boosts together — maximum exposure at a bundled rate.",
          icon: Zap,
          badge: "Best value",
        },
        {
          name: "Extra Listing Slot",
          price: "€12",
          unit: "/ listing",
          desc: "Add one listing beyond your plan quota.",
          icon: Layers,
        },
      ],
    },
    {
      category: "AI Reports",
      accent: "primary",
      items: [
        {
          name: "Property Report",
          price: "€49",
          unit: "/ report",
          desc: "Full ownership history, liens & legal status — ideal before listing.",
          icon: FileText,
        },
        {
          name: "Neighbourhood Report",
          price: "€19",
          unit: "/ report",
          desc: "Price trends & comparable sales to help price your property.",
          icon: Globe,
        },
      ],
    },
  ],
  agent: [
    {
      category: "Listing Boosts",
      accent: "amber",
      items: [
        {
          name: "Featured Listing",
          price: "€39",
          unit: "/ 30 days",
          desc: "Homepage carousel + search top placement. Avg. 3× more views.",
          icon: Crown,
        },
        {
          name: "Priority Placement",
          price: "€59",
          unit: "/ 30 days",
          desc: "Pinned above all non-priority results for your area and type.",
          icon: Star,
        },
        {
          name: "Featured + Priority",
          price: "€79",
          unit: "/ 30 days",
          desc: "Both boosts together — maximum exposure at a bundled rate.",
          icon: Zap,
          badge: "Best value",
        },
        {
          name: "Extra Listing Slot",
          price: "€12",
          unit: "/ listing",
          desc: "Add one listing beyond your plan quota.",
          icon: Layers,
        },
      ],
    },
    {
      category: "AI Reports",
      accent: "primary",
      items: [
        {
          name: "Single AI Valuation",
          price: "€39",
          unit: "/ report",
          desc: "Full AI valuation for client presentations or offer pricing.",
          icon: BarChart2,
        },
        {
          name: "Valuation Bundle × 5",
          price: "€149",
          unit: "bundle",
          desc: "Save 24% — ideal for busy agents handling multiple clients.",
          icon: TrendingUp,
          badge: "Save 24%",
        },
        {
          name: "Neighbourhood Report",
          price: "€19",
          unit: "/ report",
          desc: "Area intel to share with buyers — price trends, safety, POIs.",
          icon: Globe,
        },
      ],
    },
    {
      category: "Agency Add-ons",
      accent: "rose",
      items: [
        {
          name: "Extra Agent Seat",
          price: "€39",
          unit: "/ seat / mo",
          desc: "Add another agent to your agency under a single Pro plan. Shared listing pool.",
          icon: Users,
        },
        {
          name: "Agency-Branded Profile",
          price: "€49",
          unit: "/ month",
          desc: "Custom logo, colours and team page on your agency profile.",
          icon: Crown,
        },
        {
          name: "Dedicated Account Mgr",
          price: "€199",
          unit: "/ month",
          desc: "A named account manager for onboarding, training & support.",
          icon: UserCheck,
        },
        {
          name: "White-label Domain",
          price: "€149",
          unit: "/ month",
          desc: "Serve listings on your own domain (yourname.gr).",
          icon: Globe,
          badge: "Enterprise",
        },
      ],
    },
  ],
  developer: [
    {
      category: "Listing Boosts",
      accent: "amber",
      items: [
        {
          name: "Featured New Building",
          price: "€39",
          unit: "/ 30 days",
          desc: "Showcase at the top of the New Buildings section — high-intent buyers.",
          icon: Crown,
        },
        {
          name: "Priority Placement",
          price: "€59",
          unit: "/ 30 days",
          desc: "Pinned above all non-priority results across all listing types.",
          icon: Star,
        },
        {
          name: "Extra Project Listing",
          price: "€12",
          unit: "/ listing",
          desc: "Add a project listing beyond your plan quota.",
          icon: Layers,
        },
      ],
    },
    {
      category: "Market Intelligence",
      accent: "primary",
      items: [
        {
          name: "Neighbourhood Report",
          price: "€19",
          unit: "/ report",
          desc: "Price trends, demand signals & comparable sales for site selection.",
          icon: Globe,
        },
        {
          name: "AI Property Valuation",
          price: "€39",
          unit: "/ report",
          desc: "Pre-launch pricing intelligence for individual units.",
          icon: BarChart2,
        },
        {
          name: "Market Intelligence",
          price: "€199",
          unit: "/ month",
          desc: "Greek property price index, transaction comps, regional trend reports.",
          icon: TrendingUp,
        },
      ],
    },
  ],
  professional: [
    {
      category: "Directory & Lead Boosts",
      accent: "rose",
      items: [
        {
          name: "Featured Professional",
          price: "€59",
          unit: "/ month",
          desc: "Top-of-category placement in the Professionals directory for 30 days.",
          icon: Crown,
        },
        {
          name: "Extra Priority Ad",
          price: "€8",
          unit: "/ ad",
          desc: "Push a listing to the top of search results when acting as a property manager.",
          icon: Bell,
        },
      ],
    },
    {
      category: "Premium Tools",
      accent: "rose",
      items: [
        {
          name: "API Access",
          price: "€59",
          unit: "/ month",
          desc: "Programmatic access to your bookings, leads and AI tools — for valuers and legal practices.",
          icon: Globe,
          badge: "Pro+",
        },
        {
          name: "Referral Network Slot",
          price: "€39",
          unit: "/ month",
          desc: "Get matched with cross-discipline referrals from agents and other professionals.",
          icon: Briefcase,
        },
        {
          name: "Extra Client Seat",
          price: "€19",
          unit: "/ seat / mo",
          desc: "Add a colleague or paralegal to your account under a single Pro plan.",
          icon: Users,
        },
        {
          name: "Branded Email Templates",
          price: "€15",
          unit: "/ month",
          desc: "Send all client communications from your own branded templates.",
          icon: Mail,
        },
      ],
    },
    {
      category: "AI Tools",
      accent: "primary",
      items: [
        {
          name: "AI Property Valuation",
          price: "€39",
          unit: "/ report",
          desc: "Full AI-backed valuation — useful for valuers and legal due diligence.",
          icon: BarChart2,
        },
        {
          name: "Neighbourhood Report",
          price: "€19",
          unit: "/ report",
          desc: "Area analysis to accompany legal opinions or architectural briefs.",
          icon: Globe,
        },
        {
          name: "Property Report",
          price: "€49",
          unit: "/ report",
          desc: "Ownership history, registered liens & cadastral data for legal review.",
          icon: FileText,
        },
      ],
    },
  ],
  investor: [
    {
      category: "AI Deal Intelligence",
      accent: "primary",
      items: [
        {
          name: "Single AI Valuation",
          price: "€39",
          unit: "/ report",
          desc: "Full AI valuation with yield estimate — sharpen your offer pricing.",
          icon: BarChart2,
        },
        {
          name: "Valuation Bundle × 5",
          price: "€149",
          unit: "bundle",
          desc: "Save 24% — ideal when assessing multiple Quick Sale opportunities.",
          icon: TrendingUp,
          badge: "Save 24%",
        },
        {
          name: "Property Report",
          price: "€49",
          unit: "/ report",
          desc: "Liens, encumbrances & legal status before committing to a deal.",
          icon: FileText,
        },
        {
          name: "Neighbourhood Report",
          price: "€19",
          unit: "/ report",
          desc: "Price trends, rental demand & investment outlook for the target area.",
          icon: Globe,
        },
        {
          name: "Neighbourhood Bundle × 3",
          price: "€39",
          unit: "bundle",
          desc: "Save 31% — compare three micro-markets side by side.",
          icon: Globe,
          badge: "Save 31%",
        },
      ],
    },
  ],
};

// investor and institutional share the same add-ons
ADDONS_BY_ROLE["institutional"] = ADDONS_BY_ROLE["investor"];

const ADDON_KEY_BY_NAME: Record<string, string> = {
  "Single AI Valuation": "valuation_single",
  "AI Property Valuation": "valuation_single",
  "Property Report": "property_report_single",
  "Neighbourhood Report": "neighbourhood_report_single",
  "Featured Listing": "featured_listing",
  "Featured New Building": "featured_listing",
  "Priority Placement": "priority_placement",
  "Featured + Priority": "featured_priority_bundle",
  "Extra Listing Slot": "extra_listing",
  "Extra Project Listing": "extra_listing",
  "Market Intelligence": "market_intelligence",
  "Extra Agent Seat": "agent_extra_seat",
  "Agency-Branded Profile": "agency_branded_profile",
  "Dedicated Account Mgr": "agency_dedicated_manager",
  "White-label Domain": "agency_white_label",
  "Featured Professional": "featured_professional",
  "Extra Priority Ad": "extra_priority_ad",
  "API Access": "professional_api_access",
  "Referral Network Slot": "professional_referral_network",
  "Extra Client Seat": "professional_extra_seat",
  "Branded Email Templates": "professional_branded_email",
};

const ADDON_KEY_PREFIXES: Array<[string, string]> = [
  ["Valuation Bundle", "valuation_bundle"],
  ["Neighbourhood Bundle", "neighbourhood_report_bundle"],
];

export const resolveAddonKey = (item: Pick<AddonItem, "name">): string | null => {
  const prefixMatch = ADDON_KEY_PREFIXES.find(([prefix]) => item.name.startsWith(prefix));
  return prefixMatch?.[1] ?? ADDON_KEY_BY_NAME[item.name] ?? null;
};

export const getAddonSectionsForParticipant = (participantType: string): AddonSection[] =>
  ADDONS_BY_ROLE[participantType] ?? ADDONS_BY_ROLE["buyer"];
