-- Create attendance table for tracking worker hours
CREATE TABLE public.attendance (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  work_date DATE NOT NULL,
  hours_worked NUMERIC NOT NULL CHECK (hours_worked > 0 AND hours_worked <= 24),
  hourly_rate NUMERIC NOT NULL CHECK (hourly_rate > 0),
  daily_salary NUMERIC GENERATED ALWAYS AS (hours_worked * hourly_rate) STORED,
  description TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, work_date)
);

-- Enable RLS
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

-- Admins can manage all attendance
CREATE POLICY "Admins can manage all attendance"
ON public.attendance
FOR ALL
USING (has_role(auth.uid(), 'admin'));

-- Users can manage their own attendance
CREATE POLICY "Users can manage their own attendance"
ON public.attendance
FOR ALL
USING (auth.uid() = user_id OR auth.uid() = created_by);

-- Add trigger for updated_at
CREATE TRIGGER update_attendance_updated_at
BEFORE UPDATE ON public.attendance
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create personal_payments table for non-workshop payments
CREATE TABLE public.personal_payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  payment_date DATE NOT NULL,
  reason TEXT NOT NULL,
  paid_to TEXT NOT NULL,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.personal_payments ENABLE ROW LEVEL SECURITY;

-- Admins can manage all personal payments
CREATE POLICY "Admins can manage all personal payments"
ON public.personal_payments
FOR ALL
USING (has_role(auth.uid(), 'admin'));

-- Users can manage their own personal payments
CREATE POLICY "Users can manage their own personal payments"
ON public.personal_payments
FOR ALL
USING (auth.uid() = user_id);

-- Create storage bucket for workshop files
INSERT INTO storage.buckets (id, name, public) VALUES ('workshop-files', 'workshop-files', false);

-- Storage policies for workshop files
CREATE POLICY "Authenticated users can upload workshop files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'workshop-files');

CREATE POLICY "Authenticated users can view workshop files"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'workshop-files');

CREATE POLICY "Admins can delete workshop files"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'workshop-files' AND has_role(auth.uid(), 'admin'));

-- Create workshop_files table to track file metadata
CREATE TABLE public.workshop_files (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workshop_id UUID NOT NULL REFERENCES public.workshops(id) ON DELETE CASCADE,
  file_type TEXT NOT NULL CHECK (file_type IN ('map', 'receipt')),
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  payment_id UUID REFERENCES public.payments(id) ON DELETE SET NULL,
  uploaded_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.workshop_files ENABLE ROW LEVEL SECURITY;

-- Admins can manage all workshop files
CREATE POLICY "Admins can manage all workshop files"
ON public.workshop_files
FOR ALL
USING (has_role(auth.uid(), 'admin'));

-- Users can view files in their assigned workshops
CREATE POLICY "Users can view workshop files"
ON public.workshop_files
FOR SELECT
USING (user_has_workshop_access(auth.uid(), workshop_id));

-- Users can upload files to their assigned workshops
CREATE POLICY "Users can upload workshop files"
ON public.workshop_files
FOR INSERT
WITH CHECK (user_has_workshop_access(auth.uid(), workshop_id));