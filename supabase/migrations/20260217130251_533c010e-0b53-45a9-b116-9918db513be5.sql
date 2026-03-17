ALTER TABLE public.properties ADD COLUMN sort_order integer NOT NULL DEFAULT 0;

-- Initialize sort_order based on existing date_added order
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY date_added ASC) as rn
  FROM public.properties
)
UPDATE public.properties SET sort_order = ranked.rn FROM ranked WHERE properties.id = ranked.id;