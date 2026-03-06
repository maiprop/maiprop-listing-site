import { useState, useRef, useEffect } from "react";
import { Search, Send, Phone, Video, MoreVertical, Paperclip, Loader2, MessageSquare } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { useConversations, useMessages, useSendMessage } from "@/hooks/useMessages";
import { useAuth } from "@/contexts/AuthContext";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

function getOtherProfile(conv: any, userId: string) {
  if (!conv) return null;
  return conv.profile_a?.user_id === userId ? conv.profile_b : conv.profile_a;
}

function getInitials(name: string) {
  if (!name) return "?";
  return name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase();
}

export default function Messages() {
  const { user } = useAuth();
  const { data: conversations = [], isLoading: convsLoading } = useConversations();
  const [activeConvId, setActiveConvId] = useState<string>("");
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: messages = [], isLoading: msgsLoading } = useMessages(activeConvId);
  const sendMessage = useSendMessage();

  const activeConv = conversations.find((c: any) => c.id === activeConvId);
  const otherProfile = getOtherProfile(activeConv, user?.id || "");

  // Auto-select first conversation
  useEffect(() => {
    if (conversations.length > 0 && !activeConvId) {
      setActiveConvId(conversations[0].id);
    }
  }, [conversations, activeConvId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    if (!input.trim() || !activeConvId) return;
    sendMessage.mutate({ conversation_id: activeConvId, content: input.trim() });
    setInput("");
  };

  const filteredConvs = conversations.filter((c: any) => {
    const other = getOtherProfile(c, user?.id || "");
    const name = other?.display_name || "";
    return name.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-16 h-screen flex">
        {/* Conversation list */}
        <div className="w-72 shrink-0 bg-card border-r border-border flex flex-col">
          <div className="p-4 border-b border-border">
            <h2 className="font-display font-bold text-lg">Messages</h2>
            <div className="flex items-center gap-2 mt-3 bg-secondary rounded-xl px-3 py-2 border border-border">
              <Search className="w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search..."
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
                <p className="text-xs text-muted-foreground mt-1">Contact an agent from a property listing to start chatting</p>
              </div>
            ) : (
              filteredConvs.map((conv: any) => {
                const other = getOtherProfile(conv, user?.id || "");
                const lastMsg = conv.messages?.[conv.messages.length - 1];
                const isActive = activeConvId === conv.id;
                return (
                  <button
                    key={conv.id}
                    onClick={() => setActiveConvId(conv.id)}
                    className={`w-full p-4 text-left flex gap-3 border-b border-border transition-colors hover:bg-secondary ${isActive ? "bg-primary/5 border-l-2 border-l-primary" : ""}`}
                  >
                    <div className="w-10 h-10 rounded-full bg-gradient-primary flex items-center justify-center font-bold text-primary-foreground text-sm shrink-0">
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

        {/* Chat area */}
        {!activeConvId || !activeConv ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <MessageSquare className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-display font-semibold text-lg">Select a conversation</h3>
              <p className="text-muted-foreground text-sm mt-1 mb-4">Or start a new one from a property listing</p>
              <Button asChild className="bg-gradient-primary border-0 text-primary-foreground">
                <Link to="/listings">Browse Listings</Link>
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col min-w-0">
            {/* Chat header */}
            <div className="flex items-center gap-3 p-4 bg-card border-b border-border shrink-0">
              <div className="w-9 h-9 rounded-full bg-gradient-primary flex items-center justify-center font-bold text-primary-foreground text-sm shrink-0 overflow-hidden">
                {otherProfile?.avatar_url ? (
                  <img src={otherProfile.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  getInitials(otherProfile?.display_name || "?")
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm">{otherProfile?.display_name || "User"}</div>
                {activeConv?.listings && (
                  <Link to={`/property/${activeConv.listing_id}`} className="text-xs text-primary/70 hover:text-primary truncate block">
                    {activeConv.listings.title} · {activeConv.listings.city}
                  </Link>
                )}
              </div>
              <div className="flex items-center gap-1">
                <button className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors" title="Voice call">
                  <Phone className="w-4 h-4" />
                </button>
                <button className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors" title="Video call">
                  <Video className="w-4 h-4" />
                </button>
                <button className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                  <MoreVertical className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {msgsLoading ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : messages.length === 0 ? (
                <div className="text-center py-16">
                  <p className="text-muted-foreground text-sm">No messages yet. Say hello! 👋</p>
                </div>
              ) : (
                messages.map((msg: any) => {
                  const isMe = msg.sender_id === user?.id;
                  return (
                    <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"} gap-2`}>
                      {!isMe && (
                        <div className="w-7 h-7 rounded-full bg-gradient-primary flex items-center justify-center text-xs font-bold text-primary-foreground shrink-0 mt-1 overflow-hidden">
                          {msg.profiles?.avatar_url ? (
                            <img src={msg.profiles.avatar_url} alt="" className="w-full h-full object-cover" />
                          ) : (
                            getInitials(msg.profiles?.display_name || "?")
                          )}
                        </div>
                      )}
                      <div className={`max-w-[60%] px-4 py-3 text-sm leading-relaxed ${isMe ? "chat-bubble-sent" : "chat-bubble-received"}`}>
                        {msg.content}
                        <div className={`text-[10px] mt-1 ${isMe ? "text-primary-foreground/60" : "text-muted-foreground"} text-right`}>
                          {new Date(msg.created_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="p-4 bg-card border-t border-border shrink-0">
              <div className="flex items-center gap-3">
                <button className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                  <Paperclip className="w-4 h-4" />
                </button>
                <input
                  type="text"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleSend()}
                  placeholder="Type a message..."
                  className="flex-1 bg-secondary border border-border rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors"
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || sendMessage.isPending}
                  className="p-2.5 rounded-xl bg-gradient-primary text-primary-foreground disabled:opacity-50 transition-opacity hover:opacity-90"
                >
                  {sendMessage.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
