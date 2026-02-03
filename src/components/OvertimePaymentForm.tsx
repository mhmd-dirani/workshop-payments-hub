import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { Loader2, Clock, Building2, Users, Sparkles, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Worker {
  id: string;
  name: string;
  hourly_rate: number;
}

export default function OvertimePaymentForm() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [selectedWorkshop, setSelectedWorkshop] = useState('');
  const [selectedWorkers, setSelectedWorkers] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState('');
  const [totalAmount, setTotalAmount] = useState('');

  // Fetch active workers
  const { data: workers = [], isLoading: loadingWorkers } = useQuery({
    queryKey: ['workers-active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workers')
        .select('id, name, hourly_rate')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data as Worker[];
    },
  });

  // Fetch workshops
  const { data: workshops = [], isLoading: loadingWorkshops } = useQuery({
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

  const toggleWorker = (workerId: string) => {
    setSelectedWorkers(prev => {
      const next = new Set(prev);
      if (next.has(workerId)) {
        next.delete(workerId);
      } else {
        next.add(workerId);
      }
      return next;
    });
  };

  const selectAllWorkers = () => {
    if (selectedWorkers.size === workers.length) {
      setSelectedWorkers(new Set());
    } else {
      setSelectedWorkers(new Set(workers.map(w => w.id)));
    }
  };

  const createOvertimePayment = useMutation({
    mutationFn: async () => {
      if (!selectedWorkshop || selectedWorkers.size === 0 || !reason || !totalAmount) {
        throw new Error(t('errors.fillAllFields'));
      }

      const amount = Number(totalAmount);
      if (isNaN(amount) || amount <= 0) {
        throw new Error(t('errors.invalidAmount'));
      }

      const selectedWorkersList = workers.filter(w => selectedWorkers.has(w.id));
      const workerNames = selectedWorkersList.map(w => w.name).join(', ');
      const amountPerWorker = amount / selectedWorkersList.length;
      const paymentDate = format(new Date(), 'yyyy-MM-dd'); // Payment is made today

      // Create the payment record (approved immediately since it's paid instantly)
      const { data: payment, error: paymentError } = await supabase
        .from('payments')
        .insert([{
          workshop_id: selectedWorkshop,
          paid_to: 'Travailleur Overtime',
          reason: `${workerNames} - ${reason}`,
          amount: amount,
          payment_date: paymentDate,
          status: 'approved',
          approved_by: user?.id,
          approved_at: new Date().toISOString(),
          created_by: user?.id,
        }])
        .select('id')
        .single();

      if (paymentError) throw paymentError;

      // Create attendance records for each worker
      // Each worker gets the TOTAL amount recorded (shared payment, not split)
      // Use hourly_rate=0, hours_worked=0, and put actual amount in extra_amount
      const attendanceRecords = selectedWorkersList.map(worker => {
        const otherWorkers = selectedWorkersList.filter(w => w.id !== worker.id).map(w => w.name);
        const othersText = otherWorkers.length > 0 
          ? `${t('attendance.overtimeWith')} ${otherWorkers.join(', ')}` 
          : t('attendance.overtime');
        
        return {
          worker_id: worker.id,
          workshop_id: selectedWorkshop,
          work_date: selectedDate,
          hours_worked: 1, // Required for constraint
          hourly_rate: 0, // Set to 0 so daily_salary = extra_amount only
          has_extra: true,
          extra_amount: amount, // Total shared amount
          description: othersText, // Simplified: "Overtime with Name1, Name2"
          is_paid: true,
          payment_id: payment.id,
          created_by: user?.id,
        };
      });

      const { error: attendanceError } = await supabase
        .from('attendance')
        .insert(attendanceRecords);

      if (attendanceError) throw attendanceError;

      return { payment, workers: selectedWorkersList };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendance'] });
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['workers'] });
      
      // Reset form
      setSelectedWorkers(new Set());
      setReason('');
      setTotalAmount('');
      
      toast({
        title: t('common.success'),
        description: t('attendance.overtimePaymentCreated'),
      });
    },
    onError: (error: Error) => {
      toast({
        title: t('errors.error'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const isLoading = loadingWorkers || loadingWorkshops;
  const amountNum = Number(totalAmount) || 0;

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-card">
      <CardHeader className="pb-3 px-3 md:px-6 pt-3 md:pt-6">
        <CardTitle className="text-base md:text-lg flex items-center gap-2">
          <Clock className="w-4 h-4 md:w-5 md:h-5" />
          {t('attendance.overtimePayment')}
        </CardTitle>
        <CardDescription className="text-xs md:text-sm">
          {t('attendance.overtimePaymentDesc')}
        </CardDescription>
      </CardHeader>

      <CardContent className="px-3 md:px-6 pb-3 md:pb-6 space-y-4">
        {/* Date and Workshop Selection */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              {t('attendance.overtimeDate')}
            </Label>
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="h-9 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5" />
              {t('common.workshop')}
            </Label>
            <Select value={selectedWorkshop} onValueChange={setSelectedWorkshop}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder={t('workshopSelector.selectWorkshop')} />
              </SelectTrigger>
              <SelectContent>
                {workshops.map((w) => (
                  <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Reason */}
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">
            {t('attendance.overtimeReason')}
          </Label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t('attendance.overtimeReasonPlaceholder')}
            className="min-h-[60px] text-sm"
          />
        </div>

        {/* Total Amount */}
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">
            {t('attendance.totalOvertimeAmount')}
          </Label>
          <Input
            type="number"
            value={totalAmount}
            onChange={(e) => setTotalAmount(e.target.value)}
            placeholder="0"
            className="h-9 text-sm font-mono"
          />
          {selectedWorkers.size > 0 && amountNum > 0 && (
            <p className="text-xs text-muted-foreground">
              {t('attendance.sharedAmongWorkers', { count: selectedWorkers.size })}
            </p>
          )}
        </div>

        {/* Workers Selection */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-medium flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" />
              {t('attendance.selectWorkers')}
            </Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={selectAllWorkers}
              className="h-7 text-xs"
            >
              {selectedWorkers.size === workers.length ? t('common.deselectAll') : t('common.selectAll')}
            </Button>
          </div>

          {workers.length === 0 ? (
            <p className="text-center text-muted-foreground py-4 text-sm">
              {t('workers.noWorkers')}
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2 max-h-[200px] overflow-y-auto">
              {workers.map((worker) => {
                const isSelected = selectedWorkers.has(worker.id);
                return (
                  <div
                    key={worker.id}
                    className={cn(
                      "flex items-center gap-2 p-2 border rounded-md cursor-pointer transition-colors",
                      isSelected && "border-primary bg-primary/5"
                    )}
                    onClick={() => toggleWorker(worker.id)}
                  >
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleWorker(worker.id)}
                    />
                    <span className="text-sm truncate">{worker.name}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Summary */}
        {selectedWorkers.size > 0 && amountNum > 0 && reason && selectedWorkshop && (
          <div className="p-3 bg-success/10 border border-success/20 rounded-lg space-y-1">
            <p className="text-xs font-medium text-success">
              {t('attendance.overtimeSummary')}
            </p>
            <p className="text-xs text-muted-foreground">
              {amountNum.toLocaleString('fr-FR')} CFA {t('attendance.sharedPayment')} ({selectedWorkers.size} {t('attendance.workersSelected')})
            </p>
          </div>
        )}

        {/* Submit Button */}
        <Button
          onClick={() => createOvertimePayment.mutate()}
          disabled={
            createOvertimePayment.isPending ||
            !selectedWorkshop ||
            selectedWorkers.size === 0 ||
            !reason ||
            !totalAmount ||
            amountNum <= 0
          }
          className="w-full gap-2"
        >
          {createOvertimePayment.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Check className="w-4 h-4" />
          )}
          {t('attendance.createOvertimePayment')}
        </Button>
      </CardContent>
    </Card>
  );
}
