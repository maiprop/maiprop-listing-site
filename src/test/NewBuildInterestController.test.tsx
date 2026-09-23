import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpcMock, toastMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  toastMock: { success: vi.fn(), dismiss: vi.fn() },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: unknown[]) => rpcMock(...args) },
}));
vi.mock("sonner", () => ({ toast: toastMock }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { NewBuildInterestController } from "@/components/new-build/NewBuildInterestController";

const listing = {
  id: "listing-1",
  listing_type: "new_build",
  price: 420000,
  price_per_sqm: 5000,
  sqm: 84,
};

describe("NewBuildInterestController with the real interest card", () => {
  beforeEach(() => {
    rpcMock.mockReset();
    toastMock.success.mockReset().mockReturnValue("interest-toast");
    toastMock.dismiss.mockReset();
  });

  it("clears a retry-confirmed payload and submits later edits under a fresh key", async () => {
    const startConversation = vi.fn()
      .mockResolvedValueOnce("conversation-1")
      .mockResolvedValueOnce("conversation-2");
    rpcMock
      .mockResolvedValueOnce({ data: null, error: { code: "FETCH_ERROR", message: "response lost" } })
      .mockResolvedValueOnce({
        data: [{
          id: "e1800000-0000-4000-8000-000000000011",
          new_building_id: "listing-1",
          created_at: "2026-09-24T00:05:00.000Z",
        }],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [{
          id: "e1800000-0000-4000-8000-000000000012",
          new_building_id: "listing-1",
          created_at: "2026-09-24T00:06:00.000Z",
        }],
        error: null,
      });

    render(
      <NewBuildInterestController
        listing={listing}
        user={{ id: "buyer-1", email: "buyer@example.com" } as never}
        profile={{ display_name: "Buyer One", phone: "555-1" } as never}
        ownerId="owner-1"
        onLogin={vi.fn()}
        startConversation={startConversation}
        successMessage="Your enquiry was saved successfully."
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("Your name"), { target: { value: "Buyer One" } });
    fireEvent.change(screen.getByPlaceholderText("Phone number (optional)"), { target: { value: "555-1" } });
    fireEvent.change(screen.getByPlaceholderText("What are you looking for? (optional)"), {
      target: { value: "Send plans" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Register Interest" }));

    expect(await screen.findByRole("button", { name: "Retry these details" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry these details" }));
    expect(await screen.findByText("Interest registered!")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Make another enquiry" }));

    expect(screen.getByPlaceholderText("Your name")).toHaveValue("");
    expect(screen.getByPlaceholderText("Phone number (optional)")).toHaveValue("");
    expect(screen.getByPlaceholderText("What are you looking for? (optional)")).toHaveValue("");

    fireEvent.change(screen.getByPlaceholderText("What are you looking for? (optional)"), {
      target: { value: "Current edit" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Register Interest" }));
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(3));

    expect(rpcMock.mock.calls[0]?.[1].p_submission_key).toBe(rpcMock.mock.calls[1]?.[1].p_submission_key);
    expect(rpcMock.mock.calls[2]?.[1].p_submission_key).not.toBe(rpcMock.mock.calls[0]?.[1].p_submission_key);
    expect(rpcMock.mock.calls[2]?.[1].p_notes).toBe("Current edit");
    expect(startConversation).toHaveBeenCalledTimes(2);
  });
});
