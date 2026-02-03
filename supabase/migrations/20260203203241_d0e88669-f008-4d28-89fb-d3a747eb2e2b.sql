-- Add extra work columns to attendance table
ALTER TABLE public.attendance 
ADD COLUMN has_extra BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN extra_amount NUMERIC DEFAULT 0;