import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { format } from 'date-fns';
import { XCircle, MessageSquare } from 'lucide-react';

interface RejectedPaymentsProps {
  workshopId: string;
}

export default function RejectedPayments({ workshopId }: RejectedPaymentsProps) {
  const { user, role } = useAuth();

  const { data: rejectedPayments, isLoading } = useQuery({
    queryKey: ['rejected-payments', workshopId],
    queryFn: async () => {
      const { data: paymentsData, error: paymentsError } = await supabase
        .from('payments')
        .select('*')
        .eq('workshop_id', workshopId)
        .eq('status', 'rejected')
        .order('payment_date', { ascending: false });

      if (paymentsError) throw paymentsError;

      // Fetch profiles for creator names and rejector names
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('user_id, full_name');

      const profileMap = new Map(profilesData?.map(p => [p.user_id, p.full_name]) || []);

      return paymentsData.map(payment => ({
        ...payment,
        creator_name: profileMap.get(payment.created_by) || 'Unknown',
        rejector_name: payment.approved_by ? profileMap.get(payment.approved_by) || 'Unknown' : null
      }));
    },
    enabled: !!workshopId,
  });

  // Filter based on role - users only see their own rejected payments
  const filteredPayments = rejectedPayments?.filter(p => 
    role === 'admin' || p.created_by === user?.id
  ) || [];

  if (isLoading) {
    return <Skeleton className="h-16 w-full" />;
  }

  if (filteredPayments.length === 0) {
    return null; // Don't show section if no rejected payments
  }

  return (
    <Accordion type="single" collapsible className="w-full">
      <AccordionItem value="rejected" className="border rounded-lg bg-card shadow-card">
        <AccordionTrigger className="px-6 hover:no-underline">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-destructive/10">
              <XCircle className="w-5 h-5 text-destructive" />
            </div>
            <div className="text-left">
              <p className="font-semibold">Rejected Payments</p>
              <p className="text-sm text-muted-foreground font-normal">
                {filteredPayments.length} rejected payment{filteredPayments.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
        </AccordionTrigger>
        <AccordionContent className="px-0 pb-0">
          <div className="border-t">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>Date</TableHead>
                  <TableHead>Paid To</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Rejected By</TableHead>
                  <TableHead>Added By</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPayments.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell className="font-mono text-sm">
                      {format(new Date(payment.payment_date), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell className="font-medium">{payment.paid_to}</TableCell>
                    <TableCell className="max-w-xs truncate">{payment.reason}</TableCell>
                    <TableCell className="text-right font-mono font-medium">
                      {Number(payment.amount).toLocaleString('fr-FR')} CFA
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{payment.rejector_name || 'Unknown'}</span>
                        {payment.rejection_reason && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <MessageSquare className="w-4 h-4 text-muted-foreground cursor-help" />
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs">
                                <p className="font-medium text-xs mb-1">Rejection Reason:</p>
                                <p className="text-xs">{payment.rejection_reason}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {payment.creator_name}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
