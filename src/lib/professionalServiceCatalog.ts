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
  // Insurance & Advisory
  insurance_broker: "Insurance Broker / Insurer",
  utility_certification_provider: "Utility & Technical Certification",
  esg_sustainability_consultant: "ESG / Sustainability Consultant",
  relocation_immigration_consultant: "Relocation / Immigration Consultant",
  // Facility & Hospitality
  facility_manager: "Facility Manager",
  short_term_rental_operator: "Short-Term Rental Operator",
  hotel_hospitality_operator: "Hotel / Hospitality Operator",
  // Marketing & Tech
  marketing_agency: "Marketing Agency / Photographer / Media",
  crm_listing_data_provider: "CRM / Listing Portal / Data Provider",
  // Construction Contractors
  concrete_contractor: "Concrete Contractor",
  steel_structure_contractor: "Steel Structure Contractor",
  carpenter: "Carpenter",
  tile_installer: "Tile Installer",
  painter: "Painter",
  drywall_installer: "Drywall Installer",
  waterproofing_specialist: "Waterproofing Specialist",
  insulation_contractor: "Insulation Contractor",
  roofing_contractor: "Roofing Contractor",
  window_aluminum_installer: "Window / Aluminum Installer",
  elevator_installer: "Elevator Installer",
  smart_home_installer: "Smart Home Systems Installer",
  // Consultants & Compliance
  building_permit_consultant: "Building Permit Consultant",
  urban_planning_consultant: "Urban Planning Consultant",
  legalization_specialist: "Legalization of Illegal Structures Specialist",
  energy_certificate_inspector: "Energy Certificate Inspector (ΠΕΑ)",
  building_regulation_consultant: "Building Regulation Compliance Consultant",
  fire_protection_consultant: "Fire Protection Consultant",
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

  // ── Insurance Broker ────────────────────────────────────────────────────────
  insurance_broker: [
    { key: "property_insurance", name: "Property Insurance", description: "Buildings, contents, and landlord insurance for residential and commercial properties.", defaultPricing: "fixed", suggestedRate: 200, videoAvailable: true, isPremiumFeature: false },
    { key: "construction_insurance", name: "Construction Insurance", description: "Cover for new builds, renovations, and contractor works.", defaultPricing: "fixed", suggestedRate: 350, videoAvailable: true, isPremiumFeature: false },
    { key: "liability_insurance", name: "Liability Insurance", description: "Professional indemnity and public liability for property professionals.", defaultPricing: "fixed", suggestedRate: 400, videoAvailable: true, isPremiumFeature: false },
  ],

  // ── Utility & Technical Certification ───────────────────────────────────────
  utility_certification_provider: [
    { key: "utility_connection", name: "Utility Connection Certification", description: "DEI/DEDDIE compliance, electrical and gas connection certificates.", defaultPricing: "fixed", suggestedRate: 150, videoAvailable: false, isPremiumFeature: false },
    { key: "technical_inspection", name: "Technical Building Inspection", description: "Pre-purchase or periodic technical condition reports.", defaultPricing: "fixed", suggestedRate: 300, videoAvailable: false, isPremiumFeature: false },
  ],

  // ── ESG / Sustainability Consultant ────────────────────────────────────────
  esg_sustainability_consultant: [
    { key: "sustainability_audit", name: "Sustainability Audit", description: "ESG assessment and improvement roadmap for buildings.", defaultPricing: "fixed", suggestedRate: 1500, videoAvailable: true, isPremiumFeature: false },
    { key: "green_certification", name: "Green Certification", description: "LEED, BREEAM, or local sustainability certification support.", defaultPricing: "fixed", suggestedRate: 2500, videoAvailable: true, isPremiumFeature: true },
  ],

  // ── Relocation / Immigration Consultant ───────────────────────────────────────
  relocation_immigration_consultant: [
    { key: "relocation_package", name: "Full Relocation Package", description: "Visa support, housing search, school enrolment, utilities setup.", defaultPricing: "fixed", suggestedRate: 1500, videoAvailable: true, isPremiumFeature: false },
    { key: "golden_visa_assist", name: "Golden Visa Assistance", description: "Application support, document preparation, and property liaison for residency by investment.", defaultPricing: "fixed", suggestedRate: 2000, videoAvailable: true, isPremiumFeature: false },
  ],

  // ── Facility Manager ───────────────────────────────────────────────────────
  facility_manager: [
    { key: "facility_ops", name: "Facility Operations", description: "Day-to-day building operations, maintenance scheduling, vendor management.", defaultPricing: "fixed", suggestedRate: 500, videoAvailable: true, isPremiumFeature: false },
    { key: "commercial_fm", name: "Commercial Facility Management", description: "Office buildings, retail, mixed-use — full lifecycle management.", defaultPricing: "fixed", suggestedRate: 800, videoAvailable: true, isPremiumFeature: false },
  ],

  // ── Short-Term Rental Operator ──────────────────────────────────────────────
  short_term_rental_operator: [
    { key: "str_management", name: "Short-Term Rental Management", description: "Airbnb / Booking.com full management — listings, pricing, operations.", defaultPricing: "fixed", suggestedRate: 200, videoAvailable: true, isPremiumFeature: false },
    { key: "str_setup", name: "STR Setup & Optimisation", description: "Listing creation, photos, pricing strategy, and channel setup.", defaultPricing: "fixed", suggestedRate: 500, videoAvailable: true, isPremiumFeature: false },
  ],

  // ── Hotel / Hospitality Operator ──────────────────────────────────────────
  hotel_hospitality_operator: [
    { key: "hotel_ops", name: "Hotel Operations", description: "Guest services, housekeeping, F&B, reservations management.", defaultPricing: "fixed", suggestedRate: 0, videoAvailable: true, isPremiumFeature: false },
    { key: "hospitality_consult", name: "Hospitality Consulting", description: "Revenue management, branding, and operational improvements.", defaultPricing: "hourly", suggestedRate: 120, estimatedHours: 10, videoAvailable: true, isPremiumFeature: true },
  ],

  // ── Marketing Agency / Photographer / Media ──────────────────────────────────
  marketing_agency: [
    { key: "property_photography", name: "Property Photography", description: "Professional photos for listings — interiors, exteriors, drone.", defaultPricing: "fixed", suggestedRate: 250, videoAvailable: false, isPremiumFeature: false },
    { key: "listing_marketing", name: "Listing Marketing", description: "Copy, visuals, social media, and ad campaigns for property sales.", defaultPricing: "fixed", suggestedRate: 600, videoAvailable: true, isPremiumFeature: false },
    { key: "virtual_tour", name: "Virtual Tour & Video", description: "3D virtual tours, walkthrough videos, and promotional content.", defaultPricing: "fixed", suggestedRate: 450, videoAvailable: true, isPremiumFeature: true },
  ],

  // ── CRM / Listing Portal / Data Provider ─────────────────────────────────────
  crm_listing_data_provider: [
    { key: "crm_setup", name: "CRM Setup for Agents", description: "Implementation and training for property CRM systems.", defaultPricing: "fixed", suggestedRate: 800, videoAvailable: true, isPremiumFeature: false },
    { key: "listing_syndication", name: "Listing Syndication", description: "Multi-portal listing distribution and data feed management.", defaultPricing: "fixed", suggestedRate: 200, videoAvailable: true, isPremiumFeature: false },
  ],

  // ── Concrete Contractor ────────────────────────────────────────────────────
  concrete_contractor: [
    { key: "foundation_concrete", name: "Foundation & Structural Concrete", description: "Foundations, slabs, structural concrete works.", defaultPricing: "fixed", suggestedRate: 0, videoAvailable: false, isPremiumFeature: false },
    { key: "concrete_finishing", name: "Concrete Finishing", description: "Polished floors, stamped concrete, decorative surfaces.", defaultPricing: "daily", suggestedRate: 350, videoAvailable: false, isPremiumFeature: false },
  ],

  // ── Steel Structure Contractor ────────────────────────────────────────────────
  steel_structure_contractor: [
    { key: "structural_steel", name: "Structural Steel Works", description: "Steel frames, beams, columns for buildings and extensions.", defaultPricing: "fixed", suggestedRate: 0, videoAvailable: false, isPremiumFeature: false },
  ],

  // ── Carpenter ───────────────────────────────────────────────────────────────
  carpenter: [
    { key: "custom_joinery", name: "Custom Joinery & Cabinetry", description: "Built-in cupboards, wardrobes, kitchen units.", defaultPricing: "fixed", suggestedRate: 2500, videoAvailable: false, isPremiumFeature: false },
    { key: "wood_floors", name: "Wood Flooring", description: "Parquet, solid wood, engineered wood installation.", defaultPricing: "fixed", suggestedRate: 1800, videoAvailable: false, isPremiumFeature: false },
  ],

  // ── Tile Installer ──────────────────────────────────────────────────────────
  tile_installer: [
    { key: "floor_tiling", name: "Floor Tiling", description: "Ceramic, porcelain, natural stone floor installation.", defaultPricing: "fixed", suggestedRate: 35, videoAvailable: false, isPremiumFeature: false },
    { key: "wall_tiling", name: "Wall Tiling", description: "Bathroom, kitchen, and feature wall tiling.", defaultPricing: "fixed", suggestedRate: 40, videoAvailable: false, isPremiumFeature: false },
  ],

  // ── Painter ──────────────────────────────────────────────────────────────────
  painter: [
    { key: "interior_painting", name: "Interior Painting", description: "Walls, ceilings, woodwork — full interior paint finishes.", defaultPricing: "daily", suggestedRate: 280, videoAvailable: false, isPremiumFeature: false },
    { key: "exterior_painting", name: "Exterior Painting", description: "Facade painting, waterproof coatings, decorative finishes.", defaultPricing: "daily", suggestedRate: 350, videoAvailable: false, isPremiumFeature: false },
  ],

  // ── Building Permit Consultant ──────────────────────────────────────────────
  building_permit_consultant: [
    { key: "permit_application", name: "Building Permit Application", description: "Preparation and submission of permit dossier to municipality.", defaultPricing: "fixed", suggestedRate: 800, videoAvailable: true, isPremiumFeature: false },
    { key: "permit_expediting", name: "Permit Expediting", description: "Tracking, follow-ups, and liaison with authorities.", defaultPricing: "hourly", suggestedRate: 60, estimatedHours: 10, videoAvailable: true, isPremiumFeature: false },
  ],

  // ── Urban Planning Consultant ───────────────────────────────────────────────
  urban_planning_consultant: [
    { key: "zoning_analysis", name: "Zoning & Land Use Analysis", description: "Permitted uses, building coefficients, zoning compliance.", defaultPricing: "fixed", suggestedRate: 400, videoAvailable: true, isPremiumFeature: false },
    { key: "planning_permit", name: "Planning Permit (ΠΟΛ)", description: "Planning permission applications and amendments.", defaultPricing: "fixed", suggestedRate: 1200, videoAvailable: true, isPremiumFeature: false },
  ],

  // ── Legalization Specialist ──────────────────────────────────────────────────
  legalization_specialist: [
    { key: "illegal_structure", name: "Illegal Structure Legalization", description: "Process for legalizing unlicensed or arbitrary constructions.", defaultPricing: "fixed", suggestedRate: 1500, videoAvailable: true, isPremiumFeature: false },
    { key: "retroactive_permit", name: "Retroactive Permit", description: "Documentation and application for retroactive building permits.", defaultPricing: "fixed", suggestedRate: 2000, videoAvailable: true, isPremiumFeature: false },
  ],

  // ── Energy Certificate Inspector (ΠΕΑ) ──────────────────────────────────────
  energy_certificate_inspector: [
    { key: "pea_issuance", name: "Energy Performance Certificate (ΠΕΑ)", description: "Issuance of mandatory Energy Performance Certificate.", defaultPricing: "fixed", suggestedRate: 250, videoAvailable: false, isPremiumFeature: false },
    { key: "energy_upgrade", name: "Energy Upgrade Recommendations", description: "Recommendations for improving energy class.", defaultPricing: "fixed", suggestedRate: 150, videoAvailable: true, isPremiumFeature: false },
  ],

  // ── Building Regulation Compliance ───────────────────────────────────────────
  building_regulation_consultant: [
    { key: "compliance_audit", name: "Building Compliance Audit", description: "Review of building against current regulations and codes.", defaultPricing: "fixed", suggestedRate: 600, videoAvailable: true, isPremiumFeature: false },
    { key: "remediation_plan", name: "Remediation Plan", description: "Plan and documentation for bringing building into compliance.", defaultPricing: "fixed", suggestedRate: 1000, videoAvailable: true, isPremiumFeature: false },
  ],

  // ── Fire Protection Consultant ──────────────────────────────────────────────
  fire_protection_consultant: [
    { key: "fire_safety_report", name: "Fire Safety Report", description: "Fire safety assessment and certification for buildings.", defaultPricing: "fixed", suggestedRate: 800, videoAvailable: false, isPremiumFeature: false },
    { key: "fire_systems", name: "Fire Systems Design", description: "Design of fire detection, alarm, and suppression systems.", defaultPricing: "fixed", suggestedRate: 1500, videoAvailable: true, isPremiumFeature: false },
  ],

  // ── Drywall Installer ────────────────────────────────────────────────────────
  drywall_installer: [
    { key: "drywall_partitions", name: "Drywall Partitions", description: "Gypsum board partitions, ceiling systems, sound insulation.", defaultPricing: "fixed", suggestedRate: 45, videoAvailable: false, isPremiumFeature: false },
  ],

  // ── Waterproofing Specialist ─────────────────────────────────────────────────
  waterproofing_specialist: [
    { key: "basement_waterproofing", name: "Basement & Tanking", description: "Below-grade waterproofing and tanking systems.", defaultPricing: "fixed", suggestedRate: 2500, videoAvailable: false, isPremiumFeature: false },
    { key: "terrace_waterproofing", name: "Terrace & Roof Waterproofing", description: "Flat roof, terrace, and balcony waterproofing.", defaultPricing: "fixed", suggestedRate: 3500, videoAvailable: false, isPremiumFeature: false },
  ],

  // ── Insulation Contractor ────────────────────────────────────────────────────
  insulation_contractor: [
    { key: "thermal_insulation", name: "Thermal Insulation", description: "External and internal insulation, energy upgrade works.", defaultPricing: "fixed", suggestedRate: 35, videoAvailable: false, isPremiumFeature: false },
    { key: "acoustic_insulation", name: "Acoustic Insulation", description: "Soundproofing for floors, walls, ceilings.", defaultPricing: "fixed", suggestedRate: 40, videoAvailable: false, isPremiumFeature: false },
  ],

  // ── Roofing Contractor ──────────────────────────────────────────────────────
  roofing_contractor: [
    { key: "roof_replacement", name: "Roof Replacement", description: "Tile or flat roof replacement and repair.", defaultPricing: "fixed", suggestedRate: 3500, videoAvailable: false, isPremiumFeature: false },
    { key: "roof_maintenance", name: "Roof Maintenance", description: "Inspections, leak repair, gutter maintenance.", defaultPricing: "fixed", suggestedRate: 400, videoAvailable: false, isPremiumFeature: false },
  ],

  // ── Window / Aluminum Installer ──────────────────────────────────────────────
  window_aluminum_installer: [
    { key: "window_install", name: "Window & Door Installation", description: "Aluminum, PVC, wooden windows and doors.", defaultPricing: "fixed", suggestedRate: 0, videoAvailable: false, isPremiumFeature: false },
    { key: "shutter_install", name: "Shutter & Pergola", description: "Roller shutters, awnings, pergolas.", defaultPricing: "fixed", suggestedRate: 800, videoAvailable: false, isPremiumFeature: false },
  ],

  // ── Elevator Installer ─────────────────────────────────────────────────────
  elevator_installer: [
    { key: "elevator_install", name: "Elevator Installation", description: "New elevator installation and modernisation.", defaultPricing: "fixed", suggestedRate: 0, videoAvailable: false, isPremiumFeature: false },
    { key: "elevator_service", name: "Elevator Service & Maintenance", description: "Annual inspections, repairs, modernisation.", defaultPricing: "fixed", suggestedRate: 500, videoAvailable: false, isPremiumFeature: false },
  ],

  // ── Smart Home Installer ─────────────────────────────────────────────────────
  smart_home_installer: [
    { key: "smart_installation", name: "Smart Home Installation", description: "Lighting, climate, security, and automation systems.", defaultPricing: "daily", suggestedRate: 300, videoAvailable: true, isPremiumFeature: true },
    { key: "integration", name: "System Integration", description: "Integration of multiple smart systems (KNX, etc.).", defaultPricing: "fixed", suggestedRate: 1500, videoAvailable: true, isPremiumFeature: true },
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
