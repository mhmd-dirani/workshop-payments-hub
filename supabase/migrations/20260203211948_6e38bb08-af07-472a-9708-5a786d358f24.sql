-- Drop and recreate daily_salary as a generated column that includes extra_amount
ALTER TABLE public.attendance DROP COLUMN daily_salary;

ALTER TABLE public.attendance 
ADD COLUMN daily_salary numeric GENERATED ALWAYS AS ((hours_worked * hourly_rate) + COALESCE(extra_amount, 0)) STORED;