import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { 
  ArrowLeft, 
  DollarSign, 
  Wallet, 
  Calendar, 
  Loader2, 
  Building2, 
  History,
  CheckCircle2
} from 'lucide-react';

interface Worker {
  id: string;
  name: string;
  hourly_rate: number;
  is_active: boolean;
}

interface WorkerDetailsProps {
  worker: Worker;
  onBack: () => void;
}

export default function WorkerDetails({ worker, onBack }: WorkerDetailsProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isPayOpen, setIsPayOpen] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [selectedWorkshop, setSelectedWorkshop] = useState('');

  // Fetch unpaid attendance for this worker
  const { data: unpaidAttendance = [], isLoading: loadingUnpaid } = useQuery({
    queryKey: ['worker-unpaid-attendance', worker.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('attendance')
        .select(`
          *,
          workshops:workshop_id(id, name)
        `)
        .eq('worker_id', worker.id)
        .eq('is_paid', false)
        .order('work_date', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch paid/archived attendance
  const { data: paidAttendance = [], isLoading: loadingPaid } = useQuery({
    queryKey: ['worker-paid-attendance', worker.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('attendance')
        .select(`
          *,
          workshops:workshop_id(id, name),
          payments:payment_id(id, status, payment_date)
        `)
        .eq('worker_id', worker.id)
        .eq('is_paid', true)
        .order('work_date', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch workshops
  const { data: workshops = [] } = useQuery({
    queryKey: ['workshops'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workshops')
        .select('id, name')
        .order('name');
      if (error) throw error;
      return data || [];
    },
  });

  const totalOwed = unpaidAttendance.reduce((sum, a) => sum + Number(a.daily_salary), 0);
  const totalDays = unpaidAttendance.length;

  // Group unpaid by workshop
  const unpaidByWorkshop = unpaidAttendance.reduce((acc, entry) => {
    const workshopId = entry.workshop_id;
    const workshopName = (entry.workshops as any)?.name || 'Unknown';
    if (!acc[workshopId]) {
      acc[workshopId] = { name: workshopName, total: 0, entries: [] };
    }
    acc[workshopId].total += Number(entry.daily_salary);
    acc[workshopId].entries.push(entry);
    return acc;
  }, {} as Record<string, { name: string; total: number; entries: any[] }>);

  // Create payment mutation
  const createPayment = useMutation({
    mutationFn: async ({ workshopId, amount }: { workshopId: string; amount: number }) => {
      // Create the payment request
      const { data: payment, error: paymentError } = await supabase
        .from('payments')
        .insert([{
          workshop_id: workshopId,
          paid_to: worker.name,
          reason: t('workers.salary'),
          amount,
          payment_date: format(new Date(), 'yyyy-MM-dd'),
          created_by: user?.id,
          status: 'pending',
        }])
        .select()
        .single();

      if (paymentError) throw paymentError;

      // Mark attendance entries as paid and link to payment
      const workshopEntryIds = unpaidAttendance
        .filter(a => a.workshop_id === workshopId)
        .map(a => a.id);

      if (workshopEntryIds.length > 0) {
        const { error: updateError } = await supabase
          .from('attendance')
          .update({ is_paid: true, payment_id: payment.id })
          .in('id', workshopEntryIds);

        if (updateError) throw updateError;
      }

      return payment;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['worker-unpaid-attendance'] });
      queryClient.invalidateQueries({ queryKey: ['worker-paid-attendance'] });
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      setIsPayOpen(false);
      setPayAmount('');
      setSelectedWorkshop('');
      toast({ 
        title: t('workers.paymentCreated'), 
        description: t('workers.paymentCreatedDesc') 
      });
    },
    onError: (error: Error) => {
      toast({ title: t('errors.error'), description: error.message, variant: 'destructive' });
    },
  });

  const handlePay = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedWorkshop && payAmount) {
      createPayment.mutate({ workshopId: selectedWorkshop, amount: parseFloat(payAmount) });
    }
  };

  const openPayDialog = (workshopId?: string) => {
    if (workshopId) {
      setSelectedWorkshop(workshopId);
      const workshopTotal = unpaidByWorkshop[workshopId]?.total || 0;
      setPayAmount(workshopTotal.toString());
    } else {
      setSelectedWorkshop('');
      setPayAmount('');
    }
    setIsPayOpen(true);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack} className="h-8 w-8">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-lg md:text-2xl font-bold">{worker.name}</h1>
          <p className="text-xs md:text-sm text-muted-foreground font-mono">
            {worker.hourly_rate.toLocaleString('fr-FR')} CFA
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="shadow-card">
          <CardContent className="p-3 md:p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Calendar className="w-4 h-4" />
              <span className="text-xs">{t('workers.workDays')}</span>
            </div>
            <p className="text-xl md:text-2xl font-bold font-mono mt-1">{totalDays}</p>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardContent className="p-3 md:p-4">
            <div className="flex items-center gap-2 text-warning">
              <Wallet className="w-4 h-4" />
              <span className="text-xs">{t('workers.totalOwed')}</span>
            </div>
            <p className="text-xl md:text-2xl font-bold font-mono text-warning mt-1">
              {totalOwed.toLocaleString('fr-FR')} CFA
            </p>
          </CardContent>
        </Card>

      </div>

      {/* Pay Button - Only show if there's money owed */}
      {totalOwed > 0 && (
        <Button 
          onClick={() => openPayDialog()} 
          className="w-full bg-success text-success-foreground hover:bg-success/90 gap-2"
        >
          <Wallet className="w-4 h-4" />
          {t('workers.payWorker')}
        </Button>
      )}

      {/* Tabs for unpaid/history */}
      <Tabs defaultValue="unpaid" className="space-y-4">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="unpaid" className="gap-2">
            <DollarSign className="w-4 h-4" />
            {t('workers.unpaid')}
            {unpaidAttendance.length > 0 && (
              <Badge variant="secondary" className="ml-1">{unpaidAttendance.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-2">
            <History className="w-4 h-4" />
            {t('workers.paymentHistory')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="unpaid">
          {loadingUnpaid ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : Object.keys(unpaidByWorkshop).length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                <CheckCircle2 className="w-12 h-12 mx-auto mb-2 text-success" />
                <p>{t('workers.noPendingPayments')}</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {Object.entries(unpaidByWorkshop).map(([workshopId, { name, total, entries }]) => (
                <Card key={workshopId} className="shadow-card">
                  <CardHeader className="pb-2 px-3 pt-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-muted-foreground" />
                        <CardTitle className="text-sm">{name}</CardTitle>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => openPayDialog(workshopId)}
                        className="bg-success text-success-foreground hover:bg-success/90 h-7 text-xs gap-1"
                      >
                        <Wallet className="w-3 h-3" />
                        {t('workers.pay')} {total.toLocaleString('fr-FR')}
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="px-3 pb-3">
                    <div className="space-y-1">
                      {entries.map((entry) => (
                        <div key={entry.id} className="flex items-center justify-between text-sm py-1 border-b last:border-0">
                          <span className="font-mono text-xs">
                            {format(new Date(entry.work_date), 'EEE, dd/MM')}
                          </span>
                          <span className="font-mono font-medium">
                            {Number(entry.daily_salary).toLocaleString('fr-FR')} CFA
                          </span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="history">
          {loadingPaid ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : paidAttendance.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                <p>{t('workers.noPaymentHistory')}</p>
              </CardContent>
            </Card>
          ) : (
            <Card className="shadow-card">
              <CardContent className="p-0">
                <div className="md:hidden">
                  {paidAttendance.map((entry) => (
                    <div key={entry.id} className="p-3 border-b last:border-0">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-mono text-xs">
                            {format(new Date(entry.work_date), 'EEE, dd/MM/yyyy')}
                          </p>
                          <Badge variant="outline" className="text-[10px] mt-1">
                            {(entry.workshops as any)?.name}
                          </Badge>
                        </div>
                        <div className="text-right">
                          <p className="font-mono font-medium text-muted-foreground">
                            {Number(entry.daily_salary).toLocaleString('fr-FR')} CFA
                          </p>
                          <Badge 
                            variant={(entry.payments as any)?.status === 'approved' ? 'default' : 'secondary'}
                            className="text-[10px] mt-1"
                          >
                            {(entry.payments as any)?.status || 'paid'}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('common.date')}</TableHead>
                        <TableHead>{t('common.workshop')}</TableHead>
                        <TableHead>{t('attendance.dailySalary')}</TableHead>
                        <TableHead>{t('common.status')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paidAttendance.map((entry) => (
                        <TableRow key={entry.id}>
                          <TableCell className="font-mono">
                            {format(new Date(entry.work_date), 'MMM d, yyyy')}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{(entry.workshops as any)?.name}</Badge>
                          </TableCell>
                          <TableCell className="font-mono">
                            {Number(entry.daily_salary).toLocaleString('fr-FR')} CFA
                          </TableCell>
                          <TableCell>
                            <Badge 
                              variant={(entry.payments as any)?.status === 'approved' ? 'default' : 'secondary'}
                            >
                              {(entry.payments as any)?.status || 'paid'}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Pay Dialog */}
      <Dialog open={isPayOpen} onOpenChange={setIsPayOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('workers.payWorker')}</DialogTitle>
            <DialogDescription>
              {t('workers.payDescription', { name: worker.name })}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handlePay} className="space-y-4">
            <div className="space-y-2">
              <Label>{t('common.workshop')}</Label>
              <Select value={selectedWorkshop} onValueChange={(v) => {
                setSelectedWorkshop(v);
                const workshopTotal = unpaidByWorkshop[v]?.total || 0;
                setPayAmount(workshopTotal.toString());
              }}>
                <SelectTrigger>
                  <SelectValue placeholder={t('workshops.selectWorkshop')} />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(unpaidByWorkshop).map(([id, { name, total }]) => (
                    <SelectItem key={id} value={id}>
                      {name} ({total.toLocaleString('fr-FR')} CFA)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t('common.amount')} (CFA)</Label>
              <Input
                type="number"
                min="1"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                placeholder="0"
              />
              {selectedWorkshop && (
                <p className="text-xs text-muted-foreground">
                  {t('workers.maxAmount')}: {(unpaidByWorkshop[selectedWorkshop]?.total || 0).toLocaleString('fr-FR')} CFA
                </p>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsPayOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button
                type="submit"
                disabled={!selectedWorkshop || !payAmount || createPayment.isPending}
                className="bg-success text-success-foreground hover:bg-success/90"
              >
                {createPayment.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {t('workers.createPayment')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
