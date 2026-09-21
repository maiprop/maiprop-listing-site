import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OSDashboardMockup } from "@/components/index/OSDashboardMockup";
import { OSSection } from "@/components/index/OSSection";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("OS homepage illustration", () => {
  it("visibly labels the illustration as sample data, softens unsupported claims, and preserves OS navigation", () => {
    render(<OSSection />);

    expect(screen.getByText("Demo · Sample data")).toBeInTheDocument();
    expect(screen.getByText("Sample market data")).toBeInTheDocument();
    expect(screen.queryByText("Live Market")).not.toBeInTheDocument();
    expect(screen.queryByText("LIVE")).not.toBeInTheDocument();

    expect(screen.queryByText(/Every data on mAI prop/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/every Greek region/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/3,200\+ monthly/i)).not.toBeInTheDocument();
    expect(screen.getByText(/supported coverage areas/i)).toBeInTheDocument();

    expect(screen.getByRole("link", { name: /Open mAI Prop OS/i })).toHaveAttribute(
      "href",
      "https://os.maiprop.co",
    );
    expect(screen.getByRole("link", { name: "Open os.maiprop.co in new tab" })).toHaveAttribute(
      "href",
      "https://os.maiprop.co",
    );
  });

  it("keeps illustrative values stable when timers advance", () => {
    vi.useFakeTimers();
    const { container } = render(<OSDashboardMockup />);
    vi.spyOn(Math, "random").mockReturnValue(0);
    const initialText = container.textContent;

    act(() => {
      vi.advanceTimersByTime(10_000);
    });

    expect(container.textContent).toBe(initialText);
  });
});
