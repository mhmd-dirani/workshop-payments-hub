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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { Trash2, TrendingUp } from 'lucide-react';

interface IncomeTableProps {
  workshopId: string;
}

export default function IncomeTable({ workshopId }: IncomeTableProps) {
  const { role } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: incomeRecords, isLoading } = useQuery({
    queryKey: ['income', workshopId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('income')
        .select('*')
        .eq('workshop_id', workshopId)
        .order('income_date', { ascending: false });
      
      if (error) throw error;
      return data;
    },
    enabled: !!workshopId,
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
              <div className="flex items-center gap-2 ml-2">
                <span className="font-mono font-bold text-sm text-success">
                  +{Number(income.amount).toLocaleString('fr-FR')}
                </span>
                {role === 'admin' && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteIncome.mutate(income.id)}
                    className="h-7 w-7 text-destructive hover:text-destructive"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
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
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteIncome.mutate(income.id)}
                        className="h-8 w-8 text-destructive hover:text-destructive"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
