import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { ArrowDownCircle, ChevronDown } from 'lucide-react';

export default function UserIncomeTable() {
  const { t } = useTranslation();
  const { user, role } = useAuth();
  const [isOpen, setIsOpen] = useState(false);

  const { data: transfers, isLoading } = useQuery({
    queryKey: ['user-team-transfers', user?.id],
    queryFn: async () => {
      if (!user) return [];

      // Get transfers from team_transfers (global, not per-workshop)
      const { data: transfersData, error } = await supabase
        .from('team_transfers')
        .select('*')
        .eq('user_id', user.id)
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
        admin_name: profileMap.get(t.created_by) || 'Admin'
      })) || [];
    },
    enabled: !!user && role !== 'admin',
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

  const totalReceived = transfers.reduce((sum, t) => sum + Number(t.amount), 0);

  return (
    <Card className="shadow-card border-success/20">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CardHeader className="pb-2 px-3 md:px-6 pt-3 md:pt-6">
          <CollapsibleTrigger asChild>
            <div className="flex items-center justify-between cursor-pointer">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <ArrowDownCircle className="w-4 h-4 md:w-5 md:h-5 text-success flex-shrink-0" />
                <CardTitle className="text-sm md:text-base text-success truncate">
                  {t('userBalance.receivedFromAdmin')}
                </CardTitle>
                <span className="text-xs md:text-sm font-bold font-mono text-success flex-shrink-0">
                  +{totalReceived.toLocaleString('fr-FR')}
                </span>
              </div>
              <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </div>
          </CollapsibleTrigger>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="px-3 md:px-6 pb-3 md:pb-6">
            {/* Mobile Card View */}
            <div className="md:hidden space-y-2">
              {transfers.map((transfer) => (
                <div key={transfer.id} className="flex items-center justify-between p-3 rounded-lg border bg-success/5 border-success/20">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{transfer.admin_name}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{transfer.description || '-'}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {format(new Date(transfer.transfer_date), 'MMM d, yyyy')}
                    </p>
                  </div>
                  <span className="font-mono font-bold text-sm text-success flex-shrink-0">
                    +{Number(transfer.amount).toLocaleString('fr-FR')}
                  </span>
                </div>
              ))}
            </div>

            {/* Desktop Table View */}
            <div className="hidden md:block rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-success/5">
                    <TableHead>{t('common.date')}</TableHead>
                    <TableHead>From</TableHead>
                    <TableHead>{t('common.description')}</TableHead>
                    <TableHead className="text-right">{t('common.amount')}</TableHead>
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
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
