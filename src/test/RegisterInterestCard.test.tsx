import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { RegisterInterestCard } from "@/components/new-build/RegisterInterestCard";

const listing = {
  id: "listing-1",
  listing_type: "new_build",
  price: 420000,
  price_per_sqm: 5000,
  sqm: 84,
};

const renderCard = (
  onContact: (form: { name: string; phone: string; message: string }) => Promise<void>,
  overrides: Partial<React.ComponentProps<typeof RegisterInterestCard>> = {},
) =>
  render(
    <RegisterInterestCard
      listing={listing}
      user={{ id: "buyer-1", email: "buyer@example.com" }}
      onLogin={vi.fn()}
      onContact={onContact}
      submissionStatus="editing"
      submissionError={null}
      onRetry={vi.fn()}
      onStartNew={vi.fn()}
      {...overrides}
    />,
  );

const fillForm = () => {
  fireEvent.change(screen.getByPlaceholderText("Your name"), { target: { value: "Buyer One" } });
  fireEvent.change(screen.getByPlaceholderText("Phone number (optional)"), { target: { value: "555-1" } });
  fireEvent.change(screen.getByPlaceholderText("What are you looking for? (optional)"), {
    target: { value: "Send plans" },
  });
};

describe("RegisterInterestCard", () => {
  it("keeps entered values, shows an alert, and allows one successful retry after rejection", async () => {
    const onContact = vi.fn()
      .mockRejectedValueOnce(new Error("permission denied"))
      .mockResolvedValueOnce(undefined);
    renderCard(onContact);
    fillForm();

    fireEvent.click(screen.getByRole("button", { name: "Register Interest" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn't register your interest. Please try again.",
    );
    expect(screen.getByPlaceholderText("Your name")).toHaveValue("Buyer One");
    expect(screen.getByPlaceholderText("Phone number (optional)")).toHaveValue("555-1");
    expect(screen.getByPlaceholderText("What are you looking for? (optional)")).toHaveValue("Send plans");
    expect(screen.getByRole("button", { name: "Register Interest" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Register Interest" }));

    expect(await screen.findByText("Interest registered!")).toBeInTheDocument();
    expect(screen.getByText("Your enquiry was saved successfully.")).toBeInTheDocument();
    expect(screen.queryByText(/developer has been notified/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/1-2 business days/i)).not.toBeInTheDocument();
    expect(onContact).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("prevents a second submission while the first submission is pending", async () => {
    let resolveSubmission: (() => void) | undefined;
    const onContact = vi.fn(() => new Promise<void>((resolve) => {
      resolveSubmission = resolve;
    }));
    renderCard(onContact);
    fillForm();
    const submit = screen.getByRole("button", { name: "Register Interest" });

    fireEvent.click(submit);
    fireEvent.click(submit);

    expect(onContact).toHaveBeenCalledOnce();
    expect(submit).toBeDisabled();

    resolveSubmission?.();
    await waitFor(() => expect(screen.getByText("Interest registered!")).toBeInTheDocument());
  });

  it("keeps frozen details read-only and exposes exact retry after an uncertain result", () => {
    const onRetry = vi.fn();
    const view = renderCard(vi.fn(), { onRetry });
    fillForm();
    view.rerender(
      <RegisterInterestCard
        listing={listing}
        user={{ id: "buyer-1", email: "buyer@example.com" }}
        onLogin={vi.fn()}
        onContact={vi.fn()}
        submissionStatus="uncertain"
        submissionError="We couldn't confirm whether your enquiry was saved."
        onRetry={onRetry}
        onStartNew={vi.fn()}
      />,
    );

    expect(screen.getByPlaceholderText("Your name")).toHaveAttribute("readonly");
    expect(screen.getByPlaceholderText("Phone number (optional)")).toHaveAttribute("readonly");
    expect(screen.getByPlaceholderText("What are you looking for? (optional)")).toHaveAttribute("readonly");
    expect(screen.getByRole("alert")).toHaveTextContent("Retry these details to check without creating another enquiry");
    fireEvent.click(screen.getByRole("button", { name: "Retry these details" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("requires an explicit warning confirmation before unlocking a deliberate new enquiry", () => {
    const onStartNew = vi.fn();
    const view = renderCard(vi.fn(), { onStartNew });
    fillForm();
    view.rerender(
      <RegisterInterestCard
        listing={listing}
        user={{ id: "buyer-1", email: "buyer@example.com" }}
        onLogin={vi.fn()}
        onContact={vi.fn()}
        submissionStatus="uncertain"
        submissionError="response unavailable"
        onRetry={vi.fn()}
        onStartNew={onStartNew}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Start a new enquiry" }));
    expect(screen.getByText(/previous enquiry may already be saved/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onStartNew).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText("Your name")).toHaveAttribute("readonly");

    fireEvent.click(screen.getByRole("button", { name: "Start a new enquiry" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm new enquiry" }));
    expect(onStartNew).toHaveBeenCalledOnce();

    view.rerender(
      <RegisterInterestCard
        listing={listing}
        user={{ id: "buyer-1", email: "buyer@example.com" }}
        onLogin={vi.fn()}
        onContact={vi.fn()}
        submissionStatus="editing"
        submissionError={null}
        onRetry={vi.fn()}
        onStartNew={onStartNew}
      />,
    );
    expect(screen.getByPlaceholderText("Your name")).not.toHaveAttribute("readonly");
    expect(screen.getByPlaceholderText("Your name")).toHaveValue("Buyer One");
  });

  it("uses factual conversation fallback copy when translations are unavailable", () => {
    const onStartNew = vi.fn();
    renderCard(vi.fn(), {
      submissionStatus: "confirmed",
      onStartNew,
    });

    expect(screen.getByText("A conversation with the developer is available in Messages")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Make another enquiry" }));
    expect(onStartNew).toHaveBeenCalledOnce();
  });
});
