import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  invoke: vi.fn(),
  getUser: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: unknown[]) => mocks.from(...args),
    rpc: (...args: unknown[]) => mocks.rpc(...args),
    functions: { invoke: (...args: unknown[]) => mocks.invoke(...args) },
    auth: { getUser: (...args: unknown[]) => mocks.getUser(...args) },
  },
}));

vi.mock("sonner", () => ({ toast: mocks.toast }));

import AdminPanel from "@/components/AdminPanel";

type RowMap = Record<string, unknown[] | null>;
type ErrorMap = Record<string, Error | null>;

let rows: RowMap = {};
let errors: ErrorMap = {};
let throwingTables = new Set<string>();

function queryFor(table: string) {
  if (throwingTables.has(table)) throw new Error(`${table} unavailable`);
  const query: Record<string, unknown> = {};
  query.select = vi.fn(() => query);
  query.order = vi.fn(() => query);
  query.limit = vi.fn(() => query);
  query.eq = vi.fn(() => query);
  query.in = vi.fn(() => query);
  query.neq = vi.fn(() => query);
  const data = Object.prototype.hasOwnProperty.call(rows, table) ? rows[table] : [];
  query.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
    Promise.resolve({ data, error: errors[table] ?? null }).then(resolve, reject);
  return query;
}

function renderPanel() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  const view = render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <QueryClientProvider client={client}>
        <AdminPanel />
      </QueryClientProvider>
    </MemoryRouter>,
  );
  return { client, ...view };
}

function openAdvanced() {
  fireEvent.click(screen.getByRole("button", { name: /Advanced:/i }));
}

beforeEach(() => {
  rows = {
    sync_log: [],
    listing_management_catalogue: [],
    firesale_requests: [],
  };
  errors = {};
  throwingTables = new Set();
  mocks.from.mockReset();
  mocks.from.mockImplementation((table: string) => queryFor(table));
  mocks.rpc.mockReset();
  mocks.rpc.mockImplementation((fn: string) =>
    queryFor(fn === "get_listing_management_catalogue" ? "listing_management_catalogue" : fn));
  mocks.getUser.mockReset();
  mocks.getUser.mockResolvedValue({ data: { user: { id: "admin-1" } }, error: null });
  mocks.invoke.mockReset();
  mocks.invoke.mockResolvedValue({ data: { osReachable: true }, error: null });
  mocks.toast.success.mockReset();
  mocks.toast.error.mockReset();
  mocks.toast.info.mockReset();
});

