CREATE POLICY "Uploaders can view their own files"
ON public.workshop_files
FOR SELECT
TO authenticated
USING (auth.uid() = uploaded_by);

CREATE POLICY "Uploaders can delete their own files"
ON public.workshop_files
FOR DELETE
TO authenticated
USING (auth.uid() = uploaded_by);