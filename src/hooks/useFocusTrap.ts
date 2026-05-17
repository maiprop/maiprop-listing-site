import { RefObject, useEffect, useRef } from "react";

type FocusTrapOptions = {
  active?: boolean;
  onEscape?: () => void;
  restoreFocus?: boolean;
};

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
  "[contenteditable='true']",
].join(",");

const activeTraps: symbol[] = [];

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(focusableSelector)).filter(
    (element) => !element.hasAttribute("disabled") && element.getAttribute("aria-hidden") !== "true",
  );
}

export function useFocusTrap<T extends HTMLElement>({
  active = true,
  onEscape,
  restoreFocus = true,
}: FocusTrapOptions = {}): RefObject<T> {
  const containerRef = useRef<T>(null);
  const onEscapeRef = useRef(onEscape);

  useEffect(() => {
    onEscapeRef.current = onEscape;
  }, [onEscape]);

  useEffect(() => {
    if (!active) return;

    const trapId = Symbol("focus-trap");
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    activeTraps.push(trapId);

    const focusInitialElement = window.setTimeout(() => {
      const container = containerRef.current;
      if (!container) return;
      if (container.contains(document.activeElement)) return;
      const [firstFocusable] = getFocusableElements(container);
      (firstFocusable ?? container).focus();
    }, 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (activeTraps[activeTraps.length - 1] !== trapId) return;

      if (event.key === "Escape") {
        event.preventDefault();
        onEscapeRef.current?.();
        return;
      }

      if (event.key !== "Tab") return;

      const container = containerRef.current;
      if (!container) return;

      const focusableElements = getFocusableElements(container);
      if (focusableElements.length === 0) {
        event.preventDefault();
        container.focus();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      const currentElement = document.activeElement;

      if (event.shiftKey && currentElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && currentElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      } else if (!container.contains(currentElement)) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.clearTimeout(focusInitialElement);
      const index = activeTraps.indexOf(trapId);
      if (index !== -1) activeTraps.splice(index, 1);
      document.removeEventListener("keydown", handleKeyDown);

      if (restoreFocus && previousFocus?.isConnected) {
        previousFocus.focus();
      }
    };
  }, [active, restoreFocus]);

  return containerRef;
}
