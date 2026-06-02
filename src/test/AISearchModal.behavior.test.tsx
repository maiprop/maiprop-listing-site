import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/utils";
import { AISearchModal } from "@/components/index/AISearchModal";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  useAuth: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: {
      invoke: (...args: unknown[]) => mocks.invoke(...args),
    },
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => mocks.useAuth(),
}));

vi.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => mocks.toastError(...args),
  },
}));

vi.mock("@/components/SignInForAI", () => ({
  SignInForAI: ({ feature }: { feature: string }) => <div>Sign in for {feature}</div>,
}));

function renderModal(overrides: Partial<React.ComponentProps<typeof AISearchModal>> = {}) {
  const props = {
    onFiltersApplied: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };

  renderWithProviders(<AISearchModal {...props} />);
  return props;
}

describe("AISearchModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useAuth.mockReturnValue({ user: { id: "user-1" } });
    mocks.invoke.mockResolvedValue({ data: { city: "Athens" }, error: null });
  });

  it("shows the sign-in gate and hides search controls for signed-out users", () => {
    mocks.useAuth.mockReturnValue({ user: null });

    renderModal();

    expect(screen.getByText("Sign in for AI Search")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/quiet apartment/i)).not.toBeInTheDocument();
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it("does not invoke AI search for blank input", () => {
    renderModal();

    const searchButton = screen.getByRole("button", { name: /search/i });
    expect(searchButton).toBeDisabled();

    fireEvent.keyDown(screen.getByPlaceholderText(/quiet apartment/i), { key: "Enter" });
    fireEvent.click(searchButton);

    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it("submits typed search, applies returned filters, and closes", async () => {
    const props = renderModal();

    fireEvent.change(screen.getByPlaceholderText(/quiet apartment/i), {
      target: { value: "quiet apartment near metro in Athens under 200k" },
    });
    fireEvent.click(screen.getByRole("button", { name: /search/i }));

    await waitFor(() => {
      expect(mocks.invoke).toHaveBeenCalledWith("ai-search", {
        body: { query: "quiet apartment near metro in Athens under 200k" },
      });
    });
    expect(props.onFiltersApplied).toHaveBeenCalledWith({ city: "Athens" });
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it("submits suggestion chips directly", async () => {
    const props = renderModal();

    fireEvent.click(screen.getByRole("button", { name: /Studio with parking in Thessaloniki under 80k/i }));

    await waitFor(() => {
      expect(mocks.invoke).toHaveBeenCalledWith("ai-search", {
        body: { query: "Studio with parking in Thessaloniki under 80k" },
      });
    });
    expect(props.onFiltersApplied).toHaveBeenCalledWith({ city: "Athens" });
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps the modal open and reports transport errors", async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: { message: "Quota reached" } });
    const props = renderModal();

    fireEvent.change(screen.getByPlaceholderText(/quiet apartment/i), {
      target: { value: "villa in Crete" },
    });
    fireEvent.keyDown(screen.getByPlaceholderText(/quiet apartment/i), { key: "Enter" });

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith("Quota reached"));
    expect(props.onFiltersApplied).not.toHaveBeenCalled();
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it("handles model-level errors, escape key, and backdrop close", async () => {
    mocks.invoke.mockResolvedValueOnce({ data: { error: "Invalid search request" }, error: null });
    const props = renderModal();
    const input = screen.getByPlaceholderText(/quiet apartment/i);

    fireEvent.change(input, { target: { value: "bad query" } });
    fireEvent.click(screen.getByRole("button", { name: /search/i }));

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith("Invalid search request"));

    fireEvent.keyDown(input, { key: "Escape" });
    expect(props.onClose).toHaveBeenCalled();

    props.onClose.mockClear();
    fireEvent.click(screen.getByRole("dialog").parentElement as HTMLElement);
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });
});
