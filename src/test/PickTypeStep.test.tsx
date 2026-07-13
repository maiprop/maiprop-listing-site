import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { languageState } = vi.hoisted(() => ({
  languageState: { value: "en" as string | undefined },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ i18n: { language: languageState.value } }),
}));

import { PickTypeStep } from "@/components/onboarding/PickTypeStep";

const onPendingChangeMock = vi.fn();
const onDeveloperImmediateMock = vi.fn();
const onProfessionalImmediateMock = vi.fn();
const onConfirmMock = vi.fn();

const defaultProps: ComponentProps<typeof PickTypeStep> = {
  pendingCardId: null,
  onPendingChange: onPendingChangeMock,
  loading: false,
  authLoading: false,
  onDeveloperImmediate: onDeveloperImmediateMock,
  onProfessionalImmediate: onProfessionalImmediateMock,
  onConfirm: onConfirmMock,
};

const renderStep = (overrides: Partial<ComponentProps<typeof PickTypeStep>> = {}) =>
  render(<PickTypeStep {...defaultProps} {...overrides} />);

const getRoleCard = (label: RegExp) =>
  screen.getAllByText(label).find((element) => element.tagName === "DIV")?.closest("button") as HTMLButtonElement;

beforeEach(() => {
  vi.clearAllMocks();
  languageState.value = "en";
});

describe("PickTypeStep", () => {
  it("presents every supported account type with its business capabilities", () => {
    renderStep();

    expect(screen.getByRole("heading", { name: "How are you using mAI prop?" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Home Buyer \/ Renter/i })).toHaveTextContent("Saved searches & alerts");
    expect(screen.getByRole("button", { name: /Private Seller \/ Landlord/i })).toHaveTextContent("Manage viewing requests");
    expect(screen.getByRole("button", { name: /Real Estate Agent \/ Agency/i })).toHaveTextContent("CRM & contacts");
    expect(screen.getByRole("button", { name: /Developer \/ Builder/i })).toHaveTextContent("Project showcase pages");
    expect(screen.getByRole("button", { name: /Service Professional/i })).toHaveTextContent("Verified badge");
    expect(screen.queryByRole("button", { name: /Continue as/i })).not.toBeInTheDocument();
  });

  it.each([
    ["buyer", /Home Buyer \/ Renter/i],
    ["seller", /Private Seller \/ Landlord/i],
    ["agent", /Real Estate Agent \/ Agency/i],
  ])("selects, deselects, and confirms the %s account path", (accountType, cardName) => {
    const view = renderStep();

    fireEvent.click(getRoleCard(cardName));
    expect(onPendingChangeMock).toHaveBeenLastCalledWith(accountType);

    view.rerender(<PickTypeStep {...defaultProps} pendingCardId={accountType} />);
    fireEvent.click(getRoleCard(cardName));
    expect(onPendingChangeMock).toHaveBeenLastCalledWith(null);

    fireEvent.click(screen.getByRole("button", { name: new RegExp(`Continue as.*${accountType === "buyer" ? "Home Buyer" : accountType === "seller" ? "Private Seller" : "Real Estate Agent"}`, "i") }));
    expect(onConfirmMock).toHaveBeenCalledWith(accountType);
  });

  it.each([
    ["developer", /Developer \/ Builder/i, onDeveloperImmediateMock],
    ["professional", /Service Professional/i, onProfessionalImmediateMock],
  ])("routes the %s account directly into its required setup", (accountType, cardName, immediateHandler) => {
    renderStep();

    fireEvent.click(screen.getByRole("button", { name: cardName }));

    expect(immediateHandler).toHaveBeenCalledTimes(1);
    expect(onPendingChangeMock).not.toHaveBeenCalled();
    expect(onConfirmMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /Continue as/i })).not.toBeInTheDocument();
  });

  it.each([
    ["developer", /Developer \/ Builder/i],
    ["professional", /Service Professional/i],
  ])("does not offer a second confirmation for a pending immediate %s route", (accountType, cardName) => {
    renderStep({ pendingCardId: accountType });

    expect(screen.getByRole("button", { name: cardName })).toHaveClass("border-2");
    expect(screen.queryByRole("button", { name: /Continue as/i })).not.toBeInTheDocument();
  });

  it("locks role changes and confirmation while account persistence is in progress", () => {
    const { container } = renderStep({ pendingCardId: "buyer", loading: true });

    expect(screen.getAllByRole("button")).toHaveLength(6);
    screen.getAllByRole("button").forEach((button) => expect(button).toBeDisabled());
    expect(container.querySelector(".animate-spin")).toBeInTheDocument();

    fireEvent.click(getRoleCard(/Home Buyer \/ Renter/i));
    fireEvent.click(screen.getByRole("button", { name: /Continue as Home Buyer/i }));
    expect(onPendingChangeMock).not.toHaveBeenCalled();
    expect(onConfirmMock).not.toHaveBeenCalled();
  });

  it("locks role changes while authentication state is still resolving", () => {
    const { container } = renderStep({ pendingCardId: "seller", authLoading: true });

    screen.getAllByRole("button").forEach((button) => expect(button).toBeDisabled());
    expect(container.querySelector(".animate-spin")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Continue as Private Seller/i })).toBeDisabled();
  });

  it("localizes the full role catalogue and confirmation flow for Greek users", () => {
    languageState.value = "el-GR";
    renderStep({ pendingCardId: "buyer" });

    expect(screen.queryByText("Personalise your experience")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "How are you using mAI prop?" })).not.toBeInTheDocument();
    expect(screen.queryByText("Browse listings")).not.toBeInTheDocument();
    expect(screen.queryByText("List your property")).not.toBeInTheDocument();
    expect(screen.queryByText("Project showcase pages")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(6);
  });

  it("falls back to English when the translation engine has no active language", () => {
    languageState.value = undefined;
    renderStep();

    expect(screen.getByRole("heading", { name: "How are you using mAI prop?" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Service Professional/i })).toBeInTheDocument();
  });
});
