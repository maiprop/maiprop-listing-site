import { useState, useRef, useEffect } from "react";
import { Search, Send, MoreVertical, Paperclip, Loader2, MessageSquare, ArrowLeft, Check, CheckCheck, Link2, Copy, ExternalLink } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { useConversations, useMessages, useSendMessage, useMarkMessagesRead } from "@/hooks/useMessages";

type MsgItem = NonNullable<ReturnType<typeof useMessages>["data"]>[number];
import { useAuth } from "@/contexts/AuthContext";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MessageContent } from "@/lib/messageContent";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { SignedAttachment } from "@/components/messages/SignedAttachment";
import { getOtherProfile, getInitials } from "@/lib/messagesHelpers";
import { MESSAGE_ATTACHMENT_MIME_TYPES, assertAllowedUpload } from "@/lib/uploadValidation";
import { getListingDetailPath } from "@/lib/listingRoutes";

export default function Messages() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { data: conversations = [], isLoading: convsLoading } = useConversations();
  const [activeConvId, setActiveConvId] = useState<string>("");
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const [pendingFiles, setPendingFiles] = useState<{ path: string; filename: string; mime_type: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [otherIsTyping, setOtherIsTyping] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Mobile: show list or chat pane
  const [mobileView, setMobileView] = useState<"list" | "chat">("list");

  const { data: messages = [], isLoading: msgsLoading } = useMessages(activeConvId);
  const sendMessage = useSendMessage();
  const markAsRead = useMarkMessagesRead(activeConvId);

  const activeConv = conversations.find((c) => c.id === activeConvId);
  const otherProfile = getOtherProfile(activeConv, user?.id || "");

  // Open conversation passed from property/detail (e.g. after "Contact") or copied deep link.
  useEffect(() => {
    const openIdFromState = (location.state as { openConversationId?: string } | null)?.openConversationId;
    const openIdFromQuery = new URLSearchParams(location.search).get("conversation") ?? undefined;
    const openId = openIdFromState || openIdFromQuery;
    if (openId && typeof openId === "string") {
      setActiveConvId(openId);
      setMobileView("chat");
      if (openIdFromState) navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, location.search, location.pathname, navigate]);

  // Auto-select first conversation when none selected
  useEffect(() => {
    if (conversations.length > 0 && !activeConvId) {
      setActiveConvId(conversations[0].id);
    }
  }, [conversations, activeConvId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Mark messages as read when viewing; only if there are unread from other person
  const hasUnreadFromOther = messages.some((m) => m.sender_id !== user?.id && m.status === "sent");
  useEffect(() => {
    if (activeConvId && hasUnreadFromOther && !markAsRead.isPending) {
      markAsRead.mutate();
    }
  }, [activeConvId, hasUnreadFromOther, markAsRead]);

  // Typing indicator: subscribe to presence on the active conversation channel
  useEffect(() => {
    if (typingChannelRef.current) {
      supabase.removeChannel(typingChannelRef.current);
      typingChannelRef.current = null;
    }
    setOtherIsTyping(false);

    if (!activeConvId || !user) return;

    // Private realtime channel — gated by the realtime.messages SELECT policy
    // added in 20260627000000_audit_remediations.sql which enforces conversation
    // participation. Previously the public channel name `typing:<convId>` was
    // joinable by anyone who knew or guessed a conversation UUID.
    const channel = supabase.channel(`typing:${activeConvId}`, {
      config: { presence: { key: user.id }, private: true },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<{ typing: boolean }>();
        const othersTyping = Object.entries(state).some(
          ([presenceKey, presences]) =>
            presenceKey !== user.id &&
            (presences as { typing?: boolean }[]).some((p) => p.typing)
        );
        setOtherIsTyping(othersTyping);
      })
      .subscribe();

    typingChannelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      typingChannelRef.current = null;
    };
  }, [activeConvId, user]);

  const broadcastTyping = () => {
    if (!typingChannelRef.current || !user) return;
    typingChannelRef.current.track({ typing: true }).catch(() => undefined);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      typingChannelRef.current?.track({ typing: false }).catch(() => undefined);
    }, 3000);
  };

  const handleSend = async () => {
    if ((!input.trim() && pendingFiles.length === 0) || !activeConvId) return;
    const content = input.trim() || (pendingFiles.length > 0 ? "📎" : "");
    sendMessage.mutate({
      conversation_id: activeConvId,
      content,
      attachmentPaths: pendingFiles.length > 0 ? pendingFiles : undefined,
    });
    setInput("");
    setPendingFiles([]);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length || !activeConvId || !user) return;
    // Validate ALL files up-front against the message-attachment allowlist
    // and the 10 MB size cap. The <input accept=".."> is a UX hint only.
    for (let i = 0; i < files.length; i++) {
      try {
        assertAllowedUpload(files[i], MESSAGE_ATTACHMENT_MIME_TYPES, {
          label: "attachment",
          maxBytes: 10 * 1024 * 1024,
        });
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : "Unsupported file");
        e.target.value = "";
        return;
      }
    }
    setUploading(true);
    try {
      const uploaded: { path: string; filename: string; mime_type: string }[] = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const ext = (f.name.split(".").pop() || "bin").toLowerCase();
        const path = `${user.id}/${activeConvId}/${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage.from("message-attachments").upload(path, f, {
          contentType: f.type,
        });
        if (error) throw error;
        uploaded.push({ path, filename: f.name, mime_type: f.type });
      }
      setPendingFiles((prev) => [...prev, ...uploaded]);
    } catch (err: unknown) {
      toast.error((err instanceof Error ? err.message : null) || "Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleSelectConv = (id: string) => {
    setActiveConvId(id);
    setMobileView("chat");
  };

  const activeListingPath = activeConv?.listing_id
    ? getListingDetailPath({
        id: activeConv.listing_id,
        listing_type: activeConv.listings?.listing_type ?? "sale",
        is_pre_sale: activeConv.listings?.is_pre_sale ?? false,
      })
    : null;

  const copyUrl = async (path: string, label: string) => {
    try {
      await navigator.clipboard.writeText(new URL(path, window.location.origin).toString());
      toast.success(`${label} copied`);
    } catch {
      toast.error(`Could not copy ${label.toLowerCase()}`);
    }
  };

  const filteredConvs = conversations.filter((c) => {
    const other = getOtherProfile(c, user?.id || "");
    const name = other?.display_name || "";
    return name.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-16 h-[100dvh] flex overflow-hidden">

        {/* ── Conversation list ── visible on desktop always; on mobile only when mobileView=list */}
        <div className={`
          w-full md:w-72 shrink-0 bg-card border-r border-border flex flex-col
          ${mobileView === "chat" ? "hidden md:flex" : "flex"}
        `}>
          <div className="p-4 border-b border-border">
            <h2 className="font-display font-bold text-lg">Messages</h2>
            <div className="flex items-center gap-2 mt-3 bg-secondary rounded-xl px-3 py-2.5 border border-border">
              <Search className="w-4 h-4 text-muted-foreground shrink-0" />
              <input
                type="text"
                placeholder="Search conversations..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {convsLoading ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : filteredConvs.length === 0 ? (
              <div className="p-6 text-center">
                <MessageSquare className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No conversations yet</p>
                <p className="text-xs text-muted-foreground mt-1 mb-4">Contact an agent from a property listing to start chatting</p>
                <Button variant="outline" size="sm" className="border-border" asChild>
                  <Link to="/listings">Browse Listings</Link>
                </Button>
              </div>
            ) : (
              filteredConvs.map((conv) => {
                const other = getOtherProfile(conv, user?.id || "");
                const lastMsg = conv.messages?.[conv.messages.length - 1];
                const isActive = activeConvId === conv.id;
                return (
                  <button
                    key={conv.id}
                    onClick={() => handleSelectConv(conv.id)}
                    className={`w-full p-4 text-left flex gap-3 border-b border-border transition-colors hover:bg-secondary ${isActive ? "bg-primary/5 border-l-2 border-l-primary" : ""}`}
                  >
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-brand-purple to-brand-cyan-deep flex items-center justify-center font-bold text-primary-foreground text-sm shrink-0 overflow-hidden">
                      {other?.avatar_url ? (
                        <img src={other.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
                      ) : (
                        getInitials(other?.display_name || "?")
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm truncate">{other?.display_name || "Unknown"}</span>
                        {conv.last_message_at && (
                          <span className="text-xs text-muted-foreground shrink-0 ml-1">
                            {new Date(conv.last_message_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                          </span>
                        )}
                      </div>
                      {conv.listings && (
                        <div className="text-xs text-primary/70 truncate">{conv.listings.title} · {conv.listings.city}</div>
                      )}
                      {lastMsg && (
                        <div className="text-xs text-muted-foreground truncate mt-0.5">
                          {lastMsg.sender_id === user?.id ? "You: " : ""}{lastMsg.content}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* ── Chat area ── visible on desktop always; on mobile only when mobileView=chat */}
        <div className={`
          flex-1 flex flex-col min-w-0
          ${mobileView === "list" ? "hidden md:flex" : "flex"}
        `}>
          {!activeConvId || !activeConv ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center px-6">
                <MessageSquare className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                <h3 className="font-display font-semibold text-lg">Select a conversation</h3>
                <p className="text-muted-foreground text-sm mt-1 mb-4">Or start a new one from a property listing</p>
                <Button asChild className="bg-gradient-to-r from-brand-purple to-brand-cyan-deep border-0 text-primary-foreground">
                  <Link to="/listings">Browse Listings</Link>
                </Button>
              </div>
            </div>
          ) : (
            <>
              {/* Chat header */}
              <div className="flex items-center gap-3 p-4 bg-card border-b border-border shrink-0">
                {/* Back button — mobile only */}
                <button
                  onClick={() => setMobileView("list")}
                  className="md:hidden p-2 -ml-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                  aria-label="Back to conversations"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-purple to-brand-cyan-deep flex items-center justify-center font-bold text-primary-foreground text-sm shrink-0 overflow-hidden">
                  {otherProfile?.avatar_url ? (
                    <img src={otherProfile.avatar_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    getInitials(otherProfile?.display_name || "?")
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm">{otherProfile?.display_name || "User"}</div>
                  {activeConv?.listings && activeListingPath && (
                    <Link to={activeListingPath} className="text-xs text-primary/70 hover:text-primary truncate block">
                      {activeConv.listings.title} · {activeConv.listings.city}
                    </Link>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                        aria-label="Conversation options"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuItem
                        disabled={!activeListingPath}
                        onSelect={() => {
                          if (activeListingPath) navigate(activeListingPath);
                        }}
                      >
                        <ExternalLink className="mr-2 h-4 w-4" />
                        View listing
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={!activeListingPath}
                        onSelect={() => {
                          if (activeListingPath) void copyUrl(activeListingPath, "Property link");
                        }}
                      >
                        <Copy className="mr-2 h-4 w-4" />
                        Copy property link
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={() => void copyUrl(`/messages?conversation=${activeConv.id}`, "Conversation link")}>
                        <Copy className="mr-2 h-4 w-4" />
                        Copy conversation link
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
                {msgsLoading ? (
                  <div className="flex items-center justify-center py-20">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="text-center py-16">
                    <p className="text-muted-foreground text-sm">No messages yet. Say hello! 👋</p>
                  </div>
                ) : (
                  messages.map((msg: MsgItem) => {
                    const isMe = msg.sender_id === user?.id;
                    const isRead = msg.status === "read";
                          const attachments = msg.message_attachments || [];
                            return (
                      <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"} gap-2`}>
                        {!isMe && (
                          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-brand-purple to-brand-cyan-deep flex items-center justify-center text-xs font-bold text-primary-foreground shrink-0 mt-1 overflow-hidden">
                            {msg.profiles?.avatar_url ? (
                              <img src={msg.profiles.avatar_url} alt="" className="w-full h-full object-cover" />
                            ) : (
                              getInitials(msg.profiles?.display_name || "?")
                            )}
                          </div>
                        )}
                        <div className={`max-w-[75%] sm:max-w-[60%] px-4 py-3 text-sm leading-relaxed ${isMe ? "chat-bubble-sent" : "chat-bubble-received"}`}>
                          {msg.content ? <MessageContent content={msg.content} /> : null}
                          {attachments.length > 0 && (
                            <div className="mt-2 space-y-1">
                              {attachments.map((a) => (
                                <SignedAttachment key={a.storage_path} path={a.storage_path} filename={a.filename} mimeType={a.mime_type || ""} />
                              ))}
                            </div>
                          )}
                          <div className={`text-[10px] mt-1 flex items-center justify-end gap-1 ${isMe ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                            {new Date(msg.created_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                            {isMe && (isRead ? <CheckCheck className="w-3 h-3" /> : <Check className="w-3 h-3" />)}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={bottomRef} />
              </div>

              {/* Typing indicator */}
              {otherIsTyping && (
                <div className="px-4 sm:px-6 py-1 text-xs text-muted-foreground italic">
                  {otherProfile?.display_name || "The other person"} is typing...
                </div>
              )}

              {/* Input */}
              <div className="p-3 sm:p-4 bg-card border-t border-border shrink-0 pb-safe">
                {pendingFiles.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-2">
                    {pendingFiles.map((f, i) => (
                      <span
                        key={i}
                        className="text-xs px-2 py-1 rounded-lg bg-primary/10 text-primary flex items-center gap-1"
                      >
                        {f.filename}
                        <button
                          type="button"
                          onClick={() => setPendingFiles((p) => p.filter((_, j) => j !== i))}
                          className="hover:text-destructive"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-2 sm:gap-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,.pdf,.doc,.docx"
                    multiple
                    className="hidden"
                    onChange={handleFileSelect}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-50"
                    title="Attach file"
                    aria-label="Attach file"
                  >
                    {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
                  </button>
                  {activeConv?.listing_id && (
                    <button
                      type="button"
                      onClick={() => {
                        const path = activeListingPath ?? `/property/${activeConv.listing_id}`;
                        setInput((prev) => (prev ? `${prev} ${path}` : path));
                      }}
                      className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                      title="Share property link"
                      aria-label="Share property link"
                    >
                      <Link2 className="w-4 h-4" />
                    </button>
                  )}
                  <input
                    type="text"
                    value={input}
                    onChange={e => { setInput(e.target.value); broadcastTyping(); }}
                    onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleSend()}
                    placeholder="Type a message..."
                    className="flex-1 bg-secondary border border-border rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors"
                  />
                  <button
                    onClick={handleSend}
                    disabled={(!input.trim() && pendingFiles.length === 0) || sendMessage.isPending}
                    className="p-2.5 rounded-xl bg-gradient-to-r from-brand-purple to-brand-cyan-deep text-primary-foreground disabled:opacity-50 transition-opacity hover:opacity-90 shrink-0"
                  >
                    {sendMessage.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
