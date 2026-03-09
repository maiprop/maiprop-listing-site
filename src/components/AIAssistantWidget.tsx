import { useState, useRef, useEffect, useCallback, forwardRef } from "react";
import { Sparkles, X, Send, Loader2, Bot, User, ChevronDown, RotateCcw } from "lucide-react";
import ReactMarkdown from "react-markdown";

export interface PropertyContext {
  title?: string;
  city?: string;
  address?: string;
  price?: number;
  pricePerSqm?: number;
  propertyType?: string;
  listingType?: string;
  sqm?: number;
  bedrooms?: number;
  bathrooms?: number;
  floor?: number;
  yearBuilt?: number;
  energyClass?: string;
  heatingSystem?: string;
  hasParking?: boolean;
  hasPool?: boolean;
  hasElevator?: boolean;
  hasGarden?: boolean;
  hasBalcony?: boolean;
  hasAC?: boolean;
  hasFireplace?: boolean;
  hasFurnished?: boolean;
  hasStorage?: boolean;
  hasSmartHome?: boolean;
  petsAllowed?: boolean;
  hasView?: boolean;
  latitude?: number;
  longitude?: number;
  region?: string;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
}

interface AIAssistantWidgetProps {
  propertyContext?: PropertyContext;
}

const SUGGESTIONS_GENERIC = [
  "What are the best neighbourhoods in Athens to buy?",
  "Explain ENFIA tax in Greece",
  "What costs are involved in buying a property in Greece?",
  "How does the Greek property auction process work?",
];

const SUGGESTIONS_PROPERTY = (ctx: PropertyContext) => [
  `Is €${ctx.price ? Math.round(ctx.price / 1000) : "?"}k a fair price for this area?`,
  "What schools are near this property?",
  "What's the commute like from here to the city centre?",
  "What should I know about this neighbourhood?",
];

