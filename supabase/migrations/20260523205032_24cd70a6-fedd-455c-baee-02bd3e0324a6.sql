
-- 1) Restrict user_roles admin policies to authenticated only
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view their own role" ON public.user_roles;

CREATE POLICY "Admins can manage roles"
ON public.user_roles
AS PERMISSIVE
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can view all roles"
ON public.user_roles
AS PERMISSIVE
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can view their own role"
ON public.user_roles
AS PERMISSIVE
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- 2) Allow uploaders to delete their own workshop files
CREATE POLICY "Users can delete own workshop files"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'workshop-files'
  AND EXISTS (
    SELECT 1 FROM public.workshop_files wf
    WHERE wf.file_path = storage.objects.name
      AND wf.uploaded_by = auth.uid()
  )
);

-- 3) Revoke execute on SECURITY DEFINER admin helpers from anon
REVOKE EXECUTE ON FUNCTION public.record_worker_debt_repayment(uuid, numeric, date, text, text, uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_all_payees() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_worker_daily_attendance_summary(date) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_user_role(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.user_has_workshop_access(uuid, uuid) FROM anon, public;

GRANT EXECUTE ON FUNCTION public.record_worker_debt_repayment(uuid, numeric, date, text, text, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_all_payees() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_worker_daily_attendance_summary(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_role(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_workshop_access(uuid, uuid) TO authenticated;
