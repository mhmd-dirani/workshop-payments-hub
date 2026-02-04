-- Add extra_reason, discount_amount, and discount_reason columns to attendance table
ALTER TABLE public.attendance 
ADD COLUMN extra_reason text,
ADD COLUMN discount_amount numeric DEFAULT 0,
ADD COLUMN discount_reason text;

-- Update daily_salary computation to account for discounts
-- The daily_salary should be: (hours_worked * hourly_rate) + extra_amount - discount_amount
COMMENT ON COLUMN public.attendance.extra_reason IS 'Reason for extra/bonus payment';
COMMENT ON COLUMN public.attendance.discount_amount IS 'Amount to deduct from worker pay';
COMMENT ON COLUMN public.attendance.discount_reason IS 'Reason for the discount/deduction';