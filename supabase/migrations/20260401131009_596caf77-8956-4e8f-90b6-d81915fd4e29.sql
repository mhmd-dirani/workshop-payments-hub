
-- Table: co-admin to member assignments
CREATE TABLE public.co_admin_member_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  co_admin_user_id uuid NOT NULL,
  member_user_id uuid NOT NULL,
  assigned_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(co_admin_user_id, member_user_id)
);

ALTER TABLE public.co_admin_member_assignments ENABLE ROW LEVEL SECURITY;

-- Admins can manage all assignments
CREATE POLICY "Admins can manage all co-admin member assignments"
  ON public.co_admin_member_assignments FOR ALL
  TO public
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Co-admins can view their own assignments
CREATE POLICY "Co-admins can view own member assignments"
  ON public.co_admin_member_assignments FOR SELECT
  TO authenticated
  USING (auth.uid() = co_admin_user_id);
