import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DoneScreen } from "@/components/onboarding/DoneScreen";
import { participants } from "@/lib/onboardingConfig";

const color = {
  bg: "bg-blue-500/10",
  border: "border-blue-500/20",
  text: "text-blue-500",
  iconBg: "bg-blue-500/10",
};

const renderDoneScreen = (navigate = vi.fn(), autoRedirect?: boolean) => render(
  <DoneScreen
    selected={participants.find((p) => p.id === "seller") ?? null}
    selectedColor={color}
    SelectedIcon={() => <span data-testid="done-icon" />}
    isPro={false}
    proCategory=""
    selectedServicesCount={0}
    actions={{
      primary: { label: "Go to Seller Dashboard", href: "/dashboard" },
      subtitle: "Your seller account is ready.",
    }}
    navigate={navigate}
    autoRedirect={autoRedirect}
  />,
);

describe("DoneScreen", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not auto-redirect when a role switch disables automatic navigation", () => {
    vi.useFakeTimers();
    const navigate = vi.fn();

    renderDoneScreen(navigate, false);

    act(() => {
      vi.advanceTimersByTime(5_000);
    });

    expect(navigate).not.toHaveBeenCalled();
    expect(screen.queryByText(/Redirecting in/i)).not.toBeInTheDocument();
  });

  it("always lets the user continue manually", async () => {
    const navigate = vi.fn();

    renderDoneScreen(navigate);

    fireEvent.click(screen.getByRole("button", { name: /Go to Seller Dashboard/i }));

    expect(navigate).toHaveBeenCalledWith("/dashboard");
  });
});
