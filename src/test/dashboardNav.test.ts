/**
 * Tests for getNavItemsForBioType — the function that drives paid/free tab gating.
 *
 * Key invariants:
 *  - Pro users: no locked items for their role
 *  - Free users: items in NAV_PRO but not NAV_FREE appear with locked:true
 *  - Admin: always full access, never any locked items
 *  - eligibleForQuickSale=true adds deal-flow to free buyer nav
 */

import { describe, it, expect } from "vitest";
import { getNavItemsForBioType, type NavKey } from "@/lib/dashboardNav";

function lockedKeys(result: ReturnType<typeof getNavItemsForBioType>): NavKey[] {
  return result.filter(i => i.locked === true).map(i => i.key);
}

function unlockedKeys(result: ReturnType<typeof getNavItemsForBioType>): NavKey[] {
  return result.filter(i => !i.locked).map(i => i.key);
}

// ── Admin ──────────────────────────────────────────────────────────────────────

describe("admin role", () => {
  it("returns all items unlocked regardless of isPro", () => {
    const result = getNavItemsForBioType(null, "admin", false);
    expect(lockedKeys(result)).toHaveLength(0);
    expect(result.length).toBeGreaterThan(0);
  });

  it("includes deal-flow for admin", () => {
    const result = getNavItemsForBioType(null, "admin", false);
    expect(unlockedKeys(result)).toContain("deal-flow");
  });
});

// ── Buyer ─────────────────────────────────────────────────────────────────────

describe("buyer role", () => {
  it("free buyer has no locked items (buyer has no pro-only tabs)", () => {
    const result = getNavItemsForBioType(null, "buyer", false);
    expect(lockedKeys(result)).toHaveLength(0);
  });

  it("pro buyer has no locked items", () => {
    const result = getNavItemsForBioType(null, "buyer", true);
    expect(lockedKeys(result)).toHaveLength(0);
  });

  it("eligibleForQuickSale adds deal-flow for free buyer", () => {
    const result = getNavItemsForBioType(null, "buyer", false, true);
    expect(unlockedKeys(result)).toContain("deal-flow");
  });

  it("eligibleForQuickSale has no effect for pro buyer (deal-flow not in pro buyer nav)", () => {
    // Pro buyer nav doesn't include deal-flow either — it's investor-specific
    const withQS = getNavItemsForBioType(null, "buyer", true, true);
    const withoutQS = getNavItemsForBioType(null, "buyer", true, false);
    expect(unlockedKeys(withQS)).toEqual(unlockedKeys(withoutQS));
  });
});

// ── Seller ────────────────────────────────────────────────────────────────────

describe("seller role", () => {
  it("free seller has saved-searches locked", () => {
    const result = getNavItemsForBioType(null, "seller", false);
    expect(lockedKeys(result)).toContain("saved-searches");
  });

  it("pro seller has no locked items", () => {
    const result = getNavItemsForBioType(null, "seller", true);
    expect(lockedKeys(result)).toHaveLength(0);
  });

  it("free seller can access listings and messages unlocked", () => {
    const result = getNavItemsForBioType(null, "seller", false);
    const free = unlockedKeys(result);
    expect(free).toContain("listings");
    expect(free).toContain("messages");
  });
});

// ── Agent ─────────────────────────────────────────────────────────────────────

describe("agent role", () => {
  it("free agent has analytics, saved-searches, leads, contacts locked", () => {
    const result = getNavItemsForBioType(null, "agent", false);
    const locked = lockedKeys(result);
    expect(locked).toContain("analytics");
    expect(locked).toContain("saved-searches");
    expect(locked).toContain("leads");
    expect(locked).toContain("contacts");
  });

  it("pro agent has no locked items", () => {
    const result = getNavItemsForBioType(null, "agent", true);
    expect(lockedKeys(result)).toHaveLength(0);
  });

  it("free agent can access listings and messages unlocked", () => {
    const result = getNavItemsForBioType(null, "agent", false);
    const free = unlockedKeys(result);
    expect(free).toContain("listings");
    expect(free).toContain("messages");
  });
});

// ── Developer ─────────────────────────────────────────────────────────────────

