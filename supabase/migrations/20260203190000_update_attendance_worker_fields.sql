-- Add worker details and approval status to attendance records
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'attendance_status'
  ) THEN
    CREATE TYPE public.attendance_status AS ENUM ('pending', 'approved', 'rejected');
  END IF;
END $$;

ALTER TABLE public.attendance
  ADD COLUMN worker_name TEXT,
  ADD COLUMN workshop_name TEXT,
  ADD COLUMN status public.attendance_status NOT NULL DEFAULT 'pending';

-- Legacy records are considered already reviewed
UPDATE public.attendance
SET status = 'approved'
WHERE status IS NULL;

-- Backfill worker names using existing profile data when available
UPDATE public.attendance AS a
SET worker_name = COALESCE(p.full_name, 'Unknown Worker')
FROM public.profiles p
WHERE a.worker_name IS NULL
  AND a.user_id = p.user_id;

-- Ensure every legacy row has a worker name and workshop label
UPDATE public.attendance
SET worker_name = 'Unknown Worker'
WHERE worker_name IS NULL OR btrim(worker_name) = '';

UPDATE public.attendance
SET workshop_name = COALESCE(workshop_name, 'Unassigned Workshop');

ALTER TABLE public.attendance
  ALTER COLUMN worker_name SET NOT NULL,
  ALTER COLUMN workshop_name SET NOT NULL;

-- Drop the old uniqueness constraint tied to user_id + work_date
ALTER TABLE public.attendance
  DROP CONSTRAINT IF EXISTS attendance_user_id_work_date_key;

-- Remove worker user_id in favor of free-text worker and workshop names
ALTER TABLE public.attendance
  DROP COLUMN IF EXISTS user_id;

-- Refresh policies so creators manage only their submissions while admins keep full access
DROP POLICY IF EXISTS "Users can manage their own attendance" ON public.attendance;

CREATE POLICY "Users manage submitted attendance"
ON public.attendance
FOR ALL
TO authenticated
USING (auth.uid() = created_by)
WITH CHECK (auth.uid() = created_by);
