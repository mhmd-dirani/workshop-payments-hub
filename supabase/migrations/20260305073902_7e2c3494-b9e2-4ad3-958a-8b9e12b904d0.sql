
-- Drop the overly permissive SELECT policy on contractors
DROP POLICY IF EXISTS "All authenticated users can view contractors" ON public.contractors;

-- Create a new restrictive SELECT policy: only admins can view contractors
CREATE POLICY "Only admins can view contractors"
ON public.contractors
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));
