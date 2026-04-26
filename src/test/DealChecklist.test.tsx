/**
 * Tests for the `DealChecklist` component. The data layer (useDealChecklist
 * + useUpsertDealChecklist) is fully mocked so we can drive every branch
 * deterministically: defaults, custom items, toggle, add, remove, loading
 * skeleton, no-user fallback.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const { useAuthMock, useChecklistMock, useUpsertMock, mutateMock } = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  useChecklistMock: vi.fn(),
  useUpsertMock: vi.fn(),
  mutateMock: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => useAuthMock() }));
vi.mock("@/hooks/useDealChecklists", () => ({
  useDealChecklist: (...a: unknown[]) => useChecklistMock(...a),
  useUpsertDealChecklist: () => useUpsertMock(),
}));

import { DealChecklist } from "@/components/DealChecklist";

beforeEach(() => {
  useAuthMock.mockReset();
  useChecklistMock.mockReset();
  useUpsertMock.mockReset();
  mutateMock.mockReset();
  useAuthMock.mockReturnValue({ user: { id: "u-1" } });
  useUpsertMock.mockReturnValue({ mutate: mutateMock, isPending: false });
});

describe("DealChecklist", () => {
  it("returns null (renders nothing) when there is no signed-in user", () => {
    useAuthMock.mockReturnValue({ user: null });
    useChecklistMock.mockReturnValue({ data: null, isLoading: false });
    const { container } = render(<DealChecklist entityType="listing" entityId="e-1" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders a loading spinner while the query is in flight", () => {
    useChecklistMock.mockReturnValue({ data: null, isLoading: true });
    const { container } = render(<DealChecklist entityType="listing" entityId="e-1" />);
    expect(container.querySelector(".animate-spin")).toBeTruthy();
  });

  it("paints the 5 default tasks + a 0/5 progress chip when there is no saved checklist", () => {
    useChecklistMock.mockReturnValue({ data: null, isLoading: false });
    render(<DealChecklist entityType="listing" entityId="e-1" />);
    [
      "Title & deed verification",
      "Financing pre-approval",
      "Property inspection",
      "Legal due diligence",
      "Tax & ENFIA check",
    ].forEach((label) =>
      expect(screen.getByText(label)).toBeInTheDocument(),
    );
    expect(screen.getByText("0/5")).toBeInTheDocument();
  });

  it("renders the saved items array (when present) instead of defaults", () => {
    useChecklistMock.mockReturnValue({
      data: {
        title: "Custom",
        status: "in_progress",
        items: [
          { label: "Notary booked", done: true },
          { label: "POF uploaded", done: false },
        ],
      },
      isLoading: false,
    });
    render(<DealChecklist entityType="listing" entityId="e-1" />);
    expect(screen.getByText("Notary booked")).toBeInTheDocument();
    expect(screen.getByText("POF uploaded")).toBeInTheDocument();
    // 1 of 2 done
    expect(screen.getByText("1/2")).toBeInTheDocument();
    // The done item gets a strike-through class
    expect(screen.getByText("Notary booked").className).toMatch(/line-through/);
  });

  it("toggleItem flips done flag and calls upsert.mutate with the full payload", () => {
    useChecklistMock.mockReturnValue({
      data: {
        title: "DD",
        status: "in_progress",
        items: [
          { label: "A", done: false },
          { label: "B", done: false },
        ],
      },
      isLoading: false,
    });
    render(<DealChecklist entityType="listing" entityId="e-1" />);
    // The toggle is the unlabelled checkbox button. Pick it as the first
    // button preceding the label.
    const labelA = screen.getByText("A");
    const checkboxA = labelA.previousElementSibling as HTMLButtonElement;
    fireEvent.click(checkboxA);
    expect(mutateMock).toHaveBeenCalledWith({
      entity_type: "listing",
      entity_id: "e-1",
      items: [
        { label: "A", done: true },
        { label: "B", done: false },
      ],
      title: "DD",
      status: "in_progress",
    });
  });

  it("addItem appends the trimmed label and clears the input", () => {
    useChecklistMock.mockReturnValue({
      data: { items: [{ label: "X", done: false }] },
      isLoading: false,
    });
    render(<DealChecklist entityType="firesale_request" entityId="fr-1" />);
    const input = screen.getByPlaceholderText(/Add task/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "  New task  " } });
    // The Plus button is the last button in the panel — the only one with an
    // svg child + no text. Find via querySelector.
    const addBtn = input.parentElement!.querySelector("button")!;
    fireEvent.click(addBtn);
    expect(mutateMock).toHaveBeenCalledWith(expect.objectContaining({
      entity_type: "firesale_request",
      entity_id: "fr-1",
      items: [
        { label: "X", done: false },
        { label: "New task", done: false },
      ],
    }));
    expect(input.value).toBe("");
  });

  it("addItem skips the mutation when the input is empty / whitespace", () => {
    useChecklistMock.mockReturnValue({
      data: { items: [{ label: "X", done: false }] },
      isLoading: false,
    });
    render(<DealChecklist entityType="listing" entityId="e-1" />);
    const input = screen.getByPlaceholderText(/Add task/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "   " } });
    // The Plus button is disabled while input is blank — it's the only
    // button after the inputs and progress dots.
    const addBtn = input.parentElement!.querySelector("button[disabled]");
    expect(addBtn).not.toBeNull();
  });

  it("Enter key inside the new-item input triggers addItem", () => {
    useChecklistMock.mockReturnValue({ data: null, isLoading: false });
    render(<DealChecklist entityType="listing" entityId="e-1" />);
    const input = screen.getByPlaceholderText(/Add task/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "From keyboard" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(mutateMock).toHaveBeenCalledWith(expect.objectContaining({
      items: expect.arrayContaining([{ label: "From keyboard", done: false }]),
    }));
  });

  it("removeItem strips the row at the given index and persists the rest", () => {
    useChecklistMock.mockReturnValue({
      data: { items: [
        { label: "Keep", done: false },
        { label: "Drop me", done: false },
      ] },
      isLoading: false,
    });
    render(<DealChecklist entityType="listing" entityId="e-1" />);
    fireEvent.click(screen.getByLabelText('Remove "Drop me"'));
    expect(mutateMock).toHaveBeenCalledWith(expect.objectContaining({
      items: [{ label: "Keep", done: false }],
    }));
  });
});
