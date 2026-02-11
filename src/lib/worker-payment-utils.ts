import { getDay } from 'date-fns';

const SHORT_DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

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
 * Build a payment reason string with worker names, their work days, and adjustments.
 * Format: "Melfi (mon tue fri) [+500 bonus] [-200 discount]\nPaull (wed sat)"
 */
export function buildWorkerPaymentReason(
  entries: Array<{ worker_id: string; work_date: string }>,
  workerNames: Record<string, string>,
  adjustments?: Array<{ worker_id: string; adjustment_type: string; amount: number; reason?: string | null }>
): string {
  // Group entries by worker
  const byWorker: Record<string, Set<string>> = {};
  entries.forEach((entry) => {
    const name = workerNames[entry.worker_id] || 'Unknown';
    if (!byWorker[name]) {
      byWorker[name] = new Set();
    }
    const dayIndex = getDay(new Date(entry.work_date));
    byWorker[name].add(SHORT_DAYS[dayIndex]);
  });

  // Group adjustments by worker
  const adjByWorker: Record<string, { bonuses: number; discounts: number }> = {};
  if (adjustments) {
    adjustments.forEach((adj) => {
      const name = workerNames[adj.worker_id] || 'Unknown';
      if (!adjByWorker[name]) {
        adjByWorker[name] = { bonuses: 0, discounts: 0 };
      }
      if (adj.adjustment_type === 'bonus') {
        adjByWorker[name].bonuses += Number(adj.amount);
      } else {
        adjByWorker[name].discounts += Number(adj.amount);
      }
    });
  }

  // Build description lines
  const dayOrder = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  
  // Collect all worker names (from attendance + adjustments)
  const allNames = new Set([...Object.keys(byWorker), ...Object.keys(adjByWorker)]);
  
  return Array.from(allNames)
    .map((name) => {
      const days = byWorker[name];
      const adj = adjByWorker[name];
      
      let line = name;
      if (days && days.size > 0) {
        const sortedDays = Array.from(days).sort(
          (a, b) => dayOrder.indexOf(a) - dayOrder.indexOf(b)
        );
        line += ` (${sortedDays.join(' ')})`;
      }
      if (adj) {
        if (adj.bonuses > 0) line += ` [+${adj.bonuses}]`;
        if (adj.discounts > 0) line += ` [-${adj.discounts}]`;
      }
      return line;
    })
    .join('\n');
}
