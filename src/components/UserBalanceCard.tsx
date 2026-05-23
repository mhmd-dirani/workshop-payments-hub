import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { fetchUserBalance } from '@/lib/balance-utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowDownCircle, ArrowUpCircle, Wallet, ShoppingBag, Plus } from 'lucide-react';
import PersonalPaymentForm from './PersonalPaymentForm';

export default function UserBalanceCard() {
  const { t } = useTranslation();
  const { user, role } = useAuth();
  const queryClient = useQueryClient();
  const [isPersonalPaymentOpen, setIsPersonalPaymentOpen] = useState(false);

  // Single source of truth: see src/lib/balance-utils.ts.
  // The same util powers the admin Team page so the two views can never drift.
  const { data: balance, isLoading } = useQuery({
    queryKey: ['user-global-balance', user?.id],
    queryFn: async () => {
      if (!user) return null;
      const b = await fetchUserBalance(user.id);
      return {
        spent: b.workshopSpent,
        personal: b.personalSpent,
        received: b.received,
        balance: b.balance,
      };
    },
    enabled: !!user && role !== 'admin',
  });

  // Realtime: re-fetch balance whenever any of the three source tables change
  // for this user. Without this, an admin's edits/approvals on another device
  // would not reach the user's screen until manual refresh, causing the
  // balance to drift from the admin view.
  useEffect(() => {
    if (!user || role === 'admin') return;
    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: ['user-global-balance', user.id] });
    };
    const channel = supabase
      .channel(`user-balance-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'team_transfers', filter: `user_id=eq.${user.id}` }, invalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments', filter: `created_by=eq.${user.id}` }, invalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'personal_payments', filter: `user_id=eq.${user.id}` }, invalidate)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, role, queryClient]);

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