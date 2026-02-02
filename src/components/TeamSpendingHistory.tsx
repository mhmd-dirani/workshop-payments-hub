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
import { format } from 'date-fns';
import { ArrowUpCircle } from 'lucide-react';

interface TeamSpendingHistoryProps {
  userId: string;
}

export default function TeamSpendingHistory({ userId }: TeamSpendingHistoryProps) {
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
      if (workshopIds.length === 0) return [];

      const { data: workshops } = await supabase
        .from('workshops')
        .select('id, name')
        .in('id', workshopIds);

      const workshopMap = new Map(workshops?.map(w => [w.id, w.name]) || []);

      return paymentsData?.map(p => ({
        ...p,
        workshop_name: workshopMap.get(p.workshop_id) || 'Unknown Workshop',
      })) || [];
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

  if (!payments || payments.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-8 text-center text-muted-foreground">
          No spending recorded yet
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-card border-destructive/20">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2 text-destructive">
          <ArrowUpCircle className="w-5 h-5" />
          Spending History
        </CardTitle>
      </CardHeader>
      <CardContent>
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
              {payments.map((payment) => (
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
      </CardContent>
    </Card>
  );
}
