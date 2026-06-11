import { describe, it, expect, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import PropertyGallery from "@/components/property/PropertyGallery";

describe("PropertyGallery behavior", () => {
  it("opens a fullscreen photo viewer with in-dialog navigation", () => {
    renderWithProviders(
      <PropertyGallery
        images={["https://example.test/photo-1.jpg", "https://example.test/photo-2.jpg"]}
        listingType="sale"
        isFavorited={false}
        onFavorite={vi.fn()}
        onShare={vi.fn()}
        viewsCount={4}
        title="Gallery title"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "View photos fullscreen" }));

    expect(screen.getByRole("dialog", { name: "Full-screen photo viewer" })).toBeInTheDocument();
    expect(screen.getByText("Use the previous and next controls to review all property photos.")).toHaveClass(
      "sr-only",
    );
    expect(screen.getByRole("img", { name: "Gallery title photo 1 of 2" })).toHaveAttribute(
      "src",
      "https://example.test/photo-1.jpg",
    );

    fireEvent.click(screen.getByRole("button", { name: "Next full-screen photo" }));
    expect(screen.getByRole("img", { name: "Gallery title photo 2 of 2" })).toHaveAttribute(
      "src",
      "https://example.test/photo-2.jpg",
    );

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog", { name: "Full-screen photo viewer" })).not.toBeInTheDocument();
  });

  it("falls through broken gallery images before showing the mAI prop logo", () => {
    renderWithProviders(
      <PropertyGallery
        images={["https://example.test/street.jpg", "https://example.test/cover.jpg"]}
        listingType="auction"
        isFavorited={false}
        onFavorite={vi.fn()}
        onShare={vi.fn()}
        viewsCount={0}
        title="Auction gallery"
      />,
    );

    const image = screen.getByAltText("Auction gallery") as HTMLImageElement;
    fireEvent.error(image);
    expect(image.src).toBe("https://example.test/cover.jpg");

    fireEvent.error(image);
    expect(image.src).toContain("/images/maiprop-logo.webp");
    expect(image.style.objectFit).toBe("contain");
  });
});
