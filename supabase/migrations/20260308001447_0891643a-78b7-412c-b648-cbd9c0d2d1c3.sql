
-- Table for consultation bookings, callbacks, and enquiries to professionals
CREATE TABLE IF NOT EXISTS public.consultation_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  professional_id UUID NOT NULL,  -- references professionals.id
  requester_id UUID,               -- nullable: allows guest enquiries
  requester_name TEXT NOT NULL,
  requester_email TEXT NOT NULL,
  requester_phone TEXT,
  request_type TEXT NOT NULL CHECK (request_type IN ('consultation', 'callback', 'message')),
  message TEXT,
  service TEXT,
  preferred_date DATE,
  preferred_time TEXT,
  callback_time TEXT,              -- e.g. "Morning (9-12)", "Afternoon (12-17)"
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.consultation_requests ENABLE ROW LEVEL SECURITY;

-- Anyone can submit a request (for lead generation; requester_id may be null for guests)
CREATE POLICY "Anyone can create consultation requests"
  ON public.consultation_requests FOR INSERT
  WITH CHECK (true);

-- Requester can view their own requests
CREATE POLICY "Requesters can view own requests"
  ON public.consultation_requests FOR SELECT
  USING (auth.uid() = requester_id);

-- Professional can view requests directed at them (via professional_id <-> professionals.user_id)
CREATE POLICY "Professionals can view their requests"
  ON public.consultation_requests FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.professionals p
      WHERE p.id = consultation_requests.professional_id
        AND p.user_id = auth.uid()
    )
  );

-- Professionals can update status of their requests
CREATE POLICY "Professionals can update request status"
  ON public.consultation_requests FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.professionals p
      WHERE p.id = consultation_requests.professional_id
        AND p.user_id = auth.uid()
    )
  );

CREATE TRIGGER update_consultation_requests_updated_at
  BEFORE UPDATE ON public.consultation_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
