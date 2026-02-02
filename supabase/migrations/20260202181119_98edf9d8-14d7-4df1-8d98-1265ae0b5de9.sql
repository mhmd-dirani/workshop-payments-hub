-- Add constraint with higher limit to accommodate existing data
-- The amount_reasonable constraint allows up to 100 million to include existing records
ALTER TABLE public.payments ADD CONSTRAINT amount_reasonable CHECK (amount >= 0.01 AND amount <= 100000000);