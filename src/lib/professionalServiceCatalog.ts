// ── AI-curated service catalog for all professional categories ────────────────
// Each service was curated for the Greek real-estate market context.

export type PricingModel = "hourly" | "daily" | "fixed";

export interface ServiceTemplate {
  key: string;
  name: string;
  description: string;
  defaultPricing: PricingModel;
  suggestedRate: number;       // EUR
  estimatedHours?: number;
  videoAvailable: boolean;     // can be delivered remotely
  isPremiumFeature: boolean;   // video booking requires Pro plan
}

export const CATEGORY_LABELS: Record<string, string> = {
  real_estate_agent: "Real Estate Agent",
  architect: "Architect",
  civil_engineer: "Civil Engineer",
  lawyer: "Lawyer",
  notary: "Notary",
  electrician: "Electrician",
  plumber: "Plumber",
  contractor: "Contractor",
  property_manager: "Property Manager",
  valuer: "Valuer",
  interior_designer: "Interior Designer",
  financial_advisor: "Financial Advisor",
};

export const SERVICE_CATALOG: Record<string, ServiceTemplate[]> = {

  // ── Real Estate Agent ──────────────────────────────────────────────────────
  real_estate_agent: [
    {
      key: "buyer_representation",
      name: "Buyer Representation",
      description: "Full service buyer agency — property search, viewings, negotiations, and transaction coordination.",
      defaultPricing: "fixed",
      suggestedRate: 2500,
      videoAvailable: true,
      isPremiumFeature: false,
    },
    {
      key: "seller_representation",
      name: "Seller Representation",
      description: "Listing, marketing, viewings, and sale coordination. Typical fee 2–3% of sale price.",
      defaultPricing: "fixed",
      suggestedRate: 0,
      videoAvailable: true,
      isPremiumFeature: false,
    },
    {
      key: "rental_management",
      name: "Rental Management",
      description: "Find tenants, draft contracts, handle handover and ongoing tenant relations.",
      defaultPricing: "fixed",
      suggestedRate: 500,
      videoAvailable: true,
      isPremiumFeature: false,
    },
    {
      key: "property_valuation",
      name: "Property Valuation",
      description: "Market valuation for sale, purchase, or refinancing purposes.",
      defaultPricing: "fixed",
      suggestedRate: 150,
      videoAvailable: true,
      isPremiumFeature: false,
    },
    {
      key: "investment_consultation",
      name: "Investment Consultation",
      description: "Guidance on yields, neighbourhood trends, and off-market opportunities.",
      defaultPricing: "hourly",
      suggestedRate: 80,
      estimatedHours: 1,
      videoAvailable: true,
      isPremiumFeature: true,
    },
  ],

  // ── Architect ──────────────────────────────────────────────────────────────
  architect: [
    {
      key: "architectural_design",
      name: "Architectural Design",
      description: "Full architectural design for new builds or major renovations including drawings, specifications and permit documentation.",
      defaultPricing: "fixed",
      suggestedRate: 2500,
      videoAvailable: true,
      isPremiumFeature: false,
    },
    {
      key: "building_permit",
      name: "Building Permit Application",
      description: "Preparation and submission of all required documents for building permits with the relevant municipal authority.",
      defaultPricing: "fixed",
      suggestedRate: 800,
      videoAvailable: true,
      isPremiumFeature: false,
    },
    {
      key: "renovation_design",
      name: "Renovation & Refurbishment Design",
      description: "Design services for residential or commercial renovation projects, including layout changes and material selection.",
      defaultPricing: "hourly",
      suggestedRate: 80,
      estimatedHours: 20,
      videoAvailable: true,
      isPremiumFeature: false,
    },
    {
      key: "floor_plan",
      name: "Floor Plan Drawing",
      description: "Detailed as-built or proposed floor plan drawings in CAD/PDF format.",
      defaultPricing: "fixed",
      suggestedRate: 350,
      videoAvailable: true,
      isPremiumFeature: false,
    },
    {
      key: "3d_rendering",
      name: "3D Rendering & Visualisation",
      description: "Photorealistic 3D renders of interiors and exteriors to help clients visualise the finished project.",
      defaultPricing: "fixed",
      suggestedRate: 600,
      videoAvailable: true,
      isPremiumFeature: true,
    },
    {
      key: "site_supervision",
      name: "Site Supervision",
      description: "On-site supervision throughout construction to ensure compliance with approved drawings and specifications.",
      defaultPricing: "daily",
      suggestedRate: 400,
      videoAvailable: false,
      isPremiumFeature: false,
    },
    {
      key: "energy_audit",
      name: "Energy Efficiency Audit",
      description: "Assessment of building energy performance and recommendations for improvement to achieve a better energy class.",
      defaultPricing: "fixed",
      suggestedRate: 450,
      videoAvailable: true,
      isPremiumFeature: false,
    },
    {
      key: "interior_space",
      name: "Interior Space Planning",
      description: "Space planning and layout optimisation for residential or commercial interiors.",
      defaultPricing: "hourly",
      suggestedRate: 75,
      estimatedHours: 8,
      videoAvailable: true,
      isPremiumFeature: false,
    },
  ],

  // ── Civil Engineer ─────────────────────────────────────────────────────────
  civil_engineer: [
    {
      key: "structural_assessment",
      name: "Structural Assessment",
      description: "On-site evaluation of an existing building's structural integrity, with written report and recommendations.",
      defaultPricing: "fixed",
      suggestedRate: 600,
      videoAvailable: false,
      isPremiumFeature: false,
    },
    {
      key: "seismic_study",
      name: "Seismic Vulnerability Study",
      description: "Analysis of a building's earthquake resistance according to Greek seismic standards (KAN.EPE).",
      defaultPricing: "fixed",
      suggestedRate: 1200,
      videoAvailable: false,
      isPremiumFeature: false,
    },
    {
      key: "topographical_survey",
      name: "Topographical Survey",
      description: "Precise topographical survey of a plot or property boundary, required for permit submissions.",
      defaultPricing: "fixed",
      suggestedRate: 500,
      videoAvailable: false,
      isPremiumFeature: false,
    },
    {
      key: "foundation_design",
      name: "Foundation Design",
      description: "Geotechnical investigation and foundation engineering for new construction.",
      defaultPricing: "fixed",
      suggestedRate: 1500,
      videoAvailable: true,
      isPremiumFeature: false,
    },
    {
      key: "construction_supervision",
      name: "Construction Supervision",
      description: "Professional supervision of construction works ensuring compliance with structural drawings.",
      defaultPricing: "daily",
      suggestedRate: 350,
      videoAvailable: false,
      isPremiumFeature: false,
    },
    {
      key: "legality_check",
      name: "Building Legality Check",
      description: "Review of building permits, arbitrary constructions and legality status of a property.",
      defaultPricing: "fixed",
      suggestedRate: 400,
      videoAvailable: true,
      isPremiumFeature: false,
    },
    {
      key: "energy_certificate",
      name: "Energy Performance Certificate (ΠΕΑ)",
      description: "Issuance of the mandatory Energy Performance Certificate required for all property transactions.",
      defaultPricing: "fixed",
      suggestedRate: 250,
      videoAvailable: false,
      isPremiumFeature: false,
    },
  ],

  // ── Lawyer ─────────────────────────────────────────────────────────────────
  lawyer: [
    {
      key: "title_search",
      name: "Property Title Search",
      description: "Full land registry and cadastre search to verify ownership, encumbrances, and legal status.",
      defaultPricing: "fixed",
      suggestedRate: 300,
      videoAvailable: true,
      isPremiumFeature: false,
    },
    {
      key: "contract_review",
      name: "Contract Review & Drafting",
      description: "Review or drafting of sale/purchase agreements, lease contracts, and developer contracts.",
      defaultPricing: "hourly",
      suggestedRate: 150,
      estimatedHours: 3,
      videoAvailable: true,
      isPremiumFeature: false,
    },
    {
      key: "due_diligence",
      name: "Legal Due Diligence",
      description: "Comprehensive legal investigation of a property covering ownership, permits, taxes, and encumbrances.",
      defaultPricing: "fixed",
      suggestedRate: 800,
      videoAvailable: true,
      isPremiumFeature: false,
    },
    {
      key: "property_transfer",
      name: "Property Transfer Representation",
      description: "Legal representation and coordination for the full property transfer process.",
      defaultPricing: "fixed",
      suggestedRate: 1200,
      videoAvailable: false,
      isPremiumFeature: false,
    },
    {
      key: "lien_clearance",
      name: "Mortgage & Lien Clearance",
      description: "Negotiation and legal processing to clear mortgages, liens, and other encumbrances.",
      defaultPricing: "hourly",
      suggestedRate: 150,
      estimatedHours: 5,
      videoAvailable: true,
      isPremiumFeature: false,
    },
    {
      key: "dispute_resolution",
      name: "Property Dispute Resolution",
      description: "Representation in disputes related to boundaries, co-ownership, lease terminations, and possession.",
      defaultPricing: "hourly",
      suggestedRate: 180,
      videoAvailable: true,
      isPremiumFeature: true,
    },
    {
      key: "inheritance",
      name: "Inheritance & Succession",
      description: "Legal services for property inheritance, probate proceedings and declaration of heirs.",
      defaultPricing: "fixed",
      suggestedRate: 600,
      videoAvailable: true,
      isPremiumFeature: false,
    },
    {
      key: "enfia_appeal",
      name: "ENFIA & Tax Appeals",
      description: "Preparation and submission of appeals against property tax assessments.",
      defaultPricing: "fixed",
      suggestedRate: 250,
      videoAvailable: true,
      isPremiumFeature: false,
    },
  ],

  // ── Notary ─────────────────────────────────────────────────────────────────
  notary: [
    {
      key: "transfer_deed",
      name: "Property Transfer Deed",
      description: "Preparation and execution of the final property transfer deed (Συμβόλαιο Αγοραπωλησίας).",
      defaultPricing: "fixed",
      suggestedRate: 900,
      videoAvailable: false,
      isPremiumFeature: false,
    },
    {
      key: "mortgage_registration",
      name: "Mortgage Registration",
      description: "Notarial act for mortgage creation and registration with the Land Registry.",
      defaultPricing: "fixed",
      suggestedRate: 600,
      videoAvailable: false,
      isPremiumFeature: false,
    },
    {
      key: "power_of_attorney",
      name: "Power of Attorney",
      description: "Drafting and certification of power of attorney for property transactions.",
      defaultPricing: "fixed",
      suggestedRate: 150,
      videoAvailable: true,
      isPremiumFeature: false,
    },
    {
      key: "will_drafting",
      name: "Will Drafting & Inheritance",
      description: "Preparation of notarial wills and declaration of heirs documents.",
      defaultPricing: "fixed",
      suggestedRate: 400,
      videoAvailable: true,
      isPremiumFeature: false,
    },
    {
      key: "contract_notarisation",
      name: "Contract Notarisation",
      description: "Notarisation of preliminary contracts, leases and commercial agreements.",
      defaultPricing: "fixed",
      suggestedRate: 350,
      videoAvailable: false,
      isPremiumFeature: false,
    },
    {
      key: "deed_copy",
      name: "Certified Deed Copy",
      description: "Provision of certified copies of previously executed notarial acts.",
      defaultPricing: "fixed",
      suggestedRate: 50,
      videoAvailable: false,
      isPremiumFeature: false,
    },
  ],

  // ── Electrician ────────────────────────────────────────────────────────────
  electrician: [
    {
      key: "electrical_inspection",
      name: "Electrical Installation Inspection",
      description: "Full inspection of existing electrical installation with issuance of compliance certificate (ΥΔΕ).",
      defaultPricing: "fixed",
      suggestedRate: 200,
      videoAvailable: false,
      isPremiumFeature: false,
    },
    {
      key: "new_installation",
      name: "New Electrical Installation",
      description: "Full electrical installation for new construction or complete rewiring of existing property.",
      defaultPricing: "fixed",
      suggestedRate: 1800,
      videoAvailable: false,
      isPremiumFeature: false,
    },
    {
      key: "panel_upgrade",
      name: "Distribution Panel Upgrade",
      description: "Replacement or upgrade of the main distribution board.",
      defaultPricing: "fixed",
      suggestedRate: 450,
      videoAvailable: false,
      isPremiumFeature: false,
    },
    {
      key: "smart_home",
      name: "Smart Home Installation",
      description: "Installation of smart lighting, blinds, climate control and security automation systems.",
      defaultPricing: "daily",
      suggestedRate: 300,
      videoAvailable: true,
      isPremiumFeature: true,
    },
    {
      key: "solar_pv",
      name: "Solar PV System Installation",
      description: "Design and installation of photovoltaic systems for self-consumption or net metering.",
      defaultPricing: "fixed",
      suggestedRate: 3500,
      videoAvailable: true,
      isPremiumFeature: false,
    },
    {
      key: "ev_charger",
      name: "EV Charger Installation",
      description: "Installation of electric vehicle charging points for residential or commercial properties.",
      defaultPricing: "fixed",
      suggestedRate: 600,
      videoAvailable: false,
      isPremiumFeature: false,
    },
  ],

  // ── Plumber ────────────────────────────────────────────────────────────────
  plumber: [
    {
      key: "pipe_inspection",
      name: "Pipe Inspection & Survey",
      description: "CCTV or manual inspection of plumbing and drainage systems with detailed report.",
      defaultPricing: "fixed",
      suggestedRate: 180,
      videoAvailable: false,
      isPremiumFeature: false,
    },
    {
      key: "leak_repair",
      name: "Leak Detection & Repair",
      description: "Detection and repair of water leaks in supply or drainage pipes.",
      defaultPricing: "hourly",
      suggestedRate: 60,
      estimatedHours: 3,
      videoAvailable: false,
      isPremiumFeature: false,
    },
    {
      key: "bathroom_install",
      name: "Bathroom Installation",
      description: "Full installation of bathroom fixtures including toilet, shower, basin and tiling.",
      defaultPricing: "fixed",
      suggestedRate: 1200,
      videoAvailable: false,
      isPremiumFeature: false,
    },
    {
      key: "boiler_service",
      name: "Boiler Service & Repair",
      description: "Annual servicing, fault diagnosis and repair of gas or oil boilers.",
      defaultPricing: "fixed",
      suggestedRate: 120,
      videoAvailable: false,
      isPremiumFeature: false,
    },
    {
      key: "water_heater",
      name: "Water Heater Installation",
      description: "Supply and installation of electric, gas or solar water heaters.",
      defaultPricing: "fixed",
      suggestedRate: 350,
      videoAvailable: false,
      isPremiumFeature: false,
    },
    {
      key: "drain_unblocking",
      name: "Drain Unblocking",
      description: "High-pressure jetting and manual unblocking of blocked drains and toilets.",
      defaultPricing: "fixed",
      suggestedRate: 90,
      videoAvailable: false,
      isPremiumFeature: false,
    },
  ],

  // ── Contractor ────────────────────────────────────────────────────────────
  contractor: [
    {
      key: "full_renovation",
      name: "Full Property Renovation",
      description: "Complete renovation covering all trades — structural, electrical, plumbing, finishes.",
      defaultPricing: "fixed",
      suggestedRate: 15000,
      videoAvailable: true,
      isPremiumFeature: false,
    },
    {
      key: "kitchen_remodel",
      name: "Kitchen Remodel",
      description: "Full kitchen renovation including units, worktops, tiling, plumbing and electrical.",
      defaultPricing: "fixed",
      suggestedRate: 4500,
      videoAvailable: true,
      isPremiumFeature: false,
    },
    {
      key: "bathroom_remodel",
      name: "Bathroom Remodel",
      description: "Complete bathroom refurbishment including waterproofing, tiling and fixtures.",
      defaultPricing: "fixed",
      suggestedRate: 3000,
      videoAvailable: true,
      isPremiumFeature: false,
    },
    {
      key: "painting",
      name: "Interior Painting & Finishing",
      description: "Surface preparation and painting of interior walls, ceilings and woodwork.",
      defaultPricing: "daily",
      suggestedRate: 280,
      videoAvailable: false,
      isPremiumFeature: false,
    },
    {
      key: "flooring",
      name: "Flooring Installation",
      description: "Supply and installation of tiles, parquet, laminate or stone flooring.",
      defaultPricing: "fixed",
      suggestedRate: 2500,
      videoAvailable: false,
      isPremiumFeature: false,
    },
    {
      key: "roofing",
      name: "Roofing & Waterproofing",
      description: "Flat roof repair, insulation, waterproofing membranes and tile replacement.",
      defaultPricing: "fixed",
      suggestedRate: 3500,
      videoAvailable: false,
      isPremiumFeature: false,
    },
    {
      key: "external_works",
      name: "External Works & Landscaping",
      description: "Garden, courtyard, fencing, paving and exterior finish works.",
      defaultPricing: "daily",
      suggestedRate: 350,
      videoAvailable: true,
      isPremiumFeature: false,
    },
  ],

  // ── Property Manager ──────────────────────────────────────────────────────
  property_manager: [
    {
      key: "full_management",
      name: "Full Property Management",
      description: "End-to-end management of residential or commercial property — tenants, maintenance, accounts.",
      defaultPricing: "fixed",
      suggestedRate: 150,
      videoAvailable: true,
      isPremiumFeature: false,
    },
    {
      key: "tenant_finding",
      name: "Tenant Finding",
      description: "Marketing the property, screening applicants, conducting viewings and lease signing.",
      defaultPricing: "fixed",
      suggestedRate: 600,
      videoAvailable: true,
      isPremiumFeature: false,
    },
    {
      key: "rent_collection",
      name: "Rent Collection & Accounts",
      description: "Monthly rent collection, payment follow-up, owner reporting and tax documentation.",
      defaultPricing: "fixed",
      suggestedRate: 80,
      videoAvailable: true,
      isPremiumFeature: false,
    },
    {
      key: "maintenance_coordination",
      name: "Maintenance Coordination",
      description: "Sourcing, scheduling and supervising repair and maintenance works on behalf of the owner.",
      defaultPricing: "hourly",
      suggestedRate: 45,
      videoAvailable: false,
      isPremiumFeature: false,
    },
    {
      key: "property_inspection",
      name: "Property Condition Inspections",
      description: "Check-in, check-out and periodic condition reports with photo documentation.",
      defaultPricing: "fixed",
      suggestedRate: 120,
      videoAvailable: false,
      isPremiumFeature: false,
    },
    {
      key: "short_term_rental",
      name: "Short-Term Rental Management",
      description: "Airbnb / Booking management including listings, guest communication and changeovers.",
      defaultPricing: "fixed",
      suggestedRate: 200,
      videoAvailable: true,
      isPremiumFeature: true,
    },
  ],

  // ── Valuer ────────────────────────────────────────────────────────────────
  valuer: [
    {
      key: "market_valuation",
      name: "Market Valuation Report",
      description: "Formal market valuation of residential or commercial property with full written RICS-style report.",
      defaultPricing: "fixed",
      suggestedRate: 400,
      videoAvailable: true,
      isPremiumFeature: false,
    },
    {
      key: "tax_valuation",
      name: "Tax & Objective Value Assessment",
      description: "Calculation of objective (antikeimenikh) value for tax purposes and ENFIA zone verification.",
      defaultPricing: "fixed",
      suggestedRate: 200,
      videoAvailable: true,
      isPremiumFeature: false,
    },
    {
      key: "investment_analysis",
      name: "Investment & Yield Analysis",
      description: "Detailed rental yield, capital growth and ROI analysis for investment properties.",
      defaultPricing: "fixed",
      suggestedRate: 600,
      videoAvailable: true,
      isPremiumFeature: true,
    },
    {
      key: "mortgage_valuation",
      name: "Mortgage Valuation",
      description: "Bank-ready valuation report for mortgage and lending purposes.",
      defaultPricing: "fixed",
      suggestedRate: 350,
      videoAvailable: false,
      isPremiumFeature: false,
    },
    {
      key: "judicial_valuation",
      name: "Judicial / Expert Valuation",
      description: "Court-admissible expert opinion on property value for disputes, inheritances or expropriation.",
      defaultPricing: "fixed",
      suggestedRate: 700,
      videoAvailable: false,
      isPremiumFeature: false,
    },
    {
      key: "portfolio_valuation",
      name: "Portfolio Valuation",
      description: "Bulk valuation of a portfolio of properties for corporate or investment reporting.",
      defaultPricing: "fixed",
      suggestedRate: 1500,
      videoAvailable: true,
      isPremiumFeature: true,
    },
  ],

  // ── Interior Designer ─────────────────────────────────────────────────────
  interior_designer: [
    {
      key: "full_design",
      name: "Full Interior Design Package",
      description: "Complete interior design service from concept through to procurement and installation supervision.",
      defaultPricing: "fixed",
      suggestedRate: 3000,
      videoAvailable: true,
      isPremiumFeature: false,
    },
    {
      key: "space_planning",
      name: "Space Planning & Layout",
      description: "Detailed space planning with furniture layout options and traffic flow optimisation.",
      defaultPricing: "fixed",
      suggestedRate: 500,
      videoAvailable: true,
      isPremiumFeature: false,
    },
    {
      key: "colour_consultation",
      name: "Colour & Material Consultation",
      description: "Colour scheme development and material / finish selection for walls, floors and soft furnishings.",
      defaultPricing: "hourly",
      suggestedRate: 80,
      estimatedHours: 3,
      videoAvailable: true,
      isPremiumFeature: false,
    },
    {
      key: "furniture_sourcing",
      name: "Furniture & Fixture Sourcing",
      description: "Curated product sourcing, specification and procurement management.",
      defaultPricing: "fixed",
      suggestedRate: 800,
      videoAvailable: true,
      isPremiumFeature: false,
    },
    {
      key: "lighting_design",
      name: "Lighting Design",
      description: "Layered lighting scheme design including ambient, task and accent lighting.",
      defaultPricing: "fixed",
      suggestedRate: 600,
      videoAvailable: true,
      isPremiumFeature: true,
    },
    {
      key: "staging",
      name: "Property Staging for Sale",
      description: "Furniture and styling arrangement to maximise appeal for property photography and viewings.",
      defaultPricing: "fixed",
      suggestedRate: 700,
      videoAvailable: false,
      isPremiumFeature: false,
    },
    {
      key: "3d_interior",
      name: "3D Interior Visualisation",
      description: "Photorealistic renders of proposed interior design to preview the final result.",
      defaultPricing: "fixed",
      suggestedRate: 500,
      videoAvailable: true,
      isPremiumFeature: true,
    },
  ],

  // ── Financial Advisor ─────────────────────────────────────────────────────
  financial_advisor: [
    {
      key: "mortgage_consultation",
      name: "Mortgage Consultation",
      description: "Comparison of mortgage products across Greek banks, pre-approval guidance and application support.",
      defaultPricing: "fixed",
      suggestedRate: 300,
      videoAvailable: true,
      isPremiumFeature: false,
    },
    {
      key: "investment_strategy",
      name: "Property Investment Strategy",
      description: "Personalised strategy for building a real-estate portfolio aligned with return and risk objectives.",
      defaultPricing: "hourly",
      suggestedRate: 150,
      estimatedHours: 3,
      videoAvailable: true,
      isPremiumFeature: false,
    },
    {
      key: "tax_planning",
      name: "Property Tax Planning",
      description: "Analysis of ENFIA, capital gains, rental income tax and strategies to optimise the tax position.",
      defaultPricing: "hourly",
      suggestedRate: 130,
      estimatedHours: 2,
      videoAvailable: true,
      isPremiumFeature: false,
    },
    {
      key: "golden_visa",
      name: "Golden Visa Investment Advice",
      description: "Guidance on qualifying real-estate investments for the Greek residency-by-investment programme.",
      defaultPricing: "fixed",
      suggestedRate: 800,
      videoAvailable: true,
      isPremiumFeature: true,
    },
    {
      key: "loan_structuring",
      name: "Acquisition Loan Structuring",
      description: "Structuring of property acquisition financing including bridge loans, developer finance and equity.",
      defaultPricing: "fixed",
      suggestedRate: 500,
      videoAvailable: true,
      isPremiumFeature: true,
    },
    {
      key: "portfolio_review",
      name: "Portfolio Review & Rebalancing",
      description: "Review of existing property holdings with recommendations for optimising yield and capital allocation.",
      defaultPricing: "fixed",
      suggestedRate: 400,
      videoAvailable: true,
      isPremiumFeature: false,
    },
  ],
};

// Helper: get services for a category
export function getServicesForCategory(category: string): ServiceTemplate[] {
  return SERVICE_CATALOG[category] ?? [];
}

// Helper: pricing model display label
export const PRICING_LABELS: Record<PricingModel, string> = {
  hourly: "Per Hour",
  daily: "Per Day",
  fixed: "Fixed Price",
};

/** Flat list for Professionals search autocomplete: categories + service names. */
export interface ProfessionalSearchSuggestion {
  label: string;
  category: string;
  type: "category" | "service";
}

export function getProfessionalSearchSuggestions(): ProfessionalSearchSuggestion[] {
  const out: ProfessionalSearchSuggestion[] = [];
  for (const [cat, label] of Object.entries(CATEGORY_LABELS)) {
    out.push({ label, category: cat, type: "category" });
  }
  for (const [cat, services] of Object.entries(SERVICE_CATALOG)) {
    for (const s of services) {
      out.push({ label: s.name, category: cat, type: "service" });
    }
  }
  return out;
}