describe("developer role", () => {
  it("free developer has analytics, saved-searches, viewings, leads, contacts, projects, portfolios locked", () => {
    const result = getNavItemsForBioType(null, "developer", false);
    const locked = lockedKeys(result);
    expect(locked).toContain("analytics");
    expect(locked).toContain("saved-searches");
    expect(locked).toContain("viewings");
    expect(locked).toContain("leads");
    expect(locked).toContain("contacts");
    expect(locked).toContain("projects");
    expect(locked).toContain("portfolios");
  });

  it("pro developer has no locked items", () => {
    const result = getNavItemsForBioType(null, "developer", true);
    expect(lockedKeys(result)).toHaveLength(0);
  });
});

// ── Professional ──────────────────────────────────────────────────────────────

describe("professional role", () => {
  it("free professional has booking, leads, contacts, analytics, viewings locked", () => {
    const result = getNavItemsForBioType(null, "professional", false);
    const locked = lockedKeys(result);
    expect(locked).toContain("booking");
    expect(locked).toContain("leads");
    expect(locked).toContain("contacts");
    expect(locked).toContain("analytics");
    expect(locked).toContain("viewings");
  });

  it("pro professional has no locked items", () => {
    const result = getNavItemsForBioType(null, "professional", true);
    expect(lockedKeys(result)).toHaveLength(0);
  });

  it("free professional can access services and messages unlocked", () => {
    const result = getNavItemsForBioType(null, "professional", false);
    const free = unlockedKeys(result);
    expect(free).toContain("services");
    expect(free).toContain("messages");
  });
});

// ── Investor ──────────────────────────────────────────────────────────────────

describe("investor role", () => {
  it("free investor has saved-searches and open-houses locked", () => {
    const result = getNavItemsForBioType(null, "investor", false);
    const locked = lockedKeys(result);
    expect(locked).toContain("saved-searches");
    expect(locked).toContain("open-houses");
  });

  it("pro investor has no locked items", () => {
    const result = getNavItemsForBioType(null, "investor", true);
    expect(lockedKeys(result)).toHaveLength(0);
  });
});

// ── Institutional ─────────────────────────────────────────────────────────────

describe("institutional role", () => {
  it("free institutional has saved-searches, open-houses, contacts locked", () => {
    const result = getNavItemsForBioType(null, "institutional", false);
    const locked = lockedKeys(result);
    expect(locked).toContain("saved-searches");
    expect(locked).toContain("open-houses");
    expect(locked).toContain("contacts");
  });

  it("pro institutional has no locked items", () => {
    const result = getNavItemsForBioType(null, "institutional", true);
    expect(lockedKeys(result)).toHaveLength(0);
  });
});

// ── role authority ────────────────────────────────────────────────────────────

describe("role authority", () => {
  it("ignores bioType/participant_type override for navigation privileges", () => {
    const byRole = getNavItemsForBioType(null, "buyer", false);
    const byBioType = getNavItemsForBioType("developer", "buyer", false);
    expect(unlockedKeys(byBioType)).toEqual(unlockedKeys(byRole));
    expect(lockedKeys(byBioType)).toEqual(lockedKeys(byRole));
  });
});

// ── Structural invariants ─────────────────────────────────────────────────────

describe("structural invariants", () => {
  it("every item has icon, label, and key fields", () => {
    const result = getNavItemsForBioType(null, "agent", false);
    for (const item of result) {
      expect(item.icon).toBeDefined();
      expect(item.label).toBeTruthy();
      expect(item.key).toBeTruthy();
    }
  });

  it("overview is always unlocked for every role", () => {
    const roles = ["buyer", "seller", "agent", "developer", "professional", "investor", "institutional"] as const;
    for (const role of roles) {
      const result = getNavItemsForBioType(null, role, false);
      expect(unlockedKeys(result)).toContain("overview");
    }
  });

  it("billing and profile are always unlocked for every free role", () => {
    const roles = ["buyer", "seller", "agent", "developer", "professional", "investor", "institutional"] as const;
    for (const role of roles) {
      const result = getNavItemsForBioType(null, role, false);
      const free = unlockedKeys(result);
      expect(free).toContain("billing");
      expect(free).toContain("profile");
      expect(free).toContain("settings");
    }
  });
});
