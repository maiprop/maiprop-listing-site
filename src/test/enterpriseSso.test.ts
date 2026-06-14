import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signInWithSSO: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      signInWithSSO: mocks.signInWithSSO,
    },
  },
}));

import {
  parseEnterpriseSsoSignIn,
  signInWithEnterpriseSso,
} from "@/lib/enterpriseSso";

describe("enterprise SSO helper", () => {
  beforeEach(() => {
    mocks.signInWithSSO.mockReset();
  });

  it("normalizes a domain-based SSO request before calling Supabase", async () => {
    mocks.signInWithSSO.mockResolvedValueOnce({
      data: { url: "https://idp.example.com/sso" },
      error: null,
    });

    const result = await signInWithEnterpriseSso({
      domain: " Example.COM ",
      redirectTo: "https://portal.maiprop.co/auth/callback",
    });

    expect(result).toEqual({ url: "https://idp.example.com/sso" });
    expect(mocks.signInWithSSO).toHaveBeenCalledWith({
      domain: "example.com",
      options: {
        redirectTo: "https://portal.maiprop.co/auth/callback",
      },
    });
  });

  it("allows provider-id based SSO for preconfigured enterprise tenants", async () => {
    mocks.signInWithSSO.mockResolvedValueOnce({
      data: { provider: "saml" },
      error: null,
    });

    await signInWithEnterpriseSso({
      providerId: "4e7b2218-0db2-43d1-a051-bfa45d4d50d4",
    });

    expect(mocks.signInWithSSO).toHaveBeenCalledWith({
      providerId: "4e7b2218-0db2-43d1-a051-bfa45d4d50d4",
    });
  });

  it("rejects ambiguous or malformed SSO requests before network calls", () => {
    expect(() => parseEnterpriseSsoSignIn({ domain: "not a domain" })).toThrow("Invalid enterprise SSO");
    expect(() => parseEnterpriseSsoSignIn({ domain: "-bad.example.com" })).toThrow("Invalid enterprise SSO");
    expect(() => parseEnterpriseSsoSignIn({ domain: "bad-.example.com" })).toThrow("Invalid enterprise SSO");
    expect(() =>
      parseEnterpriseSsoSignIn({
        domain: "example.com",
        providerId: "4e7b2218-0db2-43d1-a051-bfa45d4d50d4",
      }),
    ).toThrow("Invalid enterprise SSO");
    expect(mocks.signInWithSSO).not.toHaveBeenCalled();
  });
});
