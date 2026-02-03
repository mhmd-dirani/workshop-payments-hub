import { useState, Fragment } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { Loader2, Trash2, Edit, Plus, ChevronDown, ChevronRight, CheckCircle, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';

interface DebtTableProps {
  debtType: 'i_owe' | 'they_owe';
  onAddPayment: (debt: any) => void;
  onEdit: (debt: any) => void;
}

export default function DebtTable({ debtType, onAddPayment, onEdit }: DebtTableProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [expandedDebt, setExpandedDebt] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const { data: debts, isLoading } = useQuery({
    queryKey: ['debts', debtType],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('debts')
        .select('*')
        .eq('debt_type', debtType)
        .order('debt_date', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: payments } = useQuery({
    queryKey: ['debt-payments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('debt_payments')
        .select('*')
        .order('payment_date', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const deleteDebt = useMutation({
    mutationFn: async (debtId: string) => {
      const { error } = await supabase
        .from('debts')
        .delete()
        .eq('id', debtId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['debts'] });
      queryClient.invalidateQueries({ queryKey: ['debt-stats'] });
      toast({
        title: t('debts.debtDeleted'),
        description: t('debts.debtDeletedDesc'),
      });
    },
    onError: (error: Error) => {
      toast({
        title: t('errors.error'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const markAsSettled = useMutation({
    mutationFn: async (debtId: string) => {
      const { error } = await supabase
        .from('debts')
        .update({ is_settled: true })
        .eq('id', debtId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['debts'] });
      queryClient.invalidateQueries({ queryKey: ['debt-stats'] });
      toast({
        title: t('debts.debtSettled'),
        description: t('debts.debtSettledDesc'),
      });
    },
  });

  const deletePayment = useMutation({
    mutationFn: async (paymentId: string) => {
      const { error } = await supabase
        .from('debt_payments')
        .delete()
        .eq('id', paymentId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['debt-payments'] });
      queryClient.invalidateQueries({ queryKey: ['debt-stats'] });
      toast({
        title: t('debts.paymentDeleted'),
        description: t('debts.paymentDeletedDesc'),
      });
    },
  });

  const getDebtPayments = (debtId: string) => {
    return payments?.filter(p => p.debt_id === debtId) || [];
  };

  const getTotalPaid = (debtId: string) => {
    const debtPayments = getDebtPayments(debtId);
    return debtPayments.reduce((sum, p) => sum + Number(p.amount), 0);
  };

  const getRemaining = (debt: any) => {
    const paid = getTotalPaid(debt.id);
    return Math.max(0, Number(debt.amount) - paid);
  };

  if (isLoading) {
    return (
      <Card className="shadow-card">
        <CardContent className="py-8 md:py-12 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const allActiveDebts = debts?.filter(d => !d.is_settled) || [];
  const settledDebts = debts?.filter(d => d.is_settled) || [];
  
  // Filter by search term
  const activeDebts = searchTerm.trim()
    ? allActiveDebts.filter(d => 
        d.person_name.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : allActiveDebts;
  
  // Calculate filtered total
  const filteredTotal = activeDebts.reduce((sum, d) => {
    const remaining = getRemaining(d);
    return sum + remaining;
  }, 0);

  return (
    <div className="space-y-3 md:space-y-4">
      <Card className="shadow-card">
        <CardHeader className="pb-2 px-3 md:px-6 pt-3 md:pt-6">
          <div className="flex flex-col gap-2 md:gap-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm md:text-lg">
                  {debtType === 'they_owe' ? t('debts.peopleWhoOweMe') : t('debts.peopleIOwe')}
                </CardTitle>
                <CardDescription className="text-xs md:text-sm">
                  {activeDebts.length} {t('debts.active')}{searchTerm && ` ${t('debts.matching')} "${searchTerm}"`}
                </CardDescription>
              </div>
            </div>
            <div className="relative">
              <Search className="absolute left-3 rtl:left-auto rtl:right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder={t('debts.searchByName')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="ltr:pl-9 rtl:pr-9 h-8 md:h-10 text-sm"
              />
            </div>
          </div>
          {searchTerm && activeDebts.length > 0 && (
            <div className="mt-2 p-2 md:p-3 rounded-lg bg-muted/50">
              <p className="text-xs md:text-sm">
                <span className="text-muted-foreground">{t('debts.filteredTotal')}: </span>
                <span className={`font-mono font-bold ${debtType === 'they_owe' ? 'text-success' : 'text-destructive'}`}>
                  {debtType === 'they_owe' ? '+' : '-'}{filteredTotal.toLocaleString('fr-FR')}
                </span>
              </p>
            </div>
          )}
        </CardHeader>
        <CardContent className="px-3 md:px-6 pb-3 md:pb-6">
          {activeDebts.length === 0 ? (
            <p className="text-center text-muted-foreground py-6 text-sm">
              {t('debts.noActiveDebts')}
            </p>
          ) : (
            <>
              {/* Mobile Card View */}
              <div className="md:hidden space-y-2">
                {activeDebts.map((debt) => {
                  const totalPaid = getTotalPaid(debt.id);
                  const remaining = getRemaining(debt);
                  const debtPayments = getDebtPayments(debt.id);
                  const isExpanded = expandedDebt === debt.id;

                  return (
                    <div key={debt.id} className="border rounded-lg overflow-hidden">
                      <div 
                        className="p-3 bg-card"
                        onClick={() => debtPayments.length > 0 && setExpandedDebt(isExpanded ? null : debt.id)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              {debtPayments.length > 0 && (
                                isExpanded ? <ChevronDown className="w-3 h-3 text-muted-foreground flex-shrink-0" /> : <ChevronRight className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                              )}
                              <p className="font-medium text-sm truncate">{debt.person_name}</p>
                            </div>
                            {debt.description && (
                              <p className="text-[10px] text-muted-foreground truncate mt-0.5 ml-4">{debt.description}</p>
                            )}
                            <p className="text-[10px] text-muted-foreground mt-1 ml-4">
                              {format(new Date(debt.debt_date), 'dd/MM/yyyy')}
                            </p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="font-mono font-bold text-sm">
                              {remaining.toLocaleString('fr-FR')}
                            </p>
                            {totalPaid > 0 && (
                              <p className="text-[10px] text-success">
                                paid: {totalPaid.toLocaleString('fr-FR')}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center justify-end gap-1 mt-2 pt-2 border-t" onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => onAddPayment(debt)}
                            className="h-7 w-7 text-success hover:text-success"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </Button>
                          {remaining === 0 && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => markAsSettled.mutate(debt.id)}
                              className="h-7 w-7 text-primary hover:text-primary"
                            >
                              <CheckCircle className="w-3.5 h-3.5" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => onEdit(debt)}
                            className="h-7 w-7"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteDebt.mutate(debt.id)}
                            className="h-7 w-7 text-destructive hover:text-destructive"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                      {isExpanded && debtPayments.length > 0 && (
                        <div className="bg-muted/30 p-2 border-t space-y-1.5">
                          <p className="text-xs font-medium px-1">{t('debts.repaymentHistory')}</p>
                          {debtPayments.map((payment) => (
                            <div key={payment.id} className="flex items-center justify-between p-2 rounded bg-background text-xs">
                              <div className="flex-1 min-w-0">
                                <span className="text-muted-foreground">{format(new Date(payment.payment_date), 'dd/MM/yy')}</span>
                                {payment.description && (
                                  <span className="text-muted-foreground ml-1.5 truncate">• {payment.description}</span>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono text-success">+{Number(payment.amount).toLocaleString('fr-FR')}</span>
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

              {/* Desktop Table View */}
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10"></TableHead>
                      <TableHead>{t('debts.person')}</TableHead>
                      <TableHead>{t('debts.original')}</TableHead>
                      <TableHead>{t('debts.paidAmount')}</TableHead>
                      <TableHead>{t('debts.remaining')}</TableHead>
                      <TableHead>{t('common.date')}</TableHead>
                      <TableHead className="text-end">{t('common.actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activeDebts.map((debt) => {
                      const totalPaid = getTotalPaid(debt.id);
                      const remaining = getRemaining(debt);
                      const debtPayments = getDebtPayments(debt.id);
                      const isExpanded = expandedDebt === debt.id;

                      return (
                        <Fragment key={debt.id}>
                          <TableRow>
                            <TableCell className="w-10 p-2">
                              {debtPayments.length > 0 && (
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-6 w-6"
                                  onClick={() => setExpandedDebt(isExpanded ? null : debt.id)}
                                >
                                  {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                </Button>
                              )}
                            </TableCell>
                            <TableCell className="font-medium">
                              {debt.person_name}
                              {debt.description && (
                                <p className="text-xs text-muted-foreground">{debt.description}</p>
                              )}
                            </TableCell>
                            <TableCell className="font-mono">
                              {Number(debt.amount).toLocaleString('fr-FR')} CFA
                            </TableCell>
                            <TableCell className="font-mono text-success">
                              {totalPaid.toLocaleString('fr-FR')} CFA
                            </TableCell>
                            <TableCell className="font-mono font-bold">
                              {remaining.toLocaleString('fr-FR')} CFA
                            </TableCell>
                            <TableCell>
                              {format(new Date(debt.debt_date), 'dd/MM/yyyy')}
                            </TableCell>
                            <TableCell className="text-end">
                              <div className="flex justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => onAddPayment(debt)}
                                  className="h-8 w-8 text-success hover:text-success"
                                  title="Add repayment"
                                >
                                  <Plus className="w-4 h-4" />
                                </Button>
                                {remaining === 0 && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => markAsSettled.mutate(debt.id)}
                                    className="h-8 w-8 text-primary hover:text-primary"
                                    title="Mark as settled"
                                  >
                                    <CheckCircle className="w-4 h-4" />
                                  </Button>
                                )}
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => onEdit(debt)}
                                  className="h-8 w-8"
                                >
                                  <Edit className="w-4 h-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => deleteDebt.mutate(debt.id)}
                                  className="h-8 w-8 text-destructive hover:text-destructive"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                          {isExpanded && debtPayments.length > 0 && (
                            <TableRow className="bg-muted/30">
                              <TableCell colSpan={7} className="p-0">
                                <div className="p-4">
                                  <p className="text-sm font-medium mb-2">{t('debts.repaymentHistory')}</p>
                                  <Table>
                                    <TableHeader>
                                      <TableRow>
                                        <TableHead>{t('common.date')}</TableHead>
                                        <TableHead>{t('common.amount')}</TableHead>
                                        <TableHead>{t('common.description')}</TableHead>
                                        <TableHead className="w-10"></TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {debtPayments.map((payment) => (
                                        <TableRow key={payment.id}>
                                          <TableCell>{format(new Date(payment.payment_date), 'dd/MM/yyyy')}</TableCell>
                                          <TableCell className="font-mono text-success">
                                            +{Number(payment.amount).toLocaleString('fr-FR')} CFA
                                          </TableCell>
                                          <TableCell className="text-muted-foreground">
                                            {payment.description || '-'}
                                          </TableCell>
                                          <TableCell>
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              onClick={() => deletePayment.mutate(payment.id)}
                                              className="h-6 w-6 text-destructive hover:text-destructive"
                                            >
                                              <Trash2 className="w-3 h-3" />
                                            </Button>
                                          </TableCell>
                                        </TableRow>
                                      ))}
                                    </TableBody>
                                  </Table>
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Settled Debts */}
      {settledDebts.length > 0 && (
        <Card className="shadow-card opacity-75">
          <CardHeader className="pb-2 px-3 md:px-6 pt-3 md:pt-6">
            <CardTitle className="text-sm md:text-lg">{t('debts.settledDebts')}</CardTitle>
            <CardDescription className="text-xs md:text-sm">
              {settledDebts.length} {t('debts.settled')}
            </CardDescription>
          </CardHeader>
          <CardContent className="px-3 md:px-6 pb-3 md:pb-6">
            {/* Mobile Card View for Settled */}
            <div className="md:hidden space-y-2">
              {settledDebts.map((debt) => (
                <div key={debt.id} className="flex items-center justify-between p-3 rounded-lg border bg-success/5 border-success/20">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{debt.person_name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {format(new Date(debt.debt_date), 'dd/MM/yyyy')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-end">
                      <p className="font-mono text-sm">{Number(debt.amount).toLocaleString('fr-FR')}</p>
                      <Badge variant="secondary" className="bg-success/10 text-success text-[10px] px-1.5 py-0">
                        {t('debts.settled')}
                      </Badge>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteDebt.mutate(debt.id)}
                      className="h-7 w-7 text-destructive hover:text-destructive"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table View for Settled */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('debts.person')}</TableHead>
                    <TableHead>{t('common.amount')}</TableHead>
                    <TableHead>{t('common.date')}</TableHead>
                    <TableHead>{t('common.status')}</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {settledDebts.map((debt) => (
                    <TableRow key={debt.id}>
                      <TableCell className="font-medium">{debt.person_name}</TableCell>
                      <TableCell className="font-mono">
                        {Number(debt.amount).toLocaleString('fr-FR')} CFA
                      </TableCell>
                      <TableCell>{format(new Date(debt.debt_date), 'dd/MM/yyyy')}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="bg-success/10 text-success">
                          {t('debts.settled')}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteDebt.mutate(debt.id)}
                          className="h-8 w-8 text-destructive hover:text-destructive"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
