-- Drop the old restrictive constraint
ALTER TABLE public.workshop_files DROP CONSTRAINT workshop_files_file_type_check;

-- Add new constraint that accepts all image MIME types and PDFs
ALTER TABLE public.workshop_files ADD CONSTRAINT workshop_files_file_type_check 
CHECK (
  file_type LIKE 'image/%' 
  OR file_type = 'application/pdf'
);