const AIAssistantWidget = forwardRef<HTMLDivElement, AIAssistantWidgetProps>(function AIAssistantWidget({ propertyContext }, _ref) {
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const suggestions = propertyContext
    ? SUGGESTIONS_PROPERTY(propertyContext)
    : SUGGESTIONS_GENERIC;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (open && !minimized) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open, minimized]);

  const sendMessage = useCallback(async (text?: string) => {
    const query = (text ?? input).trim();
    if (!query || isStreaming) return;

    const userMsg: Message = { id: `u-${Date.now()}`, role: "user", content: query };
    const assistantId = `a-${Date.now()}`;
    const assistantMsg: Message = { id: assistantId, role: "assistant", content: "", streaming: true };

    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setInput("");
    setIsStreaming(true);

    const history = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }));

    try {
      abortRef.current = new AbortController();
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const resp = await fetch(`${supabaseUrl}/functions/v1/property-chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${anonKey}`,
        },
        body: JSON.stringify({ messages: history, propertyContext }),
        signal: abortRef.current.signal,
      });

      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${resp.status}`);
      }

      if (!resp.body) throw new Error("No response body");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let accum = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let nl: number;
        while ((nl = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, nl);
          buffer = buffer.slice(nl + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") break;
          try {
            const parsed = JSON.parse(jsonStr);
            const delta = parsed.choices?.[0]?.delta?.content ?? "";
            if (delta) {
              accum += delta;
              setMessages(prev =>
                prev.map(m => m.id === assistantId ? { ...m, content: accum } : m)
              );
            }
          } catch {
            buffer = line + "\n" + buffer;
            break;
          }
        }
      }

      // flush remaining buffer
      for (const raw of buffer.split("\n")) {
        const trimmed = raw.trim();
        if (!trimmed.startsWith("data: ")) continue;
        const jsonStr = trimmed.slice(6).trim();
        if (jsonStr === "[DONE]") continue;
        try {
          const parsed = JSON.parse(jsonStr);
          const delta = parsed.choices?.[0]?.delta?.content ?? "";
          if (delta) {
            accum += delta;
            setMessages(prev =>
              prev.map(m => m.id === assistantId ? { ...m, content: accum } : m)
            );
          }
        } catch { /* ignore */ }
      }

      setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, streaming: false } : m));
    } catch (e: any) {
      if (e.name === "AbortError") return;
      setMessages(prev =>
        prev.map(m =>
          m.id === assistantId
            ? { ...m, content: `⚠️ ${e.message || "Something went wrong."}`, streaming: false }
            : m
        )
      );
    } finally {
      setIsStreaming(false);
    }
  }, [input, messages, isStreaming, propertyContext]);

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const clearChat = () => {
    abortRef.current?.abort();
    setMessages([]);
    setIsStreaming(false);
  };

  // ── Floating button (closed state) ──────────────────────────────────────────
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-gradient-primary text-primary-foreground shadow-elevated flex items-center justify-center hover:scale-105 active:scale-95 transition-transform group"
        aria-label="Open AI assistant"
      >
        <Sparkles className="w-6 h-6" />
        {/* pulse ring */}
        <span className="absolute inset-0 rounded-full border-2 border-primary/40 animate-ping" />
        <span className="absolute -top-8 right-0 bg-card border border-border text-foreground text-xs px-2 py-1 rounded-lg shadow whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          AI Assistant
        </span>
      </button>
    );
  }

  // ── Chat window ──────────────────────────────────────────────────────────────
  return (
    <div
      className={`fixed bottom-6 right-6 z-50 w-[360px] bg-card border border-border rounded-2xl shadow-elevated flex flex-col overflow-hidden transition-all duration-200 ${
        minimized ? "h-[52px]" : "h-[520px]"
      }`}
    >
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-3 bg-gradient-primary shrink-0">
        <div className="w-7 h-7 rounded-full bg-primary-foreground/20 flex items-center justify-center shrink-0">
          <Sparkles className="w-3.5 h-3.5 text-primary-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-primary-foreground leading-tight">
            AI Property Assistant
          </p>
          {propertyContext?.title && (
            <p className="text-[10px] text-primary-foreground/70 truncate">{propertyContext.title}</p>
          )}
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <button onClick={clearChat} title="Clear chat"
              className="p-1.5 rounded-lg bg-primary-foreground/10 hover:bg-primary-foreground/20 transition-colors">
              <RotateCcw className="w-3.5 h-3.5 text-primary-foreground" />
            </button>
          )}
          <button onClick={() => setMinimized(!minimized)} title="Minimise"
            className="p-1.5 rounded-lg bg-primary-foreground/10 hover:bg-primary-foreground/20 transition-colors">
            <ChevronDown className={`w-3.5 h-3.5 text-primary-foreground transition-transform ${minimized ? "rotate-180" : ""}`} />
          </button>
          <button onClick={() => { setOpen(false); setMinimized(false); }} title="Close"
            className="p-1.5 rounded-lg bg-primary-foreground/10 hover:bg-primary-foreground/20 transition-colors">
            <X className="w-3.5 h-3.5 text-primary-foreground" />
          </button>
        </div>
      </div>

      {!minimized && (
        <>
          {/* Messages area */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center gap-3 py-4">
                <div className="w-12 h-12 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
                  <Bot className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <p className="font-display font-semibold text-sm">Ask me anything</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {propertyContext
                      ? "I know all about this property & area"
                      : "Greek real estate expert at your service"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5 justify-center mt-1">
                  {suggestions.map(s => (
                    <button
                      key={s}
                      onClick={() => sendMessage(s)}
                      disabled={isStreaming}
                      className="px-2.5 py-1.5 rounded-xl bg-secondary border border-border text-[11px] text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors disabled:opacity-50 text-left"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {messages.map(msg => (
                  <div key={msg.id} className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    {msg.role === "assistant" && (
                      <div className="w-6 h-6 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 mt-0.5">
                        <Sparkles className="w-3 h-3 text-primary" />
                      </div>
                    )}
                    <div className={`max-w-[82%] px-3 py-2 rounded-2xl text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "bg-gradient-primary text-primary-foreground rounded-br-sm"
                        : "bg-secondary border border-border text-foreground rounded-bl-sm"
                    }`}>
                      {msg.role === "assistant" ? (
                        <div className="prose prose-sm max-w-none text-foreground [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_p]:text-sm [&_ul]:text-sm [&_ol]:text-sm [&_li]:my-0.5 [&_strong]:text-foreground [&_code]:bg-muted [&_code]:px-1 [&_code]:rounded [&_code]:text-xs">
                          <ReactMarkdown>{msg.content || (msg.streaming ? "​" : "")}</ReactMarkdown>
                          {msg.streaming && (
                            <span className="inline-block w-1.5 h-3.5 bg-primary rounded-sm animate-pulse ml-0.5" />
                          )}
                        </div>
                      ) : (
                        <span>{msg.content}</span>
                      )}
                    </div>
                    {msg.role === "user" && (
                      <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center shrink-0 mt-0.5">
                        <User className="w-3 h-3 text-primary" />
                      </div>
                    )}
                  </div>
                ))}
                <div ref={bottomRef} />
              </>
            )}
          </div>

          {/* Input */}
          <div className="p-3 border-t border-border shrink-0 bg-card">
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder={propertyContext ? "Ask about this property..." : "Ask a real estate question..."}
                disabled={isStreaming}
                className="flex-1 bg-secondary border border-border rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors disabled:opacity-60 min-w-0"
              />
              <button
                onClick={() => sendMessage()}
                disabled={!input.trim() || isStreaming}
                className="w-9 h-9 rounded-xl bg-gradient-primary text-primary-foreground flex items-center justify-center disabled:opacity-50 transition-opacity hover:opacity-90 shrink-0"
              >
                {isStreaming
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Send className="w-4 h-4" />
                }
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1.5 text-center">
              Powered by Lovable AI · Answers may not be fully accurate
            </p>
          </div>
        </>
      )}
    </div>
  );
}
