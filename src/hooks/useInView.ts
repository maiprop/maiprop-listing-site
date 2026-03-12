import { useEffect, useRef, useState } from "react";

interface UseInViewOptions {
  threshold?: number;
  rootMargin?: string;
  once?: boolean;
}

function isElementInViewport(el: Element): boolean {
  const rect = el.getBoundingClientRect();
  const viewportH = window.innerHeight || document.documentElement.clientHeight;
  const viewportW = window.innerWidth || document.documentElement.clientWidth;
  // Generous margin: catches everything already on screen + 600px below fold
  return (
    rect.top < viewportH + 600 &&
    rect.bottom > -600 &&
    rect.left < viewportW + 200 &&
    rect.right > -200
  );
}

export function useInView<T extends Element = HTMLDivElement>(
  options: UseInViewOptions = {}
) {
  const { threshold = 0.01, rootMargin = "0px 0px 400px 0px", once = true } = options;
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    // Use rAF so elements have real dimensions after first browser paint
    const raf = requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;

      if (isElementInViewport(el)) {
        setInView(true);
        return;
      }

      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            setInView(true);
            if (once) observer.unobserve(entry.target);
          } else if (!once) {
            setInView(false);
          }
        },
        { threshold, rootMargin }
      );

      observer.observe(el);

      // Hard fallback: reveal after 500ms regardless
      const fallback = setTimeout(() => setInView(true), 500);

      // Note: cleanup for observer/fallback runs on component unmount via the outer effect
      // We store them on the element to clean up
      (el as any).__inViewObserver = observer;
      (el as any).__inViewFallback = fallback;
    });

    return () => {
      cancelAnimationFrame(raf);
      const el = ref.current;
      if (el) {
        (el as any).__inViewObserver?.disconnect();
        clearTimeout((el as any).__inViewFallback);
      }
    };
  }, [threshold, rootMargin, once]);

  return { ref, inView };
}
