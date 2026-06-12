import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ImageGallery } from "@/components/listings/ImageGallery";
import type { UploadedImage } from "@/types";

const images: UploadedImage[] = [
  { id: "cover", url: "https://cdn.test/cover.jpg" },
  { id: "plain", url: "https://cdn.test/plain.jpg" },
  { id: "loading", url: "", uploading: true },
  { id: "failed", url: "", error: "network" },
];

describe("ImageGallery coverage", () => {
  it("renders nothing for an empty gallery", () => {
    const { container } = render(
      <ImageGallery
        images={[]}
        coverImageId={null}
        onSetCover={vi.fn()}
        onRemove={vi.fn()}
        onReorder={vi.fn()}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("renders cover, upload, error, and set-cover states", () => {
    const onRemove = vi.fn();
    const onSetCover = vi.fn();

    const { container } = render(
      <ImageGallery
        images={images}
        coverImageId="cover"
        onSetCover={onSetCover}
        onRemove={onRemove}
        onReorder={vi.fn()}
      />,
    );

    expect(screen.getByText("Cover")).toBeInTheDocument();
    expect(screen.getByText("Upload failed")).toBeInTheDocument();
    expect(container.querySelector(".animate-spin")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /set as cover/i }));
    expect(onSetCover).toHaveBeenCalledWith("plain");

    const removeButtons = screen.getAllByRole("button", { name: /remove photo/i });
    fireEvent.click(removeButtons[0]);
    expect(onRemove).toHaveBeenCalledWith("cover");

    expect(screen.getAllByRole("button", { name: /set as cover/i })).toHaveLength(1);
  });

  it("reorders only when a different item is dropped on a tracked target", () => {
    const onReorder = vi.fn();
    const { container } = render(
      <ImageGallery
        images={images.slice(0, 2)}
        coverImageId="cover"
        onSetCover={vi.fn()}
        onRemove={vi.fn()}
        onReorder={onReorder}
      />,
    );

    const cards = container.querySelectorAll<HTMLElement>("[draggable='true']");

    fireEvent.dragStart(cards[0]);
    fireEvent.dragOver(cards[1]);
    fireEvent.drop(cards[1]);
    expect(onReorder).toHaveBeenCalledWith(0, 1);

    onReorder.mockClear();
    fireEvent.dragStart(cards[0]);
    fireEvent.dragOver(cards[0]);
    fireEvent.drop(cards[0]);
    expect(onReorder).not.toHaveBeenCalled();

    fireEvent.dragStart(cards[0]);
    fireEvent.drop(cards[1]);
    expect(onReorder).not.toHaveBeenCalled();
  });
});
