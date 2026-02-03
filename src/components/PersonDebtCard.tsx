import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { 
  ChevronDown, 
  ChevronRight, 
  Plus, 
  Trash2, 
  Edit, 
  CheckCircle,
  User
} from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

interface Debt {
  id: string;
  amount: number;
  debt_date: string;
  description: string | null;
  is_settled: boolean;
}

interface Payment {
  id: string;
  debt_id: string;
  amount: number;
  payment_date: string;
  description: string | null;
}

interface PersonDebtCardProps {
  personName: string;
  debts: Debt[];
  payments: Payment[];
  debtType: 'i_owe' | 'they_owe';
  onAddDebt: (personName: string) => void;
  onAddPayment: (debt: Debt & { person_name: string }) => void;
  onEditDebt: (debt: Debt & { person_name: string }) => void;
}

export default function PersonDebtCard({
  personName,
  debts,
  payments,
  debtType,
  onAddDebt,
  onAddPayment,
  onEditDebt,
}: PersonDebtCardProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);

  // Filter active debts
  const activeDebts = debts.filter(d => !d.is_settled);

  // Calculate totals
  const totalDebt = activeDebts.reduce((sum, d) => sum + Number(d.amount), 0);
  const totalPaid = payments
    .filter(p => activeDebts.some(d => d.id === p.debt_id))
    .reduce((sum, p) => sum + Number(p.amount), 0);
  const remaining = Math.max(0, totalDebt - totalPaid);

  const getDebtPayments = (debtId: string) => {
    return payments.filter(p => p.debt_id === debtId);
  };

  const getDebtRemaining = (debt: Debt) => {
    const paid = getDebtPayments(debt.id).reduce((sum, p) => sum + Number(p.amount), 0);
    return Math.max(0, Number(debt.amount) - paid);
  };

  const deleteDebt = useMutation({
    mutationFn: async (debtId: string) => {
      const { error } = await supabase.from('debts').delete().eq('id', debtId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['debts'] });
      queryClient.invalidateQueries({ queryKey: ['debt-stats'] });
      toast({ title: t('debts.debtDeleted'), description: t('debts.debtDeletedDesc') });
    },
  });

  const markAsSettled = useMutation({
    mutationFn: async (debtId: string) => {
      const { error } = await supabase.from('debts').update({ is_settled: true }).eq('id', debtId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['debts'] });
      queryClient.invalidateQueries({ queryKey: ['debt-stats'] });
      toast({ title: t('debts.debtSettled'), description: t('debts.debtSettledDesc') });
    },
  });

  const deletePayment = useMutation({
    mutationFn: async (paymentId: string) => {
      const { error } = await supabase.from('debt_payments').delete().eq('id', paymentId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['debt-payments'] });
      queryClient.invalidateQueries({ queryKey: ['debt-stats'] });
      toast({ title: t('debts.paymentDeleted'), description: t('debts.paymentDeletedDesc') });
    },
  });

  if (activeDebts.length === 0) return null;

  return (
    <Card className="shadow-card overflow-hidden">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <div className="p-3 md:p-4 cursor-pointer hover:bg-muted/50 transition-colors">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 md:gap-3 min-w-0">
                {isOpen ? (
                  <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                )}
                <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <User className="w-4 h-4 md:w-5 md:h-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-sm md:text-base truncate">{personName}</p>
                  <p className="text-[10px] md:text-xs text-muted-foreground">
                    {activeDebts.length} {activeDebts.length === 1 ? t('debts.debt') : t('debts.debtsLabel')}
                  </p>
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <p className={`font-mono font-bold text-sm md:text-lg ${
                  debtType === 'they_owe' ? 'text-success' : 'text-destructive'
                }`}>
                  {debtType === 'they_owe' ? '+' : '-'}{remaining.toLocaleString('fr-FR')}
                </p>
                {totalPaid > 0 && (
                  <p className="text-[10px] md:text-xs text-success">
                    {t('debts.paid')}: {totalPaid.toLocaleString('fr-FR')}
                  </p>
                )}
              </div>
            </div>
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="border-t bg-muted/30">
            {/* Add debt button */}
            <div className="p-2 md:p-3 border-b flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onAddDebt(personName);
                }}
                className="gap-1.5 h-7 md:h-8 text-xs"
              >
                <Plus className="w-3 h-3" />
                {t('debts.addDebtForPerson')}
              </Button>
            </div>

            {/* Debts list */}
            <div className="divide-y">
              {activeDebts.map((debt) => {
                const debtPayments = getDebtPayments(debt.id);
                const debtRemaining = getDebtRemaining(debt);
                const debtPaid = debtPayments.reduce((sum, p) => sum + Number(p.amount), 0);

                return (
                  <div key={debt.id} className="p-2 md:p-3">
                    {/* Debt header */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className="text-[10px] md:text-xs font-mono">
                            {format(new Date(debt.debt_date), 'dd/MM/yyyy')}
                          </Badge>
                          <span className="font-mono text-sm">
                            {Number(debt.amount).toLocaleString('fr-FR')} CFA
                          </span>
                        </div>
                        {debt.description && (
                          <p className="text-xs text-muted-foreground mt-1 truncate">
                            {debt.description}
                          </p>
                        )}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="font-mono font-bold text-sm">
                          {debtRemaining.toLocaleString('fr-FR')}
                        </p>
                        {debtPaid > 0 && (
                          <p className="text-[10px] text-success">
                            -{debtPaid.toLocaleString('fr-FR')}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Debt actions */}
                    <div className="flex items-center justify-end gap-1 mt-2 pt-2 border-t border-dashed">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onAddPayment({ ...debt, person_name: personName })}
                        className="h-6 w-6 md:h-7 md:w-7 text-success hover:text-success"
                      >
                        <Plus className="w-3 h-3 md:w-3.5 md:h-3.5" />
                      </Button>
                      {debtRemaining === 0 && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => markAsSettled.mutate(debt.id)}
                          className="h-6 w-6 md:h-7 md:w-7 text-primary hover:text-primary"
                        >
                          <CheckCircle className="w-3 h-3 md:w-3.5 md:h-3.5" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onEditDebt({ ...debt, person_name: personName })}
                        className="h-6 w-6 md:h-7 md:w-7"
                      >
                        <Edit className="w-3 h-3 md:w-3.5 md:h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteDebt.mutate(debt.id)}
                        className="h-6 w-6 md:h-7 md:w-7 text-destructive hover:text-destructive"
                      >
                        <Trash2 className="w-3 h-3 md:w-3.5 md:h-3.5" />
                      </Button>
                    </div>

                    {/* Payment history */}
                    {debtPayments.length > 0 && (
                      <div className="mt-2 space-y-1">
                        <p className="text-[10px] md:text-xs font-medium text-muted-foreground">
                          {t('debts.repaymentHistory')}:
                        </p>
                        {debtPayments.map((payment) => (
                          <div
                            key={payment.id}
                            className="flex items-center justify-between p-1.5 md:p-2 rounded bg-background text-xs"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-muted-foreground font-mono">
                                {format(new Date(payment.payment_date), 'dd/MM/yy')}
                              </span>
                              {payment.description && (
                                <span className="text-muted-foreground truncate">
                                  • {payment.description}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono text-success">
                                +{Number(payment.amount).toLocaleString('fr-FR')}
                              </span>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => deletePayment.mutate(payment.id)}
                                className="h-5 w-5 text-destructive hover:text-destructive"
                              >
                                <Trash2 className="w-2.5 h-2.5" />
                              </Button>
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
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
