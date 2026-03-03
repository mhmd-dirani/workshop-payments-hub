
CREATE TABLE public.contractor_budget_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_payment_id uuid NOT NULL REFERENCES contractor_payments(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  purchase_date date NOT NULL,
  description text,
  receipt_file_path text,
  receipt_file_name text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.contractor_budget_purchases ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY "Admins can manage all budget purchases"
ON public.contractor_budget_purchases
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'));

-- Users can create purchases
CREATE POLICY "Users can create budget purchases"
ON public.contractor_budget_purchases
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = created_by);

-- Users can view purchases for contractor payments they can see
CREATE POLICY "Users can view budget purchases"
ON public.contractor_budget_purchases
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM contractor_payments cp
    WHERE cp.id = contractor_payment_id
    AND user_has_workshop_access(auth.uid(), cp.workshop_id)
  )
);
