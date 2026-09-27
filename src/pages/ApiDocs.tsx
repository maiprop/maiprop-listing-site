import { useRef } from "react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { ExternalLink, Lock, Zap, Code2, FileText } from "lucide-react";
import { PROJECT_ID, SECTIONS, AUTH_SNIPPET } from "@/lib/apiDocsData";
import { CodeBlock, EndpointCard } from "@/components/api/ApiDocComponents";

export default function APIDocs() {
  const _sidebarRef = useRef<HTMLDivElement>(null);

  function scrollTo(id: string) {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="min-h-screen bg-background pb-bottom-nav lg:pb-0">
      <Navbar forceScrolled />
      <main id="main-content" className="pt-16">
        {/* Hero */}
        <section className="py-12 border-b border-border bg-muted/30">
          <div className="container max-w-6xl">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Code2 className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-widest font-semibold mb-1">
                  Developers
                </p>
                <div className="flex items-center gap-3 mb-2">
                  <h1 className="font-display text-3xl sm:text-4xl font-bold">
                    maiProp Platform API
                  </h1>
                  <span className="text-xs font-bold px-2 py-1 rounded-full bg-primary/10 text-primary border border-primary/20">
                    v1.0
                  </span>
                </div>
                <p className="text-muted-foreground max-w-2xl">
                  Source contracts for Supabase services and the website catalogue API. Most responses are JSON; property chat streams SSE. Deployment parity must be checked for your selected environment.
                  Protected endpoints require a valid JWT token in the{" "}
                  <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
                    Authorization
                  </code>{" "}
                  header.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <code className="text-xs bg-muted border border-border px-3 py-1.5 rounded-lg font-mono text-foreground/80">
                    {`https://${PROJECT_ID}.supabase.co/functions/v1/`}
                  </code>
                  <span className="text-xs text-muted-foreground">
                    Edge base: replace{" "}
                    <code className="font-mono text-primary">[project-id]</code> with your
                    Supabase project ID. Website listings instead uses https://[website-host]/api/public/listings
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="container max-w-6xl py-10">
          <div className="flex gap-8 items-start">
            {/* Sticky sidebar navigation */}
            <aside
              ref={_sidebarRef}
              className="hidden lg:block w-52 shrink-0 sticky top-24 self-start"
            >
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">
                Sections
              </p>
              <nav className="space-y-1">
                <button
                  onClick={() => scrollTo("auth-section")}
                  className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-xs text-left text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                >
                  <Lock className="w-3.5 h-3.5 shrink-0" /> Authentication
                </button>
                {SECTIONS.map((section) => {
                  const Icon = section.icon;
                  return (
                    <button
                      key={section.id}
                      onClick={() => scrollTo(section.id)}
                      className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-xs text-left text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                    >
                      <Icon className="w-3.5 h-3.5 shrink-0" /> {section.title}
                    </button>
                  );
                })}
                <button
                  onClick={() => scrollTo("try-it")}
                  className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-xs text-left text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                >
                  <Zap className="w-3.5 h-3.5 shrink-0" /> Try It Out
                </button>
              </nav>
            </aside>

            {/* Main content */}
            <div className="flex-1 min-w-0 space-y-12">
              {/* Authentication section */}
              <section id="auth-section">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Lock className="w-4 h-4 text-primary" />
                  </div>
                  <h2 className="font-display text-xl font-bold">Authentication</h2>
                </div>
                <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
                  Protected endpoints use Supabase JWT authentication. Sign in via the Supabase
                  client to obtain a token, then include it in every request header.
                </p>
                <div className="mb-4 flex items-center gap-2 px-4 py-3 rounded-lg bg-muted/50 border border-border">
                  <span className="font-mono text-xs text-muted-foreground">Authorization:</span>
                  <code className="font-mono text-xs text-primary">
                    Bearer &lt;your_supabase_jwt_token&gt;
                  </code>
                </div>
                <CodeBlock
                  code={AUTH_SNIPPET}
                  label="Getting a token (JavaScript / TypeScript)"
                />
              </section>

              {/* API sections */}
              {SECTIONS.map((section) => {
                const Icon = section.icon;
                return (
                  <section key={section.id} id={section.id}>
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Icon className="w-4 h-4 text-primary" />
                      </div>
                      <h2 className="font-display text-xl font-bold">{section.title}</h2>
                      <span className="text-xs text-muted-foreground">
                        {section.endpoints.length} endpoint
                        {section.endpoints.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <div className="space-y-3">
                      {section.endpoints.map((endpoint) => (
                        <EndpointCard key={endpoint.id} endpoint={endpoint} />
                      ))}
                    </div>
                  </section>
                );
              })}

              {/* Try it out */}
              <section
                id="try-it"
                className="rounded-xl border border-primary/20 bg-primary/5 p-6"
              >
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
                    <Zap className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <h2 className="font-display text-lg font-bold mb-1">Try It Out</h2>
                    <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
                      Use synthetic inputs in an explicitly selected local or isolated environment. AI calls consume quota and checkout can create provider sessions. Never put service keys in a browser.
                    </p>
                    <div className="flex flex-wrap gap-3">
                      <Button asChild size="sm" className="gap-2">
                        <a
                          href="https://supabase.com/dashboard"
                          target="_blank"
                          rel="noreferrer"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          Supabase Dashboard
                        </a>
                      </Button>
                      <Button variant="outline" asChild size="sm" className="gap-2">
                        <a
                          href="https://docs.supabase.com/docs/guides/functions"
                          target="_blank"
                          rel="noreferrer"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          Edge Functions Docs
                        </a>
                      </Button>
                    </div>
                  </div>
                </div>
              </section>

              {/* Error codes table */}
              <section>
                <h2 className="font-display text-xl font-bold mb-4">Error Codes</h2>
                <div className="rounded-xl border border-border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/50 border-b border-border">
                        <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          Status
                        </th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          Meaning
                        </th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden sm:table-cell">
                          Common Cause
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {[
                        { code: "200", label: "OK", cause: "Request succeeded" },
                        {
                          code: "400",
                          label: "Bad Request",
                          cause: "Missing or invalid request body / query params",
                        },
                        {
                          code: "401",
                          label: "Unauthorized",
                          cause: "Missing or expired JWT token",
                        },
                        {
                          code: "403",
                          label: "Forbidden",
                          cause: "Authenticated actor lacks permission for this operation",
                        },
                        {
                          code: "422",
                          label: "Unprocessable",
                          cause: "Valid request format but failed business validation",
                        },
                        {
                          code: "429",
                          label: "Rate Limited",
                          cause:
                            "Too many requests — back off and retry after the Retry-After header",
                        },
                        {
                          code: "500",
                          label: "Server Error",
                          cause: "Edge function runtime error — contact support",
                        },
                      ].map((row) => (
                        <tr key={row.code} className="hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-3">
                            <code
                              className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${
                                row.code.startsWith("2")
                                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                                  : row.code.startsWith("4")
                                  ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"
                                  : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400"
                              }`}
                            >
                              {row.code}
                            </code>
                          </td>
                          <td className="px-4 py-3 text-xs font-medium">{row.label}</td>
                          <td className="px-4 py-3 text-xs text-muted-foreground hidden sm:table-cell">
                            {row.cause}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
