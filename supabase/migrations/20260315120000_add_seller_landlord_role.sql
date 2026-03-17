-- Add seller_landlord to user_role so private sellers/landlords are a distinct segment
-- and eligible for Pro selling addons. Real estate agents remain their own category (agent).

ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'seller_landlord';
