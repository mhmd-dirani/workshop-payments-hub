import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowDownCircle, ArrowUpCircle, Wallet } from 'lucide-react';

interface UserBalanceCardProps {
  workshopId: string;
}

export default function UserBalanceCard({ workshopId }: UserBalanceCardProps) {
  const { user, role } = useAuth();

  const { data: balance, isLoading } = useQuery({
    queryKey: ['user-balance', workshopId, user?.id],
    queryFn: async () => {
      if (!user) return null;

      // Get total spent (approved payments created by this user)
      const { data: payments } = await supabase
        .from('payments')
        .select('amount')
        .eq('workshop_id', workshopId)
        .eq('created_by', user.id)
        .eq('status', 'approved');
      
      const totalSpent = payments?.reduce((sum, p) => sum + Number(p.amount), 0) || 0;

      // Get total received (transfers to this user)
      const { data: transfers } = await supabase
        .from('user_transfers')
        .select('amount')
        .eq('workshop_id', workshopId)
        .eq('user_id', user.id);
      
      const totalReceived = transfers?.reduce((sum, t) => sum + Number(t.amount), 0) || 0;

      return {
        spent: totalSpent,
        received: totalReceived,
        balance: totalReceived - totalSpent,
      };
    },
    enabled: !!workshopId && !!user && role !== 'admin',
  });

  // Don't show for admins
  if (role === 'admin') return null;

  if (isLoading) {
    return <Skeleton className="h-32 w-full" />;
  }

  if (!balance) return null;

  return (
    <Card className="shadow-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <Wallet className="w-5 h-5" />
          Your Balance
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-destructive mb-1">
              <ArrowUpCircle className="w-4 h-4" />
              <span className="text-xs font-medium">Spent</span>
            </div>
            <p className="text-lg font-bold font-mono text-destructive">
              -{balance.spent.toLocaleString('fr-FR')}
            </p>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-success mb-1">
              <ArrowDownCircle className="w-4 h-4" />
              <span className="text-xs font-medium">Received</span>
            </div>
            <p className="text-lg font-bold font-mono text-success">
              +{balance.received.toLocaleString('fr-FR')}
            </p>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-primary mb-1">
              <Wallet className="w-4 h-4" />
              <span className="text-xs font-medium">Balance</span>
            </div>
            <p className="text-lg font-bold font-mono text-primary">
              {balance.balance >= 0 ? '+' : ''}{balance.balance.toLocaleString('fr-FR')}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
