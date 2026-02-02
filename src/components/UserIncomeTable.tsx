import { useQuery } from '@tanstack/react-query';
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { ArrowDownCircle } from 'lucide-react';

interface UserIncomeTableProps {
  workshopId: string;
}

export default function UserIncomeTable({ workshopId }: UserIncomeTableProps) {
  const { user, role } = useAuth();

  const { data: transfers, isLoading } = useQuery({
    queryKey: ['user-transfers', workshopId, user?.id],
    queryFn: async () => {
      if (!user) return [];

      // Get transfers to this user
      const { data: transfersData, error } = await supabase
        .from('user_transfers')
        .select('*')
        .eq('workshop_id', workshopId)
        .eq('user_id', user.id)
        .order('transfer_date', { ascending: false });
      
      if (error) throw error;

      // Get admin names
      const adminIds = [...new Set(transfersData?.map(t => t.created_by) || [])];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, full_name')
        .in('user_id', adminIds);
      
      const profileMap = new Map(profiles?.map(p => [p.user_id, p.full_name]) || []);

      return transfersData?.map(t => ({
        ...t,
        admin_name: profileMap.get(t.created_by) || 'Admin'
      })) || [];
    },
    enabled: !!workshopId && !!user && role !== 'admin',
  });

  // Don't show for admins
  if (role === 'admin') return null;

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(2)].map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (!transfers || transfers.length === 0) {
    return null;
  }

  return (
    <Card className="shadow-card border-success/20">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2 text-success">
          <ArrowDownCircle className="w-5 h-5" />
          Received from Admin
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-success/5">
                <TableHead>Date</TableHead>
                <TableHead>From</TableHead>
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
