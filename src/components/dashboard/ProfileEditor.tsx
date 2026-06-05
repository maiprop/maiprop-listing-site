import { useRef, useState, type ChangeEvent } from "react";
import { Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { Profile } from "@/contexts/AuthContext";
import { LocationAutocompleteInput } from "@/components/location/LocationAutocompleteInput";
import { uploadProfileAvatar } from "@/lib/profileAvatarUpload";

export function ProfileEditor({
  profile,
  onUpdate,
  onSwitchToSettings,
}: {
  profile: Profile | null;
  onUpdate: (updates: Partial<Profile>) => Promise<{ error: Error | null }>;
  onSwitchToSettings?: () => void;
}) {
  type ProfileForm = { display_name: string; first_name: string; last_name: string; phone: string; city: string; website_url: string; video_link: string };
  const [form, setForm] = useState<ProfileForm>({
    display_name: profile?.display_name || "",
    first_name:   profile?.first_name   || "",
    last_name:    profile?.last_name    || "",
    phone:        profile?.phone        || "",
    city:         profile?.city         || "",
    website_url:  profile?.website_url  || "",
    video_link:   profile?.video_link   || "",
  });
  const [saving, setSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const initials = (form.display_name || `${form.first_name} ${form.last_name}`.trim() || "U")
    .trim()
    .slice(0, 2)
    .toUpperCase();

  const handleAvatarSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!profile?.user_id) {
      toast.error("Profile is still loading. Please try again.");
      return;
    }
    setAvatarUploading(true);
    try {
      const uploaded = await uploadProfileAvatar(file, profile.user_id);
      const { error } = await onUpdate({ avatar_url: uploaded.url });
      if (error) throw error;
      toast.success("Profile photo updated!");
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to upload profile photo.");
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    const { error } = await onUpdate(form);
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("Profile updated!");
  };

  return (
    <div className="space-y-6 max-w-xl">
      <h1 className="font-display text-2xl font-bold">Edit Profile</h1>
      <div className="glass-card rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 rounded-full border border-border bg-secondary overflow-hidden flex items-center justify-center text-lg font-semibold text-muted-foreground">
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <span>{initials}</span>
            )}
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground mb-2">Profile photo</p>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleAvatarSelected}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2"
              disabled={avatarUploading}
              onClick={() => avatarInputRef.current?.click()}
            >
              {avatarUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Upload photo
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {[
            ["First Name", "first_name"],
            ["Last Name", "last_name"],
          ].map(([label, key]) => (
            <div key={key}>
              <label className="text-xs text-muted-foreground block mb-1.5">{label}</label>
              <input
                value={form[key as keyof ProfileForm]}
                onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary transition-colors"
              />
            </div>
          ))}
        </div>
        {[
          ["Display Name",                       "display_name"],
          ["Phone",                              "phone"       ],
          ["City",                               "city"        ],
          ["Website",                            "website_url" ],
          ["Video call link (Zoom, Whereby…)",   "video_link"  ],
        ].map(([label, key]) => (
          <div key={key}>
            <label className="text-xs text-muted-foreground block mb-1.5">{label}</label>
            {key === "city" ? (
              <LocationAutocompleteInput
                mode="city"
                aria-label={label}
                value={form.city}
                onChange={(value) => setForm(f => ({ ...f, city: value }))}
                inputClassName="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary transition-colors"
              />
            ) : (
              <input
                value={form[key as keyof ProfileForm]}
                onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary transition-colors"
              />
            )}
          </div>
        ))}
        {onSwitchToSettings && (
          <p className="text-xs text-muted-foreground">
            To change your participant type (buyer, seller, agent, etc.), go to{" "}
            <button type="button" onClick={onSwitchToSettings} className="text-primary hover:underline font-medium">
              Settings
            </button>{" "}
            and use &quot;Switch Participant Type&quot;.
          </p>
        )}
        <Button
          className="bg-gradient-primary border-0 text-primary-foreground w-full"
          disabled={saving}
          onClick={handleSave}
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
          Save Changes
        </Button>
      </div>
    </div>
  );
}
