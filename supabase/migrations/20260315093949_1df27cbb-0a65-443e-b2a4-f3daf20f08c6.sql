
-- 1. contacts table
CREATE TABLE IF NOT EXISTS public.contacts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  source TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='contacts' AND policyname='Users manage own contacts') THEN
    CREATE POLICY "Users manage own contacts" ON public.contacts FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_contacts_user_id ON public.contacts(user_id);

-- 2. deal_checklists table
CREATE TABLE IF NOT EXISTS public.deal_checklists (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT 'Due diligence',
  items JSONB NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'in_progress',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, entity_type, entity_id)
);
ALTER TABLE public.deal_checklists ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='deal_checklists' AND policyname='Users manage own checklists') THEN
    CREATE POLICY "Users manage own checklists" ON public.deal_checklists FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_deal_checklists_user_id ON public.deal_checklists(user_id);

-- 3. portfolios table
CREATE TABLE IF NOT EXISTS public.portfolios (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  listing_ids TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.portfolios ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='portfolios' AND policyname='Users manage own portfolios') THEN
    CREATE POLICY "Users manage own portfolios" ON public.portfolios FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_portfolios_user_id ON public.portfolios(user_id);

-- 4. Add missing columns to favorites
ALTER TABLE public.favorites ADD COLUMN IF NOT EXISTS price_alert BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.favorites ADD COLUMN IF NOT EXISTS price_when_saved NUMERIC;

-- 5. Add is_platform_admin to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_platform_admin BOOLEAN NOT NULL DEFAULT false;

-- 6. Timestamp triggers
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS update_contacts_updated_at ON public.contacts;
CREATE TRIGGER update_contacts_updated_at BEFORE UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_deal_checklists_updated_at ON public.deal_checklists;
CREATE TRIGGER update_deal_checklists_updated_at BEFORE UPDATE ON public.deal_checklists FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_portfolios_updated_at ON public.portfolios;
CREATE TRIGGER update_portfolios_updated_at BEFORE UPDATE ON public.portfolios FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
