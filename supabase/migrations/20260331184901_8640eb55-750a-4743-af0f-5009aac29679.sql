-- Allow co_admins to insert team transfers (for giving money to users)
CREATE POLICY "Co-admins can insert team transfers"
ON public.team_transfers
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'co_admin'::app_role) AND auth.uid() = created_by
);