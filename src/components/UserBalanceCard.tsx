import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowDownCircle, ArrowUpCircle, Wallet } from 'lucide-react';

export default function UserBalanceCard() {
  const { user, role } = useAuth();

  const { data: balance, isLoading } = useQuery({
    queryKey: ['user-global-balance', user?.id],
    queryFn: async () => {
      if (!user) return null;

      // Get total received from team_transfers (global, not per-workshop)
      const { data: transfers } = await supabase
        .from('team_transfers')
        .select('amount')
        .eq('user_id', user.id);
      
      const totalReceived = transfers?.reduce((sum, t) => sum + Number(t.amount), 0) || 0;

      // Get total spent (approved payments created by this user across ALL workshops)
      const { data: payments } = await supabase
        .from('payments')
        .select('amount')
        .eq('created_by', user.id)
        .eq('status', 'approved');
      
      const totalSpent = payments?.reduce((sum, p) => sum + Number(p.amount), 0) || 0;

      return {
        spent: totalSpent,
        received: totalReceived,
        balance: totalReceived - totalSpent,
      };
    },
    enabled: !!user && role !== 'admin',
  });

  // Don't show for admins
  if (role === 'admin') return null;

  if (isLoading) {
    return <Skeleton className="h-32 w-full" />;
  }

  if (!balance) return null;

  return (
    <Card className="shadow-card">
      <CardHeader className="pb-2 px-3 md:px-6 pt-3 md:pt-6">
        <CardTitle className="text-base md:text-lg flex items-center gap-2">
          <Wallet className="w-4 h-4 md:w-5 md:h-5" />
          Your Global Balance
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 md:px-6 pb-3 md:pb-6">
        <div className="grid grid-cols-3 gap-2 md:gap-4">
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-destructive mb-1">
              <ArrowUpCircle className="w-3 h-3 md:w-4 md:h-4" />
              <span className="text-[10px] md:text-xs font-medium">Spent</span>
            </div>
            <p className="text-sm md:text-lg font-bold font-mono text-destructive">
              -{balance.spent.toLocaleString('fr-FR')}
            </p>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-success mb-1">
              <ArrowDownCircle className="w-3 h-3 md:w-4 md:h-4" />
              <span className="text-[10px] md:text-xs font-medium">Received</span>
            </div>
            <p className="text-sm md:text-lg font-bold font-mono text-success">
              +{balance.received.toLocaleString('fr-FR')}
            </p>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-primary mb-1">
              <Wallet className="w-3 h-3 md:w-4 md:h-4" />
              <span className="text-[10px] md:text-xs font-medium">Balance</span>
            </div>
            <p className="text-sm md:text-lg font-bold font-mono text-primary">
              {balance.balance >= 0 ? '+' : ''}{balance.balance.toLocaleString('fr-FR')}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
