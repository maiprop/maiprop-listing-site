import { describe, expect, it } from "vitest";

type RoleTier =
  | "anonymous"
  | "buyer_free"
  | "buyer_pro"
  | "seller_free"
  | "seller_pro"
  | "agent_free"
  | "agent_pro"
  | "developer_free"
  | "developer_pro"
  | "professional_free"
  | "professional_pro"
  | "investor_pending_payment"
  | "investor_private_active"
  | "investor_institutional_active"
  | "admin";

type Surface =
  | "public_home"
  | "listings_search"
  | "property_detail"
  | "contact_listing_owner"
  | "messages"
  | "dashboard"
  | "create_standard_listing"
  | "create_new_building"
  | "projects"
  | "pricing_checkout"
  | "professionals_directory"
  | "professional_profile_contact"
  | "professional_booking"
  | "professional_self_profile"
  | "open_houses"
  | "open_house_registration"
  | "open_house_host_dashboard"
  | "auctions"
  | "auction_alerts"
  | "firesale_public_submission"
  | "firesale_investor_dashboard"
  | "ai_search"
  | "ai_reports"
  | "admin_dashboard"
  | "platform_map";

type Outcome =
  | "public"
  | "allow"
  | "signin_required"
  | "role_denied"
  | "pro_required"
  | "quota_limited"
  | "invite_pending_payment"
  | "admin_only"
  | "not_applicable";

type MatrixCell = {
  outcome: Outcome;
  evidence: readonly string[];
};

const roles: readonly RoleTier[] = [
  "anonymous",
  "buyer_free",
  "buyer_pro",
  "seller_free",
  "seller_pro",
  "agent_free",
  "agent_pro",
  "developer_free",
  "developer_pro",
  "professional_free",
  "professional_pro",
  "investor_pending_payment",
  "investor_private_active",
  "investor_institutional_active",
  "admin",
];

const surfaces: readonly Surface[] = [
  "public_home",
  "listings_search",
  "property_detail",
  "contact_listing_owner",
  "messages",
  "dashboard",
  "create_standard_listing",
  "create_new_building",
  "projects",
  "pricing_checkout",
  "professionals_directory",
  "professional_profile_contact",
  "professional_booking",
  "professional_self_profile",
  "open_houses",
  "open_house_registration",
  "open_house_host_dashboard",
  "auctions",
  "auction_alerts",
  "firesale_public_submission",
  "firesale_investor_dashboard",
  "ai_search",
  "ai_reports",
  "admin_dashboard",
  "platform_map",
];

const publicSurfaces: readonly Surface[] = [
  "public_home",
  "listings_search",
  "property_detail",
  "professionals_directory",
  "professional_profile_contact",
  "open_houses",
  "auctions",
  "firesale_public_submission",
];

const signedInOnlySurfaces: readonly Surface[] = [
  "contact_listing_owner",
  "messages",
  "dashboard",
  "professional_booking",
  "open_house_registration",
  "auction_alerts",
];

const aiSurfaces: readonly Surface[] = ["ai_search", "ai_reports"];

const sellerLike = new Set<RoleTier>(["seller_free", "seller_pro", "agent_free", "agent_pro", "admin"]);
const developerLike = new Set<RoleTier>(["developer_pro", "admin"]);
const investorActive = new Set<RoleTier>(["investor_private_active", "investor_institutional_active", "admin"]);
const professionalLike = new Set<RoleTier>(["professional_free", "professional_pro", "admin"]);
const proRoles = new Set<RoleTier>([
  "buyer_pro",
  "seller_pro",
  "agent_pro",
  "developer_pro",
  "professional_pro",
  "investor_private_active",
  "investor_institutional_active",
  "admin",
]);

