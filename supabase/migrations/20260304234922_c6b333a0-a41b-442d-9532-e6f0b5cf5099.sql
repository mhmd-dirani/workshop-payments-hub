
-- Add status column to debts table (pending/approved), default pending
ALTER TABLE public.debts ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending';

-- Set all existing debts to approved (they were created before the approval system)
UPDATE public.debts SET status = 'approved' WHERE status = 'pending';
