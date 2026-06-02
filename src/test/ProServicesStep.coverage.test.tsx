import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProServicesStep } from "@/components/onboarding/ProServicesStep";
import type { SelectedService } from "@/lib/onboardingConfig";

const toastMock = vi.hoisted(() => vi.fn());

vi.mock("sonner", () => ({
  toast: toastMock,
}));

vi.mock("@/lib/professionalServiceCatalog", () => ({
  CATEGORY_LABELS: { lawyer: "Lawyer" },
  PRICING_LABELS: { hourly: "Hourly", daily: "Daily", fixed: "Fixed" },
  getServicesForCategory: () => [
    {
      key: "title_search",
      name: "Title Search",
      description: "Check title history.",
      defaultPricing: "fixed",
      suggestedRate: 300,
      estimatedHours: 2,
      videoAvailable: false,
      isPremiumFeature: false,
    },
    {
      key: "remote_due_diligence",
      name: "Remote Due Diligence",
      description: "Remote document review.",
      defaultPricing: "hourly",
      suggestedRate: 120,
      estimatedHours: 1,
      videoAvailable: true,
      isPremiumFeature: true,
    },
  ],
}));

const renderStep = (
  selectedServices: Record<string, SelectedService> = {},
  props: Partial<React.ComponentProps<typeof ProServicesStep>> = {},
) => {
  const onChange = vi.fn();
  const onSave = vi.fn();
  render(
    <ProServicesStep
      proCategory="lawyer"
      selectedServices={selectedServices}
      onChange={onChange}
      loading={false}
      onSave={onSave}
      {...props}
    />,
  );
  return { onChange, onSave };
};

describe("ProServicesStep coverage", () => {
  beforeEach(() => {
    toastMock.mockReset();
  });

  it("selects all, deselects all, and disables save when nothing is selected", () => {
    const { onChange, onSave } = renderStep();

    expect(screen.getByText("None selected yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save services/i })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: /select all/i }));
    expect(onChange).toHaveBeenCalledWith({
      title_search: expect.objectContaining({ rate: "300", pricingModel: "fixed", videoEnabled: false }),
      remote_due_diligence: expect.objectContaining({ rate: "120", pricingModel: "hourly", videoEnabled: true }),
    });

    onChange.mockClear();
    renderStep(
      {
        title_search: {
          template: {
            key: "title_search",
            name: "Title Search",
            description: "Check title history.",
            defaultPricing: "fixed",
            suggestedRate: 300,
            estimatedHours: 2,
            videoAvailable: false,
            isPremiumFeature: false,
          },
          pricingModel: "fixed",
          rate: "300",
          videoEnabled: false,
        },
        remote_due_diligence: {
          template: {
            key: "remote_due_diligence",
            name: "Remote Due Diligence",
            description: "Remote document review.",
            defaultPricing: "hourly",
            suggestedRate: 120,
            estimatedHours: 1,
            videoAvailable: true,
            isPremiumFeature: true,
          },
          pricingModel: "hourly",
          rate: "120",
          videoEnabled: true,
        },
      },
      { onChange },
    );
    fireEvent.click(screen.getByRole("button", { name: /deselect all/i }));
    expect(onChange).toHaveBeenCalledWith({});
    expect(onSave).not.toHaveBeenCalled();
  });

  it("toggles a service, updates pricing fields, and saves selected services", () => {
    const selected: Record<string, SelectedService> = {
      title_search: {
        template: {
          key: "title_search",
          name: "Title Search",
          description: "Check title history.",
          defaultPricing: "fixed",
          suggestedRate: 300,
          estimatedHours: 2,
          videoAvailable: false,
          isPremiumFeature: false,
        },
        pricingModel: "fixed",
        rate: "300",
        videoEnabled: false,
      },
    };
    const { onChange, onSave } = renderStep(selected);

    const activeCard = screen.getByText("Title Search").closest(".rounded-2xl") as HTMLElement;
    fireEvent.click(within(activeCard).getByRole("button", { name: "Daily" }));
    expect(onChange).toHaveBeenCalledWith({
      title_search: expect.objectContaining({ pricingModel: "daily" }),
    });

    fireEvent.change(screen.getByDisplayValue("300"), { target: { value: "450" } });
    expect(onChange).toHaveBeenLastCalledWith({
      title_search: expect.objectContaining({ rate: "450" }),
    });

    fireEvent.click(screen.getByRole("button", { name: /save 1 service/i }));
    expect(onSave).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText("Title Search"));
    expect(onChange).toHaveBeenLastCalledWith({});
  });

  it("blocks enabling premium video from off state but allows disabling it from on state", () => {
    const premiumTemplate = {
      key: "remote_due_diligence",
      name: "Remote Due Diligence",
      description: "Remote document review.",
      defaultPricing: "hourly" as const,
      suggestedRate: 120,
      estimatedHours: 1,
      videoAvailable: true,
      isPremiumFeature: true,
    };

    const blockedChangeSpy = vi.fn();
    const { rerender } = render(
      <ProServicesStep
        proCategory="lawyer"
        selectedServices={{
          remote_due_diligence: {
            template: premiumTemplate,
            pricingModel: "hourly",
            rate: "120",
            videoEnabled: false,
          },
        }}
        onChange={blockedChangeSpy}
        loading={false}
        onSave={vi.fn()}
      />,
    );

    const toggle = screen.getByText(/available via video consultation/i).previousElementSibling as HTMLElement;
    fireEvent.click(toggle);
    expect(toastMock).toHaveBeenCalledWith(
      "Video consultations require the Pro plan",
      expect.objectContaining({ icon: expect.any(String) }),
    );
    expect(blockedChangeSpy).not.toHaveBeenCalled();

    const changeSpy = vi.fn();
    rerender(
      <ProServicesStep
        proCategory="lawyer"
        selectedServices={{
          remote_due_diligence: {
            template: premiumTemplate,
            pricingModel: "hourly",
            rate: "120",
            videoEnabled: true,
          },
        }}
        onChange={changeSpy}
        loading={false}
        onSave={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText(/available via video consultation/i).previousElementSibling as HTMLElement);
    expect(changeSpy).toHaveBeenCalledWith({
      remote_due_diligence: expect.objectContaining({ videoEnabled: false }),
    });
  });

  it("shows the loading state while saving", () => {
    renderStep(
      {
        title_search: {
          template: {
            key: "title_search",
            name: "Title Search",
            description: "Check title history.",
            defaultPricing: "fixed",
            suggestedRate: 300,
            estimatedHours: 2,
            videoAvailable: false,
            isPremiumFeature: false,
          },
          pricingModel: "fixed",
          rate: "300",
          videoEnabled: false,
        },
      },
      { loading: true },
    );

    expect(screen.getByRole("button", { name: /save 1 service/i })).toBeDisabled();
    expect(document.querySelector(".animate-spin")).toBeInTheDocument();
  });
});
