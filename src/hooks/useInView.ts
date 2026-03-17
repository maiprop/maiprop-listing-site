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
  const { threshold = 0.01, rootMargin = "0px 0px 600px 0px", once = true } = options;
  const ref = useRef<T>(null);
  // Default to true — elements start visible, then we only hide if they're truly off-screen
  const [inView, setInView] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // If already in viewport (or close to it), stay visible immediately
    if (isElementInViewport(el)) {
      setInView(true);
      return;
    }

    // Element is genuinely below the fold — hide it and observe
    setInView(false);

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

    // Hard fallback: reveal after 800ms regardless
    const fallback = setTimeout(() => setInView(true), 800);

    return () => {
      observer.disconnect();
      clearTimeout(fallback);
    };
  }, [threshold, rootMargin, once]);

  return { ref, inView };
}
