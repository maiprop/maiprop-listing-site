import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ServiceInput } from "@/components/index/ServiceInput";

describe("ServiceInput", () => {
  it("opens suggestions, selects by click and Enter, clears, and closes on Escape/outside click", () => {
    const onChange = vi.fn();
    const onSearch = vi.fn();
    const { rerender } = render(<ServiceInput value="" onChange={onChange} onSearch={onSearch} />);

    const input = screen.getByPlaceholderText(/Architect/i);
    fireEvent.focus(input);
    expect(screen.getByText("Professionals & Services")).toBeInTheDocument();

    const firstSuggestion = document.body.querySelector("#service-dropdown-portal [class*='cursor-pointer']") as HTMLElement;
    expect(firstSuggestion).toBeTruthy();
    fireEvent.mouseDown(firstSuggestion);
    fireEvent.click(firstSuggestion);
    expect(onChange).toHaveBeenCalledWith(expect.any(String));
    expect(onSearch).toHaveBeenCalledWith(expect.any(String));

    rerender(<ServiceInput value="arch" onChange={onChange} onSearch={onSearch} />);
    const filteredInput = screen.getByPlaceholderText(/Architect/i);
    fireEvent.focus(filteredInput);
    fireEvent.keyDown(filteredInput, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith(expect.stringMatching(/architect/i));

    rerender(<ServiceInput value="architect" onChange={onChange} onSearch={onSearch} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onChange).toHaveBeenCalledWith("");

    const escapeInput = screen.getByPlaceholderText(/Architect/i);
    fireEvent.focus(escapeInput);
    fireEvent.keyDown(escapeInput, { key: "Escape" });
    expect(document.getElementById("service-dropdown-portal")).not.toBeInTheDocument();

    fireEvent.focus(escapeInput);
    expect(document.getElementById("service-dropdown-portal")).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(document.getElementById("service-dropdown-portal")).not.toBeInTheDocument();
  });
});
