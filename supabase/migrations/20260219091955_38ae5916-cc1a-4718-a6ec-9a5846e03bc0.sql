ALTER TABLE public.leads ADD COLUMN status text NOT NULL DEFAULT 'new';

CREATE POLICY "Admins can update leads"
ON public.leads
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));
