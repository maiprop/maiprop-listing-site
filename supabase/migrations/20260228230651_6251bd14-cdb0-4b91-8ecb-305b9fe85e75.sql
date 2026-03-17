
-- Create articles table for persisting AI-generated guide content
CREATE TABLE public.articles (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  topic text NOT NULL,
  title text NOT NULL DEFAULT '',
  meta_description text NOT NULL DEFAULT '',
  content jsonb NOT NULL DEFAULT '{}',
  category text NOT NULL DEFAULT '',
  read_time text NOT NULL DEFAULT '',
  published boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.articles ENABLE ROW LEVEL SECURITY;

-- Public can read published articles
CREATE POLICY "Published articles are publicly readable"
  ON public.articles FOR SELECT
  USING (published = true);

-- Admins can read all (including drafts)
CREATE POLICY "Admins can read all articles"
  ON public.articles FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Admins can insert
CREATE POLICY "Admins can insert articles"
  ON public.articles FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Admins can update
CREATE POLICY "Admins can update articles"
  ON public.articles FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Admins can delete
CREATE POLICY "Admins can delete articles"
  ON public.articles FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Auto-update updated_at
CREATE TRIGGER update_articles_updated_at
  BEFORE UPDATE ON public.articles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
