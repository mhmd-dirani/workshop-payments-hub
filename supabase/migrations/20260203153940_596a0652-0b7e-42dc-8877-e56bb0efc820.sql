-- Add income_id column to workshop_files to link check files to income records
ALTER TABLE public.workshop_files ADD COLUMN income_id uuid REFERENCES public.income(id) ON DELETE CASCADE;

-- Create index for better query performance
CREATE INDEX idx_workshop_files_income_id ON public.workshop_files(income_id);