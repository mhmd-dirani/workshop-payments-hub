-- Add payment_id to link transfers to payments for cascade delete
ALTER TABLE public.user_transfers 
ADD COLUMN payment_id UUID REFERENCES public.payments(id) ON DELETE CASCADE;