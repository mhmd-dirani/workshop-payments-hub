CREATE POLICY "Users can insert own debts"
ON public.debts
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = created_by);