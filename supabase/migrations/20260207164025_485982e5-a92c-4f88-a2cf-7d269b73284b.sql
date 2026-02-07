
-- Add category column to workers table
ALTER TABLE public.workers ADD COLUMN category text NOT NULL DEFAULT 'worker';
