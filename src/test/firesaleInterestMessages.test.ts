import { describe, expect, it } from "vitest";
import { getFiresaleInterestUserMessage } from "@/hooks/useFiresaleInterest";

describe("firesale interest user-facing errors", () => {
  it("maps business RPC errors to actionable dashboard messages", () => {
    expect(getFiresaleInterestUserMessage(new Error("investor_access_required"))).toMatch(
      /Investor dashboard access/i,
    );
    expect(getFiresaleInterestUserMessage(new Error("firesale_deal_not_available"))).toMatch(
      /no longer available/i,
    );
    expect(getFiresaleInterestUserMessage(new Error("active_interest_is_admin_managed"))).toMatch(
      /already being managed/i,
    );
    expect(getFiresaleInterestUserMessage(new Error("invalid_proof_path"))).toMatch(
      /proof of funds/i,
    );
  });
});
