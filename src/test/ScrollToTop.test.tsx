import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { ScrollToTop } from "@/components/ScrollToTop";

function Harness() {
  return (
    <>
      <ScrollToTop />
      <Link to="/listings">Listings</Link>
      <Link to="/property/1#features">Features anchor</Link>
      <Routes>
        <Route path="/property/:id" element={<div>Property</div>} />
        <Route path="/listings" element={<div>Listings page</div>} />
      </Routes>
    </>
  );
}

describe("ScrollToTop", () => {
  beforeEach(() => {
    vi.stubGlobal("scrollTo", vi.fn());
    vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    }));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    Object.defineProperty(window.history, "scrollRestoration", {
      configurable: true,
      writable: true,
      value: "auto",
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("scrolls to the top when navigating to a new route", async () => {
    render(
      <MemoryRouter initialEntries={["/property/1"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Harness />
      </MemoryRouter>,
    );

    await waitFor(() => expect(window.scrollTo).toHaveBeenCalled());
    vi.mocked(window.scrollTo).mockClear();

    fireEvent.click(screen.getByRole("link", { name: "Listings" }));

    await waitFor(() => {
      expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: "auto" });
    });
  });

  it("does not override hash-anchor navigation", async () => {
    render(
      <MemoryRouter initialEntries={["/property/1"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Harness />
      </MemoryRouter>,
    );

    await waitFor(() => expect(window.scrollTo).toHaveBeenCalled());
    vi.mocked(window.scrollTo).mockClear();

    fireEvent.click(screen.getByRole("link", { name: "Features anchor" }));

    await waitFor(() => expect(screen.getByText("Property")).toBeInTheDocument());
    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it("disables browser-managed scroll restoration while mounted", async () => {
    const { unmount } = render(
      <MemoryRouter initialEntries={["/property/1"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Harness />
      </MemoryRouter>,
    );

    await waitFor(() => expect(window.history.scrollRestoration).toBe("manual"));

    unmount();

    expect(window.history.scrollRestoration).toBe("auto");
  });
});
