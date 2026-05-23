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

// ---------------------------------------------------------------------------
// Payment plan: single source of truth for what the dashboard payment will be.
// Used by both the worker-card summary preview AND createPayment in WorkerDetails.
// ---------------------------------------------------------------------------

export interface PlanAttendance {
  id: string;
  workshop_id: string;
  daily_salary?: number | null;
  hourly_rate: number;
  hours_worked?: number;
  extra_amount?: number | null;
}

export interface PlanAdjustment {
  id: string;
  workshop_id: string;
  adjustment_type: string;
  amount: number;
  reason?: string | null;
}

export interface PlanInputs {
  attendance: PlanAttendance[];
  adjustments: PlanAdjustment[];
  workshopNames: Record<string, string>;
  workshopOrder?: string[];            // optional: order workshops appear in
  holidayPay?: number;                  // worker.hourly_rate when toggle on
  debtDeduction?: number;               // requested total debt deduction
}

export interface WorkshopPlan {
  workshopId: string;
  workshopName: string;
  attendance: number;
  bonuses: number;
  realDiscounts: number;            // non-credit discounts only
  selfCredit: number;               // credit-discounts placed on THIS workshop
  earning: number;                  // attendance + bonuses - realDiscounts (>=0, neg capped)
  crossCreditApplied: number;       // cross-workshop credit consumed here
  holidayPay: number;
  debtDeduction: number;
  paymentAmount: number;            // final amount pushed to dashboard
  entryIds: string[];
  bonusIds: string[];
  realDiscountIds: string[];
  selfCreditIds: string[];          // credit adjustments on this workshop
}

export interface CreditConsumption {
  creditId: string;
  originalAmount: number;
  consumed: number;
  remaining: number;
  workshopId: string;
}

export interface PaymentPlan {
  workshops: WorkshopPlan[];        // workshops with payments to create (paymentAmount > 0)
  emptyWorkshops: WorkshopPlan[];   // workshops where final == 0 (still need is_paid marking)
  totals: {
    attendance: number;
    bonuses: number;
    realDiscounts: number;
    credits: number;                // sum of all credit-discount amounts
    creditsApplied: number;         // portion actually consumed
    creditsRemaining: number;       // credit left unconsumed (blocks pay if > 0)
    holidayPay: number;
    debtDeduction: number;
    toBePaid: number;               // sum of paymentAmount across workshops
  };
  creditConsumption: CreditConsumption[];
  blocked: boolean;                 // true when credits exceed earnings
}

