
ALTER TABLE public.contractor_budget_purchases
  ADD COLUMN IF NOT EXISTS payment_id uuid;

-- Backfill payment_id by matching budget purchases with their contractor_payments(budget_purchase) rows
-- via description + amount + date (best-effort).
UPDATE public.contractor_budget_purchases bp
SET payment_id = cp.payment_id
FROM public.contractor_payments cp
WHERE bp.payment_id IS NULL
  AND cp.payment_type = 'budget_purchase'
  AND cp.payment_id IS NOT NULL
  AND cp.contractor_id = (
    SELECT contractor_id FROM public.contractor_payments parent
    WHERE parent.id = bp.contractor_payment_id
  )
  AND cp.amount = bp.amount
  AND cp.payment_date = bp.purchase_date
  AND COALESCE(cp.description, '') = COALESCE(bp.description, '');
