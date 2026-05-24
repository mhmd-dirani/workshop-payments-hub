import { supabase } from '@/integrations/supabase/client';
import { getArchivedUserBalances } from './archive-totals';

export interface UserBalanceBreakdown {
  received: number;
  workshopSpent: number;
  personalSpent: number;
  totalSpent: number;
  balance: number;
}

const PAGE_SIZE = 1000;

async function fetchAllPages<T>(
  queryPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>
): Promise<T[]> {
  const rows: T[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await queryPage(from, from + PAGE_SIZE - 1);
    if (error) throw error;

    const page = data || [];
    rows.push(...page);

    if (page.length < PAGE_SIZE) break;
  }

  return rows;
}

/**
 * SINGLE SOURCE OF TRUTH for a user's global balance.
 *
 * Formula:
 *   balance = SUM(team_transfers.amount where user_id = U)
 *           - SUM(payments.amount where created_by = U AND status = 'approved')
 *           - SUM(personal_payments.amount where user_id = U)
 *
 * Both the admin Team page and the team-member's UserBalanceCard MUST use this util
 * so the two views can never drift apart.
 *
 * Notes:
 *  - Worker debts placed by a user create a personal_payments row (on admin approval),
 *    which is included in personalSpent here.
 *  - Cash repayments of worker debts insert a team_transfers row crediting the original
 *    placer, which is included in received here.
 *  - Salary-deduction repayments do NOT touch the placer's balance (the worker pays
 *    via a discount on their next salary), which is correct.
 */
export async function fetchUserBalance(userId: string): Promise<UserBalanceBreakdown> {
  const [transfers, payments, personalPayments, archived] = await Promise.all([
    fetchAllPages<{ amount: number | string }>((from, to) =>
      supabase.from('team_transfers').select('amount').eq('user_id', userId).order('id').range(from, to)
    ),
    fetchAllPages<{ amount: number | string }>((from, to) =>
      supabase.from('payments').select('amount').eq('created_by', userId).eq('status', 'approved').order('id').range(from, to)
    ),
    fetchAllPages<{ amount: number | string }>((from, to) =>
      supabase.from('personal_payments').select('amount').eq('user_id', userId).order('id').range(from, to)
    ),
    getArchivedUserBalances([userId]),
  ]);

  const arc = archived.get(userId) || { received: 0, workshopSpent: 0, personalSpent: 0 };
  const received = transfers.reduce((s, r) => s + Number(r.amount), 0) + arc.received;
  const workshopSpent = payments.reduce((s, r) => s + Number(r.amount), 0) + arc.workshopSpent;
  const personalSpent = personalPayments.reduce((s, r) => s + Number(r.amount), 0) + arc.personalSpent;
  const totalSpent = workshopSpent + personalSpent;

  return {
    received,
    workshopSpent,
    personalSpent,
    totalSpent,
    balance: received - totalSpent,
  };
}

/**
 * Compute balances for many users in a single round-trip (admin Team page).
 * Uses the same formula as fetchUserBalance(), guaranteeing identical results.
 */
export async function fetchAllUserBalances(
  userIds: string[]
): Promise<Map<string, UserBalanceBreakdown>> {
  if (userIds.length === 0) return new Map();

  const [transfersRes, paymentsRes, personalRes, archivedMap] = await Promise.all([
    fetchAllPages<{ user_id: string; amount: number | string }>((from, to) =>
      supabase.from('team_transfers').select('user_id, amount').in('user_id', userIds).order('id').range(from, to)
    ),
    fetchAllPages<{ created_by: string; amount: number | string }>((from, to) =>
      supabase
        .from('payments')
        .select('created_by, amount')
        .in('created_by', userIds)
        .eq('status', 'approved')
        .order('id')
        .range(from, to)
    ),
    fetchAllPages<{ user_id: string; amount: number | string }>((from, to) =>
      supabase.from('personal_payments').select('user_id, amount').in('user_id', userIds).order('id').range(from, to)
    ),
    getArchivedUserBalances(userIds),
  ]);

  const result = new Map<string, UserBalanceBreakdown>();
  for (const id of userIds) {
    const arc = archivedMap.get(id) || { received: 0, workshopSpent: 0, personalSpent: 0 };
    const received = transfersRes
      .filter((r) => r.user_id === id)
      .reduce((s, r) => s + Number(r.amount), 0) + arc.received;
    const workshopSpent = paymentsRes
      .filter((r) => r.created_by === id)
      .reduce((s, r) => s + Number(r.amount), 0) + arc.workshopSpent;
    const personalSpent = personalRes
      .filter((r) => r.user_id === id)
      .reduce((s, r) => s + Number(r.amount), 0) + arc.personalSpent;
    const totalSpent = workshopSpent + personalSpent;
    result.set(id, {
      received,
      workshopSpent,
      personalSpent,
      totalSpent,
      balance: received - totalSpent,
    });
  }
  return result;
}
