UPDATE public.contractor_budget_purchases AS bp
SET payment_id = cp.payment_id
FROM public.contractor_payments AS cp,
     public.contractor_payments AS parent
WHERE bp.payment_id IS NULL
  AND parent.id = bp.contractor_payment_id
  AND cp.payment_type = 'budget_purchase'
  AND cp.contractor_id = parent.contractor_id
  AND cp.payment_date = bp.purchase_date
  AND cp.amount = bp.amount
  AND cp.payment_id IS NOT NULL;