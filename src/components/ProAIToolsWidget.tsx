import { useState, useRef, useCallback, useMemo } from "react";
import { Scale, Wrench, HardHat, TrendingUp, Building2, Paintbrush2, Send, Loader2, Sparkles, RotateCcw, Bot, User } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { SUPABASE_URL } from "@/lib/config";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { AIQuotaStatus } from "@/components/AIQuotaStatus";
import { isAiQuotaReached, useAiQuota } from "@/hooks/useAiQuota";
import { parseMutationInput, proAiToolsBodySchema } from "@/lib/mutationSchemas";

const GROUPS = [
  { id: "agents",     label: "Agents",     Icon: Building2 },
  { id: "legal",      label: "Legal",      Icon: Scale },
  { id: "design",     label: "Design",     Icon: Paintbrush2 },
  { id: "trades",     label: "Trades",     Icon: Wrench },
  { id: "finance",    label: "Finance",    Icon: TrendingUp },
  { id: "management", label: "Management", Icon: HardHat },
] as const;

type GroupId = (typeof GROUPS)[number]["id"];

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
}

export default function ProAIToolsWidget() {
  const [groupId, setGroupId] = useState<GroupId>("legal");
  const [messagesByGroup, setMessagesByGroup] = useState<Partial<Record<GroupId, Message[]>>>({});
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const { user } = useAuth();
  const { quota, quotaLoading, refreshQuota } = useAiQuota("pro-ai-tools", user, {
    enabled: !!user,
  });

  const messages = useMemo(() => messagesByGroup[groupId] ?? [], [messagesByGroup, groupId]);

  const setMessages = useCallback((groupId: GroupId, updater: (prev: Message[]) => Message[]) => {
    setMessagesByGroup((prev) => ({
      ...prev,
      [groupId]: updater(prev[groupId] ?? []),
    }));
  }, []);

  const sendMessage = useCallback(async (text?: string) => {
    const query = (text ?? input).trim();
    if (!query || isStreaming) return;

    if (isAiQuotaReached(quota)) {
      setMessages(groupId, (prev) => [
        ...prev,
        {
          id: `q-${Date.now()}`,
          role: "assistant",
          content: "You've reached this month's Pro AI Tools allowance. Upgrade to continue.",
        },
      ]);
      return;
    }

    const userMsg: Message = { id: `u-${Date.now()}`, role: "user", content: query };
    const assistantId = `a-${Date.now()}`;
    const assistantMsg: Message = { id: assistantId, role: "assistant", content: "", streaming: true };

    setMessages(groupId, (prev) => [...prev, userMsg, assistantMsg]);
    setInput("");
    setIsStreaming(true);

    const currentGroupId = groupId;
    const history = [...messages, userMsg]
      .filter((m) => m.content.trim().length > 0)
      .map((m) => ({ role: m.role, content: m.content }));

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setMessages(currentGroupId, (prev) => prev.map((m) =>
          m.id === assistantId ? { ...m, content: "Please sign in to use Pro AI Tools.", streaming: false } : m
        ));
        return;
      }

      abortRef.current = new AbortController();
      const body = parseMutationInput(
        proAiToolsBodySchema,
        { messages: history, groupId: currentGroupId },
        "Pro AI tools",
      );
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/pro-ai-tools`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(body),
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
              setMessages(currentGroupId, (prev) =>
                prev.map((m) => m.id === assistantId ? { ...m, content: accum } : m)
              );
            }
          } catch { /* partial chunk, try next line */ }
        }
      }

      setMessages(currentGroupId, (prev) =>
        prev.map((m) => m.id === assistantId ? { ...m, streaming: false } : m)
      );
      void refreshQuota();
    } catch (e: unknown) {
      if (e instanceof Error && e.name === "AbortError") return;
      setMessages(currentGroupId, (prev) => prev.map((m) =>
        m.id === assistantId
          ? { ...m, content: `⚠️ ${e instanceof Error ? e.message : "Something went wrong."}`, streaming: false }
          : m
      ));
    } finally {
      setIsStreaming(false);
    }
  }, [input, messages, isStreaming, groupId, setMessages, quota, refreshQuota]);

  const clearChat = () => {
    abortRef.current?.abort();
    setMessages(groupId, () => []);
    setIsStreaming(false);
  };

  const ActiveIcon = GROUPS.find((g) => g.id === groupId)?.Icon ?? Sparkles;

  return (
    <div className="flex flex-col h-full">
      {/* Mode tabs */}
      <div className="flex gap-1 p-3 border-b border-border overflow-x-auto shrink-0">
        {GROUPS.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setGroupId(id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-colors ${
              groupId === id
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-muted-foreground hover:text-foreground border border-border"
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-2.5 bg-gradient-primary shrink-0">
        <div className="w-6 h-6 rounded-full bg-primary-foreground/20 flex items-center justify-center shrink-0">
          <ActiveIcon className="w-3.5 h-3.5 text-primary-foreground" />
        </div>
        <p className="text-sm font-semibold text-primary-foreground flex-1">
          {GROUPS.find((g) => g.id === groupId)?.label} AI
        </p>
        {messages.length > 0 && (
          <button onClick={clearChat} title="Clear chat"
            className="p-1.5 rounded-lg bg-primary-foreground/10 hover:bg-primary-foreground/20 transition-colors">
            <RotateCcw className="w-3.5 h-3.5 text-primary-foreground" />
          </button>
        )}
      </div>

      {user && (
        <div className="border-b border-border px-3 py-2 bg-card shrink-0">
          <AIQuotaStatus
            featureName="Pro AI Tools"
            quota={quota}
            quotaLoading={quotaLoading}
            variant="compact"
          />
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center gap-3 py-8">
            <div className="w-12 h-12 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Bot className="w-6 h-6 text-primary" />
            </div>
            <p className="font-display font-semibold text-sm">
              {GROUPS.find((g) => g.id === groupId)?.label} AI Assistant
            </p>
            <p className="text-xs text-muted-foreground max-w-xs">
              Specialist Greek real estate AI — ask anything about{" "}
              {GROUPS.find((g) => g.id === groupId)?.label.toLowerCase()}.
            </p>
          </div>
        ) : (
          messages.map((msg) => (
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
                  <div className="prose prose-sm max-w-none text-foreground [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_p]:text-sm [&_ul]:text-sm [&_li]:my-0.5 [&_strong]:text-foreground [&_code]:bg-muted [&_code]:px-1 [&_code]:rounded [&_code]:text-xs">
                    <ReactMarkdown>{msg.content || (msg.streaming ? "\u200B" : "")}</ReactMarkdown>
                    {msg.streaming && <span className="inline-block w-1.5 h-3.5 bg-primary rounded-sm animate-pulse ml-0.5" />}
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
          ))
        )}
      </div>

      {/* Input */}
      <div className="p-3 border-t border-border shrink-0 bg-card">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
            placeholder={`Ask the ${GROUPS.find((g) => g.id === groupId)?.label.toLowerCase()} AI...`}
            disabled={isStreaming || isAiQuotaReached(quota)}
            className="flex-1 bg-secondary border border-border rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors disabled:opacity-60 min-w-0"
          />
          <button
            onClick={() => sendMessage()}
            disabled={!input.trim() || isStreaming || isAiQuotaReached(quota)}
            className="w-9 h-9 rounded-xl bg-gradient-primary text-primary-foreground flex items-center justify-center disabled:opacity-50 transition-opacity hover:opacity-90 shrink-0"
          >
            {isStreaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
