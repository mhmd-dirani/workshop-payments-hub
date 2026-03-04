
-- Allow users to insert their own debt payments
CREATE POLICY "Users can insert own debt payments"
ON public.debt_payments
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = created_by);

-- Allow users to view their own debt payments
CREATE POLICY "Users can view own debt payments"
ON public.debt_payments
FOR SELECT
TO authenticated
USING (auth.uid() = created_by);
