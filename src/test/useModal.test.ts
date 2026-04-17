import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useModal } from "@/hooks/useModal";

describe("useModal", () => {
  it("starts with no modal open", () => {
    const { result } = renderHook(() => useModal<"a" | "b">());
    expect(result.current.active).toBeNull();
    expect(result.current.isOpen("a")).toBe(false);
    expect(result.current.isOpen("b")).toBe(false);
  });

  it("opens a modal", () => {
    const { result } = renderHook(() => useModal<"a" | "b">());
    act(() => result.current.open("a"));
    expect(result.current.isOpen("a")).toBe(true);
    expect(result.current.isOpen("b")).toBe(false);
    expect(result.current.active).toBe("a");
  });

  it("only one modal is open at a time", () => {
    const { result } = renderHook(() => useModal<"a" | "b">());
    act(() => result.current.open("a"));
    act(() => result.current.open("b"));
    expect(result.current.isOpen("a")).toBe(false);
    expect(result.current.isOpen("b")).toBe(true);
  });

  it("closes the active modal", () => {
    const { result } = renderHook(() => useModal<"a" | "b">());
    act(() => result.current.open("a"));
    act(() => result.current.close());
    expect(result.current.active).toBeNull();
    expect(result.current.isOpen("a")).toBe(false);
  });

  it("toggle opens a closed modal", () => {
    const { result } = renderHook(() => useModal<"a" | "b">());
    act(() => result.current.toggle("a"));
    expect(result.current.isOpen("a")).toBe(true);
  });

  it("toggle closes an already open modal", () => {
    const { result } = renderHook(() => useModal<"a" | "b">());
    act(() => result.current.open("a"));
    act(() => result.current.toggle("a"));
    expect(result.current.active).toBeNull();
  });

  it("toggle switches from one modal to another", () => {
    const { result } = renderHook(() => useModal<"a" | "b">());
    act(() => result.current.open("a"));
    act(() => result.current.toggle("b"));
    expect(result.current.isOpen("a")).toBe(false);
    expect(result.current.isOpen("b")).toBe(true);
  });
});
