import React from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, expect, it, vi } from "vitest";
import {
  resetIdentityQueryStateForTests,
  transitionQueryAuthorization,
  transitionQueryIdentity,
} from "@/lib/identityQueryBoundary";

const state = vi.hoisted(() => ({ user: { id: "owner" } as { id: string } | null, rpc: vi.fn() }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: state.user }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: state.rpc } }));
import { useMyListings, useManageableListingSummary } from "@/hooks/useListings";

type Pending = { name: string; signal?: AbortSignal; resolve: (value: unknown) => void };
let pending: Pending[];
beforeEach(() => {
  resetIdentityQueryStateForTests();
  state.user = { id: "owner" };
  pending = [];
  state.rpc.mockReset().mockImplementation((name: string) => {
    let resolve!: Pending["resolve"];
    const promise = new Promise((done) => { resolve = done; });
    const request: Pending = { name, resolve };
    pending.push(request);
    return Object.assign(promise, { abortSignal(signal: AbortSignal) { request.signal = signal; return this; } });
  });
});

function harness() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  transitionQueryIdentity(client, "owner");
  transitionQueryAuthorization(client, "owner", "member");
  const hook = renderHook(() => ({ listings: useMyListings(), summary: useManageableListingSummary() }), {
    wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  });
  return { client, ...hook };
}
function resolveActor(requests: Pending[], actor: string) {
  for (const request of requests) request.resolve({ error: null, data: request.name.endsWith("_page")
    ? [{ data: [{ id: `${actor}-listing`, title: actor }], total_count: 1, next_created_at: null, next_id: null }]
    : { totalListings: 1, bestListing: { id: `${actor}-listing`, title: actor, viewsCount: 0 } } });
}

it("cancels an in-flight owner page and prevents late page/summary data entering the new session", async () => {
  const { client, result, rerender, unmount } = harness();
  await waitFor(() => expect(pending).toHaveLength(2));
  const old = [...pending];
  act(() => { transitionQueryIdentity(client, "outsider"); state.user = { id: "outsider" }; });
  rerender();
  expect(old.find((r) => r.name.endsWith("_page"))?.signal?.aborted).toBe(true);
  expect(result.current.listings.data).toEqual([]);
  expect(result.current.summary.data).toBeUndefined();
  await waitFor(() => expect(pending).toHaveLength(4));
  await act(async () => resolveActor(pending.slice(2), "outsider"));
  await waitFor(() => expect(result.current.listings.data[0]?.id).toBe("outsider-listing"));
  await act(async () => resolveActor(old, "owner"));
  expect(result.current.listings.data.map((row) => row.id)).toEqual(["outsider-listing"]);
  expect(result.current.summary.data?.bestListing?.id).toBe("outsider-listing");
  expect(client.getQueryData(["manageable-listings", "owner"])).toBeUndefined();
  expect(client.getQueryData(["manageable-listing-summary", "owner"])).toBeUndefined();
  unmount(); client.clear();
});

it("purges same-user cached organization authority and rejects the old response after fingerprint change", async () => {
  const { client, result, rerender, unmount } = harness();
  await waitFor(() => expect(pending).toHaveLength(2));
  const old = [...pending];
  act(() => { transitionQueryAuthorization(client, "owner", "viewer"); });
  rerender();
  await waitFor(() => expect(pending).toHaveLength(4));
  expect(old[0].signal?.aborted).toBe(true);
  await act(async () => resolveActor(pending.slice(2), "viewer"));
  await waitFor(() => expect(result.current.listings.data[0]?.id).toBe("viewer-listing"));
  await act(async () => resolveActor(old, "old-member"));
  expect(result.current.listings.data[0]?.id).toBe("viewer-listing");
  expect(result.current.summary.data?.bestListing?.id).toBe("viewer-listing");
  unmount(); client.clear();
});

it("sign-out removes private inventory while keeping a public query", async () => {
  const { client, result, rerender, unmount } = harness();
  client.setQueryData(["public", "listing"], { id: "public" });
  await act(async () => resolveActor([...pending], "owner"));
  await waitFor(() => expect(result.current.listings.data).toHaveLength(1));
  act(() => { transitionQueryIdentity(client, null); state.user = null; });
  rerender();
  expect(result.current.listings.data).toEqual([]);
  expect(result.current.summary.data).toBeUndefined();
  expect(client.getQueryData(["public", "listing"])).toEqual({ id: "public" });
  unmount(); client.clear();
});
