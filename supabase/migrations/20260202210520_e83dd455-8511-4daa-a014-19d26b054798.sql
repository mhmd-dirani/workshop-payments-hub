-- Remove the max amount constraints from payments, income, and user_transfers tables
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_amount_check;
ALTER TABLE public.income DROP CONSTRAINT IF EXISTS income_amount_check;
ALTER TABLE public.user_transfers DROP CONSTRAINT IF EXISTS user_transfers_amount_check;

-- Add new constraints without the upper limit (only require positive amounts)
ALTER TABLE public.payments ADD CONSTRAINT payments_amount_check CHECK (amount > 0);
ALTER TABLE public.income ADD CONSTRAINT income_amount_check CHECK (amount > 0);
ALTER TABLE public.user_transfers ADD CONSTRAINT user_transfers_amount_check CHECK (amount > 0);