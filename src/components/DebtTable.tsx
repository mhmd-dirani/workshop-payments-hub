import { useState, Fragment } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
import { Loader2, Trash2, Edit, Plus, ChevronDown, ChevronRight, CheckCircle } from 'lucide-react';

interface DebtTableProps {
  debtType: 'i_owe' | 'they_owe';
  onAddPayment: (debt: any) => void;
  onEdit: (debt: any) => void;
}

export default function DebtTable({ debtType, onAddPayment, onEdit }: DebtTableProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [expandedDebt, setExpandedDebt] = useState<string | null>(null);

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
        title: 'Debt deleted',
        description: 'The debt record has been removed',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
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
        title: 'Debt settled',
        description: 'The debt has been marked as fully paid',
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
        title: 'Payment deleted',
        description: 'The repayment record has been removed',
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
        <CardContent className="py-12 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const activeDebts = debts?.filter(d => !d.is_settled) || [];
  const settledDebts = debts?.filter(d => d.is_settled) || [];

  return (
    <div className="space-y-4">
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="text-lg">
            {debtType === 'they_owe' ? 'People Who Owe Me' : 'People I Owe'}
          </CardTitle>
          <CardDescription>
            {activeDebts.length} active debt{activeDebts.length !== 1 ? 's' : ''}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {activeDebts.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No active debts
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"></TableHead>
                  <TableHead>Person</TableHead>
                  <TableHead>Original Amount</TableHead>
                  <TableHead>Paid</TableHead>
                  <TableHead>Remaining</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
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
                        <TableCell className="text-right">
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
                              <p className="text-sm font-medium mb-2">Repayment History</p>
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Date</TableHead>
                                    <TableHead>Amount</TableHead>
                                    <TableHead>Note</TableHead>
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
          )}
        </CardContent>
      </Card>

      {/* Settled Debts */}
      {settledDebts.length > 0 && (
        <Card className="shadow-card opacity-75">
          <CardHeader>
            <CardTitle className="text-lg">Settled Debts</CardTitle>
            <CardDescription>
              {settledDebts.length} debt{settledDebts.length !== 1 ? 's' : ''} fully paid
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Person</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
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
                        Settled
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
          </CardContent>
        </Card>
      )}
    </div>
  );
}
