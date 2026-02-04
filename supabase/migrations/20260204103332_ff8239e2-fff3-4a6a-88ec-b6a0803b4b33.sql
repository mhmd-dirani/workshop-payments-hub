-- Drop existing workers policies
DROP POLICY IF EXISTS "Admins can manage all workers" ON public.workers;
DROP POLICY IF EXISTS "Users can manage their own workers" ON public.workers;

-- Create new policies: All authenticated users can view all workers (shared pool)
CREATE POLICY "All users can view workers"
ON public.workers
FOR SELECT
TO authenticated
USING (true);

-- Admins can manage all workers (insert, update, delete)
CREATE POLICY "Admins can manage all workers"
ON public.workers
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Users can create workers
CREATE POLICY "Users can create workers"
ON public.workers
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = created_by);

-- Users can update workers they created
CREATE POLICY "Users can update own workers"
ON public.workers
FOR UPDATE
TO authenticated
USING (auth.uid() = created_by);

-- Users can delete workers they created
CREATE POLICY "Users can delete own workers"
ON public.workers
FOR DELETE
TO authenticated
USING (auth.uid() = created_by);