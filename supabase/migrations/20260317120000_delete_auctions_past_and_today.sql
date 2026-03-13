-- Delete all auction listings whose auction_date is today or before.
-- Only deletes rows with a non-null auction_date to avoid removing date-TBD auctions.
DELETE FROM public.listings
WHERE listing_type = 'auction'
  AND auction_date IS NOT NULL
  AND (auction_date AT TIME ZONE 'UTC')::date <= (now() AT TIME ZONE 'UTC')::date;
