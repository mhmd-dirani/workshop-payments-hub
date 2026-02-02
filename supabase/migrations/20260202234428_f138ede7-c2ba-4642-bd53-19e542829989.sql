-- Update the payments SELECT policy to allow co_admins to view all payments in their assigned workshops
DROP POLICY IF EXISTS "Users can view own payments or admins view all" ON public.payments;

CREATE POLICY "Users can view payments based on role"
ON public.payments
FOR SELECT
USING (
  -- Admins can see all
  has_role(auth.uid(), 'admin'::app_role)
  OR
  -- Co-admins can see all payments in workshops they have access to
  (has_role(auth.uid(), 'co_admin'::app_role) AND user_has_workshop_access(auth.uid(), workshop_id))
  OR
  -- Regular users can only see their own payments
  (created_by = auth.uid())
);