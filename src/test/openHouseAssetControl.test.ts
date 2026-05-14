import { describe, expect, it } from "vitest";

import { getOpenHouseApprovalBlockers } from "@/hooks/useOpenHouseAssetControl";

describe("getOpenHouseApprovalBlockers", () => {
  const baseSettings = {
    id: "s1",
    listing_id: "l1",
    timeslots: [{ start: "10:00", end: "10:30", max_visitors: 10 }],
    max_visitors_per_slot: 10,
    max_total_visitors: null,
    broker_required: false,
    require_proof_of_funds: true,
    min_proof_amount: 200000,
    require_investor_declaration: true,
    offer_deadline: null,
    allow_sealed_bids: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  it("flags every missing requirement before approval", () => {
    const blockers = getOpenHouseApprovalBlockers(
      {
        timeslot_index: null,
        id_doc_url: null,
        id_verified_at: null,
        waiver_signed_at: null,
        proof_of_funds_url: null,
        proof_amount: null,
        investor_declaration_signed_at: null,
        mortgage_status: null,
        budget_range: null,
        working_with_agent: null,
      },
      baseSettings,
      350000
    );

    expect(blockers).toContain("Timeslot not selected");
    expect(blockers).toContain("ID verification incomplete");
    expect(blockers).toContain("Waiver not signed");
    expect(blockers).toContain("Proof of funds missing");
    expect(blockers).toContain("Investor declaration not signed");
    expect(blockers).toContain("Mortgage/funds question missing");
    expect(blockers).toContain("Budget range missing");
    expect(blockers).toContain("Agent representation question missing");
  });

  it("accepts a complete registration packet", () => {
    const blockers = getOpenHouseApprovalBlockers(
      {
        timeslot_index: 0,
        id_doc_url: "docs/id.pdf",
        id_verified_at: new Date().toISOString(),
        waiver_signed_at: new Date().toISOString(),
        proof_of_funds_url: "docs/pof.pdf",
        proof_amount: 300000,
        investor_declaration_signed_at: new Date().toISOString(),
        mortgage_status: "cash",
        budget_range: "200k_500k",
        working_with_agent: "no",
      },
      baseSettings,
      350000
    );

    expect(blockers).toEqual([]);
  });
});
