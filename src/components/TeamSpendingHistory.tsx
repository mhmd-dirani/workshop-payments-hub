import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { format } from 'date-fns';
import { ArrowUpCircle } from 'lucide-react';

interface TeamSpendingHistoryProps {
  userId: string;
}

export default function TeamSpendingHistory({ userId }: TeamSpendingHistoryProps) {
  const [workshopFilter, setWorkshopFilter] = useState<string>('all');

  const { data: payments, isLoading } = useQuery({
    queryKey: ['team-spending', userId],
    queryFn: async () => {
      // Get all approved payments by this user
      const { data: paymentsData, error } = await supabase
        .from('payments')
        .select('*')
        .eq('created_by', userId)
        .eq('status', 'approved')
        .order('payment_date', { ascending: false });

      if (error) throw error;

      // Get workshop names
      const workshopIds = [...new Set(paymentsData?.map(p => p.workshop_id) || [])];
      if (workshopIds.length === 0) return { payments: [], workshops: [] };

      const { data: workshops } = await supabase
        .from('workshops')
        .select('id, name')
        .in('id', workshopIds);

      const workshopMap = new Map(workshops?.map(w => [w.id, w.name]) || []);

      return {
        payments: paymentsData?.map(p => ({
          ...p,
          workshop_name: workshopMap.get(p.workshop_id) || 'Unknown Workshop',
        })) || [],
        workshops: workshops || [],
      };
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-40" />
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!payments || payments.payments.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-8 text-center text-muted-foreground">
          No spending recorded yet
        </CardContent>
      </Card>
    );
  }

  const filteredPayments = workshopFilter === 'all' 
    ? payments.payments 
    : payments.payments.filter(p => p.workshop_id === workshopFilter);

  const filteredTotal = filteredPayments.reduce((sum, p) => sum + Number(p.amount), 0);

  return (
    <Card className="shadow-card border-destructive/20">
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <CardTitle className="text-lg flex items-center gap-2 text-destructive">
            <ArrowUpCircle className="w-5 h-5" />
            Spending History
          </CardTitle>
          {payments.workshops.length > 1 && (
            <Select value={workshopFilter} onValueChange={setWorkshopFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Filter by workshop" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Workshops</SelectItem>
                {payments.workshops.map(w => (
                  <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-destructive/5">
                <TableHead>Date</TableHead>
                <TableHead>Workshop</TableHead>
                <TableHead>Paid To</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPayments.map((payment) => (
                <TableRow key={payment.id} className="animate-fade-in">
                  <TableCell className="font-mono text-sm">
                    {format(new Date(payment.payment_date), 'MMM d, yyyy')}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-normal">
                      {payment.workshop_name}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium">
                    {payment.paid_to}
                  </TableCell>
                  <TableCell className="text-muted-foreground max-w-xs truncate">
                    {payment.reason || '-'}
                  </TableCell>
                  <TableCell className="text-right font-mono font-medium text-destructive">
                    -{Number(payment.amount).toLocaleString('fr-FR')} CFA
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        
        {/* Filtered Total */}
        <div className="flex justify-end pt-2 border-t">
          <div className="text-right">
            <p className="text-sm text-muted-foreground">
              {workshopFilter === 'all' ? 'Total Spent' : 'Filtered Total'}
            </p>
            <p className="text-xl font-bold font-mono text-destructive">
              -{filteredTotal.toLocaleString('fr-FR')} CFA
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
