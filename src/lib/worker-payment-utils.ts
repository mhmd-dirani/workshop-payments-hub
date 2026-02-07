import { getDay } from 'date-fns';

const SHORT_DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/**
 * Get the effective pay for an attendance entry, handling both old records
 * (where discount wasn't baked into daily_salary) and new records (where it is).
 */
export function getEffectivePay(entry: {
  daily_salary: number | null;
  discount_amount: number | null;
  extra_amount: number | null;
  hourly_rate: number;
}): number {
  const salary = Number(entry.daily_salary) || 0;
  const discount = Number(entry.discount_amount) || 0;
  const extra = Number(entry.extra_amount) || 0;
  const base = Number(entry.hourly_rate) || 0;
  // If daily_salary equals hourly_rate (or hourly_rate + extra), discount wasn't baked in
  if (discount > 0 && salary >= base) {
    return base + extra - discount;
  }
  return salary;
}

/**
 * Build a payment reason string with worker names and their work days.
 * Format: "Melfi (mon tue fri)\nPaull (wed sat)"
 */
export function buildWorkerPaymentReason(
  entries: Array<{ worker_id: string; work_date: string }>,
  workerNames: Record<string, string>
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

  // Build description lines
  const dayOrder = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  return Object.entries(byWorker)
    .map(([name, days]) => {
      const sortedDays = Array.from(days).sort(
        (a, b) => dayOrder.indexOf(a) - dayOrder.indexOf(b)
      );
      return `${name} (${sortedDays.join(' ')})`;
    })
    .join('\n');
}
