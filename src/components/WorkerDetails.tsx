import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { getEffectivePay, buildWorkerPaymentReason } from '@/lib/worker-payment-utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
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
import { format, startOfWeek, endOfWeek, subWeeks } from 'date-fns';
import { 
  ArrowLeft, 
  DollarSign, 
  Wallet, 
  Calendar, 
  Loader2, 
  Building2, 
  History,
  CheckCircle2,
  Edit,
  Trash2,
  Sparkles,
  Clock,
  MinusCircle,
  X,
  ArrowUpCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Worker {
  id: string;
  name: string;
  hourly_rate: number;
  is_active: boolean;
  category?: string;
}

interface WorkerDetailsProps {
  worker: Worker;
  onBack: () => void;
}

interface EditingAttendance {
  id: string;
  work_date: string;
  hourly_rate: number;
  workshop_id: string;
}

// Helper function to get week range (Sunday to Saturday) for a given date
function getWeekRange(date: Date): { weekLabel: string; sunday: Date } {
  const sunday = startOfWeek(date, { weekStartsOn: 0 });
  const saturday = new Date(sunday);
  saturday.setDate(sunday.getDate() + 6);
  const weekLabel = `${format(sunday, 'dd/MM')} - ${format(saturday, 'dd/MM')}`;
  return { weekLabel, sunday };
}

// Group attendance entries by the week they were worked
function groupByWorkWeek(entries: any[]): Record<string, any[]> {
  return entries.reduce((acc, entry) => {
    const workDate = new Date(entry.work_date);
    const { weekLabel } = getWeekRange(workDate);
    if (!acc[weekLabel]) {
      acc[weekLabel] = [];
    }
    acc[weekLabel].push(entry);
    return acc;
  }, {} as Record<string, any[]>);
}

export default function WorkerDetails({ worker, onBack }: WorkerDetailsProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Pay dialog states
  const [isPayChoiceOpen, setIsPayChoiceOpen] = useState(false);
  const [payMode, setPayMode] = useState<'full' | 'partial' | 'advance' | 'bonus' | 'overtime' | null>(null);
  const [partialAmount, setPartialAmount] = useState('');
  const [advanceAmount, setAdvanceAmount] = useState('');
  const [partialWorkshopId, setPartialWorkshopId] = useState<string>('');
  const [advanceWorkshopId, setAdvanceWorkshopId] = useState<string>('');
  const [bonusWorkshopId, setBonusWorkshopId] = useState<string>('');
  const [overtimeWorkshopId, setOvertimeWorkshopId] = useState<string>('');
  const [editingAttendance, setEditingAttendance] = useState<EditingAttendance | null>(null);
  const [attendanceToDelete, setAttendanceToDelete] = useState<string | null>(null);
  const [paidEntryToDelete, setPaidEntryToDelete] = useState<any>(null);
  
  // History filters - default to 'all' so partial payments always show
  const [historyTimeFilter, setHistoryTimeFilter] = useState('all');
  const [historyWorkshopFilter, setHistoryWorkshopFilter] = useState('all');
  const [historySelectedDate, setHistorySelectedDate] = useState<Date | undefined>(undefined);

  const { data: unpaidAttendance = [], isLoading: loadingUnpaid } = useQuery({
    queryKey: ['worker-unpaid-attendance', worker.id, worker.name],
    queryFn: async () => {
      const { data: directAttendance, error: directError } = await supabase
        .from('attendance')
        .select(`*, workshops:workshop_id(id, name)`)
        .eq('worker_id', worker.id)
        .eq('is_paid', false)
        .order('work_date', { ascending: false });
      if (directError) throw directError;

      const { data: overtimeAttendance, error: overtimeError } = await supabase
        .from('attendance')
        .select(`*, workshops:workshop_id(id, name)`)
        .neq('worker_id', worker.id)
        .eq('is_paid', false)
        .ilike('description', `%${worker.name}%`)
        .order('work_date', { ascending: false });
      if (overtimeError) throw overtimeError;

      return [...(directAttendance || []), ...(overtimeAttendance || [])];
    },
  });

  // Fetch unpaid adjustments for this worker
  const { data: unpaidAdjustments = [] } = useQuery({
    queryKey: ['worker-unpaid-adjustments', worker.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('worker_adjustments')
        .select('*, workshops:workshop_id(id, name)')
        .eq('worker_id', worker.id)
        .eq('is_paid', false)
        .order('work_date', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch paid/archived attendance (direct + overtime where name appears in description)
  const { data: paidAttendance = [], isLoading: loadingPaid } = useQuery({
    queryKey: ['worker-paid-attendance', worker.id, worker.name],
    queryFn: async () => {
      const { data: directAttendance, error: directError } = await supabase
        .from('attendance')
        .select(`*, workshops:workshop_id(id, name), payments:payment_id(id, status, payment_date, reason)`)
        .eq('worker_id', worker.id)
        .eq('is_paid', true)
        .order('work_date', { ascending: false });
      if (directError) throw directError;

      const { data: overtimeAttendance, error: overtimeError } = await supabase
        .from('attendance')
        .select(`*, workshops:workshop_id(id, name), payments:payment_id(id, status, payment_date, reason)`)
        .neq('worker_id', worker.id)
        .eq('is_paid', true)
        .ilike('description', `%${worker.name}%`)
        .order('work_date', { ascending: false });
      if (overtimeError) throw overtimeError;

      return [...(directAttendance || []), ...(overtimeAttendance || [])];
    },
  });

  // Fetch paid adjustments for this worker
  const { data: paidAdjustments = [] } = useQuery({
    queryKey: ['worker-paid-adjustments', worker.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('worker_adjustments')
        .select('*, workshops:workshop_id(id, name)')
        .eq('worker_id', worker.id)
        .eq('is_paid', true)
        .order('work_date', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  // Group paid adjustments by payment_id for quick lookup
  const paidAdjByPaymentId = useMemo(() => {
    const map: Record<string, typeof paidAdjustments> = {};
    paidAdjustments.forEach((adj) => {
      const pid = adj.payment_id;
      if (pid) {
        if (!map[pid]) map[pid] = [];
        map[pid].push(adj);
      }
    });
    return map;
  }, [paidAdjustments]);

  // Shared date/workshop filter logic
  const applyHistoryFilters = <T extends { work_date: string; workshop_id: string }>(items: T[]): T[] => {
    let filtered = items;
    if (historyWorkshopFilter !== 'all') {
      filtered = filtered.filter(e => e.workshop_id === historyWorkshopFilter);
    }
    if (historyTimeFilter === 'date' && historySelectedDate) {
      const dateStr = format(historySelectedDate, 'yyyy-MM-dd');
      filtered = filtered.filter(e => e.work_date === dateStr);
    } else if (historyTimeFilter !== 'all') {
      const weekOffset = parseInt(historyTimeFilter);
      if (!isNaN(weekOffset)) {
        const refDate = subWeeks(new Date(), weekOffset);
        const wStart = startOfWeek(refDate, { weekStartsOn: 0 });
        const wEnd = endOfWeek(refDate, { weekStartsOn: 0 });
        const startStr = format(wStart, 'yyyy-MM-dd');
        const endStr = format(wEnd, 'yyyy-MM-dd');
        filtered = filtered.filter(e => e.work_date >= startStr && e.work_date <= endStr);
      }
    }
    return filtered;
  };

  const filteredPaidAttendance = useMemo(() => applyHistoryFilters(paidAttendance), [paidAttendance, historyTimeFilter, historyWorkshopFilter, historySelectedDate]);
  const filteredPaidAdjustments = useMemo(() => applyHistoryFilters(paidAdjustments), [paidAdjustments, historyTimeFilter, historyWorkshopFilter, historySelectedDate]);

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

  // Calculate total owed (attendance + adjustments)
  const attendanceTotal = unpaidAttendance.reduce((sum, a) => sum + getEffectivePay(a), 0);
  const ADVANCE_CREDIT_TAG = '[ADVANCE_CREDIT]';
  const bonusTotal = unpaidAdjustments
    .filter((a) => a.adjustment_type === 'bonus' || a.adjustment_type === 'taxi')
    .reduce((sum, a) => sum + Number(a.amount), 0);
  const discountTotal = unpaidAdjustments
    .filter((a) => a.adjustment_type === 'discount')
    .reduce((sum, a) => sum + Number(a.amount), 0);
  // Non-credit discounts only (exclude advance/payment credits for bonus display)
  const realDiscountTotal = unpaidAdjustments
    .filter((a) => a.adjustment_type === 'discount' && !a.reason?.includes('[PAYMENT_CREDIT]') && !a.reason?.includes('[ADVANCE_CREDIT]'))
    .reduce((sum, a) => sum + Number(a.amount), 0);
  const totalOwed = attendanceTotal + bonusTotal - discountTotal;
  // adjustmentNet should only reflect real bonuses/discounts, not payment credits
  const adjustmentNet = bonusTotal - realDiscountTotal;

  // Unpaid overtime entries (description-based, not direct worker attendance)
  const unpaidOvertimeEntries = unpaidAttendance.filter(
    (e) => e.worker_id !== worker.id || (e.description?.includes('Overtime') && Number(e.hourly_rate) === 0)
  );
  const overtimeTotal = unpaidOvertimeEntries.reduce((sum, a) => sum + getEffectivePay(a), 0);

  // Group unpaid adjustments by workshop for bonus payment (exclude payment/advance credits)
  const unpaidAdjByWorkshop = useMemo(() => {
    const map: Record<string, { name: string; bonuses: number; discounts: number; items: typeof unpaidAdjustments }> = {};
    unpaidAdjustments.forEach((adj) => {
      // Skip payment/advance credit discounts - they belong to salary, not bonus
      const isCredit = adj.reason?.includes('[PAYMENT_CREDIT]') || adj.reason?.includes('[ADVANCE_CREDIT]');
      if (isCredit) return;
      const wid = adj.workshop_id;
      const wname = (adj.workshops as any)?.name || 'Unknown';
      if (!map[wid]) map[wid] = { name: wname, bonuses: 0, discounts: 0, items: [] };
      if (adj.adjustment_type === 'bonus' || adj.adjustment_type === 'taxi') map[wid].bonuses += Number(adj.amount);
      else map[wid].discounts += Number(adj.amount);
      map[wid].items.push(adj);
    });
    return map;
  }, [unpaidAdjustments]);

  // Group unpaid overtime by workshop
  const unpaidOvertimeByWorkshop = useMemo(() => {
    const map: Record<string, { name: string; total: number; entries: any[] }> = {};
    unpaidOvertimeEntries.forEach((entry) => {
      const wid = entry.workshop_id;
      const wname = (entry.workshops as any)?.name || 'Unknown';
      if (!map[wid]) map[wid] = { name: wname, total: 0, entries: [] };
      map[wid].total += getEffectivePay(entry);
      map[wid].entries.push(entry);
    });
    return map;
  }, [unpaidOvertimeEntries]);

  // "Work Days" should reflect worked days, not remaining unpaid rows.
  // Count unique work dates across paid + unpaid attendance that are visible in this view.
  const totalDays = useMemo(() => {
    const all = [...unpaidAttendance, ...paidAttendance];
    const dates = new Set<string>();
    all.forEach((e: any) => {
      if (e?.work_date) dates.add(String(e.work_date));
    });
    return dates.size;
  }, [unpaidAttendance, paidAttendance]);

  // Group unpaid by workshop for display (attendance + adjustments)
  const unpaidByWorkshop = unpaidAttendance.reduce((acc, entry) => {
    const workshopId = entry.workshop_id;
    const workshopName = (entry.workshops as any)?.name || 'Unknown';
    if (!acc[workshopId]) {
      acc[workshopId] = { name: workshopName, total: 0, entries: [] };
    }
    acc[workshopId].total += getEffectivePay(entry);
    acc[workshopId].entries.push(entry);
    return acc;
  }, {} as Record<string, { name: string; total: number; entries: any[] }>);
  
  // Add adjustments to workshop totals
  unpaidAdjustments.forEach((adj) => {
    const workshopId = adj.workshop_id;
    const workshopName = (adj.workshops as any)?.name || 'Unknown';
    if (!unpaidByWorkshop[workshopId]) {
      unpaidByWorkshop[workshopId] = { name: workshopName, total: 0, entries: [] };
    }
    if (adj.adjustment_type === 'bonus' || adj.adjustment_type === 'taxi') {
      unpaidByWorkshop[workshopId].total += Number(adj.amount);
    } else {
      unpaidByWorkshop[workshopId].total -= Number(adj.amount);
    }
  });

  // Update attendance mutation
  const updateAttendance = useMutation({
    mutationFn: async ({ id, work_date, hourly_rate, workshop_id }: EditingAttendance) => {
      const { error } = await supabase
        .from('attendance')
        .update({ work_date, hourly_rate, workshop_id })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['worker-unpaid-attendance'] });
      queryClient.invalidateQueries({ queryKey: ['attendance'] });
      setEditingAttendance(null);
      toast({ title: t('attendance.updated'), description: t('attendance.updatedDesc') });
    },
    onError: (error: Error) => {
      toast({ title: t('errors.error'), description: error.message, variant: 'destructive' });
    },
  });

  // Delete attendance mutation (for unpaid entries only)
  const deleteAttendance = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('attendance').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['worker-unpaid-attendance'] });
      queryClient.invalidateQueries({ queryKey: ['attendance'] });
      queryClient.invalidateQueries({ queryKey: ['all-unpaid-attendance'] });
      toast({ title: t('attendance.deleted'), description: t('attendance.deletedDesc') });
    },
    onError: (error: Error) => {
      toast({ title: t('errors.error'), description: error.message, variant: 'destructive' });
    },
  });

  // Delete paid attendance mutation - also updates/deletes the parent payment
  const deletePaidAttendance = useMutation({
    mutationFn: async (entry: any) => {
      const paymentId = entry.payment_id;
      const entryAmount = Number(entry.daily_salary);
      
      if (paymentId) {
        const { data: payment } = await supabase
          .from('payments')
          .select('*')
          .eq('id', paymentId)
          .single();
        
        if (payment) {
          const newAmount = Number(payment.amount) - entryAmount;
          if (newAmount <= 0) {
            await supabase.from('payments').delete().eq('id', paymentId);
          } else {
            await supabase
              .from('payments')
              .update({ amount: newAmount })
              .eq('id', paymentId);
          }
        }
      }
      
      const { error } = await supabase.from('attendance').delete().eq('id', entry.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['worker-paid-attendance'] });
      queryClient.invalidateQueries({ queryKey: ['attendance'] });
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      toast({ title: t('attendance.deleted'), description: t('attendance.deletedDesc') });
    },
    onError: (error: Error) => {
      toast({ title: t('errors.error'), description: error.message, variant: 'destructive' });
    },
  });

  // Create FULL payment mutation - pays ALL unpaid work across ALL workshops
  const createPayment = useMutation({
    mutationFn: async () => {
      const results: any[] = [];
      const workerNames: Record<string, string> = { [worker.id]: worker.name };
      
      const adjByWorkshop: Record<string, any[]> = {};
      unpaidAdjustments.forEach((adj) => {
        if (!adjByWorkshop[adj.workshop_id]) adjByWorkshop[adj.workshop_id] = [];
        adjByWorkshop[adj.workshop_id].push(adj);
      });

      // Group all attendance by workshop (not by week) - one payment per workshop
      const byWorkshop = unpaidAttendance.reduce((acc, entry) => {
        const workshopId = entry.workshop_id;
        if (!acc[workshopId]) acc[workshopId] = { entries: [], total: 0 };
        acc[workshopId].entries.push(entry);
        acc[workshopId].total += getEffectivePay(entry);
        return acc;
      }, {} as Record<string, { entries: any[]; total: number }>);
      
      for (const [workshopId, workshopData] of Object.entries(byWorkshop) as [string, { entries: any[]; total: number }][]) {
        const { entries, total } = workshopData;
        
        const workshopAdj = adjByWorkshop[workshopId] || [];
        const bonusAdj = workshopAdj.filter(a => a.adjustment_type === 'bonus' || a.adjustment_type === 'taxi');
        const discountAdj = workshopAdj.filter(a => a.adjustment_type === 'discount');
        const adjBonuses = bonusAdj.reduce((s, a) => s + Number(a.amount), 0);
        const adjDiscounts = discountAdj.reduce((s, a) => s + Number(a.amount), 0);
        const finalTotal = total + adjBonuses - adjDiscounts;
        
        const reason = buildWorkerPaymentReason(entries, workerNames, workshopAdj);
        
        const categoryLabel = t('workers.categories.travailleur');

        const { data: payment, error: paymentError } = await supabase
          .from('payments')
          .insert([{
            workshop_id: workshopId,
            paid_to: categoryLabel,
            reason,
            amount: Math.max(finalTotal, 0),
            payment_date: format(new Date(), 'yyyy-MM-dd'),
            created_by: user?.id,
            status: 'pending',
          }])
          .select()
          .single();
        
        if (paymentError) throw paymentError;

        const entryIds = entries.map((e: any) => e.id);
        if (entryIds.length > 0) {
          await supabase
            .from('attendance')
            .update({ is_paid: true, payment_id: payment.id })
            .in('id', entryIds);
        }

        const bonusIds = bonusAdj.map((a: any) => a.id);
        if (bonusIds.length > 0) {
          await supabase
            .from('worker_adjustments')
            .update({ is_paid: true, payment_id: payment.id })
            .in('id', bonusIds);
        }
        
        const discountIds = discountAdj.map((a: any) => a.id);
        if (discountIds.length > 0) {
          await supabase
            .from('worker_adjustments')
            .update({ is_paid: true })
            .in('id', discountIds);
        }
        
        delete adjByWorkshop[workshopId];
        
        results.push({ workshopId, paymentId: payment.id, amount: finalTotal });
      }
      
      return results;
    },
    onSuccess: () => {
      invalidateAll();
      setIsPayChoiceOpen(false);
      setPayMode(null);
      toast({ title: t('workers.paymentCreated'), description: t('workers.paymentCreatedDesc') });
    },
    onError: (error: Error) => {
      toast({ title: t('errors.error'), description: error.message, variant: 'destructive' });
    },
  });

  const PAYMENT_CREDIT_TAG = '[PAYMENT_CREDIT]';

  const createPaymentCreditAdjustment = async (params: {
    paymentId: string;
    workshopId: string;
    amount: number;
    mode: 'partial' | 'advance';
  }) => {
    const { paymentId, workshopId, amount, mode } = params;

    // We do NOT modify attendance rows for partial/advance payments.
    // Instead, we create an "unpaid" discount adjustment that represents a credit already given.
    // This reduces the owed balance (and can make it negative).
    const reason = `${t('workers.paymentCreditReason', {
      mode: t(mode === 'partial' ? 'workers.payPartial' : 'workers.payAdvance'),
      amount: amount.toLocaleString('fr-FR'),
    })} ${PAYMENT_CREDIT_TAG}`;

    const { error } = await supabase.from('worker_adjustments').insert({
      worker_id: worker.id,
      workshop_id: workshopId,
      work_date: format(new Date(), 'yyyy-MM-dd'),
      adjustment_type: 'discount',
      amount,
      reason,
      // Keep it "unpaid" so it affects the outstanding balance.
      is_paid: false,
      payment_id: paymentId,
      created_by: user?.id,
    });
    if (error) throw error;
  };

  // Pay partial salary mutation
  const payPartial = useMutation({
    mutationFn: async () => {
      const amount = parseFloat(partialAmount);
      if (!amount || amount <= 0 || !partialWorkshopId) throw new Error('Invalid amount or workshop');

      const reason = `${worker.name} - ${t('workers.partialPaymentReason')} (${amount.toLocaleString('fr-FR')} CFA)`;
      const categoryLabel = t('workers.categories.travailleur');

      const { data: payment, error: paymentError } = await supabase
        .from('payments')
        .insert([
          {
            workshop_id: partialWorkshopId,
            paid_to: categoryLabel,
            reason,
            amount,
            payment_date: format(new Date(), 'yyyy-MM-dd'),
            created_by: user?.id,
            status: 'pending',
          },
        ])
        .select()
        .single();
      if (paymentError) throw paymentError;

      try {
        await createPaymentCreditAdjustment({
          paymentId: payment.id,
          workshopId: partialWorkshopId,
          amount,
          mode: 'partial',
        });
      } catch (err) {
        await supabase.from('payments').delete().eq('id', payment.id);
        throw err;
      }

      return payment;
    },
    onSuccess: () => {
      invalidateAll();
      setIsPayChoiceOpen(false);
      setPayMode(null);
      setPartialAmount('');
      setPartialWorkshopId('');
      toast({ title: t('workers.partialPaymentCreated'), description: t('workers.partialPaymentCreatedDesc') });
    },
    onError: (error: Error) => {
      toast({ title: t('errors.error'), description: error.message, variant: 'destructive' });
    },
  });

  // Pay advance mutation - can be below or above owed amount
  const payAdvance = useMutation({
    mutationFn: async () => {
      const amount = parseFloat(advanceAmount);
      if (!amount || amount <= 0 || !advanceWorkshopId) throw new Error('Invalid amount or workshop');

      const categoryLabel = t('workers.categories.travailleur');
      const reason = `${worker.name} - ${t('workers.advancePaymentReason')} (${amount.toLocaleString('fr-FR')} CFA)`;

      const { data: payment, error: paymentError } = await supabase
        .from('payments')
        .insert([
          {
            workshop_id: advanceWorkshopId,
            paid_to: categoryLabel,
            reason,
            amount,
            payment_date: format(new Date(), 'yyyy-MM-dd'),
            created_by: user?.id,
            status: 'pending',
          },
        ])
        .select()
        .single();
      if (paymentError) throw paymentError;

      try {
        await createPaymentCreditAdjustment({
          paymentId: payment.id,
          workshopId: advanceWorkshopId,
          amount,
          mode: 'advance',
        });
      } catch (err) {
        await supabase.from('payments').delete().eq('id', payment.id);
        throw err;
      }

      return payment;
    },
    onSuccess: () => {
      invalidateAll();
      setIsPayChoiceOpen(false);
      setPayMode(null);
      setAdvanceAmount('');
      setAdvanceWorkshopId('');
      toast({ title: t('workers.advancePaymentCreated'), description: t('workers.advancePaymentCreatedDesc') });
    },
    onError: (error: Error) => {
      toast({ title: t('errors.error'), description: error.message, variant: 'destructive' });
    },
  });

  // Pay bonus only mutation
  const payBonus = useMutation({
    mutationFn: async () => {
      if (!bonusWorkshopId) throw new Error('No workshop selected');
      const workshopAdj = unpaidAdjByWorkshop[bonusWorkshopId];
      if (!workshopAdj || workshopAdj.items.length === 0) throw new Error('No adjustments');
      if (workshopAdj.bonuses <= 0) throw new Error('No bonus/taxi to pay');

      const categoryLabel = t('workers.categories.travailleur');
      
      // Only pay bonuses + taxi, NOT discounts
      const bonusItems = workshopAdj.items.filter((a: any) => a.adjustment_type === 'bonus' || a.adjustment_type === 'taxi');
      const discountItems = workshopAdj.items.filter((a: any) => a.adjustment_type === 'discount');
      const payableAmount = workshopAdj.bonuses; // only bonuses + taxi
      
      if (payableAmount <= 0) throw new Error('No bonus/taxi to pay');
      
      const reason = `${worker.name} - ${t('workers.bonusPaymentReason', { defaultValue: 'Bonus/Taxi payment' })}`;

      const { data: payment, error: paymentError } = await supabase
        .from('payments')
        .insert([{
          workshop_id: bonusWorkshopId,
          paid_to: categoryLabel,
          reason,
          amount: payableAmount,
          payment_date: format(new Date(), 'yyyy-MM-dd'),
          created_by: user?.id,
          status: 'pending',
        }])
        .select()
        .single();
      if (paymentError) throw paymentError;

      // Mark bonus/taxi adjustments as paid with payment_id
      const bonusIds = bonusItems.map((a: any) => a.id);
      if (bonusIds.length > 0) {
        await supabase
          .from('worker_adjustments')
          .update({ is_paid: true, payment_id: payment.id })
          .in('id', bonusIds);
      }
      
      // Mark discount adjustments as paid (no payment record - they just reduce balance)
      const discountIds = discountItems.map((a: any) => a.id);
      if (discountIds.length > 0) {
        await supabase
          .from('worker_adjustments')
          .update({ is_paid: true })
          .in('id', discountIds);
      }

      return payment;
    },
    onSuccess: () => {
      invalidateAll();
      setIsPayChoiceOpen(false);
      setPayMode(null);
      setBonusWorkshopId('');
      toast({ title: t('workers.bonusPaymentCreated'), description: t('workers.bonusPaymentCreatedDesc') });
    },
    onError: (error: Error) => {
      toast({ title: t('errors.error'), description: error.message, variant: 'destructive' });
    },
  });

  // Pay overtime only mutation
  const payOvertime = useMutation({
    mutationFn: async () => {
      if (!overtimeWorkshopId) throw new Error('No workshop selected');
      const workshopOt = unpaidOvertimeByWorkshop[overtimeWorkshopId];
      if (!workshopOt || workshopOt.entries.length === 0) throw new Error('No overtime entries');

      const categoryLabel = t('workers.categories.travailleur');
      const reason = `${worker.name} - ${t('workers.overtimePaymentReason', { defaultValue: 'Overtime payment' })}`;

      const { data: payment, error: paymentError } = await supabase
        .from('payments')
        .insert([{
          workshop_id: overtimeWorkshopId,
          paid_to: categoryLabel,
          reason,
          amount: workshopOt.total,
          payment_date: format(new Date(), 'yyyy-MM-dd'),
          created_by: user?.id,
          status: 'pending',
        }])
        .select()
        .single();
      if (paymentError) throw paymentError;

      const entryIds = workshopOt.entries.map((e: any) => e.id);
      await supabase
        .from('attendance')
        .update({ is_paid: true, payment_id: payment.id })
        .in('id', entryIds);

      return payment;
    },
    onSuccess: () => {
      invalidateAll();
      setIsPayChoiceOpen(false);
      setPayMode(null);
      setOvertimeWorkshopId('');
      toast({ title: t('workers.overtimePaymentCreated', { defaultValue: 'Overtime payment created' }), description: t('workers.overtimePaymentCreatedDesc', { defaultValue: 'The overtime payment is pending approval' }) });
    },
    onError: (error: Error) => {
      toast({ title: t('errors.error'), description: error.message, variant: 'destructive' });
    },
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['worker-unpaid-attendance'] });
    queryClient.invalidateQueries({ queryKey: ['worker-paid-attendance'] });
    queryClient.invalidateQueries({ queryKey: ['worker-paid-adjustments'] });
    queryClient.invalidateQueries({ queryKey: ['worker-unpaid-adjustments'] });
    queryClient.invalidateQueries({ queryKey: ['all-unpaid-attendance'] });
    queryClient.invalidateQueries({ queryKey: ['payments'] });
  };

  const handleEditAttendance = (entry: any) => {
    setEditingAttendance({
      id: entry.id,
      work_date: entry.work_date,
      hourly_rate: Number(entry.hourly_rate),
      workshop_id: entry.workshop_id,
    });
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingAttendance) {
      updateAttendance.mutate(editingAttendance);
    }
  };

  const openPayChoiceDialog = () => {
    setPayMode(null);
    setPartialAmount('');
    setAdvanceAmount('');
    const firstWorkshopId = Object.keys(unpaidByWorkshop)[0] || (workshops.length > 0 ? workshops[0].id : '');
    setPartialWorkshopId(firstWorkshopId);
    setAdvanceWorkshopId(firstWorkshopId);
    setIsPayChoiceOpen(true);
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

      {/* Single Pay Button */}
      <Button 
        onClick={openPayChoiceDialog} 
        className="w-full bg-success text-success-foreground hover:bg-success/90 gap-2"
      >
        <Wallet className="w-4 h-4" />
        {t('workers.payWorker')} ({totalOwed.toLocaleString('fr-FR')} CFA)
      </Button>

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
                      <Badge variant="outline" className="text-xs font-mono">
                        {total.toLocaleString('fr-FR')} CFA
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="px-3 pb-3">
                    <div className="space-y-1">
                      {entries.map((entry) => {
                        const extraAmount = Number(entry.extra_amount) || 0;
                        const hasExtra = Boolean(entry.has_extra && extraAmount > 0);
                        const discountAmount = Number(entry.discount_amount) || 0;
                        const hasDiscount = discountAmount > 0;
                        const extraReason = entry.extra_reason?.trim();
                        const discountReason = entry.discount_reason?.trim();
                        return (
                          <div key={entry.id} className="flex items-center justify-between text-sm py-2 border-b last:border-0">
                            <div className="flex flex-col">
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono text-xs">
                                  {format(new Date(entry.work_date), 'EEE, dd/MM')}
                                </span>
                                {Number(entry.hours_worked) === 0.5 && (
                                  <Badge variant="outline" className="text-[10px] px-1 py-0 text-warning border-warning">
                                     {t('attendance.halfDay', { defaultValue: '½ Day' })}
                                  </Badge>
                                )}
                              </div>
                              {hasExtra && (
                                <div className="flex flex-col gap-0.5 mt-0.5">
                                  <div className="flex items-center gap-1">
                                    <Sparkles className="w-3 h-3 text-warning" />
                                    <span className="text-[10px] text-warning">
                                      +{extraAmount.toLocaleString('fr-FR')} {t('attendance.extra')}
                                    </span>
                                  </div>
                                  {extraReason && (
                                    <p className="text-[10px] text-muted-foreground line-clamp-2">
                                      {extraReason}
                                    </p>
                                  )}
                                </div>
                              )}
                              {hasDiscount && (
                                <div className="flex flex-col gap-0.5 mt-0.5">
                                  <div className="flex items-center gap-1">
                                    <MinusCircle className="w-3 h-3 text-destructive" />
                                    <span className="text-[10px] text-destructive">
                                      -{discountAmount.toLocaleString('fr-FR')} {t('attendance.discount', { defaultValue: 'Discount' })}
                                    </span>
                                  </div>
                                  {discountReason && (
                                    <p className="text-[10px] text-muted-foreground line-clamp-2">
                                      {discountReason}
                                    </p>
                                  )}
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="text-right">
                                <span className="font-mono font-medium">
                                  {Number(entry.daily_salary).toLocaleString('fr-FR')} CFA
                                </span>
                                {(hasExtra || hasDiscount) && (
                                  <p className="text-[10px] text-muted-foreground font-mono">
                                    {Number(entry.hourly_rate).toLocaleString('fr-FR')}
                                    {hasExtra && ` + ${extraAmount.toLocaleString('fr-FR')}`}
                                    {hasDiscount && ` - ${discountAmount.toLocaleString('fr-FR')}`}
                                  </p>
                                )}
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleEditAttendance(entry)}
                                className="h-6 w-6"
                              >
                                <Edit className="w-3 h-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setAttendanceToDelete(entry.id)}
                                className="h-6 w-6 text-destructive hover:text-destructive"
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                      {/* Show unpaid adjustments for this workshop */}
                      {unpaidAdjustments
                        .filter((adj) => adj.workshop_id === workshopId)
                        .map((adj) => (
                          <div key={adj.id} className="flex items-center justify-between text-sm py-2 border-b last:border-0">
                            <div className="flex flex-col">
                              <span className="font-mono text-xs">
                                {format(new Date(adj.work_date), 'EEE, dd/MM')}
                              </span>
                              <div className="flex items-center gap-1 mt-0.5">
                                {adj.adjustment_type === 'bonus' ? (
                                  <Sparkles className="w-3 h-3 text-success" />
                                ) : adj.adjustment_type === 'taxi' ? (
                                  <Clock className="w-3 h-3 text-blue-600" />
                                ) : (
                                  <MinusCircle className="w-3 h-3 text-destructive" />
                                )}
                                <span className={`text-[10px] ${adj.adjustment_type === 'bonus' ? 'text-success' : adj.adjustment_type === 'taxi' ? 'text-blue-600' : 'text-destructive'}`}>
                                  {adj.adjustment_type === 'discount' ? '-' : '+'}{Number(adj.amount).toLocaleString('fr-FR')} {adj.adjustment_type === 'bonus' ? t('workers.bonus', { defaultValue: 'Bonus' }) : adj.adjustment_type === 'taxi' ? t('adjustments.taxi', { defaultValue: 'Taxi' }) : t('attendance.discount', { defaultValue: 'Discount' })}
                                </span>
                              </div>
                              {adj.reason && (
                                <p className="text-[10px] text-muted-foreground line-clamp-2 mt-0.5">{adj.reason}</p>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant={adj.adjustment_type === 'discount' ? 'destructive' : 'secondary'} className="gap-1 font-mono text-xs">
                                {adj.adjustment_type === 'discount' ? '-' : '+'}{Number(adj.amount).toLocaleString('fr-FR')}
                              </Badge>
                            </div>
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
          ) : (
            <div className="space-y-3">
              {/* History Filters */}
              <div className="flex flex-wrap gap-2 items-center">
                <Select value={historyTimeFilter} onValueChange={(v) => {
                  setHistoryTimeFilter(v);
                  if (v !== 'date') setHistorySelectedDate(undefined);
                }}>
                  <SelectTrigger className="w-[120px] h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('attendance.allTime')}</SelectItem>
                    <SelectItem value="0">{t('attendance.thisWeek')}</SelectItem>
                    <SelectItem value="1">{t('attendance.lastWeek')}</SelectItem>
                    <SelectItem value="2">2 {t('attendance.weeksAgo')}</SelectItem>
                    <SelectItem value="3">3 {t('attendance.weeksAgo')}</SelectItem>
                    <SelectItem value="4">4 {t('attendance.weeksAgo')}</SelectItem>
                    <SelectItem value="date">{t('attendance.specificDate')}</SelectItem>
                  </SelectContent>
                </Select>

                {historyTimeFilter === 'date' && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className={cn(
                          "h-8 text-xs justify-start text-left font-normal",
                          !historySelectedDate && "text-muted-foreground"
                        )}
                      >
                        <Calendar className="mr-1.5 h-3 w-3" />
                        {historySelectedDate ? format(historySelectedDate, 'dd/MM/yyyy') : t('attendance.pickDate')}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarComponent
                        mode="single"
                        selected={historySelectedDate}
                        onSelect={setHistorySelectedDate}
                        initialFocus
                        className={cn("p-3 pointer-events-auto")}
                      />
                    </PopoverContent>
                  </Popover>
                )}

                {historySelectedDate && historyTimeFilter === 'date' && (
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setHistorySelectedDate(undefined)}>
                    <X className="h-3 w-3" />
                  </Button>
                )}

                <Select value={historyWorkshopFilter} onValueChange={setHistoryWorkshopFilter}>
                  <SelectTrigger className="w-[130px] h-8 text-xs">
                    <SelectValue placeholder={t('attendance.allWorkshops')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('attendance.allWorkshops')}</SelectItem>
                    {workshops.map((w) => (
                      <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Paid Adjustments (Bonuses/Discounts) Section - filtered */}
              {filteredPaidAdjustments.length > 0 && (
                <Card className="shadow-card">
                  <CardHeader className="pb-2 px-3 pt-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-warning" />
                      {t('workers.paidAdjustments', { defaultValue: 'Paid Bonuses & Discounts' })}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-3 pb-3">
                    <div className="space-y-1">
                      {filteredPaidAdjustments.map((adj) => (
                        <div key={adj.id} className="flex items-center justify-between text-sm py-2 border-b last:border-0">
                          <div className="flex flex-col">
                            <span className="font-mono text-xs">
                              {format(new Date(adj.work_date), 'EEE, dd/MM')}
                            </span>
                            <Badge variant="outline" className="text-[10px] mt-1 w-fit">
                              {(adj.workshops as any)?.name}
                            </Badge>
                            {adj.reason && (
                              <p className="text-[10px] text-muted-foreground mt-0.5">{adj.reason}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            {adj.adjustment_type === 'bonus' ? (
                              <Badge variant="secondary" className="gap-1 font-mono">
                                <Sparkles className="w-3 h-3" />
                                +{Number(adj.amount).toLocaleString('fr-FR')}
                              </Badge>
                            ) : (
                              <Badge variant="destructive" className="gap-1 font-mono">
                                <MinusCircle className="w-3 h-3" />
                                -{Number(adj.amount).toLocaleString('fr-FR')}
                              </Badge>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {filteredPaidAttendance.length === 0 && filteredPaidAdjustments.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground">
                    <p>{t('workers.noPaymentHistory')}</p>
                  </CardContent>
                </Card>
              ) : filteredPaidAttendance.length > 0 ? (
                <Card className="shadow-card">
                  <CardContent className="p-0">
                    <div className="md:hidden">
                      {filteredPaidAttendance.map((entry) => {
                        const isOvertime = entry.description?.includes('Overtime') || Number(entry.hourly_rate) === 0;
                        const extraAmount = Number(entry.extra_amount) || 0;
                        const hasExtra = Boolean(entry.has_extra && extraAmount > 0);
                        const discountAmount = Number(entry.discount_amount) || 0;
                        const hasDiscount = discountAmount > 0;
                        const extraReason = entry.extra_reason?.trim();
                        const discountReason = entry.discount_reason?.trim();
                        const linkedAdj = entry.payment_id ? (paidAdjByPaymentId[entry.payment_id] || []) : [];
                        const isFirstForPayment = entry.payment_id ? filteredPaidAttendance.findIndex(e => e.payment_id === entry.payment_id) === filteredPaidAttendance.indexOf(entry) : false;
                        const showLinkedAdj = isFirstForPayment && linkedAdj.length > 0;
                        return (
                          <div key={entry.id} className="p-3 border-b last:border-0">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <p className="font-mono text-xs">
                                    {format(new Date(entry.work_date), 'EEE, dd/MM/yyyy')}
                                  </p>
                                  {Number(entry.hours_worked) === 0.5 && (
                                    <Badge variant="outline" className="text-[10px] px-1 py-0 text-warning border-warning">
                                      {t('attendance.halfDay', { defaultValue: '½ Day' })}
                                    </Badge>
                                  )}
                                </div>
                                <Badge variant="outline" className="text-[10px] mt-1 max-w-full">
                                  <span className="truncate">{(entry.workshops as any)?.name}</span>
                                </Badge>
                                {entry.description && (
                                  <p className="text-[10px] text-muted-foreground mt-1 line-clamp-2">
                                    {entry.description}
                                  </p>
                                )}
                                {hasExtra && !isOvertime && (
                                  <div className="flex flex-col gap-0.5 mt-1">
                                    <div className="flex items-center gap-1">
                                      <Sparkles className="w-3 h-3 text-warning flex-shrink-0" />
                                      <span className="text-[10px] text-warning">
                                        +{extraAmount.toLocaleString('fr-FR')} {t('attendance.extra')}
                                      </span>
                                    </div>
                                    {extraReason && (
                                      <p className="text-[10px] text-muted-foreground line-clamp-2">
                                        {extraReason}
                                      </p>
                                    )}
                                  </div>
                                )}
                                {hasDiscount && (
                                  <div className="flex flex-col gap-0.5 mt-1">
                                    <div className="flex items-center gap-1">
                                      <MinusCircle className="w-3 h-3 text-destructive" />
                                      <span className="text-[10px] text-destructive">
                                        -{discountAmount.toLocaleString('fr-FR')} {t('attendance.discount', { defaultValue: 'Discount' })}
                                      </span>
                                    </div>
                                    {discountReason && (
                                      <p className="text-[10px] text-muted-foreground line-clamp-2">
                                        {discountReason}
                                      </p>
                                    )}
                                  </div>
                                )}
                                {showLinkedAdj && linkedAdj.map((adj) => (
                                  <div key={adj.id} className="flex items-center gap-1 mt-1">
                                    {adj.adjustment_type === 'bonus' ? (
                                      <Sparkles className="w-3 h-3 text-success flex-shrink-0" />
                                    ) : (
                                      <MinusCircle className="w-3 h-3 text-destructive flex-shrink-0" />
                                    )}
                                    <span className={`text-[10px] ${adj.adjustment_type === 'bonus' ? 'text-success' : 'text-destructive'}`}>
                                      {adj.adjustment_type === 'bonus' ? '+' : '-'}{Number(adj.amount).toLocaleString('fr-FR')} {adj.adjustment_type === 'bonus' ? t('workers.bonus', { defaultValue: 'Bonus' }) : t('attendance.discount', { defaultValue: 'Discount' })}
                                    </span>
                                    {adj.reason && (
                                      <span className="text-[10px] text-muted-foreground truncate">({adj.reason})</span>
                                    )}
                                  </div>
                                ))}
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <div className="text-right">
                                  <p className="font-mono font-medium text-muted-foreground">
                                    {Number(entry.daily_salary).toLocaleString('fr-FR')} CFA
                                  </p>
                                  {isOvertime && (
                                    <Badge variant="secondary" className="text-[10px] mt-1 gap-1">
                                      <Clock className="w-2.5 h-2.5" />
                                      {t('attendance.overtimeShort')}
                                    </Badge>
                                  )}
                                  {!isOvertime && (
                                    <Badge 
                                      variant={(entry.payments as any)?.status === 'approved' ? 'default' : 'secondary'}
                                      className="text-[10px] mt-1"
                                    >
                                      {(entry.payments as any)?.status || 'paid'}
                                    </Badge>
                                  )}
                                </div>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => deletePaidAttendance.mutate(entry)}
                                  className="h-7 w-7 text-destructive hover:text-destructive"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="hidden md:block">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>{t('common.date')}</TableHead>
                            <TableHead>{t('common.workshop')}</TableHead>
                            <TableHead>{t('attendance.dailySalary')}</TableHead>
                            <TableHead>{t('common.description')}</TableHead>
                            <TableHead>{t('common.status')}</TableHead>
                            <TableHead className="text-right">{t('common.actions')}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredPaidAttendance.map((entry) => {
                            const isOvertime = entry.description?.includes('Overtime') || Number(entry.hourly_rate) === 0;
                            const extraAmount = Number(entry.extra_amount) || 0;
                            const hasExtra = Boolean(entry.has_extra && extraAmount > 0);
                            const discountAmount = Number(entry.discount_amount) || 0;
                            const hasDiscount = discountAmount > 0;
                            const extraReason = entry.extra_reason?.trim();
                            const discountReason = entry.discount_reason?.trim();
                            const description = entry.description?.trim();
                            const linkedAdj = entry.payment_id ? (paidAdjByPaymentId[entry.payment_id] || []) : [];
                            const isFirstForPayment = entry.payment_id ? filteredPaidAttendance.findIndex(e => e.payment_id === entry.payment_id) === filteredPaidAttendance.indexOf(entry) : false;
                            const showLinkedAdj = isFirstForPayment && linkedAdj.length > 0;
                            return (
                              <TableRow key={entry.id}>
                                <TableCell className="font-mono">
                                  <div className="flex items-center gap-1.5">
                                    {format(new Date(entry.work_date), 'MMM d, yyyy')}
                                    {Number(entry.hours_worked) === 0.5 && (
                                      <Badge variant="outline" className="text-[10px] px-1 py-0 text-warning border-warning">
                                        ½
                                      </Badge>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <Badge variant="outline">{(entry.workshops as any)?.name}</Badge>
                                </TableCell>
                                <TableCell className="font-mono">
                                  {Number(entry.daily_salary).toLocaleString('fr-FR')} CFA
                                </TableCell>
                                <TableCell className="max-w-[200px]">
                                  {isOvertime ? (
                                    <div className="flex items-center gap-1">
                                      <Badge variant="secondary" className="gap-1 flex-shrink-0">
                                        <Clock className="w-3 h-3" />
                                        {t('attendance.overtimeShort')}
                                      </Badge>
                                      {description && (
                                        <span className="text-xs text-muted-foreground truncate" title={description}>
                                          {description}
                                        </span>
                                      )}
                                    </div>
                                  ) : (
                                    <div className="space-y-1">
                                      {hasExtra || hasDiscount ? (
                                        <div className="flex flex-wrap gap-1">
                                          {hasExtra && (
                                            <Badge variant="secondary" className="gap-1">
                                              <Sparkles className="w-3 h-3" />
                                              +{extraAmount.toLocaleString('fr-FR')} {t('attendance.extra')}
                                            </Badge>
                                          )}
                                          {hasDiscount && (
                                            <Badge variant="destructive" className="gap-1">
                                              <MinusCircle className="w-3 h-3" />
                                              -{discountAmount.toLocaleString('fr-FR')} {t('attendance.discount', { defaultValue: 'Discount' })}
                                            </Badge>
                                          )}
                                        </div>
                                      ) : (
                                        <span className="text-muted-foreground">-</span>
                                      )}
                                      {description && (
                                        <p className="text-xs text-muted-foreground line-clamp-2" title={description}>
                                          {description}
                                        </p>
                                      )}
                                      {extraReason && (
                                        <p className="text-xs text-muted-foreground line-clamp-2">
                                          {extraReason}
                                        </p>
                                      )}
                                      {discountReason && (
                                        <p className="text-xs text-muted-foreground line-clamp-2">
                                          {discountReason}
                                        </p>
                                      )}
                                    </div>
                                  )}
                                  {showLinkedAdj && (
                                    <div className="flex flex-wrap gap-1 mt-1">
                                      {linkedAdj.map((adj) => (
                                        <Badge key={adj.id} variant={adj.adjustment_type === 'bonus' ? 'secondary' : 'destructive'} className="gap-1">
                                          {adj.adjustment_type === 'bonus' ? <Sparkles className="w-3 h-3" /> : <MinusCircle className="w-3 h-3" />}
                                          {adj.adjustment_type === 'bonus' ? '+' : '-'}{Number(adj.amount).toLocaleString('fr-FR')} {adj.adjustment_type === 'bonus' ? t('workers.bonus', { defaultValue: 'Bonus' }) : t('attendance.discount', { defaultValue: 'Discount' })}
                                          {adj.reason && <span className="text-[10px] opacity-70">({adj.reason})</span>}
                                        </Badge>
                                      ))}
                                    </div>
                                  )}
                                </TableCell>
                                <TableCell>
                                  <Badge 
                                    variant={(entry.payments as any)?.status === 'approved' ? 'default' : 'secondary'}
                                  >
                                    {(entry.payments as any)?.status || 'paid'}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-right">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => deletePaidAttendance.mutate(entry)}
                                    className="h-8 w-8 text-destructive hover:text-destructive"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              ) : null}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Pay Choice Dialog */}
      <Dialog open={isPayChoiceOpen} onOpenChange={(open) => { setIsPayChoiceOpen(open); if (!open) setPayMode(null); }}>
        <DialogContent className="sm:max-w-sm max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('workers.payWorker')}</DialogTitle>
            <DialogDescription>
              {t('workers.payDescription', { name: worker.name })}
            </DialogDescription>
          </DialogHeader>

          {/* Payment option selection */}
          {!payMode && (
            <div className="space-y-2">
              {/* Full Salary */}
              <Button
                variant="outline"
                className="w-full justify-start gap-3 h-auto py-3"
                onClick={() => setPayMode('full')}
                disabled={totalOwed <= 0}
              >
                <Wallet className="w-5 h-5 text-success flex-shrink-0" />
                <div className="text-left">
                  <p className="font-medium text-sm">{t('workers.payFullSalary')}</p>
                  <p className="text-xs text-muted-foreground font-mono">{totalOwed.toLocaleString('fr-FR')} CFA</p>
                </div>
              </Button>

              {/* Pay Bonus Only */}
              <Button
                variant="outline"
                className="w-full justify-start gap-3 h-auto py-3"
                onClick={() => setPayMode('bonus')}
                disabled={adjustmentNet === 0}
              >
                <Sparkles className="w-5 h-5 text-warning flex-shrink-0" />
                <div className="text-left">
                  <p className="font-medium text-sm">{t('workers.payBonusOnly')}</p>
                  <p className="text-xs text-muted-foreground font-mono">{adjustmentNet > 0 ? '+' : ''}{adjustmentNet.toLocaleString('fr-FR')} CFA</p>
                </div>
              </Button>

              {/* Pay Overtime Only */}
              <Button
                variant="outline"
                className="w-full justify-start gap-3 h-auto py-3"
                onClick={() => setPayMode('overtime')}
                disabled={overtimeTotal <= 0}
              >
                <Clock className="w-5 h-5 text-primary flex-shrink-0" />
                <div className="text-left">
                  <p className="font-medium text-sm">{t('workers.payOvertime', { defaultValue: 'Pay Overtime' })}</p>
                  <p className="text-xs text-muted-foreground font-mono">{overtimeTotal.toLocaleString('fr-FR')} CFA</p>
                </div>
              </Button>

              {/* Advance Payment */}
              <Button
                variant="outline"
                className="w-full justify-start gap-3 h-auto py-3"
                onClick={() => setPayMode('advance')}
              >
                <ArrowUpCircle className="w-5 h-5 text-warning flex-shrink-0" />
                <div className="text-left">
                  <p className="font-medium text-sm">{t('workers.payAdvance')}</p>
                  <p className="text-xs text-muted-foreground">{t('workers.payAdvanceDesc')}</p>
                </div>
              </Button>
            </div>
          )}

          {/* Full Salary Confirmation */}
          {payMode === 'full' && (
            <div className="space-y-4">
              <Button variant="ghost" size="sm" onClick={() => setPayMode(null)} className="gap-1 text-xs -mt-2">
                <ArrowLeft className="w-3 h-3" /> {t('common.back')}
              </Button>
              <div className="space-y-2">
                <p className="text-sm font-medium">{t('workers.paymentSummary')}:</p>
                {Object.entries(unpaidByWorkshop).map(([workshopId, { name, total }]) => (
                  <div key={workshopId} className="flex items-center justify-between text-sm p-2 rounded-lg bg-muted">
                    <span className="flex items-center gap-2">
                      <Building2 className="w-3.5 h-3.5" />
                      {name}
                    </span>
                    <span className="font-mono font-medium">{total.toLocaleString('fr-FR')} CFA</span>
                  </div>
                ))}
                <div className="flex items-center justify-between text-base font-bold p-2 rounded-lg bg-success/10 border border-success/20">
                  <span>{t('common.total')}</span>
                  <span className="font-mono text-success">{totalOwed.toLocaleString('fr-FR')} CFA</span>
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsPayChoiceOpen(false)}>
                  {t('common.cancel')}
                </Button>
                <Button
                  onClick={() => createPayment.mutate()}
                  disabled={createPayment.isPending}
                  className="bg-success text-success-foreground hover:bg-success/90"
                >
                  {createPayment.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {t('workers.confirmPayment')}
                </Button>
              </DialogFooter>
            </div>
          )}

          {/* Pay Bonus Form */}
          {payMode === 'bonus' && (
            <div className="space-y-4">
              <Button variant="ghost" size="sm" onClick={() => setPayMode(null)} className="gap-1 text-xs -mt-2">
                <ArrowLeft className="w-3 h-3" /> {t('common.back')}
              </Button>
              <div className="space-y-2">
                <Label>{t('workers.selectWorkshop')}</Label>
                <Select value={bonusWorkshopId} onValueChange={setBonusWorkshopId}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('workers.selectWorkshop')} />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(unpaidAdjByWorkshop).map(([workshopId, { name, bonuses, discounts }]) => (
                      <SelectItem key={workshopId} value={workshopId}>
                        {name} ({(bonuses - discounts).toLocaleString('fr-FR')} CFA)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {bonusWorkshopId && unpaidAdjByWorkshop[bonusWorkshopId] && (
                <div className="text-xs space-y-1 p-2 rounded-lg bg-muted">
                  <div className="flex justify-between">
                    <span>{t('workers.bonus', { defaultValue: 'Bonus' })}:</span>
                    <span className="font-mono text-success">+{unpaidAdjByWorkshop[bonusWorkshopId].bonuses.toLocaleString('fr-FR')} CFA</span>
                  </div>
                  {unpaidAdjByWorkshop[bonusWorkshopId].discounts > 0 && (
                    <div className="flex justify-between">
                      <span>{t('attendance.discount')}:</span>
                      <span className="font-mono text-destructive">-{unpaidAdjByWorkshop[bonusWorkshopId].discounts.toLocaleString('fr-FR')} CFA</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold border-t pt-1">
                    <span>{t('common.total')}:</span>
                    <span className="font-mono">{(unpaidAdjByWorkshop[bonusWorkshopId].bonuses - unpaidAdjByWorkshop[bonusWorkshopId].discounts).toLocaleString('fr-FR')} CFA</span>
                  </div>
                </div>
              )}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsPayChoiceOpen(false)}>
                  {t('common.cancel')}
                </Button>
                <Button
                  onClick={() => payBonus.mutate()}
                  disabled={payBonus.isPending || !bonusWorkshopId}
                  className="bg-success text-success-foreground hover:bg-success/90"
                >
                  {payBonus.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {t('workers.confirmPayment')}
                </Button>
              </DialogFooter>
            </div>
          )}

          {/* Pay Overtime Form */}
          {payMode === 'overtime' && (
            <div className="space-y-4">
              <Button variant="ghost" size="sm" onClick={() => setPayMode(null)} className="gap-1 text-xs -mt-2">
                <ArrowLeft className="w-3 h-3" /> {t('common.back')}
              </Button>
              <div className="space-y-2">
                <Label>{t('workers.selectWorkshop')}</Label>
                <Select value={overtimeWorkshopId} onValueChange={setOvertimeWorkshopId}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('workers.selectWorkshop')} />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(unpaidOvertimeByWorkshop).map(([workshopId, { name, total }]) => (
                      <SelectItem key={workshopId} value={workshopId}>
                        {name} ({total.toLocaleString('fr-FR')} CFA)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {overtimeWorkshopId && unpaidOvertimeByWorkshop[overtimeWorkshopId] && (
                <div className="text-xs space-y-1 p-2 rounded-lg bg-muted">
                  <div className="flex justify-between">
                    <span>{t('workers.payOvertime', { defaultValue: 'Overtime' })}:</span>
                    <span className="font-mono">{unpaidOvertimeByWorkshop[overtimeWorkshopId].total.toLocaleString('fr-FR')} CFA</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>{t('workers.entries', { defaultValue: 'Entries' })}:</span>
                    <span>{unpaidOvertimeByWorkshop[overtimeWorkshopId].entries.length}</span>
                  </div>
                </div>
              )}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsPayChoiceOpen(false)}>
                  {t('common.cancel')}
                </Button>
                <Button
                  onClick={() => payOvertime.mutate()}
                  disabled={payOvertime.isPending || !overtimeWorkshopId}
                  className="bg-success text-success-foreground hover:bg-success/90"
                >
                  {payOvertime.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {t('workers.confirmPayment')}
                </Button>
              </DialogFooter>
            </div>
          )}

          {/* Advance Payment Form */}
          {payMode === 'advance' && (
            <div className="space-y-4">
              <Button variant="ghost" size="sm" onClick={() => setPayMode(null)} className="gap-1 text-xs -mt-2">
                <ArrowLeft className="w-3 h-3" /> {t('common.back')}
              </Button>
              <div className="space-y-2">
                <Label>{t('workers.selectWorkshop')}</Label>
                <Select value={advanceWorkshopId} onValueChange={setAdvanceWorkshopId}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('workers.selectWorkshop')} />
                  </SelectTrigger>
                  <SelectContent>
                    {workshops.map((w) => (
                      <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('common.amount')} (CFA)</Label>
                <Input
                  type="number"
                  min="1"
                  value={advanceAmount}
                  onChange={(e) => setAdvanceAmount(e.target.value)}
                  placeholder="0"
                />
                {advanceWorkshopId && (() => {
                  const workshopOwed = unpaidByWorkshop[advanceWorkshopId]?.total || 0;
                  const advAmt = parseFloat(advanceAmount) || 0;
                  const newBalance = workshopOwed - advAmt;
                  return (
                    <div className="text-xs space-y-1 p-2 rounded-lg bg-muted">
                      <div className="flex justify-between">
                        <span>{t('workers.totalOwed')}:</span>
                        <span className="font-mono">{workshopOwed.toLocaleString('fr-FR')} CFA</span>
                      </div>
                      <div className="flex justify-between">
                        <span>{t('workers.payAdvance')}:</span>
                        <span className="font-mono">{advAmt.toLocaleString('fr-FR')} CFA</span>
                      </div>
                      <div className="flex justify-between font-bold border-t pt-1">
                        <span>{t('userBalance.balance')}:</span>
                        <span className={`font-mono ${newBalance < 0 ? 'text-destructive' : 'text-success'}`}>
                          {newBalance.toLocaleString('fr-FR')} CFA
                        </span>
                      </div>
                    </div>
                  );
                })()}
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsPayChoiceOpen(false)}>
                  {t('common.cancel')}
                </Button>
                <Button
                  onClick={() => payAdvance.mutate()}
                  disabled={payAdvance.isPending || !advanceAmount || parseFloat(advanceAmount) <= 0 || !advanceWorkshopId}
                  className="bg-success text-success-foreground hover:bg-success/90"
                >
                  {payAdvance.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {t('workers.confirmPayment')}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Attendance Dialog */}
      <Dialog open={!!editingAttendance} onOpenChange={(open) => !open && setEditingAttendance(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('attendance.editAttendance')}</DialogTitle>
            <DialogDescription>
              {t('attendance.updateAttendance')}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveEdit} className="space-y-4">
            <div className="space-y-2">
              <Label>{t('common.date')}</Label>
              <Input
                type="date"
                value={editingAttendance?.work_date || ''}
                onChange={(e) => setEditingAttendance(prev => prev ? { ...prev, work_date: e.target.value } : null)}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('attendance.dailyRate')} (CFA)</Label>
              <Input
                type="number"
                min="1"
                value={editingAttendance?.hourly_rate || ''}
                onChange={(e) => setEditingAttendance(prev => prev ? { ...prev, hourly_rate: Number(e.target.value) } : null)}
                placeholder="0"
              />
            </div>
            <div className="space-y-2">
              <Label>{t('common.workshop')}</Label>
              <Select 
                value={editingAttendance?.workshop_id || ''} 
                onValueChange={(v) => setEditingAttendance(prev => prev ? { ...prev, workshop_id: v } : null)}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('workshopSelector.selectWorkshop')} />
                </SelectTrigger>
                <SelectContent>
                  {workshops.map((w) => (
                    <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <p className="text-xs text-muted-foreground pt-2 border-t">
              {t('attendance.bonusDiscountNote', { defaultValue: 'To add bonuses or discounts, mark attendance from the Attendance page.' })}
            </p>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditingAttendance(null)}>
                {t('common.cancel')}
              </Button>
              <Button
                type="submit"
                disabled={updateAttendance.isPending}
              >
                {updateAttendance.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {t('common.save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
