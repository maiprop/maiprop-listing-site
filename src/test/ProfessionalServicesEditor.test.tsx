import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/utils";
import ProfessionalServicesEditor from "@/components/ProfessionalServicesEditor";

const {
  myProfessional,
  professionalServices,
  professionalAvailability,
  upsertServices,
  upsertAvailability,
  updateProfessional,
} = vi.hoisted(() => ({
  myProfessional: { current: null as unknown },
  professionalServices: { current: [] as unknown[] },
  professionalAvailability: { current: [] as unknown[] },
  upsertServices: { mutateAsync: vi.fn(), isPending: false },
  upsertAvailability: { mutateAsync: vi.fn(), isPending: false },
  updateProfessional: { mutateAsync: vi.fn(), isPending: false },
}));

vi.mock("@/hooks/useProfessionalServices", () => ({
  useMyProfessional: () => myProfessional.current,
  useProfessionalServices: () => ({ data: professionalServices.current }),
  useProfessionalAvailability: () => ({ data: professionalAvailability.current }),
  useUpsertProfessionalServices: () => upsertServices,
  useUpsertProfessionalAvailability: () => upsertAvailability,
  useUpdateProfessional: () => updateProfessional,
}));

vi.mock("@/lib/professionalServiceCatalog", () => ({
  getServicesForCategory: () => [
    {
      key: "title_search",
      name: "Property Title Search",
      description: "Check title, liens, and ownership history.",
      defaultPricing: "fixed",
      suggestedRate: 300,
      videoAvailable: true,
      isPremiumFeature: false,
    },
    {
      key: "site_visit",
      name: "Site Visit",
      description: "On-site inspection.",
      defaultPricing: "daily",
      suggestedRate: 400,
      videoAvailable: false,
      isPremiumFeature: true,
    },
  ],
}));

const pro = {
  id: "pro-1",
  user_id: "user-1",
  category: "lawyer",
  video_link: "",
  calendar_notes: "",
};

beforeEach(() => {
  myProfessional.current = { data: pro, isLoading: false };
  professionalServices.current = [];
  professionalAvailability.current = [];
  upsertServices.mutateAsync.mockReset().mockResolvedValue(undefined);
  upsertServices.isPending = false;
  upsertAvailability.mutateAsync.mockReset().mockResolvedValue(undefined);
  upsertAvailability.isPending = false;
  updateProfessional.mutateAsync.mockReset().mockResolvedValue(undefined);
  updateProfessional.isPending = false;
});

describe("ProfessionalServicesEditor", () => {
  it("renders profile-missing and loading states", () => {
    myProfessional.current = { data: null, isLoading: true };
    const { rerender } = renderWithProviders(<ProfessionalServicesEditor />);
    expect(document.querySelector(".animate-spin")).toBeInTheDocument();

    myProfessional.current = { data: null, isLoading: false };
    rerender(<ProfessionalServicesEditor />);
    expect(screen.getByText(/No professional profile found/i)).toBeInTheDocument();
  });

  it("validates custom services, saves them, and can remove the saved custom row", async () => {
    vi.spyOn(Date, "now").mockReturnValue(12345);
    renderWithProviders(<ProfessionalServicesEditor />);

    fireEvent.click(screen.getByRole("button", { name: /Add your own Service/i }));
    const addButton = screen.getByRole("button", { name: /Add & Save/i });
    expect(addButton).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText(/Bespoke Consultation/i), {
      target: { value: "Golden Visa Review" },
    });
    fireEvent.change(screen.getByPlaceholderText("80"), { target: { value: "125" } });
    fireEvent.change(screen.getByPlaceholderText(/Brief description/i), {
      target: { value: "Document check before purchase" },
    });
    fireEvent.click(screen.getByLabelText(/Video call available/i));
    fireEvent.click(addButton);

    await waitFor(() => expect(upsertServices.mutateAsync).toHaveBeenCalledTimes(1));
    expect(upsertServices.mutateAsync).toHaveBeenLastCalledWith({
      professionalId: "pro-1",
      services: [
        expect.objectContaining({
          professional_id: "pro-1",
          service_key: "custom_12345",
          service_name: "Golden Visa Review",
          description: "Document check before purchase",
          pricing_model: "hourly",
          rate_amount: 125,
          video_enabled: true,
        }),
      ],
    });

    const customRow = screen.getByText("Golden Visa Review").closest(".glass-card") as HTMLElement;
    fireEvent.click(within(customRow).getByRole("button"));
    await waitFor(() => expect(upsertServices.mutateAsync).toHaveBeenCalledTimes(2));
    expect(upsertServices.mutateAsync).toHaveBeenLastCalledWith({
      professionalId: "pro-1",
      services: [],
    });
  });

  it("saves selected catalog services with edited pricing and invalid rates as null", async () => {
    renderWithProviders(<ProfessionalServicesEditor />);
    const card = screen.getByText("Property Title Search").closest(".glass-card") as HTMLElement;

    fireEvent.click(within(card).getAllByRole("button")[0]);
    fireEvent.click(within(card).getAllByRole("button")[1]);
    fireEvent.change(screen.getByDisplayValue("300"), { target: { value: "not-a-number" } });
    fireEvent.change(screen.getByDisplayValue("Fixed Price"), { target: { value: "hourly" } });
    fireEvent.click(screen.getByRole("button", { name: /^Save Services$/i }));

    await waitFor(() => expect(upsertServices.mutateAsync).toHaveBeenCalled());
    expect(upsertServices.mutateAsync).toHaveBeenCalledWith({
      professionalId: "pro-1",
      services: [
        expect.objectContaining({
          service_key: "title_search",
          service_name: "Property Title Search",
          pricing_model: "hourly",
          rate_amount: null,
          video_enabled: true,
          is_premium: false,
        }),
      ],
    });
  });

  it("saves enabled availability rows and video settings", async () => {
    renderWithProviders(<ProfessionalServicesEditor />);

    fireEvent.click(screen.getByRole("button", { name: /Availability/i }));
    fireEvent.click(screen.getByText("Sun").previousElementSibling as HTMLElement);
    fireEvent.change(screen.getAllByDisplayValue("09:00")[0], { target: { value: "10:30" } });
    fireEvent.click(screen.getByRole("button", { name: /Save Availability/i }));

    await waitFor(() => expect(upsertAvailability.mutateAsync).toHaveBeenCalled());
    expect(upsertAvailability.mutateAsync).toHaveBeenCalledWith({
      professionalId: "pro-1",
      availability: expect.arrayContaining([
        expect.objectContaining({ professional_id: "pro-1", day_of_week: 0, start_time: "10:30", end_time: "18:00" }),
        expect.objectContaining({ professional_id: "pro-1", day_of_week: 1 }),
      ]),
    });

    fireEvent.click(screen.getByRole("button", { name: /Calls, Video & Calendar/i }));
    fireEvent.change(screen.getByPlaceholderText(/meet.google.com/i), {
      target: { value: "https://meet.example/pro" },
    });
    fireEvent.change(screen.getByPlaceholderText(/prepare relevant documents/i), {
      target: { value: "Bring IDs" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Save Video Settings/i }));

    await waitFor(() => expect(updateProfessional.mutateAsync).toHaveBeenCalledWith({
      id: "pro-1",
      updates: { video_link: "https://meet.example/pro", calendar_notes: "Bring IDs" },
    }));
  });
});
