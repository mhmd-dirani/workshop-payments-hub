-- Create new table for workshop-independent team transfers
CREATE TABLE public.team_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  transfer_date DATE NOT NULL,
  description TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.team_transfers ENABLE ROW LEVEL SECURITY;

-- Admin can manage all team transfers
CREATE POLICY "Admins can manage all team transfers"
  ON public.team_transfers FOR ALL
  USING (has_role(auth.uid(), 'admin'));

-- Users can view their own team transfers
CREATE POLICY "Users can view their own team transfers"
  ON public.team_transfers FOR SELECT
  USING (auth.uid() = user_id);