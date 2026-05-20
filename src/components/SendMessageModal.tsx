import { useState } from "react";
import { MessageSquare, Send, Loader2, CheckCircle2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useStartConversation, useSendMessage } from "@/hooks/useMessages";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

interface SendMessageModalProps {
  open: boolean;
  onClose: () => void;
  professional: {
    id: string;
    user_id: string;
    display_name?: string | null;
    title?: string | null;
  };
}

const SignInRequired = ({ firstName }: { firstName: string }) => (
  <div className="space-y-4 py-4">
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground">
      <p className="font-semibold text-foreground mb-1">Sign in to send an inquiry</p>
      <p>{firstName} can receive messages only from signed-in mAI prop accounts.</p>
    </div>
    <Button className="w-full bg-gradient-primary border-0 text-primary-foreground" asChild>
      <a href="/login">Sign in</a>
    </Button>
  </div>
);

export default function SendMessageModal({ open, onClose, professional }: SendMessageModalProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const startConversation = useStartConversation();
  const sendMessage = useSendMessage();

  const [message, setMessage] = useState("");
  const [done, setDone] = useState(false);
  const isLoading = startConversation.isPending || sendMessage.isPending;

  const proName = professional.display_name || "the professional";
  const firstName = proName.split(" ")[0];

  const handleSend = async () => {
    if (!message.trim()) { toast.error("Please write a message"); return; }

    if (!user) {
      toast.error("Please sign in to send an inquiry.");
      return;
    }

    try {
      const convId = await startConversation.mutateAsync({ other_user_id: professional.user_id });
      await sendMessage.mutateAsync({ conversation_id: convId, content: message });
      toast.success(`Message sent to ${firstName}!`);
      setDone(true);
    } catch (_err: unknown) {
      toast.error("Could not send message. Please try again.");
    }
  };

  const handleClose = () => {
    setDone(false);
    setMessage("");
    onClose();
  };

  const goToMessages = () => { navigate("/messages"); handleClose(); };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="bg-card border-border max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-lg flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-primary" />
            {done ? "Message Sent!" : `Message ${firstName}`}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Send a message or consultation request to this professional.
          </DialogDescription>
        </DialogHeader>

        {!user ? (
          <SignInRequired firstName={firstName} />
        ) : done ? (
          <div className="text-center py-6 space-y-4">
            <div className="w-16 h-16 rounded-full bg-brand-emerald/20 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8 text-brand-emerald" />
            </div>
            <div>
              <p className="font-semibold text-foreground">Your message has been sent!</p>
              <p className="text-sm text-muted-foreground mt-1">{firstName} will typically respond within 2 hours.</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 border-border" onClick={handleClose}>Close</Button>
              <Button className="flex-1 bg-gradient-primary border-0 text-primary-foreground" onClick={goToMessages}>
                View Messages
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Pro context */}
            <div className="flex items-center gap-3 p-3 bg-secondary rounded-xl">
              <div className="w-10 h-10 rounded-lg bg-gradient-primary flex items-center justify-center font-bold text-primary-foreground text-sm shrink-0">
                {proName.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase()}
              </div>
              <div>
                <div className="font-medium text-sm">{proName}</div>
                <div className="text-xs text-muted-foreground">{professional.title}</div>
              </div>
            </div>

            {/* Message */}
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Message *</label>
              <textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder={`Hi ${firstName}, I'm interested in your services for...`}
                rows={5}
                className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary resize-none transition-colors"
              />
              <div className="text-right text-xs text-muted-foreground mt-1">{message.length}/1000</div>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" className="border-border" onClick={handleClose}>Cancel</Button>
              <Button
                className="flex-1 bg-gradient-primary border-0 text-primary-foreground gap-2"
                onClick={handleSend}
                disabled={isLoading || !message.trim()}
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Send Message
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
