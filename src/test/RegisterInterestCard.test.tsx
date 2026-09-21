import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RegisterInterestCard } from "@/components/new-build/RegisterInterestCard";

const listing = {
  id: "listing-1",
  listing_type: "new_build",
  price: 420000,
  price_per_sqm: 5000,
  sqm: 84,
};

const renderCard = (onContact: (form: { name: string; phone: string; message: string }) => Promise<void>) =>
  render(
    <RegisterInterestCard
      listing={listing}
      user={{ id: "buyer-1", email: "buyer@example.com" }}
      onLogin={vi.fn()}
      onContact={onContact}
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
});
