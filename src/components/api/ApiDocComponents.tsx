import { useState } from "react";
import { Copy, Check, Lock, Globe, ChevronRight } from "lucide-react";
import type { Endpoint } from "@/lib/apiDocsData";
import { METHOD_STYLES } from "@/lib/apiDocsData";

// ── CopyButton ─────────────────────────────────────────────────────────────────

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1 px-2 py-1 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
      title="Copy to clipboard"
    >
      {copied ? (
        <Check className="w-3 h-3 text-emerald-500" />
      ) : (
        <Copy className="w-3 h-3" />
      )}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

// ── CodeBlock ──────────────────────────────────────────────────────────────────

export function CodeBlock({ code, label }: { code: string; label?: string }) {
  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 bg-muted/60 border-b border-border">
        {label ? (
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
            {label}
          </span>
        ) : (
          <span />
        )}
        <CopyButton text={code} />
      </div>
      <pre className="p-4 text-xs font-mono leading-relaxed overflow-x-auto bg-muted/30 text-foreground/85 whitespace-pre-wrap">
        {code}
      </pre>
    </div>
  );
}

// ── EndpointCard ───────────────────────────────────────────────────────────────

export function EndpointCard({ endpoint }: { endpoint: Endpoint }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden" id={endpoint.id}>
      <button
        className="w-full flex items-start gap-3 p-4 text-left hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <span
          className={`text-[11px] font-bold px-2 py-1 rounded font-mono shrink-0 mt-0.5 ${METHOD_STYLES[endpoint.method]}`}
        >
          {endpoint.method}
        </span>
        <div className="flex-1 min-w-0">
          <code className="text-sm font-mono text-foreground break-all">{endpoint.path}</code>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            {endpoint.description}
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            {endpoint.auth ? (
              <span className="flex items-center gap-1 text-[10px] font-semibold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-2 py-0.5 rounded-full">
                <Lock className="w-2.5 h-2.5" /> Auth required
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 px-2 py-0.5 rounded-full">
                <Globe className="w-2.5 h-2.5" /> Public
              </span>
            )}
            <span className="text-[10px] text-muted-foreground">{endpoint.rateLimit}</span>
          </div>
        </div>
        <ChevronRight
          className={`w-4 h-4 text-muted-foreground shrink-0 mt-1 transition-transform ${
            expanded ? "rotate-90" : ""
          }`}
        />
      </button>

      {expanded && (
        <div className="border-t border-border p-4 space-y-4 bg-muted/10">
          {endpoint.requestBody && (
            <CodeBlock code={endpoint.requestBody} label="Request Body (JSON)" />
          )}
          {!endpoint.requestBody && endpoint.method === "GET" && (
            <p className="text-xs text-muted-foreground italic">
              No request body. Use query parameters for filtering.
            </p>
          )}
          <CodeBlock code={endpoint.responseExample} label={endpoint.responseLabel ?? "Synthetic response example (200, JSON)"} />
        </div>
      )}
    </div>
  );
}
