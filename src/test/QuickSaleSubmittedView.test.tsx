import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QuickSaleSubmittedView } from "@/components/firesale/QuickSaleSubmittedView";
import { renderWithProviders } from "@/test/utils";

const navigateMock = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

describe("QuickSaleSubmittedView", () => {
  it("shows the reference, market estimate, investor distribution guarantees, and reset action", () => {
    const onReset = vi.fn();

    renderWithProviders(
      <QuickSaleSubmittedView
        requestId="abc12345-quick-sale"
        aiEstimate={250000}
        onReset={onReset}
      />,
    );

    expect(screen.getByText(/Request Submitted/)).toBeInTheDocument();
    expect(screen.getByText("ABC12345")).toBeInTheDocument();
    expect(screen.getByText("€250,000")).toBeInTheDocument();
    expect(screen.getByText("Market estimate")).toBeInTheDocument();
    expect(screen.queryByText("€263,158")).not.toBeInTheDocument();
    expect(screen.queryByText("~5%")).not.toBeInTheDocument();
    expect(screen.getByText(/Queued for advisor review before investor publication/)).toBeInTheDocument();
    expect(screen.getByText(/not visible to investors until/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Submit another/i }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it("routes sellers to their dashboard tracking view", () => {
    renderWithProviders(
      <QuickSaleSubmittedView requestId={null} aiEstimate={null} onReset={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Track Status/i }));
    expect(navigateMock).toHaveBeenCalledWith("/dashboard");
    expect(screen.queryByText(/Ref:/)).not.toBeInTheDocument();
    expect(screen.getByText("Unavailable")).toBeInTheDocument();
    expect(screen.queryByText("€0")).not.toBeInTheDocument();
  });
});
