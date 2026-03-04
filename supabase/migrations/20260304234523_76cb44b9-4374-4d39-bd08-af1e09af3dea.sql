
-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Admins can manage all debts" ON public.debts;
DROP POLICY IF EXISTS "Admins can view all debts" ON public.debts;
DROP POLICY IF EXISTS "Users can insert own debts" ON public.debts;

-- Recreate as PERMISSIVE policies
CREATE POLICY "Admins can manage all debts"
ON public.debts
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can insert own debts"
ON public.debts
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can view own debts"
ON public.debts
FOR SELECT
TO authenticated
USING (auth.uid() = created_by);
