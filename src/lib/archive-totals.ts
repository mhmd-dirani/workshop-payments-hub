import { supabase } from '@/integrations/supabase/client';

/**
 * Read archived summaries. These are PERMANENT snapshots created when historical
 * rows are archived & deleted. All totals widgets must add these to live totals
 * so deletions never decrease historical numbers.
 *
 * Only batches with status='deleted' need to be added to totals (because the
 * underlying rows are gone). For status='verified' (rows still live), adding the
 * summary would double-count. So every helper filters by status='deleted'.
 */

const ps = 1000;
async function pagedSum<T>(
  table: string,
  select: string,
  filter: (q: any) => any
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += ps) {
    const q = filter(supabase.from(table).select(select)).order('id').range(from, from + ps - 1);
    const { data, error } = await q;
    if (error) throw error;
    const page = (data || []) as T[];
    rows.push(...page);
    if (page.length < ps) break;
  }
  return rows;
}

async function deletedBatchIds(): Promise<string[]> {
  const rows = await pagedSum<{ id: string }>('archive_batches', 'id', (q) =>
    q.eq('status', 'deleted')
  );
  return rows.map((r) => r.id);
}

export interface ArchivedWorkshopTotals {
  income: number;
  approvedPayments: number;
  workerSalaries: number;
  workerHours: number;
  contractorAdvances: number;
  contractorMaterials: number;
  debts: number;
  debtPayments: number;
  transfers: number;
  expenses: number;
  net: number;
}
const EMPTY_WS: ArchivedWorkshopTotals = {
  income: 0, approvedPayments: 0, workerSalaries: 0, workerHours: 0,
  contractorAdvances: 0, contractorMaterials: 0, debts: 0, debtPayments: 0,
  transfers: 0, expenses: 0, net: 0,
};

export async function getArchivedWorkshopTotals(workshopId?: string): Promise<ArchivedWorkshopTotals> {
  const ids = await deletedBatchIds();
  if (!ids.length) return { ...EMPTY_WS };
  const rows = await pagedSum<any>('workshop_archive_summaries', '*', (q) => {
    let qq = q.in('batch_id', ids);
    if (workshopId) qq = qq.eq('workshop_id', workshopId);
    return qq;
  });
  const out = { ...EMPTY_WS };
  for (const r of rows) {
    out.income += Number(r.total_income || 0);
    out.approvedPayments += Number(r.total_approved_payments || 0);
    out.workerSalaries += Number(r.total_worker_salaries || 0);
    out.workerHours += Number(r.total_worker_hours || 0);
    out.contractorAdvances += Number(r.total_contractor_advances || 0);
    out.contractorMaterials += Number(r.total_contractor_materials || 0);
    out.debts += Number(r.total_debts || 0);
    out.debtPayments += Number(r.total_debt_payments || 0);
    out.transfers += Number(r.total_transfers || 0);
    out.expenses += Number(r.total_expenses || 0);
    out.net += Number(r.net_total || 0);
  }
  return out;
}

export interface ArchivedWorkerTotals {
  hours: number; salary: number; extra: number; discounts: number; adjustments: number;
}
export async function getArchivedWorkerTotals(workerId: string): Promise<ArchivedWorkerTotals> {
  const ids = await deletedBatchIds();
  if (!ids.length) return { hours: 0, salary: 0, extra: 0, discounts: 0, adjustments: 0 };
  const rows = await pagedSum<any>('worker_archive_summaries', '*', (q) =>
    q.in('batch_id', ids).eq('worker_id', workerId)
  );
  const out = { hours: 0, salary: 0, extra: 0, discounts: 0, adjustments: 0 };
  for (const r of rows) {
    out.hours += Number(r.total_hours || 0);
    out.salary += Number(r.total_salary || 0);
    out.extra += Number(r.total_extra || 0);
    out.discounts += Number(r.total_discounts || 0);
    out.adjustments += Number(r.total_adjustments || 0);
  }
  return out;
}

export interface ArchivedContractorTotals {
  advances: number; materials: number; purchases: number; budget: number;
}
export async function getArchivedContractorTotals(contractorId: string): Promise<ArchivedContractorTotals> {
  const ids = await deletedBatchIds();
  if (!ids.length) return { advances: 0, materials: 0, purchases: 0, budget: 0 };
  const rows = await pagedSum<any>('contractor_archive_summaries', '*', (q) =>
    q.in('batch_id', ids).eq('contractor_id', contractorId)
  );
  const out = { advances: 0, materials: 0, purchases: 0, budget: 0 };
  for (const r of rows) {
    out.advances += Number(r.total_advances || 0);
    out.materials += Number(r.total_materials || 0);
    out.purchases += Number(r.total_purchases || 0);
    out.budget += Number(r.total_budget || 0);
  }
  return out;
}

export interface ArchivedUserBalance {
  received: number; workshopSpent: number; personalSpent: number;
}
export async function getArchivedUserBalances(userIds: string[]): Promise<Map<string, ArchivedUserBalance>> {
  const out = new Map<string, ArchivedUserBalance>();
  for (const id of userIds) out.set(id, { received: 0, workshopSpent: 0, personalSpent: 0 });
  if (!userIds.length) return out;
  const ids = await deletedBatchIds();
  if (!ids.length) return out;
  const rows = await pagedSum<any>('user_balance_archive_summaries', '*', (q) =>
    q.in('batch_id', ids).in('user_id', userIds)
  );
  for (const r of rows) {
    const e = out.get(r.user_id);
    if (!e) continue;
    e.received += Number(r.received || 0);
    e.workshopSpent += Number(r.workshop_spent || 0);
    e.personalSpent += Number(r.personal_spent || 0);
  }
  return out;
}