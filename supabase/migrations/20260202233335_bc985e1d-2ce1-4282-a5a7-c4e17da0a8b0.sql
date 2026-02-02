-- Create a security definer function to get all unique payees
-- This allows users to see all recipient names for autocomplete convenience
CREATE OR REPLACE FUNCTION public.get_all_payees()
RETURNS TABLE(paid_to text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT p.paid_to
  FROM public.payments p
  ORDER BY p.paid_to
$$;