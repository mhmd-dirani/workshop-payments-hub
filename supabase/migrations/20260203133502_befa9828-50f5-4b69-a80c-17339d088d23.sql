-- Create workers table to track external workers
CREATE TABLE public.workers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on workers table
ALTER TABLE public.workers ENABLE ROW LEVEL SECURITY;

-- Admins can manage all workers
CREATE POLICY "Admins can manage all workers"
  ON public.workers
  FOR ALL
  USING (has_role(auth.uid(), 'admin'));

-- Users can manage workers they created
CREATE POLICY "Users can manage their own workers"
  ON public.workers
  FOR ALL
  USING (auth.uid() = created_by);

-- Update trigger for workers
CREATE TRIGGER update_workers_updated_at
  BEFORE UPDATE ON public.workers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Drop the dependent RLS policy first
DROP POLICY IF EXISTS "Users can manage their own attendance" ON public.attendance;

-- Drop user_id column and add worker_id and workshop_id to attendance
ALTER TABLE public.attendance DROP COLUMN user_id;
ALTER TABLE public.attendance ADD COLUMN worker_id UUID NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE;
ALTER TABLE public.attendance ADD COLUMN workshop_id UUID NOT NULL REFERENCES public.workshops(id) ON DELETE CASCADE;

-- Add indexes for better query performance
CREATE INDEX idx_attendance_worker_id ON public.attendance(worker_id);
CREATE INDEX idx_attendance_workshop_id ON public.attendance(workshop_id);
CREATE INDEX idx_workers_created_by ON public.workers(created_by);
CREATE INDEX idx_workers_is_active ON public.workers(is_active);

-- Create new RLS policy for attendance to check workshop access
CREATE POLICY "Users can manage attendance in their workshops"
  ON public.attendance
  FOR ALL
  USING (
    has_role(auth.uid(), 'admin') 
    OR user_has_workshop_access(auth.uid(), workshop_id)
    OR auth.uid() = created_by
  );