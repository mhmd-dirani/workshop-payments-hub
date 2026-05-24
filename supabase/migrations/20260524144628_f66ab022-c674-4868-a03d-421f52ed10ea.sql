-- ============================================================
-- Archive snapshot system + Finished workshop backup
-- ============================================================

-- 1. Workshop status column
ALTER TABLE public.workshops
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','paused','finished','archived'));

-- 2. archive_batches
CREATE TABLE IF NOT EXISTS public.archive_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_date date NOT NULL,
  to_date date NOT NULL,
  label text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','verified','deleted')),
  drive_folder_url text,
  spreadsheet_url text,
  rows_archived jsonb NOT NULL DEFAULT '{}'::jsonb,
  rows_deleted jsonb NOT NULL DEFAULT '{}'::jsonb,
  totals_verified_at timestamptz,
  deleted_at timestamptz,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT archive_batches_range_valid CHECK (from_date <= to_date),
  CONSTRAINT archive_batches_range_unique UNIQUE (from_date, to_date)
);
ALTER TABLE public.archive_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage archive batches" ON public.archive_batches
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Authenticated read archive batches" ON public.archive_batches
  FOR SELECT TO authenticated USING (true);

-- 3. workshop_archive_summaries
CREATE TABLE IF NOT EXISTS public.workshop_archive_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.archive_batches(id) ON DELETE CASCADE,
  workshop_id uuid NOT NULL,
  workshop_name text NOT NULL,
  total_income numeric NOT NULL DEFAULT 0,
  total_approved_payments numeric NOT NULL DEFAULT 0,
  total_worker_salaries numeric NOT NULL DEFAULT 0,
  total_worker_hours numeric NOT NULL DEFAULT 0,
  total_contractor_advances numeric NOT NULL DEFAULT 0,
  total_contractor_materials numeric NOT NULL DEFAULT 0,
  total_debts numeric NOT NULL DEFAULT 0,
  total_debt_payments numeric NOT NULL DEFAULT 0,
  total_transfers numeric NOT NULL DEFAULT 0,
  total_expenses numeric NOT NULL DEFAULT 0,
  net_total numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (batch_id, workshop_id)
);
CREATE INDEX IF NOT EXISTS idx_was_workshop ON public.workshop_archive_summaries(workshop_id);
ALTER TABLE public.workshop_archive_summaries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage workshop summaries" ON public.workshop_archive_summaries
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Authenticated read workshop summaries" ON public.workshop_archive_summaries
  FOR SELECT TO authenticated USING (true);

-- 4. worker_archive_summaries
CREATE TABLE IF NOT EXISTS public.worker_archive_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.archive_batches(id) ON DELETE CASCADE,
  worker_id uuid NOT NULL,
  worker_name text NOT NULL,
  total_hours numeric NOT NULL DEFAULT 0,
  total_salary numeric NOT NULL DEFAULT 0,
  total_extra numeric NOT NULL DEFAULT 0,
  total_discounts numeric NOT NULL DEFAULT 0,
  total_adjustments numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (batch_id, worker_id)
);
CREATE INDEX IF NOT EXISTS idx_wkras_worker ON public.worker_archive_summaries(worker_id);
ALTER TABLE public.worker_archive_summaries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage worker summaries" ON public.worker_archive_summaries
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Authenticated read worker summaries" ON public.worker_archive_summaries
  FOR SELECT TO authenticated USING (true);

-- 5. contractor_archive_summaries
CREATE TABLE IF NOT EXISTS public.contractor_archive_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.archive_batches(id) ON DELETE CASCADE,
  contractor_id uuid NOT NULL,
  contractor_name text NOT NULL,
  total_advances numeric NOT NULL DEFAULT 0,
  total_materials numeric NOT NULL DEFAULT 0,
  total_purchases numeric NOT NULL DEFAULT 0,
  total_budget numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (batch_id, contractor_id)
);
CREATE INDEX IF NOT EXISTS idx_cas_contractor ON public.contractor_archive_summaries(contractor_id);
ALTER TABLE public.contractor_archive_summaries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage contractor summaries" ON public.contractor_archive_summaries
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Authenticated read contractor summaries" ON public.contractor_archive_summaries
  FOR SELECT TO authenticated USING (true);

-- 6. user_balance_archive_summaries (preserves balance formula components per user)
CREATE TABLE IF NOT EXISTS public.user_balance_archive_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.archive_batches(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  received numeric NOT NULL DEFAULT 0,         -- SUM(team_transfers.amount)
  workshop_spent numeric NOT NULL DEFAULT 0,   -- SUM(approved payments by user)
  personal_spent numeric NOT NULL DEFAULT 0,   -- SUM(personal_payments)
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (batch_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_ubas_user ON public.user_balance_archive_summaries(user_id);
ALTER TABLE public.user_balance_archive_summaries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage user balance summaries" ON public.user_balance_archive_summaries
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Users read own balance summaries or admin" ON public.user_balance_archive_summaries
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));

-- 7. finished_workshop_archives
CREATE TABLE IF NOT EXISTS public.finished_workshop_archives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id uuid NOT NULL,
  workshop_name text NOT NULL,
  archived_by uuid NOT NULL,
  archived_at timestamptz NOT NULL DEFAULT now(),
  drive_folder_url text,
  spreadsheet_urls jsonb NOT NULL DEFAULT '{}'::jsonb,
  final_totals jsonb NOT NULL DEFAULT '{}'::jsonb,
  final_balances jsonb NOT NULL DEFAULT '{}'::jsonb,
  backup_verified boolean NOT NULL DEFAULT false,
  deleted_from_database boolean NOT NULL DEFAULT false,
  deleted_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_fwa_active_one_per_workshop
  ON public.finished_workshop_archives(workshop_id)
  WHERE deleted_from_database = false;
ALTER TABLE public.finished_workshop_archives ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage finished workshop archives" ON public.finished_workshop_archives
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins read finished workshop archives" ON public.finished_workshop_archives
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));
