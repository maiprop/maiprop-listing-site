import { useRef, useState } from "react";
import type { ChangeEvent } from "react";
import type { User } from "@supabase/supabase-js";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  MESSAGE_ATTACHMENT_MIME_TYPES,
  assertAllowedUpload,
} from "@/lib/uploadValidation";

export type PendingMessageFile = {
  path: string;
  filename: string;
  mime_type: string;
};

export function useMessageAttachments(
  activeConvId: string,
  user: User | null,
  isMounted: () => boolean,
  onUploadedToConversation: (
    conversationId: string,
    uploaded: PendingMessageFile[],
  ) => void,
) {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: ChangeEvent<HTMLInputElement>) => {
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
    const uploadConversationId = activeConvId;
    const uploaded: PendingMessageFile[] = [];
    setUploading(true);
    try {
      for (let i = 0; i < files.length; i++) {
        if (!isMounted()) return;
        const f = files[i];
        const ext = (f.name.split(".").pop() || "bin").toLowerCase();
        const path = `${user.id}/${uploadConversationId}/${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage.from("message-attachments").upload(path, f, {
          contentType: f.type,
        });
        if (!isMounted()) return;
        if (error) throw error;
        uploaded.push({ path, filename: f.name, mime_type: f.type });
      }
      onUploadedToConversation(uploadConversationId, uploaded);
    } catch (err: unknown) {
      if (!isMounted()) return;
      if (uploaded.length > 0) {
        await supabase.storage
          .from("message-attachments")
          .remove(uploaded.map((file) => file.path));
      }
      if (isMounted()) toast.error((err instanceof Error ? err.message : null) || "Upload failed");
    } finally {
      if (isMounted()) {
        setUploading(false);
        e.target.value = "";
      }
    }
  };

  return { uploading, fileInputRef, handleFileSelect };
}
