import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Loader2, HandCoins, ChevronDown, CheckCircle2, Clock } from 'lucide-react';

export default function UserDebtTracker() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);

  // Fetch debts placed by this user (worker debts)
  const { data: placedDebts = [], isLoading } = useQuery({
    queryKey: ['user-placed-debts', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('debts')
        .select('*')
        .eq('created_by', user.id)
        .or('description.ilike.%[WORKER_DEBT]%,description.ilike.%[ADVANCE_DEBT]%')
        .order('debt_date', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
  });

  // Fetch debt payments for these debts
  const { data: debtPayments = [] } = useQuery({
    queryKey: ['user-debt-payments-tracker', placedDebts.map(d => d.id)],
    queryFn: async () => {
      if (placedDebts.length === 0) return [];
      const { data, error } = await supabase
        .from('debt_payments')
        .select('*')
        .in('debt_id', placedDebts.map(d => d.id))
        .order('payment_date', { ascending: false });
      if (error) throw error;

      // Get profiles for repayer names
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, full_name');
      const profileMap = new Map(profiles?.map(p => [p.user_id, p.full_name]) || []);

      return (data || []).map(p => ({
        ...p,
        created_by_name: profileMap.get(p.created_by) || t('common.unknown', { defaultValue: 'Unknown' }),
      }));
    },
    enabled: placedDebts.length > 0,
  });

  if (placedDebts.length === 0 && !isLoading) return null;

  const totalPlaced = placedDebts
    .filter(d => (d as any).status === 'approved')
    .reduce((sum, d) => sum + Number(d.amount), 0);
  const totalRepaid = debtPayments.reduce((sum, p) => sum + Number(p.amount), 0);
  const totalPending = placedDebts
    .filter(d => (d as any).status === 'pending')
    .reduce((sum, d) => sum + Number(d.amount), 0);

  return (
    <Card className="shadow-card">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CardHeader className="pb-2 px-3 md:px-6 pt-3 md:pt-6">
          <CollapsibleTrigger asChild>
            <div className="flex items-center justify-between cursor-pointer">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <HandCoins className="w-4 h-4 md:w-5 md:h-5 flex-shrink-0" />
                <CardTitle className="text-sm md:text-base truncate">
                  {t('userDebtTracker.title', { defaultValue: 'Worker Debts Placed' })}
                </CardTitle>
                <span className="text-xs md:text-sm font-bold font-mono text-warning flex-shrink-0">
                  {(totalPlaced - totalRepaid).toLocaleString('fr-FR')} CFA
                </span>
              </div>
              <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </div>
          </CollapsibleTrigger>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="px-3 md:px-6 pb-3 md:pb-6">
            {isLoading ? (
              <div className="flex justify-center py-4">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-3">
                {/* Summary */}
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-[10px] text-muted-foreground">{t('userDebtTracker.placed', { defaultValue: 'Placed' })}</p>
                    <p className="text-xs font-bold font-mono text-destructive">-{totalPlaced.toLocaleString('fr-FR')}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">{t('userDebtTracker.repaid', { defaultValue: 'Repaid' })}</p>
                    <p className="text-xs font-bold font-mono text-success">+{totalRepaid.toLocaleString('fr-FR')}</p>
                  </div>
                  {totalPending > 0 && (
                    <div>
                      <p className="text-[10px] text-muted-foreground">{t('userDebtTracker.pending', { defaultValue: 'Pending' })}</p>
                      <p className="text-xs font-bold font-mono text-warning">{totalPending.toLocaleString('fr-FR')}</p>
                    </div>
                  )}
                </div>

                {/* Debt list */}
                <div className="space-y-2">
                  {placedDebts.map((debt) => {
                    const payments = debtPayments.filter(p => p.debt_id === debt.id);
                    const paidSoFar = payments.reduce((s, p) => s + Number(p.amount), 0);
                    const remaining = Math.max(0, Number(debt.amount) - paidSoFar);
                    const isApproved = (debt as any).status === 'approved';
                    const isPending = (debt as any).status === 'pending';

                    return (
                      <div key={debt.id} className="border rounded-lg p-2.5 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium text-sm">{debt.person_name}</span>
                            {isPending && (
                              <Badge variant="outline" className="text-[10px] px-1 py-0 border-warning text-warning">
                                <Clock className="w-2.5 h-2.5 mr-0.5" />
                                {t('common.pending', { defaultValue: 'Pending' })}
                              </Badge>
                            )}
                            {debt.is_settled && (
                              <Badge variant="outline" className="text-[10px] px-1 py-0 border-success text-success">
                                <CheckCircle2 className="w-2.5 h-2.5 mr-0.5" />
                                {t('debts.settled', { defaultValue: 'Settled' })}
                              </Badge>
                            )}
                          </div>
                          <span className="font-mono text-xs font-medium">
                            {Number(debt.amount).toLocaleString('fr-FR')} CFA
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                          <span>{format(new Date(debt.debt_date), 'dd/MM/yyyy')}</span>
                          {isApproved && remaining > 0 && (
                            <span className="text-warning font-mono">
                              {t('userDebtTracker.remaining', { defaultValue: 'Remaining' })}: {remaining.toLocaleString('fr-FR')}
                            </span>
                          )}
                        </div>
                        {/* Repayment history */}
                        {payments.length > 0 && (
                          <div className="mt-1 space-y-1 pl-2 border-l-2 border-success/30">
                            {payments.map((p: any) => (
                              <div key={p.id} className="flex items-center justify-between text-[10px]">
                                <div className="flex items-center gap-1">
                                  <CheckCircle2 className="w-2.5 h-2.5 text-success" />
                                  <span className="text-success font-mono">+{Number(p.amount).toLocaleString('fr-FR')}</span>
                                  <span className="text-muted-foreground">
                                    {p.created_by_name} · {format(new Date(p.payment_date), 'dd/MM')}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
