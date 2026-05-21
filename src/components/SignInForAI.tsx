import { Link, useLocation } from "react-router-dom";
import { LogIn, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SignInForAIProps {
  /** Short label for the feature (e.g. "AI Market Insights", "AI Search") */
  feature?: string;
  className?: string;
}

/** Shown when an anonymous user tries to use an AI feature. Prompts sign-in with return URL. */
export function SignInForAI({ feature = "AI features", className = "" }: SignInForAIProps) {
  const location = useLocation();

  return (
    <div
      className={`flex flex-col items-center justify-center gap-4 py-8 px-4 rounded-xl border border-dashed border-primary/30 bg-primary/5 ${className}`}
    >
      <div className="flex items-center gap-2 text-primary">
        <Sparkles className="w-5 h-5" />
        <span className="font-medium text-sm">{feature} requires sign-in</span>
      </div>
      <p className="text-xs text-muted-foreground text-center max-w-[260px]">
        Sign in to use AI-powered analysis, search, and insights.
      </p>
      <Button asChild size="sm" className="gap-2">
        <Link to="/login" state={{ from: location }}>
          <LogIn className="w-3.5 h-3.5" />
          Sign in
        </Link>
      </Button>
    </div>
  );
}
