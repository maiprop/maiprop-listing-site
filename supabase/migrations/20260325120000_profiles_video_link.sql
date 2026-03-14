-- Add video_link to profiles for listing owners (agents/sellers) to set default video call URL
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS video_link TEXT;

COMMENT ON COLUMN public.profiles.video_link IS 'Default video call URL for agents/sellers (Zoom, Whereby, etc.) used when confirming video viewings';
