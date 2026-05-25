import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { format } from 'date-fns';
import { ArrowUpCircle, Wallet } from 'lucide-react';
import { usePaymentReceipts } from '@/hooks/usePaymentReceipts';

interface TeamSpendingHistoryProps {
  userId: string;
}

export default function TeamSpendingHistory({ userId }: TeamSpendingHistoryProps) {
  const { t } = useTranslation();
  const [workshopFilter, setWorkshopFilter] = useState<string>('all');

  // Fetch workshop payments
  const { data: workshopData, isLoading: loadingWorkshop } = useQuery({
    queryKey: ['team-spending', userId],
    queryFn: async () => {
      // Get all approved payments by this user (paginated past 1000-row PostgREST cap)
      const { fetchAllPages } = await import('@/lib/paginate');
      const paymentsData = await fetchAllPages<any>((from, to) =>
        supabase
          .from('payments')
          .select('*')
          .eq('created_by', userId)
          .eq('status', 'approved')
          .order('payment_date', { ascending: false })
          .order('id', { ascending: false })
          .range(from, to)
      );

      // Get workshop names
      const workshopIds = [...new Set(paymentsData.map(p => p.workshop_id))] as string[];
      if (workshopIds.length === 0) return { payments: [], workshops: [] };

      const { data: workshops } = await supabase
        .from('workshops')
        .select('id, name')
        .in('id', workshopIds);

      const workshopMap = new Map(workshops?.map(w => [w.id, w.name]) || []);

      return {
        payments: paymentsData.map(p => ({
          ...p,
          workshop_name: workshopMap.get(p.workshop_id) || 'Unknown Workshop',
        })),
        workshops: workshops || [],
      };
    },
  });

  // Fetch personal payments
  const { data: personalPayments = [], isLoading: loadingPersonal } = useQuery({
    queryKey: ['team-personal-spending', userId],
    queryFn: async () => {
      const { fetchAllPages } = await import('@/lib/paginate');
      return await fetchAllPages<any>((from, to) =>
        supabase
          .from('personal_payments')
          .select('*')
          .eq('user_id', userId)
          .order('payment_date', { ascending: false })
          .order('id', { ascending: false })
          .range(from, to)
      );
    },
  });

  const isLoading = loadingWorkshop || loadingPersonal;

  const filteredWorkshopPayments = workshopFilter === 'all'
    ? workshopData?.payments || []
    : workshopData?.payments.filter(p => p.workshop_id === workshopFilter) || [];

  // Hook must run on every render — call before any early returns.
  const { ReceiptButtons, PreviewDialog } = usePaymentReceipts(
    filteredWorkshopPayments.map((p: any) => p.id)
  );

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

  const hasWorkshopPayments = workshopData && workshopData.payments.length > 0;
  const hasPersonalPayments = personalPayments.length > 0;

  if (!hasWorkshopPayments && !hasPersonalPayments) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-8 text-center text-muted-foreground">
          {t('team.noSpendingYet')}
        </CardContent>
      </Card>
    );
  }

  const workshopTotal = filteredWorkshopPayments.reduce((sum, p) => sum + Number(p.amount), 0);
  const personalTotal = personalPayments.reduce((sum, p) => sum + Number(p.amount), 0);

  return (
    <Card className="shadow-card border-destructive/20">
      <CardHeader className="pb-3 px-3 md:px-6 pt-3 md:pt-6">
        <CardTitle className="text-base md:text-lg flex items-center gap-2 text-destructive">
          <ArrowUpCircle className="w-4 h-4 md:w-5 md:h-5" />
          {t('team.spendingHistory')}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 md:px-6 pb-3 md:pb-6 space-y-4">
        <Tabs defaultValue="workshop">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="workshop" className="text-xs md:text-sm">
              {t('common.workshop')}
              {hasWorkshopPayments && (
                <Badge variant="secondary" className="ml-1 text-[10px]">
                  {workshopData?.payments.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="personal" className="text-xs md:text-sm">
              {t('personalPayments.title')}
              {hasPersonalPayments && (
                <Badge variant="secondary" className="ml-1 text-[10px]">
                  {personalPayments.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="workshop" className="mt-4 space-y-3">
            {/* Workshop Filter */}
            {workshopData && workshopData.workshops.length > 1 && (
              <Select value={workshopFilter} onValueChange={setWorkshopFilter}>
                <SelectTrigger className="w-full h-9 text-sm">
                  <SelectValue placeholder={t('dashboard.selectWorkshop')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('common.all')} {t('users.workshops')}</SelectItem>
                  {workshopData.workshops.map(w => (
                    <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {!hasWorkshopPayments ? (
              <p className="text-center text-muted-foreground py-4 text-sm">
                {t('team.noSpendingYet')}
              </p>
            ) : filteredWorkshopPayments.length === 0 ? (
              <p className="text-center text-muted-foreground py-4 text-sm">
                {t('payments.noMatchingPayments')}
              </p>
            ) : (
              <>
                {/* Mobile-optimized card list */}
                <div className="space-y-2">
                  {filteredWorkshopPayments.map((payment) => (
                    <div key={payment.id} className="border rounded-lg p-3 animate-fade-in">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm truncate">{payment.paid_to}</span>
                            <Badge variant="outline" className="text-[10px] shrink-0">
                              {payment.workshop_name}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground truncate">
                            {payment.reason || '-'}
                          </p>
                          <p className="text-xs text-muted-foreground font-mono">
                            {format(new Date(payment.payment_date), 'MMM d, yyyy')}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <ReceiptButtons paymentId={payment.id} size="sm" />
                          <p className="font-mono font-medium text-destructive text-sm">
                            -{Number(payment.amount).toLocaleString('fr-FR')}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                
                {/* Workshop Total */}
                <div className="flex justify-end pt-2 border-t">
                  <div className="text-end">
                    <p className="text-xs text-muted-foreground">
                      {workshopFilter === 'all' ? t('userBalance.totalSpent') : t('debts.filteredTotal')}
                    </p>
                    <p className="text-lg md:text-xl font-bold font-mono text-destructive">
                      -{workshopTotal.toLocaleString('fr-FR')} CFA
                    </p>
                  </div>
                </div>
              </>
            )}
          </TabsContent>

          <TabsContent value="personal" className="mt-4 space-y-3">
            {!hasPersonalPayments ? (
              <p className="text-center text-muted-foreground py-4 text-sm">
                {t('personalPayments.noPayments')}
              </p>
            ) : (
              <>
                {/* Mobile-optimized card list for personal payments */}
                <div className="space-y-2">
                  {personalPayments.map((payment) => (
                    <div key={payment.id} className="border rounded-lg p-3 animate-fade-in">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm truncate">{payment.paid_to}</span>
                            <Badge variant="outline" className="text-[10px] shrink-0 bg-primary/10">
                              <Wallet className="w-2.5 h-2.5 mr-1" />
                              {t('personalPayments.title')}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground truncate">
                            {payment.reason || '-'}
                          </p>
                          <p className="text-xs text-muted-foreground font-mono">
                            {format(new Date(payment.payment_date), 'MMM d, yyyy')}
                          </p>
                        </div>
                        <p className="font-mono font-medium text-destructive text-sm shrink-0">
                          -{Number(payment.amount).toLocaleString('fr-FR')}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
                
                {/* Personal Total */}
                <div className="flex justify-end pt-2 border-t">
                  <div className="text-end">
                    <p className="text-xs text-muted-foreground">
                      {t('userBalance.totalSpent')}
                    </p>
                    <p className="text-lg md:text-xl font-bold font-mono text-destructive">
                      -{personalTotal.toLocaleString('fr-FR')} CFA
                    </p>
                  </div>
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
      <PreviewDialog />
    </Card>
  );
}
