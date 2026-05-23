import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Database, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { countRows, SUPABASE_ROW_LIMIT } from '@/lib/paginate';

/**
 * Tables that are aggregated or paginated heavily and would silently break
 * once they cross the 1000-row PostgREST cap if not paginated.
 */
const TRACKED_TABLES = [
  'payments',
  'personal_payments',
  'team_transfers',
  'attendance',
  'worker_adjustments',
  'contractor_payments',
  'contractor_budget_purchases',
  'income',
  'debts',
  'debt_payments',
  'workshop_files',
] as const;

type TableName = (typeof TRACKED_TABLES)[number];

export default function DatabaseUsageCard() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const { data: counts, isLoading } = useQuery({
    queryKey: ['db-row-counts'],
    queryFn: async () => {
      const entries = await Promise.all(
        TRACKED_TABLES.map(async (table) => [table, await countRows(table)] as const),
      );
      return Object.fromEntries(entries) as Record<TableName, number>;
    },
    refetchInterval: 30_000,
  });

  // Live invalidation when any tracked table changes
  useEffect(() => {
    const channel = supabase
      .channel('db-usage-monitor')
      .on('postgres_changes', { event: '*', schema: 'public' }, () => {
        queryClient.invalidateQueries({ queryKey: ['db-row-counts'] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const rows = TRACKED_TABLES.map((table) => {
    const count = counts?.[table] ?? 0;
    const pct = Math.min(100, (count / SUPABASE_ROW_LIMIT) * 100);
    return { table, count, pct };
  }).sort((a, b) => b.count - a.count);

  const anyWarning = rows.some((r) => r.pct >= 75);

  return (
    <Card className="shadow-card">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4 text-primary" />
          <CardTitle className="text-base md:text-lg">{t('dbUsage.title')}</CardTitle>
          {anyWarning ? (
            <AlertTriangle className="w-4 h-4 text-warning ml-auto" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-success ml-auto" />
          )}
        </div>
        <CardDescription className="text-xs">
          {t('dbUsage.description', { limit: SUPABASE_ROW_LIMIT.toLocaleString('fr-FR') })}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading && (
          <p className="text-xs text-muted-foreground">{t('common.loading')}…</p>
        )}
        {rows.map(({ table, count, pct }) => {
          const color =
            pct >= 90 ? 'text-destructive' : pct >= 75 ? 'text-warning' : 'text-muted-foreground';
          return (
            <div key={table} className="space-y-1">
              <div className="flex items-center justify-between gap-2 text-xs md:text-sm">
                <span className="font-medium truncate">
                  {t(`dbUsage.tables.${table}`, { defaultValue: table })}
                </span>
                <span className={`font-mono tabular-nums ${color}`}>
                  {count.toLocaleString('fr-FR')} / {SUPABASE_ROW_LIMIT.toLocaleString('fr-FR')}
                </span>
              </div>
              <Progress value={pct} className="h-1.5" />
            </div>
          );
        })}
        <p className="text-[10px] md:text-xs text-muted-foreground pt-2 leading-relaxed">
          {t('dbUsage.note')}
        </p>
      </CardContent>
    </Card>
  );
}