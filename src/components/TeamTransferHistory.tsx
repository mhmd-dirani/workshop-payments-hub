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
import { format } from 'date-fns';
import { ArrowDownCircle } from 'lucide-react';

interface TeamTransferHistoryProps {
  userId: string;
}

export default function TeamTransferHistory({ userId }: TeamTransferHistoryProps) {
  const { data: transfers, isLoading } = useQuery({
    queryKey: ['team-transfers', userId],
    queryFn: async () => {
      const { data: transfersData, error } = await supabase
        .from('team_transfers')
        .select('*')
        .eq('user_id', userId)
        .order('transfer_date', { ascending: false });

      if (error) throw error;

      // Get admin names
      const adminIds = [...new Set(transfersData?.map(t => t.created_by) || [])];
      if (adminIds.length === 0) return [];

      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, full_name')
        .in('user_id', adminIds);

      const profileMap = new Map(profiles?.map(p => [p.user_id, p.full_name]) || []);

      return transfersData?.map(t => ({
        ...t,
        admin_name: profileMap.get(t.created_by) || 'Admin',
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

  if (!transfers || transfers.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-8 text-center text-muted-foreground">
          No transfers received yet
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-card border-success/20">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2 text-success">
          <ArrowDownCircle className="w-5 h-5" />
          Transfer History (Received)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-success/5">
                <TableHead>Date</TableHead>
                <TableHead>From</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transfers.map((transfer) => (
                <TableRow key={transfer.id} className="animate-fade-in">
                  <TableCell className="font-mono text-sm">
                    {format(new Date(transfer.transfer_date), 'MMM d, yyyy')}
                  </TableCell>
                  <TableCell className="font-medium">
                    {transfer.admin_name}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {transfer.description || '-'}
                  </TableCell>
                  <TableCell className="text-right font-mono font-medium text-success">
                    +{Number(transfer.amount).toLocaleString('fr-FR')} CFA
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