export function buildPaymentPlan(inputs: PlanInputs): PaymentPlan {
  const { attendance, adjustments, workshopNames, holidayPay = 0, debtDeduction = 0 } = inputs;

  // Collect every workshop that has any attendance or adjustment for this worker.
  const workshopIds = Array.from(new Set<string>([
    ...(inputs.workshopOrder || []),
    ...attendance.map(a => a.workshop_id),
    ...adjustments.map(a => a.workshop_id),
  ]));

  // Per-workshop raw breakdown.
  const plans: WorkshopPlan[] = workshopIds.map(wid => {
    const wAttendance = attendance.filter(a => a.workshop_id === wid);
    const wAdj = adjustments.filter(a => a.workshop_id === wid);

    const attendanceTotal = wAttendance.reduce((s, e) => s + getEffectivePay(e), 0);
    const bonusAdj = wAdj.filter(a => a.adjustment_type === 'bonus' || a.adjustment_type === 'taxi');
    const discountAdj = wAdj.filter(a => a.adjustment_type === 'discount');
    const realDiscountAdj = discountAdj.filter(a => !isWorkerPaymentCredit(a.reason));
    const creditAdj = discountAdj.filter(a => isWorkerPaymentCredit(a.reason));

    const bonuses = bonusAdj.reduce((s, a) => s + Number(a.amount), 0);
    const realDiscounts = realDiscountAdj.reduce((s, a) => s + Number(a.amount), 0);
    const selfCredit = creditAdj.reduce((s, a) => s + Number(a.amount), 0);
    const earning = Math.max(0, attendanceTotal + bonuses - realDiscounts);

    return {
      workshopId: wid,
      workshopName: workshopNames[wid] || 'Unknown',
      attendance: attendanceTotal,
      bonuses,
      realDiscounts,
      selfCredit,
      earning,
      crossCreditApplied: 0,
      holidayPay: 0,
      debtDeduction: 0,
      paymentAmount: 0,
      entryIds: wAttendance.map(a => a.id),
      bonusIds: bonusAdj.map(a => a.id),
      realDiscountIds: realDiscountAdj.map(a => a.id),
      selfCreditIds: creditAdj.map(a => a.id),
    };
  });

  // Total credit pool (all credit-discounts across all workshops).
  const allCredits = adjustments.filter(a => a.adjustment_type === 'discount' && isWorkerPaymentCredit(a.reason));
  const totalCredits = allCredits.reduce((s, a) => s + Number(a.amount), 0);

  // 1. Each workshop absorbs its own credit first (against its own earning).
  let remainingCreditPool = 0;
  for (const p of plans) {
    const absorb = Math.min(p.earning, p.selfCredit);
    p.earning -= absorb;
    const leftover = p.selfCredit - absorb;
    remainingCreditPool += leftover;
  }

  // 2. Distribute remaining credit across workshops with earning, in given order.
  for (const p of plans) {
    if (remainingCreditPool <= 0) break;
    const apply = Math.min(p.earning, remainingCreditPool);
    p.crossCreditApplied = apply;
    p.earning -= apply;
    remainingCreditPool -= apply;
  }

  const creditsApplied = totalCredits - remainingCreditPool;

  // 3. Holiday pay → workshop with the largest remaining earning (deterministic, falls back to first).
  if (holidayPay > 0) {
    const target = [...plans].sort((a, b) => b.earning - a.earning)[0];
    if (target) target.holidayPay = holidayPay;
  }

  // 4. Debt deduction proportional to (earning + holidayPay) across workshops.
  const grandPositive = plans.reduce((s, p) => s + p.earning + p.holidayPay, 0);
  let remainingDebt = Math.min(debtDeduction, grandPositive);
  if (remainingDebt > 0 && grandPositive > 0) {
    // Distribute proportionally, last workshop takes rounding remainder.
    const sortedByValue = [...plans].sort((a, b) => (b.earning + b.holidayPay) - (a.earning + a.holidayPay));
    let allocated = 0;
    sortedByValue.forEach((p, idx) => {
      const value = p.earning + p.holidayPay;
      if (value <= 0) return;
      let share = idx === sortedByValue.length - 1
        ? remainingDebt - allocated
        : Math.min(value, Math.round((value / grandPositive) * remainingDebt));
      share = Math.max(0, Math.min(share, value));
      p.debtDeduction = share;
      allocated += share;
    });
  }

  // 5. Final amount per workshop.
  for (const p of plans) {
    p.paymentAmount = Math.max(0, p.earning + p.holidayPay - p.debtDeduction);
  }

  // 6. Per-credit consumption breakdown (for DB ops: split partial credits).
  // Walk credits in id order, consuming creditsApplied across them.
  let toAllocate = creditsApplied;
  const creditConsumption: CreditConsumption[] = allCredits.map(c => {
    const amt = Number(c.amount);
    const take = Math.min(amt, toAllocate);
    toAllocate -= take;
    return {
      creditId: c.id,
      originalAmount: amt,
      consumed: take,
      remaining: amt - take,
      workshopId: c.workshop_id,
    };
  });

  const workshopsWithPay = plans.filter(p => p.paymentAmount > 0);
  const emptyWorkshops = plans.filter(p => p.paymentAmount <= 0);

  const totals = {
    attendance: plans.reduce((s, p) => s + p.attendance, 0),
    bonuses: plans.reduce((s, p) => s + p.bonuses, 0),
    realDiscounts: plans.reduce((s, p) => s + p.realDiscounts, 0),
    credits: totalCredits,
    creditsApplied,
    creditsRemaining: remainingCreditPool,
    holidayPay: plans.reduce((s, p) => s + p.holidayPay, 0),
    debtDeduction: plans.reduce((s, p) => s + p.debtDeduction, 0),
    toBePaid: workshopsWithPay.reduce((s, p) => s + p.paymentAmount, 0),
  };

  // Blocked: credits remain unconsumed AND there are credits at all.
  // (Means worker owes more than they've earned — can't safely settle salary.)
  const blocked = totalCredits > 0 && remainingCreditPool > 0;

  return {
    workshops: workshopsWithPay,
    emptyWorkshops,
    totals,
    creditConsumption,
    blocked,
  };
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

      // Header: name and days worked  →  "Aanz — Sun, Mon"
      let line = name;
      if (workerData && workerData.days.size > 0) {
        const sortedDays = Array.from(workerData.days).sort(
          (a, b) => dayOrder.indexOf(a.replace('½', '')) - dayOrder.indexOf(b.replace('½', ''))
        );
        line += ` — ${sortedDays.join(', ')}`;
      }

      // Base salary  →  "  · 5 000 CFA"
      if (salary > 0) line += ` · ${salary.toLocaleString('fr-FR')} CFA`;

      let netTotal = salary;
      const parts: string[] = [];
      if (adj) {
        if (adj.bonuses > 0) { parts.push(`+${adj.bonuses.toLocaleString('fr-FR')} bonus`); netTotal += adj.bonuses; }
        if (adj.taxi > 0) { parts.push(`+${adj.taxi.toLocaleString('fr-FR')} taxi`); netTotal += adj.taxi; }
        if (adj.discounts > 0) { parts.push(`−${adj.discounts.toLocaleString('fr-FR')} discount`); netTotal -= adj.discounts; }
      }
      if (parts.length) {
        line += `  (${parts.join(' · ')})`;
      }
      // Show net total only when adjustments changed it
      if (parts.length && netTotal !== salary) {
        line += ` = ${netTotal.toLocaleString('fr-FR')} CFA`;
      }

      grandTotal += netTotal;
      return line;
    });

  // Add grand total line if more than one worker
  if (lines.length > 1) {
    lines.push(`──────────────`);
    lines.push(`Total · ${grandTotal.toLocaleString('fr-FR')} CFA`);
  }
  
  return lines.join('\n');
}
