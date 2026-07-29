import { beforeEach, describe, expect, it, vi } from "vitest";

const rpcMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: unknown[]) => rpcMock(...args) },
}));

import {
  createListingForUser,
  deleteListingForUser,
  updateListingForUser,
} from "@/hooks/listingManagementBoundary";

describe("listing management RPC client", () => {
  beforeEach(() => {
    rpcMock.mockReset();
    rpcMock.mockResolvedValue({ data: { id: "listing-1" }, error: null });
  });

  it("strips ownership, promotion, analytics and project fields before create", async () => {
    await createListingForUser({
      title: "Scoped listing",
      city: "Athens",
      price: 250000,
      sqm: 80,
      property_type: "apartment",
      listing_type: "sale",
      owner_id: "attacker",
      organization_id: "org-attacker",
      is_featured: true,
      priority_placement: 999,
      views_count: 99999,
      project_id: "project-attacker",
    } as never);

    expect(rpcMock).toHaveBeenCalledWith("create_listing_for_user", {
      p_payload: expect.objectContaining({
        title: "Scoped listing",
        city: "Athens",
        price: 250000,
        sqm: 80,
      }),
    });
    const payload = rpcMock.mock.calls[0][1].p_payload;
    expect(payload).not.toHaveProperty("owner_id");
    expect(payload).not.toHaveProperty("organization_id");
    expect(payload).not.toHaveProperty("is_featured");
    expect(payload).not.toHaveProperty("priority_placement");
    expect(payload).not.toHaveProperty("views_count");
    expect(payload).not.toHaveProperty("project_id");
  });

  it("passes organization ownership separately from the client-writable payload", async () => {
    await createListingForUser({
      title: "Organization listing",
      city: "Athens",
      price: 320000,
      sqm: 92,
      property_type: "apartment",
      listing_type: "sale",
      organization_id: "forged-inside-payload",
    } as never, "organization-1");

    expect(rpcMock).toHaveBeenCalledWith("create_listing_for_user", {
      p_organization_id: "organization-1",
      p_payload: expect.not.objectContaining({
        organization_id: expect.anything(),
      }),
    });
  });

  it("keeps personal listing creation backward compatible with a null organization", async () => {
    await createListingForUser({
      title: "Personal listing",
      city: "Athens",
      price: 210000,
      sqm: 70,
      property_type: "apartment",
      listing_type: "sale",
    });

    expect(rpcMock).toHaveBeenCalledWith("create_listing_for_user", {
      p_payload: expect.any(Object),
    });
  });

  it("drops undefined values and system fields before update", async () => {
    await updateListingForUser("listing-1", {
      title: "Updated",
      description: undefined,
      featured_until: "2099-01-01T00:00:00Z",
      updated_at: "2099-01-01T00:00:00Z",
    });

    expect(rpcMock).toHaveBeenCalledWith("update_listing_for_user", {
      p_id: "listing-1",
      p_updates: { title: "Updated" },
    });
  });

  it("uses the delete RPC and propagates RPC failures", async () => {
    await deleteListingForUser("listing-1");
    expect(rpcMock).toHaveBeenCalledWith("delete_listing_for_user", {
      p_id: "listing-1",
    });

    rpcMock.mockResolvedValueOnce({ data: null, error: new Error("denied") });
    await expect(deleteListingForUser("listing-2")).rejects.toThrow("denied");
  });
});
