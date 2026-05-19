import { describe, expect, it } from "vitest";
import { stripSupervisorTestMarkers } from "@/lib/displayText";

describe("display text sanitizers", () => {
  it("removes supervisor repair markers without touching normal profile copy", () => {
    expect(stripSupervisorTestMarkers("Professional profile repaired by supervisor-1779128352056.")).toBe("");
    expect(stripSupervisorTestMarkers("Review contracts. Consultation service repaired by supervisor-1779128352056.")).toBe("Review contracts.");
    expect(stripSupervisorTestMarkers("Title checks and Golden Visa support.")).toBe("Title checks and Golden Visa support.");
  });
});
