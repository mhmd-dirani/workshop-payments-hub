CREATE OR REPLACE FUNCTION public.sync_debt_settlement_from_payments()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _debt_id uuid;
  _total_paid numeric;
  _debt_amount numeric;
BEGIN
  _debt_id := COALESCE(NEW.debt_id, OLD.debt_id);

  IF _debt_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT amount INTO _debt_amount
  FROM public.debts
  WHERE id = _debt_id;

  IF _debt_amount IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO _total_paid
  FROM public.debt_payments
  WHERE debt_id = _debt_id;

  UPDATE public.debts
  SET is_settled = (_total_paid >= _debt_amount),
      updated_at = now()
  WHERE id = _debt_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS sync_debt_settlement_after_payment_change ON public.debt_payments;
CREATE TRIGGER sync_debt_settlement_after_payment_change
AFTER INSERT OR UPDATE OR DELETE ON public.debt_payments
FOR EACH ROW
EXECUTE FUNCTION public.sync_debt_settlement_from_payments();

CREATE OR REPLACE FUNCTION public.record_worker_debt_repayment(
  _debt_id uuid,
  _amount numeric,
  _payment_date date,
  _description text,
  _repayment_mode text,
  _worker_id uuid DEFAULT NULL,
  _workshop_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _debt public.debts%ROWTYPE;
  _existing_paid numeric;
  _remaining numeric;
  _payment_id uuid;
  _total_paid numeric;
  _actor uuid := auth.uid();
  _worker_name text;
BEGIN
  IF _actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'Repayment amount must be greater than zero';
  END IF;

  IF _repayment_mode NOT IN ('separate', 'salary') THEN
    RAISE EXCEPTION 'Invalid repayment mode';
  END IF;

  SELECT * INTO _debt
  FROM public.debts
  WHERE id = _debt_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Debt not found';
  END IF;

  IF COALESCE(_debt.description, '') NOT ILIKE '%[WORKER_DEBT]%'
     AND COALESCE(_debt.description, '') NOT ILIKE '%[ADVANCE_DEBT]%' THEN
    RAISE EXCEPTION 'Only worker debts can be repaid here';
  END IF;

  IF _debt.status <> 'approved' THEN
    RAISE EXCEPTION 'Debt must be approved before repayment';
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO _existing_paid
  FROM public.debt_payments
  WHERE debt_id = _debt_id;

  _remaining := GREATEST(0, _debt.amount - _existing_paid);

  IF _amount > _remaining THEN
    RAISE EXCEPTION 'Repayment amount exceeds remaining debt';
  END IF;

  INSERT INTO public.debt_payments (debt_id, amount, payment_date, description, created_by)
  VALUES (_debt_id, _amount, _payment_date, _description, _actor)
  RETURNING id INTO _payment_id;

  IF _repayment_mode = 'separate' THEN
    INSERT INTO public.team_transfers (user_id, amount, transfer_date, description, created_by)
    VALUES (
      _debt.created_by,
      _amount,
      _payment_date,
      'Debt repayment from ' || _debt.person_name || ' [DEBT_REPAYMENT:' || _debt_id::text || ']',
      _actor
    );
  ELSE
    IF _worker_id IS NULL OR _workshop_id IS NULL THEN
      RAISE EXCEPTION 'Worker and workshop are required for salary deduction repayments';
    END IF;

    SELECT name INTO _worker_name
    FROM public.workers
    WHERE id = _worker_id;

    IF _worker_name IS NULL THEN
      RAISE EXCEPTION 'Worker not found';
    END IF;

    INSERT INTO public.worker_adjustments (
      worker_id,
      workshop_id,
      adjustment_type,
      amount,
      work_date,
      reason,
      is_paid,
      created_by
    ) VALUES (
      _worker_id,
      _workshop_id,
      'discount',
      _amount,
      _payment_date,
      'Debt repayment deducted from salary [DEBT_REPAYMENT:' || _debt_id::text || ']',
      false,
      _actor
    );
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO _total_paid
  FROM public.debt_payments
  WHERE debt_id = _debt_id;

  UPDATE public.debts
  SET is_settled = (_total_paid >= amount),
      updated_at = now()
  WHERE id = _debt_id;

  RETURN jsonb_build_object(
    'payment_id', _payment_id,
    'is_settled', (_total_paid >= _debt.amount),
    'remaining', GREATEST(0, _debt.amount - _total_paid)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_worker_debt_repayment(uuid, numeric, date, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_worker_debt_repayment(uuid, numeric, date, text, text, uuid, uuid) TO authenticated;