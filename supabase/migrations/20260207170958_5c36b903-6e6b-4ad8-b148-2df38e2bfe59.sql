
-- Create worker_adjustments table for bonuses and discounts
CREATE TABLE public.worker_adjustments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  worker_id UUID NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  adjustment_type TEXT NOT NULL CHECK (adjustment_type IN ('bonus', 'discount')),
  amount NUMERIC NOT NULL CHECK (amount > 0),
  reason TEXT,
  work_date DATE NOT NULL,
  workshop_id UUID NOT NULL REFERENCES public.workshops(id),
  is_paid BOOLEAN NOT NULL DEFAULT false,
  payment_id UUID REFERENCES public.payments(id) ON DELETE SET NULL,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.worker_adjustments ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Admins can manage all adjustments"
  ON public.worker_adjustments FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can manage adjustments in their workshops"
  ON public.worker_adjustments FOR ALL
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR user_has_workshop_access(auth.uid(), workshop_id)
    OR auth.uid() = created_by
  );

-- Trigger for updated_at
CREATE TRIGGER update_worker_adjustments_updated_at
  BEFORE UPDATE ON public.worker_adjustments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
