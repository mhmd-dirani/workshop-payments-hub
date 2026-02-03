-- Add hourly_rate to workers table (default rate per worker)
ALTER TABLE public.workers ADD COLUMN hourly_rate numeric NOT NULL DEFAULT 0;

-- Add is_paid flag to attendance to track which entries have been paid
ALTER TABLE public.attendance ADD COLUMN is_paid boolean NOT NULL DEFAULT false;

-- Add payment_id to link attendance to the payment that covered it
ALTER TABLE public.attendance ADD COLUMN payment_id uuid REFERENCES public.payments(id) ON DELETE SET NULL;

-- Create index for faster filtering of unpaid attendance
CREATE INDEX idx_attendance_is_paid ON public.attendance(is_paid);
CREATE INDEX idx_attendance_payment_id ON public.attendance(payment_id);