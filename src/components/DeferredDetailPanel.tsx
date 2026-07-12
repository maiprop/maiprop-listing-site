import { type ReactNode, useEffect, useRef, useState } from "react";

interface DeferredDetailPanelProps {
  children: ReactNode;
  className?: string;
  placeholder: ReactNode;
  rootMargin?: string;
}

/** Delays below-the-fold detail panels until the user is close enough to use them. */
export function DeferredDetailPanel({
  children,
  className,
  placeholder,
  rootMargin = "800px 0px",
}: DeferredDetailPanelProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [enabled, setEnabled] = useState(() => typeof IntersectionObserver === "undefined");

  useEffect(() => {
    if (enabled) return;
    const element = ref.current;
    if (!element) {
      setEnabled(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setEnabled(true);
        observer.disconnect();
      },
      { rootMargin, threshold: 0.01 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [enabled, rootMargin]);

  return (
    <div ref={ref} className={className}>
      {enabled ? children : placeholder}
    </div>
  );
}
