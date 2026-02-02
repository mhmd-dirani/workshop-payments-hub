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
import { format } from 'date-fns';
import { XCircle } from 'lucide-react';

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

      // Fetch profiles for creator names
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('user_id, full_name');

      const profileMap = new Map(profilesData?.map(p => [p.user_id, p.full_name]) || []);

      return paymentsData.map(payment => ({
        ...payment,
        creator_name: profileMap.get(payment.created_by) || 'Unknown'
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
                  <TableHead>Status</TableHead>
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
                      <Badge className="bg-destructive/10 text-destructive border-destructive/20 gap-1">
                        <XCircle className="w-3 h-3" />
                        Rejected
                      </Badge>
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
