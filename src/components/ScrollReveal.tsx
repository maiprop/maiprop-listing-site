import { useEffect, useRef, type ReactNode, type CSSProperties } from "react";

interface Props {
  children: ReactNode;
  className?: string;
  /** Use "stagger" to animate children via CSS cascade delays */
  variant?: "fadeUp" | "stagger";
}

const baseStyle: CSSProperties = {
  opacity: 0,
  transform: "translateY(28px)",
  transition: "opacity 0.55s cubic-bezier(0.25,0.1,0.25,1), transform 0.55s cubic-bezier(0.25,0.1,0.25,1)",
  willChange: "opacity, transform",
};

const visibleStyle: CSSProperties = {
  opacity: 1,
  transform: "translateY(0)",
};

export const ScrollReveal = ({ children, className, variant = "fadeUp" }: Props) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Already visible (e.g. SSR / prerender)
    if (el.getBoundingClientRect().top < window.innerHeight - 40) {
      Object.assign(el.style, visibleStyle);
      if (variant === "stagger") applyStagger(el);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          Object.assign(el.style, visibleStyle);
          if (variant === "stagger") applyStagger(el);
          observer.disconnect();
        }
      },
      { rootMargin: "-50px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [variant]);

  return (
    <div ref={ref} className={className} style={baseStyle}>
      {children}
    </div>
  );
};

function applyStagger(container: HTMLElement) {
  const children = Array.from(container.children) as HTMLElement[];
  children.forEach((child, i) => {
    child.style.opacity = "0";
    child.style.transform = "translateY(24px)";
    child.style.transition = `opacity 0.5s ease ${i * 0.08}s, transform 0.5s ease ${i * 0.08}s`;
    // Force a reflow then apply visible state
    void child.offsetHeight;
    requestAnimationFrame(() => {
      child.style.opacity = "1";
      child.style.transform = "translateY(0)";
    });
  });
}

/** Wrap individual items inside a stagger container */
export const RevealItem = ({ children, className }: { children: ReactNode; className?: string }) => (
  <div className={className}>{children}</div>
);