describe("AdminPanel branch coverage", () => {
  it("accepts either diagnostic success shape and renders all sync log states", async () => {
    rows.sync_log = [
      { id: "success", direction: "os_to_hub", entity_type: "auction", status: "success", records_affected: 2, error_message: null, created_at: "2026-07-13T10:00:00Z" },
      { id: "error", direction: "hub_to_os", entity_type: "listing", status: "error", records_affected: 0, error_message: "Rejected", created_at: "2026-07-13T09:00:00Z" },
      { id: "pending", direction: "other", entity_type: "job", status: "pending", records_affected: null, error_message: null, created_at: "2026-07-13T08:00:00Z" },
    ];
    mocks.invoke.mockResolvedValue({ data: { status: "ok" }, error: null });

    renderPanel();

    expect(await screen.findByText("Connected")).toBeInTheDocument();
    expect(screen.getByText(/Last sync:/i)).toBeInTheDocument();
    expect(screen.getByText("2 records")).toBeInTheDocument();
    expect(screen.getByText("Rejected")).toBeInTheDocument();
    expect(screen.getByText("pending")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^OS/i }));
    expect(screen.getByText("2 records")).toBeInTheDocument();
    expect(screen.queryByText("Rejected")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^All$/i }));
    expect(screen.getByText("Rejected")).toBeInTheDocument();
  });

  it("fails status checks safely when database and diagnostic clients throw", async () => {
    throwingTables.add("sync_log");
    mocks.invoke.mockRejectedValue(new Error("network down"));

    renderPanel();

    expect(await screen.findByText("Not connected")).toBeInTheDocument();
    expect(screen.getByText("Error")).toBeInTheDocument();
    expect(screen.getByText(/MAIPROP_OS_PASSWORD/i)).toBeInTheDocument();
  });

  it("reports pull counts including partial errors and exposes pull failures", async () => {
    mocks.invoke.mockImplementation((name: string) => {
      if (name === "full-sync-from-os") {
        return Promise.resolve({ data: { sync: { auctions: { imported: 3, updated: 2, errors: 1 } } }, error: null });
      }
      return Promise.resolve({ data: { osReachable: true }, error: null });
    });
    const first = renderPanel();
    fireEvent.click(await screen.findByRole("button", { name: /Pull auctions/i }));
    await waitFor(() => expect(mocks.toast.success).toHaveBeenCalledWith(expect.stringMatching(/3 new.*2 updated.*1 errors/i)));

    first.unmount();
    mocks.invoke.mockImplementation((name: string) =>
      Promise.resolve(name === "full-sync-from-os"
        ? { data: null, error: new Error("pull denied") }
        : { data: { osReachable: true }, error: null }),
    );
    renderPanel();
    fireEvent.click(await screen.findByRole("button", { name: /Pull auctions/i }));
    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith("Pull failed: pull denied"));
  });

  it("handles listing and firesale success, skipped credentials, and failures", async () => {
    rows.listing_management_catalogue = [{ id: "listing-1", title: null, city: "Athens", status: "active" }];
    rows.firesale_requests = [{ id: "fire-1", address: null, city: "Piraeus", status: "pending" }];
    let listingCalls = 0;
    let fireCalls = 0;
    mocks.invoke.mockImplementation((name: string) => {
      if (name === "sync-to-os") {
        listingCalls += 1;
        return Promise.resolve(listingCalls === 1
          ? { data: { status: "ok" }, error: null }
          : { data: null, error: new Error("listing denied") });
      }
      if (name === "sync-firesale-to-os") {
        fireCalls += 1;
        return Promise.resolve(fireCalls === 1
          ? { data: { status: "skipped" }, error: null }
          : { data: null, error: new Error("firesale denied") });
      }
      return Promise.resolve({ data: { osReachable: true }, error: null });
    });

    renderPanel();
    expect(await screen.findByText("Athens")).toBeInTheDocument();
    expect(screen.getByText("Piraeus")).toBeInTheDocument();
    const pushButtons = screen.getAllByRole("button", { name: /Push/i });
    fireEvent.click(pushButtons[0]);
    await waitFor(() => expect(mocks.toast.success).toHaveBeenCalledWith("Listing pushed to maiProp OS."));
    fireEvent.click(pushButtons[1]);
    await waitFor(() => expect(mocks.toast.info).toHaveBeenCalledWith("OS credentials not configured."));

    fireEvent.click(pushButtons[0]);
    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith("Push failed: listing denied"));
    fireEvent.click(pushButtons[1]);
    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith("Firesale push failed: firesale denied"));
  });

  it("does not query an admin's listing inventory when no authenticated user exists", async () => {
    rows.listing_management_catalogue = [{ id: "should-not-show", title: "Private row", city: "Athens", status: "active" }];
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });

    renderPanel();

    expect(await screen.findByText("No active listings.")).toBeInTheDocument();
    expect(screen.queryByText("Private row")).not.toBeInTheDocument();
  });

  it("runs batched full sync, clamps limits, and reports replace variants", async () => {
    let fullSyncCalls = 0;
    let replaceCalls = 0;
    mocks.invoke.mockImplementation((name: string, options?: { body?: Record<string, unknown> }) => {
      if (name !== "full-sync-from-os") return Promise.resolve({ data: { osReachable: true }, error: null });
      if (options?.body?.replaceAll) {
        replaceCalls += 1;
        return Promise.resolve(replaceCalls === 1
          ? { data: { sync: { auctions: { replaced: 8, imported: 3, updated: 2 } } }, error: null }
          : { data: { sync: { auctions: {} } }, error: null });
      }
      fullSyncCalls += 1;
      return Promise.resolve({
        data: { sync: { auctions: { imported: fullSyncCalls, updated: 1, errors: 0, pages: fullSyncCalls === 1 ? 10 : 2 } } },
        error: null,
      });
    });

    renderPanel();
    openAdvanced();
    const inputs = screen.getAllByRole("spinbutton");
    fireEvent.change(inputs[0], { target: { value: "0" } });
    fireEvent.change(inputs[1], { target: { value: "12" } });
    expect(inputs[0]).toHaveValue(1);

    fireEvent.click(screen.getByRole("button", { name: /Full sync \(OS/i }));
    await waitFor(() => expect(mocks.toast.success).toHaveBeenCalledWith(expect.stringMatching(/Full sync: 3 new.*2 updated/)));
    expect(fullSyncCalls).toBe(2);

    fireEvent.click(screen.getByRole("button", { name: /Replace all auctions/i }));
    await waitFor(() => expect(mocks.toast.success).toHaveBeenCalledWith(expect.stringMatching(/Replaced 8.*3 new.*2 updated/i)));
    fireEvent.click(screen.getByRole("button", { name: /Replace all auctions/i }));
    await waitFor(() => expect(mocks.toast.success).toHaveBeenCalledWith("Replace & sync done."));
  });

  it("clears progress and reports full-sync and replace failures", async () => {
    let syncCalls = 0;
    mocks.invoke.mockImplementation((name: string, options?: { body?: Record<string, unknown> }) => {
      if (name !== "full-sync-from-os") return Promise.resolve({ data: { osReachable: true }, error: null });
      syncCalls += 1;
      return Promise.resolve(options?.body?.replaceAll
        ? { data: null, error: new Error("replace blocked") }
        : { data: null, error: new Error("sync blocked") });
    });

    renderPanel();
    openAdvanced();
    fireEvent.click(screen.getByRole("button", { name: /Full sync \(OS/i }));
    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith("Full sync failed: sync blocked"));
    fireEvent.click(screen.getByRole("button", { name: /Replace all auctions/i }));
    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith("Replace failed: replace blocked"));
    expect(syncCalls).toBe(2);
  });

  it("tests edge functions with success, returned errors, and thrown non-Error values", async () => {
    mocks.invoke.mockImplementation((name: string) => {
      if (name === "poll-os-auctions") return Promise.resolve({ data: { count: 2 }, error: null });
      if (name === "sync-to-os") return Promise.resolve({ data: null, error: new Error("remote error") });
      if (name === "sync-firesale-to-os") return Promise.reject("socket closed");
      return Promise.resolve({ data: { osReachable: true }, error: null });
    });

    renderPanel();
    openAdvanced();
    const poll = screen.getByText("poll-os-auctions").closest("div")!;
    fireEvent.click(within(poll).getByRole("button"));
    expect(await within(poll).findByText("OK")).toBeInTheDocument();

    const sync = screen.getByText("sync-to-os").closest("div")!;
    fireEvent.click(within(sync).getByRole("button"));
    expect(await within(sync).findByText(/remote error/i)).toBeInTheDocument();

    const fire = screen.getByText("sync-firesale-to-os").closest("div")!;
    fireEvent.click(within(fire).getByRole("button"));
    expect(await within(fire).findByText("error")).toBeInTheDocument();
  });

  it("uses empty defaults when database and OS responses omit optional payloads", async () => {
    rows.sync_log = null;
    rows.listing_management_catalogue = null;
    rows.firesale_requests = null;
    mocks.invoke.mockImplementation((name: string, options?: { body?: Record<string, unknown> }) => {
      if (name === "os-diagnose") return Promise.resolve({ data: { osReachable: false }, error: null });
      if (name === "full-sync-from-os") {
        if (options?.body?.replaceAll) return Promise.resolve({ data: { sync: { auctions: { replaced: 1 } } }, error: null });
        return Promise.resolve({ data: null, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });

    renderPanel();
    expect(await screen.findByText("No sync events yet.")).toBeInTheDocument();
    expect(screen.getByText("No active listings.")).toBeInTheDocument();
    expect(screen.getByText("No pending firesales.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Pull auctions/i }));
    await waitFor(() => expect(mocks.toast.success).toHaveBeenCalledWith(expect.stringMatching(/Pull: 0 new.*0 updated/)));

    openAdvanced();
    const inputs = screen.getAllByRole("spinbutton");
    fireEvent.change(inputs[1], { target: { value: "" } });
    expect(inputs[1]).toHaveValue(1);
    fireEvent.click(screen.getByRole("button", { name: /Full sync \(OS/i }));
    await waitFor(() => expect(mocks.toast.success).toHaveBeenCalledWith(expect.stringMatching(/Full sync: 0 new.*0 updated/)));
    fireEvent.click(screen.getByRole("button", { name: /Replace all auctions/i }));
    await waitFor(() => expect(mocks.toast.success).toHaveBeenCalledWith(expect.stringMatching(/Replaced 1.*0 new.*0 updated/)));
  });

  it("surfaces the pending state for pull, listing, and firesale mutations", async () => {
    rows.listing_management_catalogue = [{ id: "listing-1", title: "Pending Listing", city: "Athens", status: "active" }];
    rows.firesale_requests = [{ id: "fire-1", address: "Pending Fire", city: "Athens", status: "pending" }];
    const resolvers: Array<(value: { data: { status: string }; error: null }) => void> = [];
    mocks.invoke.mockImplementation((name: string) => {
      if (name === "os-diagnose") return Promise.resolve({ data: { osReachable: true }, error: null });
      return new Promise((resolve) => resolvers.push(resolve));
    });

    renderPanel();
    const pull = await screen.findByRole("button", { name: /Pull auctions/i });
    fireEvent.click(pull);
    await waitFor(() => expect(screen.getByRole("button", { name: /Pulling/i })).toBeDisabled());
    resolvers.shift()!({ data: { status: "ok" }, error: null });
    await waitFor(() => expect(screen.getByRole("button", { name: /Pull auctions/i })).toBeEnabled());

    const listingPush = screen.getAllByRole("button", { name: /Push/i })[0];
    fireEvent.click(listingPush);
    await waitFor(() => expect(listingPush).toBeDisabled());
    resolvers.shift()!({ data: { status: "ok" }, error: null });
    await waitFor(() => expect(listingPush).toBeEnabled());

    const firePush = screen.getAllByRole("button", { name: /Push/i })[1];
    fireEvent.click(firePush);
    await waitFor(() => expect(firePush).toBeDisabled());
    resolvers.shift()!({ data: { status: "ok" }, error: null });
    await waitFor(() => expect(firePush).toBeEnabled());
  });

  it("handles returned sync-log errors and thrown Error messages in the function tester", async () => {
    errors.sync_log = new Error("log denied");
    let diagnoseCalls = 0;
    mocks.invoke.mockImplementation((name: string) => {
      if (name === "os-diagnose") {
        diagnoseCalls += 1;
        if (diagnoseCalls === 1) return Promise.resolve({ data: { status: "ok" }, error: null });
        return Promise.reject(new Error("diagnostic crashed"));
      }
      return Promise.resolve({ data: {}, error: null });
    });

    renderPanel();
    expect(await screen.findByText("Error")).toBeInTheDocument();
    openAdvanced();
    const diagnostic = screen.getByText("os-diagnose").closest("div")!;
    fireEvent.click(within(diagnostic).getByRole("button"));
    expect(await within(diagnostic).findByText(/diagnostic crashed/i)).toBeInTheDocument();
  });
});