const evidenceBySurface: Record<Surface, readonly string[]> = {
  public_home: ["src/App.tsx / route /", "e2e/pages-public.spec.ts"],
  listings_search: ["src/App.tsx / route /listings", "src/pages/Listings.tsx", "e2e/listings.spec.ts"],
  property_detail: ["src/App.tsx / route /property/:id", "src/pages/PropertyDetail.tsx", "src/test/pages.smoke.test.tsx"],
  contact_listing_owner: ["src/components/SendMessageModal.tsx", "src/hooks/useMessages.ts", "e2e/interaction-buyer-seller.spec.ts"],
  messages: ["src/App.tsx / protected route /messages", "src/pages/Messages.tsx", "src/test/Messages.test.tsx"],
  dashboard: ["src/App.tsx / protected route /dashboard", "src/pages/Dashboard.tsx", "e2e/pages-authenticated.spec.ts"],
  create_standard_listing: ["src/App.tsx / SellerRoute /listings/new", "src/components/SellerRoute.tsx", "src/test/routeGuards.test.tsx"],
  create_new_building: ["src/App.tsx / NewBuildingRoute /listings/new-building", "src/components/NewBuildingRoute.tsx", "e2e/interaction-agent-developer.spec.ts"],
  projects: ["src/App.tsx / DeveloperRoute /projects", "src/components/DeveloperRoute.tsx", "src/test/ProjectsTab.test.tsx"],
  pricing_checkout: ["src/pages/Pricing.tsx", "src/lib/rolePlanMap.ts", "supabase/functions/create-checkout/index.test.ts"],
  professionals_directory: ["src/pages/Professionals.tsx", "src/hooks/useProfessionals.ts", "src/test/useProfessionals.test.tsx"],
  professional_profile_contact: ["src/pages/ProfessionalProfile.tsx", "src/components/BookConsultationModal.tsx", "src/test/pages.smoke.test.tsx"],
  professional_booking: ["src/components/BookConsultationModal.tsx", "src/hooks/useConsultations.ts", "src/test/useConsultations.test.tsx"],
  professional_self_profile: ["src/App.tsx / protected route /professionals/me", "src/pages/ProfessionalProfileMe.tsx", "src/test/pages.smoke.test.tsx"],
  open_houses: ["src/App.tsx / route /open-houses", "src/pages/OpenHouses.tsx", "e2e/interaction-open-house.spec.ts"],
  open_house_registration: ["src/components/OpenHouseRegistrationDialog.tsx", "src/hooks/useOpenHouseAssetControl.ts", "src/test/openHouseRegistrationMutationGuard.test.ts"],
  open_house_host_dashboard: ["src/components/OpenHouseDashboardSection.tsx", "src/components/OpenHouseAssetControlPanel.tsx", "src/test/openHouseAssetControl.test.ts"],
  auctions: ["src/App.tsx / route /auctions", "src/pages/Auctions.tsx", "e2e/interaction-auctions.spec.ts"],
  auction_alerts: ["src/components/AuctionAlertModal.tsx", "src/hooks/useAuctionAlerts.ts", "src/test/useAuctionAlerts.test.tsx"],
  firesale_public_submission: ["src/pages/Firesale.tsx", "src/components/firesale/FiresaleQuickSaleForm.tsx", "src/test/FiresaleQuickSaleForm.test.tsx"],
  firesale_investor_dashboard: ["src/App.tsx / InvestorRoute /investor-dashboard", "src/components/InvestorRoute.tsx", "e2e/interaction-investor-admin.spec.ts"],
  ai_search: ["src/components/AISearchBar.tsx", "supabase/functions/ai-search/index.test.ts", "src/test/useSmartFilters.test.tsx"],
  ai_reports: ["src/components/NeighbourhoodReport.tsx", "supabase/functions/neighbourhood-report/index.test.ts", "src/test/NeighbourhoodReport.test.tsx"],
  admin_dashboard: ["src/App.tsx / AdminRoute /admin", "src/components/AdminRoute.tsx", "e2e/interaction-investor-admin.spec.ts"],
  platform_map: ["src/App.tsx / AdminRoute /platform-map", "src/pages/PlatformMap.tsx", "e2e/pages-roles.spec.ts"],
};

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
function expectedOutcome(role: RoleTier, surface: Surface): Outcome {
  if (publicSurfaces.includes(surface)) return "public";
  if (role === "anonymous") return "signin_required";

  if (signedInOnlySurfaces.includes(surface)) return "allow";
  if (aiSurfaces.includes(surface)) return proRoles.has(role) ? "allow" : "quota_limited";

  if (surface === "create_standard_listing") return sellerLike.has(role) ? "allow" : "role_denied";
  if (surface === "create_new_building" || surface === "projects") {
    if (role === "developer_free") return "pro_required";
    return developerLike.has(role) ? "allow" : "role_denied";
  }
  if (surface === "pricing_checkout") {
    return role === "investor_pending_payment" ? "invite_pending_payment" : "allow";
  }
  if (surface === "professional_self_profile") return professionalLike.has(role) ? "allow" : "role_denied";
  if (surface === "open_house_host_dashboard") return sellerLike.has(role) ? "allow" : "role_denied";
  if (surface === "firesale_investor_dashboard") {
    if (role === "investor_pending_payment") return "invite_pending_payment";
    return investorActive.has(role) ? "allow" : "role_denied";
  }
  if (surface === "admin_dashboard" || surface === "platform_map") return role === "admin" ? "allow" : "admin_only";

  return "not_applicable";
}

