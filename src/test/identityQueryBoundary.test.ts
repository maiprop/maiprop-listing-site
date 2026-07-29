import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it } from "vitest";

import {
  accountQueryKey,
  captureIdentityEpoch,
  isPublicQueryKey,
  isCurrentIdentityEpoch,
  resetIdentityQueryStateForTests,
  transitionQueryAuthorization,
  transitionQueryIdentity,
} from "@/lib/identityQueryBoundary";

const createClient = () => new QueryClient({
  defaultOptions: {
    queries: { retry: false },
  },
});

describe("identity query boundary", () => {
  beforeEach(() => {
    resetIdentityQueryStateForTests();
  });

  it("removes private account data while preserving public catalogue caches", () => {
    const client = createClient();
    const publicListingsKey = [
      "listings-paginated",
      { listing_type: "sale" },
      { publicScope: true },
    ] as const;
    const publicHomepageKey = ["homepage-featured"] as const;
    const billingKey = accountQueryKey("account-a", "billing-info");
    const projectKey = accountQueryKey("account-a", "project", "project-a");

    client.setQueryData(publicListingsKey, { pages: [{ data: ["listing-a"] }] });
    client.setQueryData(publicHomepageKey, ["listing-a"]);
    client.setQueryData(billingKey, { invoices: ["invoice-a"] });
    client.setQueryData(projectKey, { id: "project-a", leads: ["lead-a"] });

    transitionQueryIdentity(client, "account-a");

    expect(client.getQueryData(publicListingsKey)).toEqual({
      pages: [{ data: ["listing-a"] }],
    });
    expect(client.getQueryData(publicHomepageKey)).toEqual(["listing-a"]);
    expect(client.getQueryData(billingKey)).toBeUndefined();
    expect(client.getQueryData(projectKey)).toBeUndefined();
  });

  it("uses account-specific keys for the same private resource", () => {
    expect(accountQueryKey("account-a", "billing-info")).not.toEqual(
      accountQueryKey("account-b", "billing-info"),
    );
  });

  it("never classifies investor-only past deals as public cache data", () => {
    expect(isPublicQueryKey(["past-deals", "auction-1"])).toBe(false);
  });

  it("never classifies the current user's professional record as public cache data", () => {
    expect(isPublicQueryKey(["professional-by-user", "account-a"])).toBe(false);
  });

  it("rejects callbacks captured before an identity change", () => {
    const client = createClient();

    transitionQueryIdentity(client, "account-a");
    const accountAEpoch = captureIdentityEpoch();
    expect(isCurrentIdentityEpoch(accountAEpoch)).toBe(true);

    transitionQueryIdentity(client, "account-b");

    expect(isCurrentIdentityEpoch(accountAEpoch)).toBe(false);
    expect(isCurrentIdentityEpoch(captureIdentityEpoch())).toBe(true);
  });

  it("does not advance the epoch when the identity is unchanged", () => {
    const client = createClient();

    transitionQueryIdentity(client, "account-a");
    const epoch = captureIdentityEpoch();
    transitionQueryIdentity(client, "account-a");

    expect(captureIdentityEpoch()).toBe(epoch);
  });

  it("purges private data when authorization changes for the same identity", () => {
    const client = createClient();
    const publicKey = ["homepage-featured"] as const;
    const privateKey = accountQueryKey("account-a", "projects");

    transitionQueryIdentity(client, "account-a");
    transitionQueryAuthorization(client, "account-a", "buyer:no-org");
    client.setQueryData(publicKey, ["listing-a"]);
    client.setQueryData(privateKey, ["project-a"]);
    const buyerEpoch = captureIdentityEpoch();

    transitionQueryAuthorization(client, "account-a", "developer:org-a");

    expect(captureIdentityEpoch()).toBeGreaterThan(buyerEpoch);
    expect(client.getQueryData(privateKey)).toBeUndefined();
    expect(client.getQueryData(publicKey)).toEqual(["listing-a"]);
  });

  it("does not purge again when the authorization fingerprint is unchanged", () => {
    const client = createClient();

    transitionQueryIdentity(client, "account-a");
    transitionQueryAuthorization(client, "account-a", "developer:org-a");
    const epoch = captureIdentityEpoch();
    const privateKey = accountQueryKey("account-a", "projects");
    client.setQueryData(privateKey, ["project-a"]);

    transitionQueryAuthorization(client, "account-a", "developer:org-a");

    expect(captureIdentityEpoch()).toBe(epoch);
    expect(client.getQueryData(privateKey)).toEqual(["project-a"]);
  });
});
