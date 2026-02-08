
-- 1. Fix get_all_payees RPC: restrict to user's accessible payments
CREATE OR REPLACE FUNCTION public.get_all_payees()
RETURNS TABLE(paid_to text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT p.paid_to
  FROM public.payments p
  WHERE 
    has_role(auth.uid(), 'admin')
    OR
    (
      has_role(auth.uid(), 'co_admin')
      AND user_has_workshop_access(auth.uid(), p.workshop_id)
    )
    OR
    p.created_by = auth.uid()
  ORDER BY p.paid_to
$$;

-- 2. Fix storage policies for workshop-files bucket
DROP POLICY IF EXISTS "Authenticated users can upload workshop files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view workshop files" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete workshop files" ON storage.objects;

CREATE POLICY "Users can upload to assigned workshops"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'workshop-files'
  AND (
    has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.workshop_files wf
      WHERE wf.uploaded_by = auth.uid()
      AND user_has_workshop_access(auth.uid(), wf.workshop_id)
    )
    OR EXISTS (
      SELECT 1 FROM public.workshop_assignments wa
      WHERE wa.user_id = auth.uid()
    )
  )
);

CREATE POLICY "Users can view files from assigned workshops"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'workshop-files'
  AND (
    has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.workshop_files wf
      WHERE wf.file_path = name
      AND user_has_workshop_access(auth.uid(), wf.workshop_id)
    )
  )
);

CREATE POLICY "Admins can delete workshop files"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'workshop-files' AND has_role(auth.uid(), 'admin'));

-- 3. Add missing SELECT policy on debts table (admin only)
CREATE POLICY "Admins can view all debts"
ON public.debts
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));
