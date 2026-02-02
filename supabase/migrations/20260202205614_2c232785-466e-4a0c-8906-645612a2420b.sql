-- Create income table for tracking money received (per workshop)
CREATE TABLE public.income (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workshop_id UUID NOT NULL REFERENCES public.workshops(id) ON DELETE CASCADE,
    amount NUMERIC NOT NULL CHECK (amount > 0 AND amount <= 100000000),
    description TEXT,
    income_date DATE NOT NULL,
    created_by UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.income ENABLE ROW LEVEL SECURITY;

-- RLS policies for income (only admins can manage income)
CREATE POLICY "Admins can manage all income"
ON public.income FOR ALL
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view income in their workshops"
ON public.income FOR SELECT
USING (user_has_workshop_access(auth.uid(), workshop_id));

-- Add trigger for updated_at
CREATE TRIGGER update_income_updated_at
    BEFORE UPDATE ON public.income
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Add user_transfers table for admin payments to users (per workshop)
CREATE TABLE public.user_transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workshop_id UUID NOT NULL REFERENCES public.workshops(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    amount NUMERIC NOT NULL CHECK (amount > 0 AND amount <= 100000000),
    description TEXT,
    transfer_date DATE NOT NULL,
    created_by UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_transfers ENABLE ROW LEVEL SECURITY;

-- RLS policies for user_transfers
CREATE POLICY "Admins can manage all transfers"
ON public.user_transfers FOR ALL
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view their own transfers"
ON public.user_transfers FOR SELECT
USING (auth.uid() = user_id);