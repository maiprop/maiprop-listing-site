import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  ProCardItem,
  StatusBadge,
  VerificationModal,
  categoryIcon,
  initials,
  pendingSince,
  type ProCard,
} from "@/components/admin/ProVerificationComponents";
import { renderWithProviders } from "@/test/utils";

const NOW = new Date("2026-05-16T09:00:00Z");

const makePro = (overrides: Partial<ProCard> = {}): ProCard => {
  return {
    id: "pro-1",
    display_name: "Maria Consultant",
    category: "lawyer",
    title: "Real Estate Lawyer",
    avatar_url: null,
    created_at: "2026-05-15T09:00:00Z",
    license_number: "LAW-123",
    specialties: ["Contracts", "Title Search", "Auctions", "Permits"],
    status: "pending",
    ...overrides,
  };
};

describe("ProVerificationComponents helpers", () => {
  it("normalizes initials and pending age labels", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);

    expect(initials("Maria Elena Consultant")).toBe("ME");
    expect(pendingSince("2026-05-16T08:30:00Z")).toBe("Today");
    expect(pendingSince("2026-05-15T08:30:00Z")).toBe("1d ago");
    expect(pendingSince("2026-05-12T08:30:00Z")).toBe("4d ago");

    vi.useRealTimers();
  });

  it("renders category icons and status badges for all moderation states", () => {
    expect(categoryIcon("architect")).toBeTruthy();
    expect(categoryIcon("lawyer")).toBeTruthy();
    expect(categoryIcon("notary")).toBeTruthy();
    expect(categoryIcon("surveyor")).toBeTruthy();

    const { rerender } = renderWithProviders(<StatusBadge status="pending" />);
    expect(screen.getByText("Pending")).toBeInTheDocument();

    rerender(<StatusBadge status="verified" />);
    expect(screen.getByText("Verified")).toBeInTheDocument();

    rerender(<StatusBadge status="rejected" />);
    expect(screen.getByText("Rejected")).toBeInTheDocument();
  });
});

describe("ProCardItem", () => {
  it("shows pending professionals with truncated specializations and opens review", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const onOpenModal = vi.fn();
    const pro = makePro();

    renderWithProviders(<ProCardItem pro={pro} onOpenModal={onOpenModal} />);

    expect(screen.getByText("Maria Consultant")).toBeInTheDocument();
    expect(screen.getByText("+1")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Review Documents/i }));
    expect(onOpenModal).toHaveBeenCalledWith(pro);

    vi.useRealTimers();
  });

  it("shows verified and rejected terminal states without a review button", () => {
    const { rerender } = renderWithProviders(
      <ProCardItem
        pro={makePro({ status: "verified", verified_at: "2026-05-16T08:00:00Z" })}
        onOpenModal={vi.fn()}
      />,
    );

    expect(screen.getAllByText(/Verified/).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /Review Documents/i })).not.toBeInTheDocument();

    rerender(
      <ProCardItem
        pro={makePro({ status: "rejected", rejection_reason: "License mismatch" })}
        onOpenModal={vi.fn()}
      />,
    );
    expect(screen.getByText(/Reason:/)).toHaveTextContent("License mismatch");
  });
});

describe("VerificationModal", () => {
  it("requires notes before rejection and passes license/notes to every action", () => {
    const onClose = vi.fn();
    const onApprove = vi.fn();
    const onSaveNote = vi.fn();
    const onReject = vi.fn();

    renderWithProviders(
      <VerificationModal
        pro={makePro()}
        onClose={onClose}
        onApprove={onApprove}
        onSaveNote={onSaveNote}
        onReject={onReject}
      />,
    );

    expect(screen.getByRole("button", { name: /Reject/i })).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("e.g. ARK-2019-4521"), {
      target: { value: "LAW-999" },
    });
    fireEvent.change(screen.getByPlaceholderText(/Internal review note/i), {
      target: { value: "Documents verified" },
    });

    fireEvent.click(screen.getByRole("button", { name: /Approve & Verify/i }));
    expect(onApprove).toHaveBeenCalledWith("pro-1", "LAW-999", "Documents verified");

    expect(screen.getByText(/Saving this note keeps it internal/i)).toBeInTheDocument();
    expect(screen.getByText(/Rejecting shares it with the applicant as the rejection reason/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Save Internal Note/i }));
    expect(onSaveNote).toHaveBeenCalledWith("pro-1", "Documents verified");

    fireEvent.click(screen.getByRole("button", { name: /Reject/i }));
    expect(onReject).toHaveBeenCalledWith("pro-1", "Documents verified");

    fireEvent.click(screen.getAllByRole("button")[0]);
    expect(onClose).toHaveBeenCalled();
  });
});
