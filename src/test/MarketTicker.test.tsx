import { act, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { fetchPublicApiMock } = vi.hoisted(() => ({
  fetchPublicApiMock: vi.fn(),
}));

vi.mock("@/lib/publicApi", () => ({
  fetchPublicApi: (...args: unknown[]) => fetchPublicApiMock(...args),
}));

import { MarketTicker } from "@/components/MarketTicker";

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function createClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Number.POSITIVE_INFINITY },
    },
  });
}

function renderTicker(client = createClient()) {
  return {
    client,
    ...render(
      <QueryClientProvider client={client}>
        <MarketTicker />
      </QueryClientProvider>,
    ),
  };
}

function firstCityRow(city: string) {
  const cityLabel = screen.getAllByText(city)[0];
  const row = cityLabel.closest("[data-market-row]");
  expect(row).not.toBeNull();
  return within(row as HTMLElement);
}

function auctionsFooter() {
  const label = screen.getByText("Active Auctions");
  const footer = label.parentElement?.parentElement;
  expect(footer).not.toBeNull();
  return within(footer as HTMLElement);
}

beforeEach(() => {
  fetchPublicApiMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("MarketTicker", () => {
  it("waits for delayed API observations and distinguishes observed prices, estimates, trends, and a zero count", async () => {
    const prices = deferred<unknown>();
    const auctionCount = deferred<unknown>();
    fetchPublicApiMock.mockImplementation((url: string) =>
      url.includes("price-index") ? prices.promise : auctionCount.promise,
    );

    renderTicker();

    expect(screen.getByText("Market data")).toBeInTheDocument();
    expect(screen.queryByText(/€2[,.]840/)).not.toBeInTheDocument();

    await act(async () => {
      prices.resolve([
        {
          city: "Athens",
          avg_price_per_sqm: 2310,
          listing_count: 8,
          is_live: true,
          trend_change_pct: 1.5,
          trend_up: true,
          trend_is_live: true,
        },
        {
          city: "Thessaloniki",
          avg_price_per_sqm: 1700,
          listing_count: 0,
          is_live: false,
          trend_change_pct: null,
          trend_up: null,
          trend_is_live: false,
        },
      ]);
      auctionCount.resolve(0);
      await Promise.all([prices.promise, auctionCount.promise]);
    });

    await waitFor(() => expect(firstCityRow("Athens").getByText(/€2[,.]310/)).toBeInTheDocument());
    expect(firstCityRow("Athens").getByText("Observed")).toBeInTheDocument();
    expect(firstCityRow("Athens").getByText("▲ 1.5%")).toBeInTheDocument();
    expect(firstCityRow("Thessaloniki").getByText(/€1[,.]700/)).toBeInTheDocument();
    expect(firstCityRow("Thessaloniki").getByText("Estimate")).toBeInTheDocument();
    expect(firstCityRow("Thessaloniki").getByText("Unavailable")).toBeInTheDocument();
    expect(auctionsFooter().getByText("0")).toBeInTheDocument();
    expect(screen.queryByText("LIVE")).not.toBeInTheDocument();
    expect(screen.queryByText("Live Market")).not.toBeInTheDocument();
  });

  it("replaces a displayed observation when the price-index query refetches", async () => {
    const client = createClient();
    client.setQueryData(["price-index"], [
      { city: "Athens", avg_price_per_sqm: 2300, listing_count: 4, is_live: true },
    ]);
    client.setQueryData(["auction-count-today"], 4);
    fetchPublicApiMock.mockImplementation(async (url: string) =>
      url.includes("price-index")
        ? [{ city: "Athens", avg_price_per_sqm: 2410, listing_count: 5, is_live: true }]
        : 4,
    );

    renderTicker(client);
    expect(firstCityRow("Athens").getByText(/€2[,.]300/)).toBeInTheDocument();

    await act(async () => {
      await client.refetchQueries({ queryKey: ["price-index"] });
    });

    await waitFor(() => expect(firstCityRow("Athens").getByText(/€2[,.]410/)).toBeInTheDocument());
    expect(firstCityRow("Athens").queryByText(/€2[,.]300/)).not.toBeInTheDocument();
  });

  it("shows unavailable data for absent or invalid values without static prices, trends, charts, or a fallback count", () => {
    const client = createClient();
    client.setQueryData(["price-index"], [
      {
        city: "Athens",
        avg_price_per_sqm: Number.NaN,
        listing_count: 3,
        is_live: true,
        trend_change_pct: Number.POSITIVE_INFINITY,
        trend_up: true,
        trend_is_live: true,
      },
      {
        city: "Thessaloniki",
        avg_price_per_sqm: 0,
        listing_count: 0,
        is_live: false,
        trend_change_pct: null,
        trend_up: null,
        trend_is_live: false,
      },
    ]);
    client.setQueryData(["auction-count-today"], Number.NaN);

    const { container } = renderTicker(client);

    expect(firstCityRow("Athens").getAllByText("Unavailable")).toHaveLength(2);
    expect(firstCityRow("Thessaloniki").getAllByText("Unavailable")).toHaveLength(2);
    expect(firstCityRow("Mykonos").getAllByText("Unavailable")).toHaveLength(2);
    expect(container.querySelector("svg")).not.toBeInTheDocument();
    expect(container).not.toHaveTextContent("2,840");
    expect(container).not.toHaveTextContent("1,920");
    expect(container).not.toHaveTextContent("▲");
    expect(container).not.toHaveTextContent("▼");
    expect(auctionsFooter().getByText("Unavailable")).toBeInTheDocument();
    expect(auctionsFooter().queryByText("47")).not.toBeInTheDocument();
  });

  it("does not change a sourced price when timers elapse", () => {
    vi.useFakeTimers();
    const client = createClient();
    client.setQueryData(["price-index"], [
      { city: "Athens", avg_price_per_sqm: 2400, listing_count: 7, is_live: true },
    ]);
    client.setQueryData(["auction-count-today"], 1);
    renderTicker(client);
    vi.spyOn(Math, "random").mockReturnValue(0);

    expect(firstCityRow("Athens").getByText(/€2[,.]400/)).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(10_000);
    });

    expect(firstCityRow("Athens").getByText(/€2[,.]400/)).toBeInTheDocument();
  });
});
