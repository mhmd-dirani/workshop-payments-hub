import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowDownCircle, ArrowUpCircle, Wallet, ShoppingBag, Plus } from 'lucide-react';
import PersonalPaymentForm from './PersonalPaymentForm';

export default function UserBalanceCard() {
  const { t } = useTranslation();
  const { user, role } = useAuth();
  const [isPersonalPaymentOpen, setIsPersonalPaymentOpen] = useState(false);

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

      // Get personal payments (outside workshop)
      const { data: personalPayments } = await supabase
        .from('personal_payments')
        .select('amount')
        .eq('user_id', user.id);
      
      const totalPersonal = personalPayments?.reduce((sum, p) => sum + Number(p.amount), 0) || 0;

      return {
        spent: totalSpent,
        personal: totalPersonal,
        received: totalReceived,
        balance: totalReceived - totalSpent - totalPersonal,
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

  const totalSpentCombined = balance.spent + balance.personal;

  return (
    <>
      <Card className="shadow-card">
        <CardHeader className="pb-2 px-3 md:px-6 pt-3 md:pt-6">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base md:text-lg flex items-center gap-2">
              <Wallet className="w-4 h-4 md:w-5 md:h-5" />
              {t('userBalance.yourGlobalBalance')}
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsPersonalPaymentOpen(true)}
              className="gap-1.5 h-7 md:h-8 text-xs"
            >
              <ShoppingBag className="w-3 h-3" />
              <span className="hidden sm:inline">{t('personalPayments.add')}</span>
              <Plus className="w-3 h-3 sm:hidden" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="px-3 md:px-6 pb-3 md:pb-6">
          <div className="grid grid-cols-3 gap-2 md:gap-4">
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 text-destructive mb-1">
                <ArrowUpCircle className="w-3 h-3 md:w-4 md:h-4" />
                <span className="text-[10px] md:text-xs font-medium">{t('userBalance.spent')}</span>
              </div>
              <p className="text-sm md:text-lg font-bold font-mono text-destructive">
                -{totalSpentCombined.toLocaleString('fr-FR')}
              </p>
              {balance.personal > 0 && (
                <p className="text-[8px] md:text-[10px] text-muted-foreground">
                  ({balance.personal.toLocaleString('fr-FR')} {t('personalPayments.title').toLowerCase()})
                </p>
              )}
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 text-success mb-1">
                <ArrowDownCircle className="w-3 h-3 md:w-4 md:h-4" />
                <span className="text-[10px] md:text-xs font-medium">{t('userBalance.received')}</span>
              </div>
              <p className="text-sm md:text-lg font-bold font-mono text-success">
                +{balance.received.toLocaleString('fr-FR')}
              </p>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 text-primary mb-1">
                <Wallet className="w-3 h-3 md:w-4 md:h-4" />
                <span className="text-[10px] md:text-xs font-medium">{t('userBalance.balance')}</span>
              </div>
              <p className={`text-sm md:text-lg font-bold font-mono ${balance.balance >= 0 ? 'text-primary' : 'text-destructive'}`}>
                {balance.balance >= 0 ? '+' : ''}{balance.balance.toLocaleString('fr-FR')}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <PersonalPaymentForm
        open={isPersonalPaymentOpen}
        onOpenChange={setIsPersonalPaymentOpen}
      />
    </>
  );
}