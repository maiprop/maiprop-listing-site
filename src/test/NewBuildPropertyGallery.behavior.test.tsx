import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { PropertyGallery } from "@/components/new-build/PropertyGallery";

describe("New-build PropertyGallery behavior", () => {
  it("opens a fullscreen photo viewer with in-dialog navigation", () => {
    renderWithProviders(
      <PropertyGallery
        images={["https://example.test/new-build-1.jpg", "https://example.test/new-build-2.jpg"]}
        isFavorited={false}
        onFavorite={vi.fn()}
        onShare={vi.fn()}
        title="New build gallery"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "View photos fullscreen" }));

    expect(screen.getByRole("dialog", { name: "Full-screen photo viewer" })).toBeInTheDocument();
    expect(screen.getByText("Use the previous and next controls to review all new-build photos.")).toHaveClass(
      "sr-only",
    );
    expect(screen.getByRole("img", { name: "New build gallery photo 1 of 2" })).toHaveAttribute(
      "src",
      "https://example.test/new-build-1.jpg",
    );

    fireEvent.click(screen.getByRole("button", { name: "Next full-screen photo" }));
    expect(screen.getByRole("img", { name: "New build gallery photo 2 of 2" })).toHaveAttribute(
      "src",
      "https://example.test/new-build-2.jpg",
    );

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog", { name: "Full-screen photo viewer" })).not.toBeInTheDocument();
  });
});
