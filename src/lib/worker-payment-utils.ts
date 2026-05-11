import { getDay } from 'date-fns';

const SHORT_DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
export const PAYMENT_CREDIT_TAG = '[PAYMENT_CREDIT]';
export const ADVANCE_CREDIT_TAG = '[ADVANCE_CREDIT]';

export function isWorkerPaymentCredit(reason?: string | null): boolean {
  return Boolean(reason?.includes(PAYMENT_CREDIT_TAG) || reason?.includes(ADVANCE_CREDIT_TAG));
}

export function rewriteCreditReasonAmount(reason: string | null | undefined, amount: number): string {
  const nextAmount = `${amount.toLocaleString('fr-FR')} CFA`;
  return reason?.replace(/\d[\d\s.,]*\s*CFA/, nextAmount) || `Advance Payment credit: ${nextAmount} applied to balance. ${PAYMENT_CREDIT_TAG}`;
}

/**
 * Get the effective pay for an attendance entry.
 * Now that bonuses/discounts are in a separate table, this just returns the daily salary or hourly rate.
 */
export function getEffectivePay(entry: {
  daily_salary?: number | null;
  hourly_rate: number;
  hours_worked?: number;
  extra_amount?: number | null;
}): number {
  // daily_salary is a generated column: hours_worked * hourly_rate + COALESCE(extra_amount, 0)
  const salary = Number(entry.daily_salary) || 0;
  if (salary > 0) return salary;
  // Fallback calculation
  const hours = Number(entry.hours_worked) || 1;
  const rate = Number(entry.hourly_rate) || 0;
  const extra = Number(entry.extra_amount) || 0;
  return hours * rate + extra;
}

/**
 * Build a payment reason string with worker names, their work days, salary, adjustments and net total.
 * Format: "Aanz (mon) 6000 [+200] [🚕100] 6300\nAbell (mon thu) 12000 [-200] 11800\n18100"
 */
export function buildWorkerPaymentReason(
  entries: Array<{ worker_id: string; work_date: string; hours_worked?: number; daily_salary?: number | null; hourly_rate: number; extra_amount?: number | null }>,
  workerNames: Record<string, string>,
  adjustments?: Array<{ worker_id: string; adjustment_type: string; amount: number; reason?: string | null }>
): string {
  // Group entries by worker, tracking half-day markers and salary totals
  const byWorker: Record<string, { days: Set<string>; salary: number }> = {};
  entries.forEach((entry) => {
    const name = workerNames[entry.worker_id] || 'Unknown';
    if (!byWorker[name]) {
      byWorker[name] = { days: new Set(), salary: 0 };
    }
    const [y, m, d] = entry.work_date.split('-').map(Number);
    const dayIndex = getDay(new Date(y, m - 1, d));
    const dayLabel = SHORT_DAYS[dayIndex];
    const isHalf = Number(entry.hours_worked) === 0.5;
    byWorker[name].days.add(isHalf ? `½${dayLabel}` : dayLabel);
    byWorker[name].salary += getEffectivePay(entry);
  });

  // Group adjustments by worker
  const adjByWorker: Record<string, { bonuses: number; discounts: number; taxi: number }> = {};
  if (adjustments) {
    adjustments.forEach((adj) => {
      const name = workerNames[adj.worker_id] || 'Unknown';
      if (!adjByWorker[name]) {
        adjByWorker[name] = { bonuses: 0, discounts: 0, taxi: 0 };
      }
      if (adj.adjustment_type === 'bonus') {
        adjByWorker[name].bonuses += Number(adj.amount);
      } else if (adj.adjustment_type === 'taxi') {
        adjByWorker[name].taxi += Number(adj.amount);
      } else {
        adjByWorker[name].discounts += Number(adj.amount);
      }
    });
  }

  // Build description lines
  const dayOrder = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  
  // Collect all worker names (from attendance + adjustments)
  const allNames = new Set([...Object.keys(byWorker), ...Object.keys(adjByWorker)]);
  
  let grandTotal = 0;
  const lines = Array.from(allNames)
    .map((name) => {
      const workerData = byWorker[name];
      const adj = adjByWorker[name];
      const salary = workerData?.salary || 0;
      
      let line = name;
      if (workerData && workerData.days.size > 0) {
        const sortedDays = Array.from(workerData.days).sort(
          (a, b) => dayOrder.indexOf(a.replace('½', '')) - dayOrder.indexOf(b.replace('½', ''))
        );
        line += ` (${sortedDays.join(' ')})`;
      }
      
      // Show base salary
      if (salary > 0) line += ` ${salary.toLocaleString('fr-FR')}`;
      
      let netTotal = salary;
      if (adj) {
        if (adj.bonuses > 0) { line += ` [+${adj.bonuses.toLocaleString('fr-FR')}]`; netTotal += adj.bonuses; }
        if (adj.taxi > 0) { line += ` [🚕${adj.taxi.toLocaleString('fr-FR')}]`; netTotal += adj.taxi; }
        if (adj.discounts > 0) { line += ` [-${adj.discounts.toLocaleString('fr-FR')}]`; netTotal -= adj.discounts; }
      }
      
      // Show net total if different from salary (i.e. there are adjustments)
      if (adj && (adj.bonuses > 0 || adj.taxi > 0 || adj.discounts > 0)) {
        line += ` ${netTotal.toLocaleString('fr-FR')}`;
      }
      
      grandTotal += netTotal;
      return line;
    });

  // Add grand total line if more than one worker
  if (lines.length > 1) {
    lines.push(grandTotal.toLocaleString('fr-FR'));
  }
  
  return lines.join('\n');
}
