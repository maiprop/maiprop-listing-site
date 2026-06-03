import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { Footer } from "@/components/Footer";
import { renderWithProviders } from "@/test/utils";

describe("Footer product links", () => {
  it("wires every product cell to its canonical destination", () => {
    renderWithProviders(<Footer />);

    expect(screen.getByRole("link", { name: /mAI prop OS/i })).toHaveAttribute(
      "href",
      "https://os.maiprop.co/",
    );
    expect(screen.getByRole("link", { name: /mAI properties/i })).toHaveAttribute(
      "href",
      "https://properties.maiprop.co/",
    );
    expect(screen.getByRole("link", { name: /mAI prop home/i })).toHaveAttribute("href", "/");
  });
});
