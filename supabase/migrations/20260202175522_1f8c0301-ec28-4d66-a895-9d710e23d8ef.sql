-- Add rejection_reason column to payments table
ALTER TABLE public.payments 
ADD COLUMN rejection_reason text;