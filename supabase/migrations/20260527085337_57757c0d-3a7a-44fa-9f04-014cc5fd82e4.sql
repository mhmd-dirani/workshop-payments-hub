-- Allow all authenticated users to view attendance records
-- (workers table is already viewable by all authenticated, attendance should match)
CREATE POLICY "All authenticated can view attendance"
ON public.attendance
FOR SELECT
TO authenticated
USING (true);