import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProofOfFundsReviewer } from "@/components/ProofOfFundsReviewer";

const toastSuccessMock = vi.fn();

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
  },
}));

describe("ProofOfFundsReviewer", () => {
  it("reviews proof documents, verifies amounts, rejects submissions, and filters every status", () => {
    render(<ProofOfFundsReviewer />);

    expect(screen.getByText("Awaiting review").previousElementSibling).toHaveTextContent("3");
    expect(screen.getByText(/375\.000\s*€/i)).toBeInTheDocument();
    expect(screen.getByText(/Across 2 verified submissions/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Pending3/i }));
    expect(screen.getByText("Thanasis Georgiou")).toBeInTheDocument();
    expect(screen.queryByText("Anna Konstantinou")).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: /Review/i })[0]);
    fireEvent.click(screen.getByRole("button", { name: /View Document/i }));
    expect(screen.getByText("Submitted by Thanasis Georgiou")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /View Document/i }));
    expect(screen.queryByText("Submitted by Thanasis Georgiou")).not.toBeInTheDocument();

    const amountInput = screen.getByDisplayValue("450000");
    fireEvent.change(amountInput, { target: { value: "" } });
    expect(screen.getByRole("button", { name: /Verify/i })).toBeDisabled();
    fireEvent.change(amountInput, { target: { value: "430000" } });
    fireEvent.click(screen.getByRole("button", { name: /Verify/i }));

    expect(toastSuccessMock).toHaveBeenCalledWith(expect.stringContaining("Thanasis Georgiou"));
    expect(screen.queryByText("Thanasis Georgiou")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Pending2/i })).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: /Review/i })[0]);
    fireEvent.click(screen.getByRole("button", { name: /Reject submission/i }));
    expect(screen.getByRole("button", { name: /Confirm rejection/i })).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText(/Rejection reason/i), {
      target: { value: "Document owner cannot be verified" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Cancel/i }));
    expect(screen.queryByPlaceholderText(/Rejection reason/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Reject submission/i }));
    fireEvent.change(screen.getByPlaceholderText(/Rejection reason/i), {
      target: { value: "Document owner cannot be verified" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Confirm rejection/i }));
    expect(toastSuccessMock).toHaveBeenCalledWith(expect.stringContaining("Petros Alexiou"));

    fireEvent.click(screen.getByRole("button", { name: /Verified3/i }));
    expect(screen.getByText("Thanasis Georgiou")).toBeInTheDocument();
    expect(screen.getByText(/Verified: 430\.000\s*€/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Rejected2/i }));
    expect(screen.getByText("Petros Alexiou")).toBeInTheDocument();
    expect(screen.getByText(/Document owner cannot be verified/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /All6/i }));
    const allPanel = screen.getByText("Thanasis Georgiou").closest(".border-b");
    expect(allPanel).toBeTruthy();
    expect(within(allPanel as HTMLElement).getAllByText(/Verified/i).length).toBeGreaterThan(0);
  });
});
