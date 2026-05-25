import { FormEvent, useState } from "react";
import { Megaphone, Send, Link as LinkIcon } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

type Segment = "all" | "investors" | "sellers" | "agents" | "professionals" | "developers";

type BroadcastRpc = (
  fn: "admin_broadcast_notification",
  args: {
    p_segment: Segment;
    p_title: string;
    p_body: string;
    p_type?: string;
    p_link?: string | null;
  },
) => Promise<{ data: number | null; error: Error | null }>;

const SEGMENTS: { value: Segment; label: string }[] = [
  { value: "all", label: "All active users" },
  { value: "investors", label: "Investors" },
  { value: "sellers", label: "Sellers" },
  { value: "agents", label: "Agents" },
  { value: "professionals", label: "Professionals" },
  { value: "developers", label: "Developers" },
];

export default function AdminBroadcastNotifications() {
  const [segment, setSegment] = useState<Segment>("all");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [link, setLink] = useState("");

  const broadcast = useMutation({
    mutationFn: async () => {
      const rpc = supabase.rpc as unknown as BroadcastRpc;
      const { data, error } = await rpc("admin_broadcast_notification", {
        p_segment: segment,
        p_title: title.trim(),
        p_body: body.trim(),
        p_type: "admin_broadcast",
        p_link: link.trim() || null,
      });
      if (error) throw error;
      return data ?? 0;
    },
    onSuccess: (count) => {
      toast.success(`Broadcast sent to ${count} user${count === 1 ? "" : "s"}`);
      setTitle("");
      setBody("");
      setLink("");
      setSegment("all");
    },
    onError: (error: Error) => toast.error(error.message || "Broadcast failed"),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim() || !body.trim()) {
      toast.error("Title and message are required");
      return;
    }
    broadcast.mutate();
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-lg font-semibold flex items-center gap-2">
          <Megaphone className="w-5 h-5 text-primary" /> Broadcast Notifications
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Send in-app notifications to active user segments.
        </p>
      </div>

      <form onSubmit={submit} className="rounded-lg border border-border bg-card p-5 space-y-4 max-w-2xl">
        <div>
          <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5 block">
            Audience
          </label>
          <select
            value={segment}
            onChange={(event) => setSegment(event.target.value as Segment)}
            className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-primary"
          >
            {SEGMENTS.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5 block">
            Title
          </label>
          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={120}
            placeholder="Short notification title"
          />
        </div>

        <div>
          <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5 block">
            Message
          </label>
          <Textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={5}
            maxLength={1000}
            placeholder="Message users will see in their notification panel"
          />
        </div>

        <div>
          <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5 block">
            Link
          </label>
          <div className="relative">
            <LinkIcon className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              value={link}
              onChange={(event) => setLink(event.target.value)}
              className="pl-9"
              placeholder="/dashboard or https://portal.maiprop.co/..."
            />
          </div>
        </div>

        <div className="flex justify-end">
          <Button type="submit" className="gap-2" disabled={broadcast.isPending}>
            <Send className="w-4 h-4" />
            {broadcast.isPending ? "Sending..." : "Send Broadcast"}
          </Button>
        </div>
      </form>
    </div>
  );
}
