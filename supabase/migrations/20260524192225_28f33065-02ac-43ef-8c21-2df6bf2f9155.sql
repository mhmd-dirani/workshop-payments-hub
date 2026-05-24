CREATE POLICY "Uploaders can view their own stored workshop files"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'workshop-files'
  AND EXISTS (
    SELECT 1
    FROM public.workshop_files wf
    WHERE wf.file_path = storage.objects.name
      AND wf.uploaded_by = auth.uid()
  )
);

CREATE POLICY "Uploaders can delete their own stored workshop files"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'workshop-files'
  AND EXISTS (
    SELECT 1
    FROM public.workshop_files wf
    WHERE wf.file_path = storage.objects.name
      AND wf.uploaded_by = auth.uid()
  )
);