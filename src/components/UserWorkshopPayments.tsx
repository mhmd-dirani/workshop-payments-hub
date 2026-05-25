import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { ArrowUpCircle, ChevronDown } from 'lucide-react';
import { usePaymentReceipts } from '@/hooks/usePaymentReceipts';

export default function UserWorkshopPayments() {
  const { t } = useTranslation();
  const { user, role } = useAuth();
  const [isOpen, setIsOpen] = useState(false);

  const { data: payments = [], isLoading } = useQuery({
    queryKey: ['user-all-workshop-payments', user?.id],
    queryFn: async () => {
      if (!user) return [];

      const { fetchAllPages } = await import('@/lib/paginate');
      const data = await fetchAllPages<any>((from, to) =>
        supabase
          .from('payments')
          .select('id, amount, paid_to, reason, payment_date, status, workshop_id')
          .eq('created_by', user.id)
          .eq('status', 'approved')
          .order('payment_date', { ascending: false })
          .order('id', { ascending: false })
          .range(from, to)
      );

      // Get workshop names
      const workshopIds = [...new Set(data.map(p => p.workshop_id))] as string[];
      if (workshopIds.length === 0) return [];

      const { data: workshops } = await supabase
        .from('workshops')
        .select('id, name')
        .in('id', workshopIds);

      const workshopMap = new Map(workshops?.map(w => [w.id, w.name]) || []);

      return data.map(p => ({
        ...p,
        workshop_name: workshopMap.get(p.workshop_id) || '-',
      }));
    },
    enabled: !!user && role !== 'admin',
  });

  // Hook must run on every render — call before any early returns.
  const { ReceiptButtons, PreviewDialog } = usePaymentReceipts(payments.map((p: any) => p.id));

  if (role === 'admin') return null;
  if (isLoading) return <Skeleton className="h-12 w-full" />;
  if (payments.length === 0) return null;

  const totalSpent = payments.reduce((sum, p) => sum + Number(p.amount), 0);

  return (
    <Card className="shadow-card border-destructive/20">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CardHeader className="pb-2 px-3 md:px-6 pt-3 md:pt-6">
          <CollapsibleTrigger asChild>
            <div className="flex items-center justify-between cursor-pointer">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <ArrowUpCircle className="w-4 h-4 md:w-5 md:h-5 text-destructive flex-shrink-0" />
                <CardTitle className="text-sm md:text-base text-destructive truncate">
                  {t('dashboard.workshopPayments')}
                </CardTitle>
                <span className="text-xs md:text-sm font-bold font-mono text-destructive flex-shrink-0">
                  -{totalSpent.toLocaleString('fr-FR')}
                </span>
              </div>
              <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </div>
          </CollapsibleTrigger>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="px-3 md:px-6 pb-3 md:pb-6 space-y-2">
            {payments.map((payment) => (
              <div key={payment.id} className="flex items-center justify-between p-2.5 rounded-lg border bg-destructive/5 border-destructive/20">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs font-medium truncate">{payment.paid_to}</p>
                    <Badge variant="outline" className="text-[8px] px-1 py-0 h-4 flex-shrink-0">
                      {payment.workshop_name}
                    </Badge>
                  </div>
                  <p className="text-[10px] text-muted-foreground truncate">{payment.reason}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {format(new Date(payment.payment_date), 'MMM d, yyyy')}
                  </p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                  <ReceiptButtons paymentId={payment.id} size="sm" />
                  <span className="font-mono font-bold text-sm text-destructive">
                    -{Number(payment.amount).toLocaleString('fr-FR')}
                  </span>
                </div>
              </div>
            ))}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
      <PreviewDialog />
    </Card>
  );
}
