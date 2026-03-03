
-- Contractors table
CREATE TABLE public.contractors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  specialty text NOT NULL DEFAULT 'other',
  phone text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.contractors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all contractors" ON public.contractors FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "All authenticated users can view contractors" ON public.contractors FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can create contractors" ON public.contractors FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Users can update own contractors" ON public.contractors FOR UPDATE TO authenticated USING (auth.uid() = created_by);

-- Contracts table
CREATE TABLE public.contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_id uuid NOT NULL REFERENCES public.contractors(id) ON DELETE CASCADE,
  workshop_id uuid NOT NULL REFERENCES public.workshops(id) ON DELETE CASCADE,
  total_amount numeric,
  description text,
  status text NOT NULL DEFAULT 'active',
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all contracts" ON public.contracts FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can view contracts in their workshops" ON public.contracts FOR SELECT TO authenticated USING (user_has_workshop_access(auth.uid(), workshop_id));
CREATE POLICY "Users can create contracts" ON public.contracts FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Users can update own contracts" ON public.contracts FOR UPDATE TO authenticated USING (auth.uid() = created_by);

-- Contractor payments table
CREATE TABLE public.contractor_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid REFERENCES public.contracts(id) ON DELETE SET NULL,
  contractor_id uuid NOT NULL REFERENCES public.contractors(id) ON DELETE CASCADE,
  workshop_id uuid NOT NULL REFERENCES public.workshops(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  payment_type text NOT NULL DEFAULT 'advance',
  description text,
  payment_date date NOT NULL,
  payment_id uuid REFERENCES public.payments(id) ON DELETE SET NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.contractor_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all contractor payments" ON public.contractor_payments FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can view contractor payments in their workshops" ON public.contractor_payments FOR SELECT TO authenticated USING (user_has_workshop_access(auth.uid(), workshop_id));
CREATE POLICY "Users can create contractor payments" ON public.contractor_payments FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);

-- Triggers for updated_at
CREATE TRIGGER update_contractors_updated_at BEFORE UPDATE ON public.contractors FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_contracts_updated_at BEFORE UPDATE ON public.contracts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
