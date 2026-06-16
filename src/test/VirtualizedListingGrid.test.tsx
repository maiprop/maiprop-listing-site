import { act, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { VirtualizedListingGrid } from "@/components/listings/VirtualizedListingGrid";
import { renderWithProviders } from "@/test/utils";

type ListingGridTestItem = {
  id: string;
  title: string;
};

const ITEMS: ListingGridTestItem[] = Array.from({ length: 20 }, (_, index) => ({
  id: `listing-${index + 1}`,
  title: `Listing ${index + 1}`,
}));

const mockElementClientWidth = (width: number) => {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get: () => width,
  });

  return () => {
    if (descriptor) {
      Object.defineProperty(HTMLElement.prototype, "clientWidth", descriptor);
      return;
    }
    Reflect.deleteProperty(HTMLElement.prototype, "clientWidth");
  };
};

describe("VirtualizedListingGrid", () => {
  it("renders nothing for an empty item set", () => {
    renderWithProviders(
      <VirtualizedListingGrid<ListingGridTestItem>
        items={[]}
        className="grid"
        data-testid="grid"
        renderItem={(item) => <article key={item.id}>{item.title}</article>}
      />,
    );

    expect(screen.queryByTestId("grid")).not.toBeInTheDocument();
  });

  it("renders a bounded window and exposes virtualization counts", () => {
    renderWithProviders(
      <VirtualizedListingGrid
        items={ITEMS}
        className="grid"
        columns={2}
        estimateItemHeight={100}
        gap={10}
        overscanRows={1}
        data-testid="grid"
        renderItem={(item) => <article key={item.id}>{item.title}</article>}
      />,
    );

    const grid = screen.getByTestId("grid");
    expect(grid).toHaveAttribute("data-total-count", "20");
    expect(Number(grid.dataset.virtualizedCount)).toBeGreaterThan(0);
    expect(Number(grid.dataset.virtualizedCount)).toBeLessThanOrEqual(20);
    expect(screen.getByText("Listing 1")).toBeInTheDocument();
  });

  it("passes the absolute item index to renderItem so callers can prioritize visible cards", () => {
    renderWithProviders(
      <VirtualizedListingGrid
        items={ITEMS.slice(0, 4)}
        className="grid"
        columns={2}
        estimateItemHeight={100}
        gap={10}
        overscanRows={1}
        data-testid="grid"
        renderItem={(item, index) => (
          <article key={item.id} data-testid={`item-${index}`}>
            {index}:{item.title}
          </article>
        )}
      />,
    );

    expect(screen.getByTestId("item-0")).toHaveTextContent("0:Listing 1");
    expect(screen.getByTestId("item-3")).toHaveTextContent("3:Listing 4");
  });

  it("uses the measured width for auto columns before settling layout", () => {
    const restoreClientWidth = mockElementClientWidth(1300);

    try {
      renderWithProviders(
        <VirtualizedListingGrid
          items={ITEMS}
          className="grid"
          estimateItemHeight={100}
          gap={10}
          data-testid="grid"
          renderItem={(item) => <article key={item.id}>{item.title}</article>}
        />,
      );

      const grid = screen.getByTestId("grid");
      expect(grid.style.minHeight).toBe("430px");
      expect(grid).toHaveAttribute("data-total-count", "20");
    } finally {
      restoreClientWidth();
    }
  });

  it("recalculates the visible window when a scroll parent moves", () => {
    const scrollParent = document.createElement("div");
    Object.defineProperty(scrollParent, "clientHeight", { configurable: true, value: 120 });
    scrollParent.getBoundingClientRect = () => ({
      bottom: 120,
      height: 120,
      left: 0,
      right: 600,
      top: 0,
      width: 600,
      x: 0,
      y: 0,
      toJSON: () => ({ top: 0, bottom: 400 }),
    });
    const scrollParentRef = { current: scrollParent };

    const { container } = renderWithProviders(
      <VirtualizedListingGrid
        items={ITEMS}
        className="grid"
        columns={1}
        estimateItemHeight={80}
        gap={0}
        overscanRows={0}
        scrollParentRef={scrollParentRef}
        data-testid="grid"
        renderItem={(item) => <article key={item.id}>{item.title}</article>}
      />,
    );

    const root = container.firstElementChild as HTMLElement;
    root.getBoundingClientRect = () => ({
      bottom: -280,
      height: 1600,
      left: 0,
      right: 600,
      top: -400,
      width: 600,
      x: 0,
      y: -400,
      toJSON: () => ({ top: -400, bottom: 0 }),
    });

    act(() => {
      scrollParent.dispatchEvent(new Event("scroll"));
    });

    expect(screen.getByTestId("grid")).toHaveAttribute("data-total-count", "20");
    expect(screen.queryByText("Listing 1")).not.toBeInTheDocument();
    expect(screen.getByText("Listing 6")).toBeInTheDocument();
  });
});
