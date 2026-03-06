import { useState, useRef, useEffect } from "react";
import { X, Send, Phone, Video, MoreVertical, Paperclip, Image } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ChatWidgetProps {
  open: boolean;
  onClose: () => void;
  agentName: string;
}

interface Message {
  id: string;
  text: string;
  sender: "user" | "agent";
  time: string;
}

const initialMessages: Message[] = [
  {
    id: "1",
    text: "Hello! I'm interested in the property. Could you provide more information about it?",
    sender: "agent",
    time: "10:23",
  },
];

const autoReplies = [
  "Sure! I'd be happy to answer any questions. What would you like to know?",
  "The property is available for viewing this week. Would you like to schedule a visit?",
  "I can arrange a video tour as well if you prefer. Just let me know!",
  "The price is negotiable depending on the terms. Would you like to discuss further?",
];

export default function ChatWidget({ open, onClose, agentName }: ChatWidgetProps) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  let replyIndex = 0;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typing]);

  const sendMessage = () => {
    if (!input.trim()) return;
    const newMsg: Message = {
      id: Date.now().toString(),
      text: input,
      sender: "user",
      time: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }),
    };
    setMessages(prev => [...prev, newMsg]);
    setInput("");
    setTyping(true);

    setTimeout(() => {
      setTyping(false);
      const reply: Message = {
        id: (Date.now() + 1).toString(),
        text: autoReplies[replyIndex % autoReplies.length],
        sender: "agent",
        time: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }),
      };
      replyIndex++;
      setMessages(prev => [...prev, reply]);
    }, 1500);
  };

  if (!open) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 w-80 rounded-2xl overflow-hidden shadow-elevated border border-border bg-card animate-fade-in-up">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 bg-gradient-primary">
        <div className="w-9 h-9 rounded-full bg-primary-foreground/20 flex items-center justify-center font-bold text-primary-foreground text-sm">
          {agentName[0]}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm text-primary-foreground">{agentName}</div>
          <div className="text-xs text-primary-foreground/70 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
            Online
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button className="p-1.5 rounded-lg bg-primary-foreground/10 hover:bg-primary-foreground/20 transition-colors">
            <Phone className="w-3.5 h-3.5 text-primary-foreground" />
          </button>
          <button className="p-1.5 rounded-lg bg-primary-foreground/10 hover:bg-primary-foreground/20 transition-colors">
            <Video className="w-3.5 h-3.5 text-primary-foreground" />
          </button>
          <button className="p-1.5 rounded-lg bg-primary-foreground/10 hover:bg-primary-foreground/20 transition-colors" onClick={onClose}>
            <X className="w-3.5 h-3.5 text-primary-foreground" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="h-64 overflow-y-auto p-4 space-y-3">
        {messages.map(msg => (
          <div key={msg.id} className={`flex ${msg.sender === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[75%] px-3 py-2 text-sm leading-relaxed ${
              msg.sender === "user" ? "chat-bubble-sent" : "chat-bubble-received"
            }`}>
              {msg.text}
              <div className={`text-[10px] mt-1 ${msg.sender === "user" ? "text-primary-foreground/60" : "text-muted-foreground"} text-right`}>
                {msg.time}
              </div>
            </div>
          </div>
        ))}
        {typing && (
          <div className="flex justify-start">
            <div className="chat-bubble-received px-4 py-3 flex gap-1">
              <span className="w-2 h-2 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="w-2 h-2 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="w-2 h-2 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-border bg-card">
        <div className="flex items-center gap-2">
          <button className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
            <Paperclip className="w-4 h-4" />
          </button>
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && sendMessage()}
            placeholder="Type a message..."
            className="flex-1 bg-secondary rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none border border-border focus:border-primary transition-colors"
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim()}
            className="p-2 rounded-xl bg-gradient-primary text-primary-foreground disabled:opacity-50 transition-opacity hover:opacity-90"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
