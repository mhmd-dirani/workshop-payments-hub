-- Fix 1: Profiles table - restrict to own profile + admins can see all (for displaying names)
DROP POLICY IF EXISTS "Anyone can view profiles" ON public.profiles;

CREATE POLICY "Users can view own profile or admins view all"
ON public.profiles
FOR SELECT
USING (
  auth.uid() = user_id 
  OR has_role(auth.uid(), 'admin'::app_role)
);

-- Fix 2: Payments table - remove public visibility of approved payments
-- Only creator and admins should see payments
DROP POLICY IF EXISTS "Users can view approved payments" ON public.payments;

CREATE POLICY "Users can view own payments or admins view all"
ON public.payments
FOR SELECT
USING (
  created_by = auth.uid() 
  OR has_role(auth.uid(), 'admin'::app_role)
);