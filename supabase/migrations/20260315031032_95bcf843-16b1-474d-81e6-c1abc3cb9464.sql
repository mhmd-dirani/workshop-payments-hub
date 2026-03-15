
CREATE POLICY "All authenticated can view worker debts"
ON public.debts FOR SELECT
TO authenticated
USING (
  description ILIKE '%[WORKER_DEBT]%' OR description ILIKE '%[ADVANCE_DEBT]%'
);
