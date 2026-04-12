
-- Create holidays table
CREATE TABLE public.holidays (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  holiday_date DATE NOT NULL UNIQUE,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;

-- Only admins can manage holidays
CREATE POLICY "Admins can manage holidays"
ON public.holidays FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- All authenticated users can view holidays
CREATE POLICY "All users can view holidays"
ON public.holidays FOR SELECT TO authenticated
USING (true);

-- Update debt_payments RLS: all authenticated users can view debt payments for worker debts
CREATE POLICY "All users can view worker debt payments"
ON public.debt_payments FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.debts d
    WHERE d.id = debt_payments.debt_id
    AND (d.description ILIKE '%[WORKER_DEBT]%' OR d.description ILIKE '%[ADVANCE_DEBT]%')
  )
);
