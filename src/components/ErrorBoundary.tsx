import { Component, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { logger } from "@/lib/logger";
import { recoverFromChunkLoadError } from "@/lib/chunkLoadRecovery";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, _info: { componentStack: string }) {
    if (recoverFromChunkLoadError(error)) return;
    logger.critical("[ErrorBoundary]", error);
  }

  override render() {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback;
    return (
      <>
        <header className="sticky top-0 z-50 border-b border-border bg-background px-4 py-3">
          <a href="/" className="text-lg font-bold text-foreground">maiProp</a>
        </header>
        <main id="main-content" className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 text-center px-4">
          <p className="text-lg font-semibold">Something went wrong loading this page.</p>
          <p className="text-sm text-muted-foreground max-w-sm">
            {this.state.error?.message ?? "An unexpected error occurred."}
          </p>
          <Button onClick={() => window.location.reload()}>Reload</Button>
        </main>
      </>
    );
  }
}
