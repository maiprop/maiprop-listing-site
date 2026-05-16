import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import logoImg from "@/assets/logo.png";
import { cn } from "@/lib/utils";
import type { OnboardingStep } from "@/lib/onboardingConfig";

export function OnboardingShell({
  children,
  stepIndex,
  totalSteps,
  onBack,
  step,
}: {
  children: React.ReactNode;
  stepIndex: number;
  totalSteps: number;
  step: OnboardingStep;
  onBack?: () => void;
}) {
  const prevStepRef = useRef<OnboardingStep | null>(null);
  const prevIndexRef = useRef(stepIndex);
  const [displayedChildren, setDisplayedChildren] = useState(children);
  const [animClass, setAnimClass] = useState("opacity-100 translate-x-0");
  const [isTransitioning, setIsTransitioning] = useState(false);

  useEffect(() => {
    if (prevStepRef.current === null) {
      prevStepRef.current = step;
      prevIndexRef.current = stepIndex;
      return;
    }
    if (prevStepRef.current === step) return;

    const forward = stepIndex >= prevIndexRef.current;
    prevStepRef.current = step;
    prevIndexRef.current = stepIndex;

    setIsTransitioning(true);
    setAnimClass(forward ? "opacity-0 -translate-x-6" : "opacity-0 translate-x-6");

    const t = setTimeout(() => {
      setDisplayedChildren(children);
      setAnimClass(forward ? "opacity-0 translate-x-6" : "opacity-0 -translate-x-6");

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setAnimClass("opacity-100 translate-x-0");
          setIsTransitioning(false);
        });
      });
    }, 170);

    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  useEffect(() => {
    if (!isTransitioning) setDisplayedChildren(children);
  }, [children, isTransitioning]);

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-start px-4 pt-10 pb-16 overflow-x-hidden">
      <div className="mb-6 text-center shrink-0">
        <Link to="/">
          <img src={logoImg} alt="mAI prop" className="h-10 w-auto object-contain mx-auto" />
        </Link>
      </div>

      {totalSteps > 1 && (
        <div className="flex items-center gap-1.5 mb-8 shrink-0">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div
              key={i}
              className={cn(
                "h-1.5 rounded-full transition-all duration-500",
                i + 1 < stepIndex ? "bg-primary w-5" :
                i + 1 === stepIndex ? "bg-primary w-10" : "bg-muted w-5"
              )}
            />
          ))}
          <span className="text-xs text-muted-foreground ml-1">{Math.min(stepIndex, totalSteps)}/{totalSteps}</span>
        </div>
      )}

      <div className="w-full max-w-2xl">
        {onBack ? (
          <button onClick={onBack} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-4 transition-colors">
            ← Back
          </button>
        ) : step !== "done" && (
          <Link to="/" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-4 transition-colors">
            ← Back to home
          </Link>
        )}

        <div className={cn("transition-all duration-200 ease-out will-change-transform", animClass)}>
          {displayedChildren}
        </div>
      </div>
    </div>
  );
}
