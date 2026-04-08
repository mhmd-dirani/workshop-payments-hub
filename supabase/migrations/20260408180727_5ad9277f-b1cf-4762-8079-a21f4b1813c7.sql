
-- Allow co-admins to view profiles of their assigned members
CREATE POLICY "Co-admins can view assigned member profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'co_admin'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.co_admin_member_assignments
    WHERE co_admin_user_id = auth.uid()
      AND member_user_id = profiles.user_id
  )
);
