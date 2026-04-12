CREATE OR REPLACE FUNCTION public.get_worker_daily_attendance_summary(_work_date date)
RETURNS TABLE (
  worker_id uuid,
  total_hours numeric,
  hidden_hours numeric,
  visible_entries jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    a.worker_id,
    COALESCE(SUM(a.hours_worked), 0) AS total_hours,
    COALESCE(
      SUM(
        CASE
          WHEN user_has_workshop_access(auth.uid(), a.workshop_id) THEN 0
          ELSE a.hours_worked
        END
      ),
      0
    ) AS hidden_hours,
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'workshop_id', a.workshop_id,
          'hours_worked', a.hours_worked
        )
      ) FILTER (WHERE user_has_workshop_access(auth.uid(), a.workshop_id)),
      '[]'::jsonb
    ) AS visible_entries
  FROM public.attendance a
  WHERE a.work_date = _work_date
  GROUP BY a.worker_id;
$$;

REVOKE ALL ON FUNCTION public.get_worker_daily_attendance_summary(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_worker_daily_attendance_summary(date) TO authenticated;