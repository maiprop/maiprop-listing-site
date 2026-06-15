import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

describe("Dialog layering", () => {
  it("keeps dialog content above the overlay so mobile taps reach modal controls", () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Mobile registration</DialogTitle>
          <button type="button">Register</button>
        </DialogContent>
      </Dialog>,
    );

    expect(screen.getByRole("dialog")).toHaveClass("z-[60]");
    expect(screen.getByRole("button", { name: /register/i })).toBeEnabled();
  });
});
