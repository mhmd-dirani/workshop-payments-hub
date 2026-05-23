ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_amount_check;
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS amount_reasonable;
ALTER TABLE public.payments ADD CONSTRAINT payments_amount_check CHECK (amount >= 0);
ALTER TABLE public.payments ADD CONSTRAINT amount_reasonable CHECK (amount >= 0 AND amount <= 100000000);