import { supabase } from '@/integrations/supabase/client';

/**
 * Supabase / PostgREST caps a single response at 1000 rows. For aggregations
 * over potentially-large tables we MUST page through with .range() or totals
 * will silently undercount once a table crosses 1000 rows.
 */
export const SUPABASE_ROW_LIMIT = 1000;

export async function fetchAllPages<T>(
  queryPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += SUPABASE_ROW_LIMIT) {
    const { data, error } = await queryPage(from, from + SUPABASE_ROW_LIMIT - 1);
    if (error) throw error;
    const page = data || [];
    rows.push(...page);
    if (page.length < SUPABASE_ROW_LIMIT) break;
  }
  return rows;
}

/** Cheap exact row count via HEAD request (no payload). */
export async function countRows(table: string): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count, error } = await (supabase as any)
    .from(table)
    .select('*', { count: 'exact', head: true });
  if (error) throw error;
  return count ?? 0;
}