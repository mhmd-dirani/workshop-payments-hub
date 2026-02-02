import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { Trash2, TrendingUp, Pencil, Loader2 } from 'lucide-react';

interface IncomeTableProps {
  workshopId: string;
}

interface Income {
  id: string;
  amount: number;
  income_date: string;
  description: string | null;
  workshop_id: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export default function IncomeTable({ workshopId }: IncomeTableProps) {
  const { role } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [editingIncome, setEditingIncome] = useState<Income | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editDescription, setEditDescription] = useState('');

  const { data: incomeRecords, isLoading } = useQuery({
    queryKey: ['income', workshopId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('income')
        .select('*')
        .eq('workshop_id', workshopId)
        .order('income_date', { ascending: false });
      
      if (error) throw error;
      return data as Income[];
    },
    enabled: !!workshopId,
  });

  const updateIncome = useMutation({
    mutationFn: async () => {
      if (!editingIncome) return;
      
      const numAmount = parseFloat(editAmount);
      if (isNaN(numAmount) || numAmount <= 0) {
        throw new Error('Amount must be greater than 0');
      }

      const { error } = await supabase
        .from('income')
        .update({
          amount: numAmount,
          income_date: editDate,
          description: editDescription.trim() || null,
        })
        .eq('id', editingIncome.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['income', workshopId] });
      queryClient.invalidateQueries({ queryKey: ['workshop-stats', workshopId] });
      setEditingIncome(null);
      toast({ title: 'Income updated successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const deleteIncome = useMutation({
    mutationFn: async (incomeId: string) => {
      const { error } = await supabase
        .from('income')
        .delete()
        .eq('id', incomeId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['income', workshopId] });
      queryClient.invalidateQueries({ queryKey: ['workshop-stats', workshopId] });
      toast({
        title: 'Income deleted',
        description: 'The income record has been removed',
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

  const openEditDialog = (income: Income) => {
    setEditingIncome(income);
    setEditAmount(String(income.amount));
    setEditDate(income.income_date);
    setEditDescription(income.description || '');
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (!incomeRecords || incomeRecords.length === 0) {
    return null;
  }

  return (
    <>
      <Card className="shadow-card border-success/20">
        <CardHeader className="pb-2 md:pb-3 px-3 md:px-6 pt-3 md:pt-6">
          <CardTitle className="text-base md:text-lg flex items-center gap-2 text-success">
            <TrendingUp className="w-4 h-4 md:w-5 md:h-5" />
            Income Records
          </CardTitle>
        </CardHeader>
        <CardContent className="px-3 md:px-6 pb-3 md:pb-6">
          {/* Mobile Card View */}
          <div className="md:hidden space-y-2">
            {incomeRecords.map((income) => (
              <div key={income.id} className="flex items-center justify-between p-3 rounded-lg border bg-success/5 border-success/20">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground truncate">
                    {income.description || 'No description'}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {format(new Date(income.income_date), 'MMM d, yyyy')}
                  </p>
                </div>
                <div className="flex items-center gap-1 ml-2">
                  <span className="font-mono font-bold text-sm text-success">
                    +{Number(income.amount).toLocaleString('fr-FR')}
                  </span>
                  {role === 'admin' && (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditDialog(income)}
                        className="h-7 w-7"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteIncome.mutate(income.id)}
                        className="h-7 w-7 text-destructive hover:text-destructive"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Desktop Table View */}
          <div className="hidden md:block rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-success/5">
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  {role === 'admin' && <TableHead className="text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {incomeRecords.map((income) => (
                  <TableRow key={income.id} className="animate-fade-in">
                    <TableCell className="font-mono text-sm">
                      {format(new Date(income.income_date), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-muted-foreground">
                      {income.description || '-'}
                    </TableCell>
                    <TableCell className="text-right font-mono font-medium text-success">
                      +{Number(income.amount).toLocaleString('fr-FR')} CFA
                    </TableCell>
                    {role === 'admin' && (
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEditDialog(income)}
                            className="h-8 w-8"
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteIncome.mutate(income.id)}
                            className="h-8 w-8 text-destructive hover:text-destructive"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={!!editingIncome} onOpenChange={(open) => !open && setEditingIncome(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Income</DialogTitle>
            <DialogDescription>
              Update the income record details
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit_income_amount">Amount *</Label>
              <Input
                id="edit_income_amount"
                type="number"
                step="1"
                min="1"
                value={editAmount}
                onChange={(e) => setEditAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit_income_date">Date *</Label>
              <Input
                id="edit_income_date"
                type="date"
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
                max={new Date().toISOString().split('T')[0]}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit_income_description">Description</Label>
              <Textarea
                id="edit_income_description"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingIncome(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => updateIncome.mutate()}
              disabled={updateIncome.isPending}
              className="gradient-primary text-primary-foreground"
            >
              {updateIncome.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
