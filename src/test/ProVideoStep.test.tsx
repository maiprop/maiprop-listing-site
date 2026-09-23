import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { ProVideoStep } from "@/components/onboarding/ProVideoStep";

const props = {
  videoLink: "",
  calendarNotes: "",
  loading: false,
  authLoading: false,
  onVideoLinkChange: vi.fn(),
  onCalendarNotesChange: vi.fn(),
  onSave: vi.fn(),
  onSkip: vi.fn(),
};

describe("ProVideoStep", () => {
  it("links to current professional plans without promising launch enrollment", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    render(<MemoryRouter><ProVideoStep {...props} /></MemoryRouter>);

    const plans = screen.getByRole("link", { name: /View professional plans/i });
    expect(plans).toHaveAttribute("href", "/pricing?audience=professional");
    expect(plans).toHaveAttribute("target", "_blank");
    expect(screen.queryByText(/Coming Soon/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Notify me/i })).not.toBeInTheDocument();
    fireEvent.click(plans);
    expect(setItem).not.toHaveBeenCalledWith("pro_launch_interest", expect.anything());
    setItem.mockRestore();
  });
});