const interactionMatrix = Object.fromEntries(
  roles.map((role) => [
    role,
    Object.fromEntries(
      surfaces.map((surface) => [
        surface,
        {
          outcome: expectedOutcome(role, surface),
          evidence: evidenceBySurface[surface],
        } satisfies MatrixCell,
      ]),
    ),
  ]),
) as Record<RoleTier, Record<Surface, MatrixCell>>;

describe("role/tier interaction matrix", () => {
  it("classifies every role/tier and surface combination without unknowns", () => {
    for (const role of roles) {
      for (const surface of surfaces) {
        const cell = interactionMatrix[role]?.[surface];
        expect(cell, `${role} x ${surface}`).toBeDefined();
        expect(cell.outcome, `${role} x ${surface}`).not.toBe("not_applicable");
        expect(cell.evidence.length, `${role} x ${surface}`).toBeGreaterThan(0);
      }
    }
  });

  it("keeps the matrix exhaustive when new roles or surfaces are added", () => {
    expect(Object.keys(interactionMatrix).sort()).toEqual([...roles].sort());
    for (const role of roles) {
      expect(Object.keys(interactionMatrix[role]).sort()).toEqual([...surfaces].sort());
    }
  });

  it("locks down high-risk role-gated flows", () => {
    expect(interactionMatrix.anonymous.messages.outcome).toBe("signin_required");
    expect(interactionMatrix.buyer_free.create_standard_listing.outcome).toBe("role_denied");
    expect(interactionMatrix.seller_free.create_standard_listing.outcome).toBe("allow");
    expect(interactionMatrix.developer_free.create_new_building.outcome).toBe("pro_required");
    expect(interactionMatrix.developer_pro.create_new_building.outcome).toBe("allow");
    expect(interactionMatrix.investor_pending_payment.firesale_investor_dashboard.outcome).toBe("invite_pending_payment");
    expect(interactionMatrix.investor_private_active.firesale_investor_dashboard.outcome).toBe("allow");
    expect(interactionMatrix.professional_free.professional_self_profile.outcome).toBe("allow");
    expect(interactionMatrix.buyer_free.admin_dashboard.outcome).toBe("admin_only");
    expect(interactionMatrix.admin.admin_dashboard.outcome).toBe("allow");
  });

  it("documents quota-limited AI access for signed-in free users", () => {
    expect(interactionMatrix.buyer_free.ai_reports.outcome).toBe("quota_limited");
    expect(interactionMatrix.seller_free.ai_search.outcome).toBe("quota_limited");
    expect(interactionMatrix.agent_free.ai_reports.outcome).toBe("quota_limited");
    expect(interactionMatrix.professional_free.ai_search.outcome).toBe("quota_limited");
    expect(interactionMatrix.buyer_pro.ai_reports.outcome).toBe("allow");
    expect(interactionMatrix.agent_pro.ai_search.outcome).toBe("allow");
  });
});
