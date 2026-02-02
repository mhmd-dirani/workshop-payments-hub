-- Create workshop assignments table to control user access to workshops
CREATE TABLE public.workshop_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    workshop_id UUID NOT NULL REFERENCES public.workshops(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    assigned_by UUID,
    UNIQUE (user_id, workshop_id)
);

-- Enable RLS
ALTER TABLE public.workshop_assignments ENABLE ROW LEVEL SECURITY;

-- Admins can manage all assignments
CREATE POLICY "Admins can manage workshop assignments"
ON public.workshop_assignments
FOR ALL
USING (has_role(auth.uid(), 'admin'));

-- Users can view their own assignments
CREATE POLICY "Users can view own assignments"
ON public.workshop_assignments
FOR SELECT
USING (auth.uid() = user_id);

-- Create function to check if user has access to a workshop
CREATE OR REPLACE FUNCTION public.user_has_workshop_access(_user_id UUID, _workshop_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    -- Admins always have access
    has_role(_user_id, 'admin')
    OR
    -- Users have access if assigned
    EXISTS (
      SELECT 1
      FROM public.workshop_assignments
      WHERE user_id = _user_id
        AND workshop_id = _workshop_id
    )
$$;

-- Update workshops RLS: users can only see assigned workshops (admins see all)
DROP POLICY IF EXISTS "Authenticated users can view workshops" ON public.workshops;

CREATE POLICY "Users can view assigned workshops or admins see all"
ON public.workshops
FOR SELECT
USING (
  has_role(auth.uid(), 'admin')
  OR
  EXISTS (
    SELECT 1
    FROM public.workshop_assignments
    WHERE workshop_assignments.user_id = auth.uid()
      AND workshop_assignments.workshop_id = workshops.id
  )
);