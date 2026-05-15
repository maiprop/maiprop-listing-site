export type StakeholderVideoSpec = {
  id: string;
  title: string;
  subtitle: string;
  promise: string;
  audience: string;
  route: string;
  accent: string;
  dashboardModules: string[];
  modules: {
    name: string;
    action: string;
    value: string;
    surface: string;
  }[];
  workflow: string[];
  outcomes: string[];
  cta: string;
};

export const stakeholderVideos: StakeholderVideoSpec[] = [
  {
    id: "buyer",
    title: "Buyer and renter portal",
    subtitle: "Find, compare, save, and book viewings from one workspace.",
    promise: "A focused path from discovery to decision.",
    audience: "Home buyers and renters",
    route: "/listings -> /property/:id -> /dashboard",
    accent: "#4ef5f1",
    dashboardModules: ["Saved", "Saved searches", "Viewings", "Auction alerts", "Messages"],
    modules: [
      {
        name: "Browse listings",
        action: "Filter by location, type, price, and property needs",
        value: "Cuts the market down to relevant homes quickly",
        surface: "/listings",
      },
      {
        name: "Saved searches",
        action: "Store criteria and return to fresh matches",
        value: "Keeps the buyer from rebuilding the same search",
        surface: "Dashboard",
      },
      {
        name: "Viewings",
        action: "Request and track property visits",
        value: "Turns interest into scheduled next steps",
        surface: "Dashboard",
      },
      {
        name: "Property reports",
        action: "Open valuation and report cards on property detail",
        value: "Adds confidence before contacting or offering",
        surface: "/property/:id",
      },
      {
        name: "Professionals",
        action: "Message or book verified service providers",
        value: "Brings expert help into the buying workflow",
        surface: "/professionals",
      },
    ],
    workflow: ["Search", "Save", "Inspect", "Book", "Decide"],
    outcomes: ["Less tab switching", "Clear next steps", "A reusable buying workspace"],
    cta: "Start with Browse Listings",
  },
  {
    id: "seller",
    title: "Seller and landlord portal",
    subtitle: "Create listings, manage buyer interest, and track the sale workflow.",
    promise: "Everything a private owner needs to go from listing to lead.",
    audience: "Private sellers and landlords",
    route: "/listings/new -> /dashboard",
    accent: "#ffcf5a",
    dashboardModules: ["My listings", "Viewings", "Messages", "Open houses", "Saved searches"],
    modules: [
      {
        name: "Create listing",
        action: "Add type, location, price, features, details, and photos",
        value: "Gets a complete property live without a complex back office",
        surface: "/listings/new",
      },
      {
        name: "My listings",
        action: "Track published listings and listing status",
        value: "Keeps the owner focused on active inventory",
        surface: "Dashboard",
      },
      {
        name: "Messages",
        action: "Respond to buyer and professional conversations",
        value: "Prevents lead follow-up from getting scattered",
        surface: "/messages",
      },
      {
        name: "Viewings",
        action: "Review visit requests and scheduling activity",
        value: "Moves qualified interest toward a real viewing",
        surface: "Dashboard",
      },
      {
        name: "Open houses",
        action: "Use open house visibility and registration flow",
        value: "Creates a structured path for grouped buyer interest",
        surface: "Pro dashboard",
      },
    ],
    workflow: ["List", "Publish", "Promote", "Respond", "Schedule"],
    outcomes: ["Faster listing creation", "Cleaner owner follow-up", "Better buyer visibility"],
    cta: "Create a New Listing",
  },
  {
    id: "agent",
    title: "Agent and agency portal",
    subtitle: "Manage listings, leads, contacts, analytics, and client activity.",
    promise: "A practical operating layer for real estate teams.",
    audience: "Agents and agencies",
    route: "/dashboard -> listings, contacts, analytics",
    accent: "#8ef06f",
    dashboardModules: ["My listings", "Analytics", "Contacts", "Leads", "Open houses", "Auction alerts"],
    modules: [
      {
        name: "My listings",
        action: "Create and manage client inventory",
        value: "Centralizes sell-side work across active properties",
        surface: "Dashboard",
      },
      {
        name: "Contacts",
        action: "Organize buyers, sellers, and follow-ups",
        value: "Turns portal activity into a working CRM",
        surface: "Pro dashboard",
      },
      {
        name: "Leads",
        action: "Review inquiries from listings and services",
        value: "Keeps demand attached to its source property",
        surface: "Pro dashboard",
      },
      {
        name: "Analytics",
        action: "Read performance signals across listings",
        value: "Shows which properties and channels need attention",
        surface: "Pro dashboard",
      },
      {
        name: "Reports and AI",
        action: "Use valuations, reports, auction filters, and AI search",
        value: "Improves client advice with market context",
        surface: "Property + auctions",
      },
    ],
    workflow: ["List", "Capture", "Qualify", "Follow up", "Advise"],
    outcomes: ["Shared sales context", "Cleaner lead tracking", "More informed client conversations"],
    cta: "Open the Agent Dashboard",
  },
  {
    id: "developer",
    title: "Developer and builder portal",
    subtitle: "Showcase projects, manage units, and capture demand before completion.",
    promise: "A launchpad for new developments and project sales.",
    audience: "Developers and builders",
    route: "/listings/new-building -> /projects -> /dashboard",
    accent: "#ff7a7a",
    dashboardModules: ["Projects", "Portfolios", "My listings", "Analytics", "Leads", "Contacts"],
    modules: [
      {
        name: "New building listing",
        action: "Publish building, unit, media, plans, specs, and timeline",
        value: "Turns a development into a structured sales asset",
        surface: "/listings/new-building",
      },
      {
        name: "Projects",
        action: "Group project pages, units, and buyer interest",
        value: "Keeps project demand visible before completion",
        surface: "/projects",
      },
      {
        name: "Portfolios",
        action: "Organize multiple developments and assets",
        value: "Makes cross-project management easier",
        surface: "/portfolios",
      },
      {
        name: "Leads and contacts",
        action: "Capture inquiries and buyer follow-up",
        value: "Connects demand to project sales activity",
        surface: "Pro dashboard",
      },
      {
        name: "Analytics",
        action: "Track views, interest, and project performance",
        value: "Shows where marketing or sales action is needed",
        surface: "Pro dashboard",
      },
    ],
    workflow: ["Showcase", "Group units", "Capture demand", "Track", "Sell"],
    outcomes: ["Project-ready presentation", "Lead capture by development", "Pre-sale operating visibility"],
    cta: "Create a New Building Listing",
  },
  {
    id: "professional",
    title: "Service professional portal",
    subtitle: "Build a verified profile, sell services, and receive bookings.",
    promise: "A service storefront connected to real property demand.",
    audience: "Architects, lawyers, notaries, engineers, and service providers",
    route: "/onboarding -> /professionals/me -> /dashboard",
    accent: "#b7f4ff",
    dashboardModules: ["My services", "Booking", "Leads", "Contacts", "Analytics", "Messages"],
    modules: [
      {
        name: "Pro onboarding",
        action: "Add discipline, business details, AFM, phone, and license",
        value: "Creates a verified provider profile",
        surface: "/onboarding",
      },
      {
        name: "My services",
        action: "Publish services, pricing model, rates, and video option",
        value: "Turns expertise into selectable offers",
        surface: "Dashboard",
      },
      {
        name: "Availability",
        action: "Set working days, hours, meeting link, and notes",
        value: "Makes booking practical for clients",
        surface: "Onboarding + profile",
      },
      {
        name: "Directory profile",
        action: "Show overview, services, reviews, and availability",
        value: "Creates market presence where property users already are",
        surface: "/professionals/:id",
      },
      {
        name: "Booking and leads",
        action: "Receive messages, bookings, contacts, and lead analytics",
        value: "Converts profile attention into client work",
        surface: "Pro dashboard",
      },
    ],
    workflow: ["Verify", "Publish services", "Set availability", "Get discovered", "Convert"],
    outcomes: ["Verified market presence", "Service-led conversion", "Booking workflow in one place"],
    cta: "Finish Professional Onboarding",
  },
  {
    id: "investor",
    title: "Investor and fund portal",
    subtitle: "Track deal flow, firesales, auctions, saved searches, and reports.",
    promise: "A filtered pipeline for opportunity-first users.",
    audience: "Private investors, funds, and institutional users",
    route: "/investor-dashboard -> /firesale -> /auctions",
    accent: "#cba6ff",
    dashboardModules: ["Deal flow", "Saved searches", "Auction alerts", "Reports", "Messages", "Portfolios"],
    modules: [
      {
        name: "Deal flow",
        action: "Monitor eligible investor and quick-sale opportunities",
        value: "Creates one pipeline for investable inventory",
        surface: "/investor-dashboard",
      },
      {
        name: "Auctions",
        action: "Use advanced filters for ownership, round, and yield",
        value: "Screens auction inventory faster",
        surface: "/auctions",
      },
      {
        name: "Saved searches",
        action: "Track recurring investment criteria",
        value: "Keeps thesis-based search reusable",
        surface: "Dashboard",
      },
      {
        name: "Reports",
        action: "Open valuation and property report cards",
        value: "Adds context before reserving interest or contacting",
        surface: "/property/:id",
      },
      {
        name: "Messages and portfolios",
        action: "Move shortlisted deals into follow-up and portfolio views",
        value: "Keeps opportunities organized after discovery",
        surface: "Dashboard",
      },
    ],
    workflow: ["Source", "Filter", "Evaluate", "Shortlist", "Act"],
    outcomes: ["Faster deal screening", "Reusable saved criteria", "One view of active opportunities"],
    cta: "Open Investor Dashboard",
  },
  {
    id: "admin",
    title: "Platform admin portal",
    subtitle: "Review access, pricing, firesale flow, reports, and platform operations.",
    promise: "A controlled workspace for operating the marketplace.",
    audience: "MaiProp platform operators",
    route: "/admin",
    accent: "#ffffff",
    dashboardModules: ["Invitation requests", "Professional verification", "Firesale pipeline", "Pricing", "Reports"],
    modules: [
      {
        name: "Invitation requests",
        action: "Approve or reject high-trust role requests",
        value: "Controls who gets privileged marketplace access",
        surface: "/admin",
      },
      {
        name: "Professional verification",
        action: "Review provider credentials and verification state",
        value: "Keeps the services directory credible",
        surface: "/admin",
      },
      {
        name: "Firesale pipeline",
        action: "Review, publish, and manage quick-sale opportunities",
        value: "Turns sensitive inventory into a controlled workflow",
        surface: "/admin",
      },
      {
        name: "Pricing and subscribers",
        action: "Manage pricing configs and subscriber state",
        value: "Keeps monetization and access aligned",
        surface: "/admin",
      },
      {
        name: "Reports and audit",
        action: "Review reports and keep admin-only actions separated",
        value: "Adds accountability to platform operations",
        surface: "/admin",
      },
    ],
    workflow: ["Review", "Approve", "Publish", "Configure", "Audit"],
    outcomes: ["Separated admin control", "Clear review queues", "Operational confidence"],
    cta: "Open Admin Dashboard",
  },
];

export const stakeholderCompositionIds = stakeholderVideos.map((video) => `stakeholder-${video.id}`);
