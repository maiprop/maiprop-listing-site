import { useState, useRef, useEffect } from "react";
import { Search, Send, Phone, Video, MoreVertical, Paperclip, ChevronLeft } from "lucide-react";
import { Navbar } from "@/components/Navbar";

const conversations = [
  { id: "1", name: "Maria Kostopoulos", lastMsg: "Is the apartment still available?", time: "2m", unread: 2, property: "Modern Apt · Glyfada", avatar: "M" },
  { id: "2", name: "Eleni Stavrou", lastMsg: "Thank you! I'll confirm the viewing.", time: "1h", unread: 0, property: "Villa · Santorini", avatar: "E" },
  { id: "3", name: "Alexandros Petridis", lastMsg: "Can we negotiate the price?", time: "3h", unread: 1, property: "Penthouse · Kolonaki", avatar: "A" },
  { id: "4", name: "Kostas Alexiou", lastMsg: "Sent you the cadastre documents.", time: "1d", unread: 0, property: "Land Plot · Halkidiki", avatar: "K" },
];

const mockMessages: Record<string, Array<{ text: string; sender: "me" | "other"; time: string }>> = {
  "1": [
    { text: "Hello! I saw your listing for the Glyfada apartment.", sender: "other", time: "10:20" },
    { text: "Is the property still available for viewing?", sender: "other", time: "10:21" },
    { text: "Hi Maria! Yes, it is still available. When would you like to schedule a viewing?", sender: "me", time: "10:35" },
  ],
  "2": [
    { text: "I would like to book a video viewing for the Santorini villa.", sender: "other", time: "09:00" },
    { text: "Of course! I can arrange that for tomorrow at 11am. Does that work?", sender: "me", time: "09:15" },
    { text: "Thank you! I'll confirm the viewing.", sender: "other", time: "09:20" },
  ],
};

export default function Messages() {
  const [activeConv, setActiveConv] = useState(conversations[0]);
  const [messages, setMessages] = useState(mockMessages["1"] || []);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const selectConv = (conv: typeof conversations[0]) => {
    setActiveConv(conv);
    setMessages(mockMessages[conv.id] || []);
  };

  const sendMessage = () => {
    if (!input.trim()) return;
    setMessages(prev => [...prev, { text: input, sender: "me", time: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }) }]);
    setInput("");
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-16 h-screen flex">
        {/* Conversation list */}
        <div className="w-72 shrink-0 bg-card border-r border-border flex flex-col">
          <div className="p-4 border-b border-border">
            <h2 className="font-display font-bold">Messages</h2>
            <div className="flex items-center gap-2 mt-3 bg-secondary rounded-xl px-3 py-2 border border-border">
              <Search className="w-4 h-4 text-muted-foreground" />
              <input type="text" placeholder="Search..." className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none" />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {conversations.map(conv => (
              <button
                key={conv.id}
                onClick={() => selectConv(conv)}
                className={`w-full p-4 text-left flex gap-3 border-b border-border transition-colors hover:bg-secondary ${activeConv.id === conv.id ? "bg-primary/5 border-l-2 border-l-primary" : ""}`}
              >
                <div className="w-10 h-10 rounded-full bg-gradient-primary flex items-center justify-center font-bold text-primary-foreground shrink-0">
                  {conv.avatar}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm truncate">{conv.name}</span>
                    <span className="text-xs text-muted-foreground shrink-0 ml-1">{conv.time}</span>
                  </div>
                  <div className="text-xs text-muted-foreground truncate mt-0.5">{conv.lastMsg}</div>
                  <div className="text-xs text-primary/70 truncate mt-0.5">{conv.property}</div>
                </div>
                {conv.unread > 0 && (
                  <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center shrink-0">
                    {conv.unread}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Chat area */}
        <div className="flex-1 flex flex-col">
          {/* Chat header */}
          <div className="flex items-center gap-3 p-4 bg-card border-b border-border">
            <div className="w-9 h-9 rounded-full bg-gradient-primary flex items-center justify-center font-bold text-primary-foreground text-sm">
              {activeConv.avatar}
            </div>
            <div className="flex-1">
              <div className="font-semibold text-sm">{activeConv.name}</div>
              <div className="text-xs text-muted-foreground">{activeConv.property}</div>
            </div>
            <div className="flex items-center gap-1">
              <button className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                <Phone className="w-4 h-4" />
              </button>
              <button className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                <Video className="w-4 h-4" />
              </button>
              <button className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                <MoreVertical className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.sender === "me" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[60%] px-4 py-3 text-sm leading-relaxed ${msg.sender === "me" ? "chat-bubble-sent" : "chat-bubble-received"}`}>
                  {msg.text}
                  <div className={`text-[10px] mt-1 ${msg.sender === "me" ? "text-primary-foreground/60" : "text-muted-foreground"} text-right`}>{msg.time}</div>
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="p-4 bg-card border-t border-border">
            <div className="flex items-center gap-3">
              <button className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                <Paperclip className="w-4 h-4" />
              </button>
              <input
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && sendMessage()}
                placeholder="Type a message..."
                className="flex-1 bg-secondary border border-border rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors"
              />
              <button
                onClick={sendMessage}
                disabled={!input.trim()}
                className="p-2.5 rounded-xl bg-gradient-primary text-primary-foreground disabled:opacity-50 transition-opacity hover:opacity-90"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
