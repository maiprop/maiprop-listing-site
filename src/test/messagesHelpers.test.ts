/**
 * Unit tests for the pure helpers extracted from src/pages/Messages.tsx.
 * These cover every branch so the page-level coverage gap (FINDING-A in
 * the 2026-04-27 audit) is closed for the testable logic.
 */
import { describe, it, expect } from "vitest";
import { getOtherProfile, getInitials } from "@/lib/messagesHelpers";

const A = { user_id: "user-A", display_name: "Alice", avatar_url: null };
const B = { user_id: "user-B", display_name: "Bob",   avatar_url: null };

describe("getOtherProfile", () => {
  it("returns null when conversation is undefined", () => {
    expect(getOtherProfile(undefined, "user-A")).toBeNull();
  });

  it("returns profile_b when the viewer matches profile_a", () => {
    expect(getOtherProfile({ profile_a: A, profile_b: B }, "user-A")).toEqual(B);
  });

  it("returns profile_a when the viewer matches profile_b (or anyone else)", () => {
    expect(getOtherProfile({ profile_a: A, profile_b: B }, "user-B")).toEqual(A);
    expect(getOtherProfile({ profile_a: A, profile_b: B }, "stranger")).toEqual(A);
  });

  it("returns null when the matching side's counterpart is missing", () => {
    // profile_a matches viewer, but profile_b is absent → null (not undefined).
    expect(getOtherProfile({ profile_a: A }, "user-A")).toBeNull();
    // profile_a missing means the else branch returns profile_a ?? null → null.
    // (Real conversations from useConversations() always have both sides; this
    //  case asserts the defensive fallback so a malformed row never throws.)
    expect(getOtherProfile({ profile_b: B }, "user-A")).toBeNull();
  });

  it("returns null when both sides are missing", () => {
    expect(getOtherProfile({}, "user-A")).toBeNull();
  });
});

describe("getInitials", () => {
  it("returns '?' for empty / falsy input", () => {
    expect(getInitials("")).toBe("?");
  });

  it("returns up to two uppercased initials for a multi-word name", () => {
    expect(getInitials("Alice Bob")).toBe("AB");
    expect(getInitials("alice bob carol")).toBe("AB");
  });

  it("uppercases a single-word name's first letter", () => {
    expect(getInitials("alice")).toBe("A");
  });

  it("ignores empty segments from consecutive whitespace", () => {
    expect(getInitials("Alice  Bob")).toBe("AB");
    expect(getInitials("  Alice")).toBe("A");
  });
});
