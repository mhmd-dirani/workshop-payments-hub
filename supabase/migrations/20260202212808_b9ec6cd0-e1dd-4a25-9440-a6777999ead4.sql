-- Create debts table for tracking money owed
CREATE TABLE public.debts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  person_name TEXT NOT NULL,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  debt_date DATE NOT NULL,
  debt_type TEXT NOT NULL CHECK (debt_type IN ('i_owe', 'they_owe')),
  description TEXT,
  is_settled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID NOT NULL
);

-- Create debt_payments table for tracking repayments
CREATE TABLE public.debt_payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  debt_id UUID NOT NULL REFERENCES public.debts(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  payment_date DATE NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID NOT NULL
);

-- Enable RLS
ALTER TABLE public.debts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.debt_payments ENABLE ROW LEVEL SECURITY;

-- Only admins can manage debts
CREATE POLICY "Admins can manage all debts"
ON public.debts
FOR ALL
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage all debt payments"
ON public.debt_payments
FOR ALL
USING (has_role(auth.uid(), 'admin'));

-- Add triggers for updated_at
CREATE TRIGGER update_debts_updated_at
BEFORE UPDATE ON public.debts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Delete the "Dettes" workshop if it exists
DELETE FROM public.workshops WHERE LOWER(name) = 'dettes';