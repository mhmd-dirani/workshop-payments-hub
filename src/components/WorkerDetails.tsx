import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { getEffectivePay, buildWorkerPaymentReason, PAYMENT_CREDIT_TAG, ADVANCE_CREDIT_TAG, isWorkerPaymentCredit, rewriteCreditReasonAmount, buildPaymentPlan } from '@/lib/worker-payment-utils';
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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { useToast } from '@/hooks/use-toast';
import { format, startOfWeek, endOfWeek, subWeeks, addDays } from 'date-fns';
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
  ArrowUpCircle,
  CalendarHeart,
  CalendarDays,
  TrendingUp,
  TrendingDown
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
  const { user, role } = useAuth();
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
  const [bonusAmount, setBonusAmount] = useState('');
  const [bonusReason, setBonusReason] = useState('');
  const [overtimeWorkshopId, setOvertimeWorkshopId] = useState<string>('');
  const [overtimeType, setOvertimeType] = useState<'sunday' | 'hours' | null>(null);
  const [overtimeAmount, setOvertimeAmount] = useState('');
  const [overtimeHours, setOvertimeHours] = useState('');
  const [overtimePaidNow, setOvertimePaidNow] = useState(true);
  const [isWorkerDebtFormOpen, setIsWorkerDebtFormOpen] = useState(false);
  const [workerDebtAmount, setWorkerDebtAmount] = useState('');
  const [workerDebtDescription, setWorkerDebtDescription] = useState('');
  const [workerDebtWorkshopId, setWorkerDebtWorkshopId] = useState('');
  const [workerDebtRepayId, setWorkerDebtRepayId] = useState<string | null>(null);
  const [workerDebtRepayAmount, setWorkerDebtRepayAmount] = useState('');
  const [workerDebtRepayWorkshopId, setWorkerDebtRepayWorkshopId] = useState('');
  const [workerDebtRepayMode, setWorkerDebtRepayMode] = useState<'separate' | 'salary'>('separate');
  const [editingWorkerDebt, setEditingWorkerDebt] = useState<any>(null);
  const [editDebtAmount, setEditDebtAmount] = useState('');
  const [editDebtDescription, setEditDebtDescription] = useState('');
  const [workerDebtToDelete, setWorkerDebtToDelete] = useState<any>(null);
  const [editingAdvanceCredit, setEditingAdvanceCredit] = useState<any>(null);
  const [editAdvanceAmount, setEditAdvanceAmount] = useState('');
  const [editAdvanceCreatorId, setEditAdvanceCreatorId] = useState('');
  const [advanceCreditToDelete, setAdvanceCreditToDelete] = useState<any>(null);
  const [editingBonusAdj, setEditingBonusAdj] = useState<any>(null);
  const [editBonusAdjAmount, setEditBonusAdjAmount] = useState('');
  const [editBonusAdjReason, setEditBonusAdjReason] = useState('');
  const [bonusAdjToDelete, setBonusAdjToDelete] = useState<any>(null);
  const [editingAttendance, setEditingAttendance] = useState<EditingAttendance | null>(null);
  const [attendanceToDelete, setAttendanceToDelete] = useState<string | null>(null);
  const [paidEntryToDelete, setPaidEntryToDelete] = useState<any>(null);
  const [debtDeductionAmount, setDebtDeductionAmount] = useState('');
  const [debtDeductionEnabled, setDebtDeductionEnabled] = useState(false);
  const [selectedDebtForDeduction, setSelectedDebtForDeduction] = useState<string>('');
  const [includeHolidayPay, setIncludeHolidayPay] = useState(false);
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

  // Check holidays in the current week for the holiday pay prompt
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 0 });
  const weekEndDate = addDays(weekStart, 6);
  const weekStartStr = format(weekStart, 'yyyy-MM-dd');
  const weekEndStr = format(weekEndDate, 'yyyy-MM-dd');

  const { data: weekHolidays = [] } = useQuery({
    queryKey: ['holidays-week', weekStartStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('holidays')
        .select('*')
        .gte('holiday_date', weekStartStr)
        .lte('holiday_date', weekEndStr);
      if (error) throw error;
      return data || [];
    },
  });

  const hasHolidayThisWeek = weekHolidays.length > 0;

  // Fetch profiles for "who paid" selector
  const { data: allProfiles = [] } = useQuery({
    queryKey: ['all-profiles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, full_name')
        .order('full_name');
      if (error) throw error;
      return data || [];
    },
  });

  // Calculate total owed (attendance + adjustments)
  const attendanceTotal = unpaidAttendance.reduce((sum, a) => sum + getEffectivePay(a), 0);
  const bonusTotal = unpaidAdjustments
    .filter((a) => a.adjustment_type === 'bonus' || a.adjustment_type === 'taxi')
    .reduce((sum, a) => sum + Number(a.amount), 0);
  const discountTotal = unpaidAdjustments
    .filter((a) => a.adjustment_type === 'discount')
    .reduce((sum, a) => sum + Number(a.amount), 0);
  // Non-credit discounts only (exclude advance/payment credits for bonus display)
  const realDiscountTotal = unpaidAdjustments
    .filter((a) => a.adjustment_type === 'discount' && !isWorkerPaymentCredit(a.reason))
    .reduce((sum, a) => sum + Number(a.amount), 0);
  const totalOwed = attendanceTotal + bonusTotal - discountTotal;
  // adjustmentNet should only reflect real bonuses/discounts, not payment credits
  const adjustmentNet = bonusTotal - realDiscountTotal;

  // Live payment plan — single source of truth used by both the worker-card
  // summary preview and createPayment so the dashboard amount always matches
  // what the admin sees on the card.
  const paymentPlan = useMemo(() => {
    const workshopNames: Record<string, string> = {};
    unpaidAttendance.forEach((e: any) => {
      if (e.workshop_id) workshopNames[e.workshop_id] = (e.workshops as any)?.name || workshopNames[e.workshop_id] || 'Unknown';
    });
    unpaidAdjustments.forEach((a: any) => {
      if (a.workshop_id) workshopNames[a.workshop_id] = (a.workshops as any)?.name || workshopNames[a.workshop_id] || 'Unknown';
    });
    return buildPaymentPlan({
      attendance: unpaidAttendance as any,
      adjustments: unpaidAdjustments as any,
      workshopNames,
      holidayPay: includeHolidayPay ? worker.hourly_rate : 0,
      debtDeduction: debtDeductionEnabled ? (parseFloat(debtDeductionAmount) || 0) : 0,
    });
  }, [unpaidAttendance, unpaidAdjustments, includeHolidayPay, debtDeductionEnabled, debtDeductionAmount, worker.hourly_rate]);

   // Unpaid overtime entries (description-based)
  const unpaidOvertimeEntries = unpaidAttendance.filter(
    (e) => e.description?.includes('Overtime')
  );
  const overtimeTotal = unpaidOvertimeEntries.reduce((sum, a) => sum + getEffectivePay(a), 0);

  // Group unpaid adjustments by workshop for bonus payment (exclude payment/advance credits)
  const unpaidAdjByWorkshop = useMemo(() => {
    const map: Record<string, { name: string; bonuses: number; discounts: number; items: typeof unpaidAdjustments }> = {};
    unpaidAdjustments.forEach((adj) => {
      // Skip payment/advance credit discounts - they belong to salary, not bonus
      const isCredit = isWorkerPaymentCredit(adj.reason);
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
      const plan = paymentPlan;
      const debtDeduction = plan.totals.debtDeduction;
      const workerNames: Record<string, string> = { [worker.id]: worker.name };
      const results: any[] = [];

      // Hard block: credits exceed earnings. Do not mark anything paid — would
      // either lose the advance or silently overpay later.
      if (plan.blocked) {
        throw new Error(t('workers.advancesExceedEarnings', { defaultValue: 'Advances exceed current earnings. Cannot settle salary — adjust the advance or wait for more attendance.' }));
      }

      // Refuse to silently mark adjustments paid when there is nothing to do.
      if (plan.workshops.length === 0 && plan.emptyWorkshops.length === 0) {
        throw new Error(t('workers.nothingToPay', { defaultValue: 'Nothing to pay.' }));
      }

      let fallbackPaymentId: string | null = null;

      // 1. Create one payment per workshop with positive paymentAmount.
      for (const wp of plan.workshops) {
        const wEntries = (unpaidAttendance as any[]).filter(e => e.workshop_id === wp.workshopId);
        const wAdj = (unpaidAdjustments as any[]).filter(a => a.workshop_id === wp.workshopId);
        const wBonusAndReal = wAdj.filter(a =>
          a.adjustment_type === 'bonus' ||
          a.adjustment_type === 'taxi' ||
          (a.adjustment_type === 'discount' && !isWorkerPaymentCredit(a.reason))
        );

        let reason = buildWorkerPaymentReason(wEntries, workerNames, wBonusAndReal);
        const notes: string[] = [];
        if (wp.holidayPay > 0) {
          notes.push(`${t('attendance.holidayIncluded')} · +${wp.holidayPay.toLocaleString('fr-FR')} CFA`);
        }
        if (wp.crossCreditApplied > 0 || wp.selfCredit > 0) {
          const totalCreditApplied = wp.crossCreditApplied + Math.min(wp.selfCredit, wp.attendance + wp.bonuses - wp.realDiscounts);
          if (totalCreditApplied > 0) {
            notes.push(`${t('workers.paymentCreditsApplied')} · −${totalCreditApplied.toLocaleString('fr-FR')} CFA`);
          }
        }
        if (wp.debtDeduction > 0) {
          notes.push(`${t('workers.debtRepaymentReason')} · −${wp.debtDeduction.toLocaleString('fr-FR')} CFA`);
        }
        if (notes.length) {
          reason += `\n──────────────\n` + notes.join('\n');
        }

        const { data: payment, error: paymentError } = await supabase
          .from('payments')
          .insert([{
            workshop_id: wp.workshopId,
            paid_to: 'Travailleur',
            reason,
            amount: wp.paymentAmount,
            payment_date: format(new Date(), 'yyyy-MM-dd'),
            created_by: user?.id,
            status: role === 'admin' ? 'approved' : 'pending',
          }])
          .select()
          .single();
        if (paymentError) throw paymentError;
        if (!fallbackPaymentId) fallbackPaymentId = payment.id;

        if (wp.entryIds.length > 0) {
          await supabase.from('attendance').update({ is_paid: true, payment_id: payment.id }).in('id', wp.entryIds);
        }
        if (wp.bonusIds.length > 0) {
          await supabase.from('worker_adjustments').update({ is_paid: true, payment_id: payment.id }).in('id', wp.bonusIds);
        }
        if (wp.realDiscountIds.length > 0) {
          await supabase.from('worker_adjustments').update({ is_paid: true, payment_id: payment.id }).in('id', wp.realDiscountIds);
        }

        results.push({ workshopId: wp.workshopId, paymentId: payment.id, amount: wp.paymentAmount });
      }

      // 2. Empty workshops (paymentAmount == 0): mark their attendance/bonus/real-discount
      //    rows as paid against the fallback payment so they don't reappear next pay.
      for (const wp of plan.emptyWorkshops) {
        if (wp.entryIds.length > 0) {
          await supabase.from('attendance').update({ is_paid: true, payment_id: fallbackPaymentId }).in('id', wp.entryIds);
        }
        if (wp.bonusIds.length > 0) {
          await supabase.from('worker_adjustments').update({ is_paid: true, payment_id: fallbackPaymentId }).in('id', wp.bonusIds);
        }
        if (wp.realDiscountIds.length > 0) {
          await supabase.from('worker_adjustments').update({ is_paid: true, payment_id: fallbackPaymentId }).in('id', wp.realDiscountIds);
        }
      }

      // 3. Reconcile credit adjustments (split partial consumption).
      for (const cc of plan.creditConsumption) {
        if (cc.consumed <= 0) continue; // not touched this round, keep as-is
        const original = (unpaidAdjustments as any[]).find(a => a.id === cc.creditId);
        if (!original) continue;

        if (cc.remaining <= 0) {
          // Fully consumed: mark paid, link to a payment row from this round.
          await supabase.from('worker_adjustments')
            .update({ is_paid: true, payment_id: fallbackPaymentId })
            .eq('id', cc.creditId);
        } else {
          // Partially consumed: shrink the original to the remaining unpaid amount,
          // and insert a new "paid" credit row recording the consumed portion.
          await supabase.from('worker_adjustments')
            .update({
              amount: cc.remaining,
              reason: rewriteCreditReasonAmount(original.reason, cc.remaining),
            })
            .eq('id', cc.creditId);

          await supabase.from('worker_adjustments').insert({
            worker_id: worker.id,
            workshop_id: cc.workshopId,
            work_date: original.work_date || format(new Date(), 'yyyy-MM-dd'),
            adjustment_type: 'discount',
            amount: cc.consumed,
            reason: rewriteCreditReasonAmount(original.reason, cc.consumed),
            is_paid: true,
            payment_id: fallbackPaymentId,
            created_by: user?.id,
          });
        }
      }

      // 4. Record debt repayment if deduction was applied
      if (debtDeduction > 0 && selectedDebtForDeduction) {
        const creatorProfile = allProfiles.find(p => p.user_id === user?.id);
        const creatorName = creatorProfile?.full_name || 'Unknown';
        // Record in debt_payments
        await supabase.from('debt_payments').insert({
          debt_id: selectedDebtForDeduction,
          amount: debtDeduction,
          payment_date: format(new Date(), 'yyyy-MM-dd'),
          description: `${t('workers.repaidBy', { defaultValue: 'Repaid by' })} ${creatorName} (${t('workers.deductedFromSalary', { defaultValue: 'deducted from salary' })})`,
          created_by: user?.id,
        });
        
        // Check if debt is fully paid
        const debt = workerDebts.find(d => d.id === selectedDebtForDeduction);
        if (debt) {
          const existingPaid = workerDebtPayments
            .filter(p => p.debt_id === selectedDebtForDeduction)
            .reduce((s, p) => s + Number(p.amount), 0);
          if (existingPaid + debtDeduction >= Number(debt.amount)) {
            await supabase.from('debts').update({ is_settled: true }).eq('id', selectedDebtForDeduction);
          }
        }
      }
      
      return results;
    },
    onSuccess: () => {
      invalidateAll();
      queryClient.invalidateQueries({ queryKey: ['worker-debts'] });
      queryClient.invalidateQueries({ queryKey: ['worker-debt-payments'] });
      setIsPayChoiceOpen(false);
      setPayMode(null);
      setDebtDeductionAmount('');
      setDebtDeductionEnabled(false);
      setSelectedDebtForDeduction('');
      setIncludeHolidayPay(false);
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
    const modeLabel = mode === 'partial' ? 'Partial Pay' : 'Advance Payment';
    const reason = `${modeLabel} credit: ${amount.toLocaleString('fr-FR')} CFA applied to balance. ${PAYMENT_CREDIT_TAG}`;

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

      const reason = `${worker.name} - Partial salary payment (${amount.toLocaleString('fr-FR')} CFA)`;
      const categoryLabel = 'Travailleur';

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
            status: role === 'admin' ? 'approved' : 'pending',
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

      const categoryLabel = 'Travailleur';
      const reason = `${worker.name} - Advance payment (${amount.toLocaleString('fr-FR')} CFA)`;

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
            status: role === 'admin' ? 'approved' : 'pending',
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

  // Pay bonus - direct payment with custom amount (like advance payment)
  const payBonus = useMutation({
    mutationFn: async () => {
      const amount = parseFloat(bonusAmount);
      if (!amount || amount <= 0 || !bonusWorkshopId) throw new Error('Invalid amount or workshop');

      const categoryLabel = 'Travailleur';
      const reasonText = bonusReason ? `${worker.name} - ${bonusReason}` : `${worker.name} - Bonus payment`;

      // 1. Create payment record
      const { data: payment, error: paymentError } = await supabase
        .from('payments')
        .insert([{
          workshop_id: bonusWorkshopId,
          paid_to: categoryLabel,
          reason: reasonText,
          amount,
          payment_date: format(new Date(), 'yyyy-MM-dd'),
          created_by: user?.id,
          status: role === 'admin' ? 'approved' : 'pending',
        }])
        .select()
        .single();
      if (paymentError) throw paymentError;

      // 2. Create a bonus adjustment that's already paid (so it shows in history)
      const { error: adjError } = await supabase.from('worker_adjustments').insert({
        worker_id: worker.id,
        workshop_id: bonusWorkshopId,
        work_date: format(new Date(), 'yyyy-MM-dd'),
        adjustment_type: 'bonus',
        amount,
        reason: bonusReason || 'Bonus payment',
        is_paid: true,
        payment_id: payment.id,
        created_by: user?.id,
      });
      if (adjError) {
        // Rollback payment if adjustment fails
        await supabase.from('payments').delete().eq('id', payment.id);
        throw adjError;
      }

      return payment;
    },
    onSuccess: () => {
      invalidateAll();
      setIsPayChoiceOpen(false);
      setPayMode(null);
      setBonusWorkshopId('');
      setBonusAmount('');
      setBonusReason('');
      toast({ title: t('workers.bonusPaymentCreated'), description: t('workers.bonusPaymentCreatedDesc') });
    },
    onError: (error: Error) => {
      toast({ title: t('errors.error'), description: error.message, variant: 'destructive' });
    },
  });

  // Pay overtime mutation - new flow with Sunday/Hours and paid now/add to salary
  const payOvertime = useMutation({
    mutationFn: async () => {
      if (!overtimeWorkshopId || !overtimeType) throw new Error('Missing fields');
      const amount = parseFloat(overtimeAmount);
      if (!amount || amount <= 0) throw new Error('Invalid amount');

      const categoryLabel = 'Travailleur';
      const hours = overtimeType === 'hours' ? parseFloat(overtimeHours) || 1 : 1;
      const typeLabel = overtimeType === 'sunday' ? t('workers.overtimeSunday', { defaultValue: 'Sunday work' }) : t('workers.overtimeHours', { defaultValue: 'Extra hours' }) + (hours > 1 ? ` (${hours}h)` : '');
      const reason = `${worker.name} - ${t('workers.payOvertime', { defaultValue: 'Overtime' })}: ${typeLabel}`;

      // For Sunday-type overtime, anchor the work_date to the previous Sunday (or today if Sunday).
      const today = new Date();
      const todayStr = format(today, 'yyyy-MM-dd');
      let workDateStr = todayStr;
      if (overtimeType === 'sunday') {
        const dow = today.getDay();
        const sunday = dow === 0 ? today : addDays(today, -dow);
        workDateStr = format(sunday, 'yyyy-MM-dd');
      }

      if (overtimePaidNow) {
        // Paid now: create payment + paid attendance entry
        const { data: payment, error: paymentError } = await supabase
          .from('payments')
          .insert([{
            workshop_id: overtimeWorkshopId,
            paid_to: categoryLabel,
            reason,
            amount,
            payment_date: todayStr,
            created_by: user?.id,
            status: role === 'admin' ? 'approved' : 'pending',
          }])
          .select()
          .single();
        if (paymentError) throw paymentError;

        // Create paid attendance record
        await supabase.from('attendance').insert({
          worker_id: worker.id,
          workshop_id: overtimeWorkshopId,
          work_date: workDateStr,
          hours_worked: 1,
          hourly_rate: amount,
          has_extra: false,
          extra_amount: 0,
          description: `${t('attendance.overtime')}: ${typeLabel}`,
          is_paid: true,
          payment_id: payment.id,
          created_by: user?.id,
        });

        return payment;
      } else {
        // Add to salary: create unpaid attendance entry
        await supabase.from('attendance').insert({
          worker_id: worker.id,
          workshop_id: overtimeWorkshopId,
          work_date: workDateStr,
          hours_worked: 1,
          hourly_rate: amount,
          has_extra: false,
          extra_amount: 0,
          description: `${t('attendance.overtime')}: ${typeLabel}`,
          is_paid: false,
          created_by: user?.id,
        });

        return null;
      }
    },
    onSuccess: () => {
      invalidateAll();
      setIsPayChoiceOpen(false);
      setPayMode(null);
      setOvertimeWorkshopId('');
      setOvertimeType(null);
      setOvertimeAmount('');
      setOvertimeHours('');
      setOvertimePaidNow(true);
      const msg = overtimePaidNow
        ? t('workers.overtimePaidNow', { defaultValue: 'Overtime payment created and sent to dashboard' })
        : t('workers.overtimeAddedToSalary', { defaultValue: 'Overtime added to salary to be paid later' });
      toast({ title: t('common.success'), description: msg });
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

  // Worker debts - separate from main debts page
  const WORKER_DEBT_TAG = '[WORKER_DEBT]';
  
  const { data: workerDebts = [] } = useQuery({
    queryKey: ['worker-debts', worker.name],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('debts')
        .select('*')
        .eq('person_name', worker.name)
        .eq('debt_type', 'they_owe')
        .ilike('description', `%${WORKER_DEBT_TAG}%`)
        .eq('is_settled', false)
        .neq('status', 'rejected')
        .order('debt_date', { ascending: false });
      if (error) throw error;
      return (data || []) as (typeof data extends (infer T)[] ? T & { status?: string } : never)[];
    },
  });

  const { data: workerDebtPayments = [] } = useQuery({
    queryKey: ['worker-debt-payments', workerDebts.map(d => d.id)],
    queryFn: async () => {
      if (workerDebts.length === 0) return [];
      const { data, error } = await supabase
        .from('debt_payments')
        .select('*')
        .in('debt_id', workerDebts.map(d => d.id))
        .order('payment_date', { ascending: false });
      if (error) throw error;

      // Fetch profiles to show who repaid
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, full_name');
      const profileMap = new Map(profiles?.map(p => [p.user_id, p.full_name]) || []);

      return (data || []).map(p => ({
        ...p,
        created_by_name: profileMap.get(p.created_by) || null,
      }));
    },
    enabled: workerDebts.length > 0,
  });

  // Calculate total remaining debt for this worker
  const totalRemainingDebt = useMemo(() => {
    return workerDebts
      .filter(d => (d as any).status === 'approved')
      .reduce((sum, debt) => {
        const paid = workerDebtPayments
          .filter(p => p.debt_id === debt.id)
          .reduce((s, p) => s + Number(p.amount), 0);
        return sum + Math.max(0, Number(debt.amount) - paid);
      }, 0);
  }, [workerDebts, workerDebtPayments]);

  const addWorkerDebt = useMutation({
    mutationFn: async () => {
      const amount = parseFloat(workerDebtAmount);
      if (!amount || amount <= 0 || !workerDebtWorkshopId) throw new Error('Invalid amount or workshop');
      
      const isAdmin = role === 'admin';
      
      // 1. Create debt record
      const { data: insertedDebt, error } = await supabase.from('debts').insert({
        person_name: worker.name,
        amount,
        debt_type: 'they_owe',
        debt_date: format(new Date(), 'yyyy-MM-dd'),
        description: `${workerDebtDescription || 'Worker debt'} ${WORKER_DEBT_TAG}`,
        created_by: user?.id,
        status: isAdmin ? 'approved' : 'pending',
      } as any).select().single();
      if (error) throw error;

      // 2. Deduct from placer's balance only when the debt is approved.
      //    Admins are auto-approved → deduct immediately.
      //    Regular users: deduction happens later when an admin approves the debt.
      if (isAdmin) {
        const { error: ppError } = await supabase.from('personal_payments').insert({
          user_id: user?.id,
          paid_to: worker.name,
          reason: `Worker debt - ${workerDebtDescription || 'Debt'} [WORKER_DEBT:${(insertedDebt as any)?.id}]`,
          amount,
          payment_date: format(new Date(), 'yyyy-MM-dd'),
          created_by: user?.id,
        });
        if (ppError) throw ppError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['worker-debts'] });
      queryClient.invalidateQueries({ queryKey: ['personal-payments'] });
      queryClient.invalidateQueries({ queryKey: ['user-global-balance'] });
      queryClient.invalidateQueries({ queryKey: ['team-members'] });
      setIsWorkerDebtFormOpen(false);
      setWorkerDebtAmount('');
      setWorkerDebtDescription('');
      setWorkerDebtWorkshopId('');
      toast({ title: t('workers.debtAdded'), description: t('workers.debtAddedDesc') });
    },
    onError: (error: Error) => {
      toast({ title: t('errors.error'), description: error.message, variant: 'destructive' });
    },
  });

  const repayWorkerDebt = useMutation({
    mutationFn: async () => {
      const amount = parseFloat(workerDebtRepayAmount);
      if (!amount || amount <= 0 || !workerDebtRepayId || !workerDebtRepayWorkshopId) throw new Error('Invalid data');

      // Validate amount doesn't exceed remaining debt
      const debt = workerDebts.find(d => d.id === workerDebtRepayId);
      if (debt) {
        const existingPayments = workerDebtPayments
          .filter(p => p.debt_id === workerDebtRepayId)
          .reduce((s, p) => s + Number(p.amount), 0);
        const remaining = Math.max(0, Number(debt.amount) - existingPayments);
        if (amount > remaining) throw new Error(t('workers.repayExceedsDebt', { defaultValue: 'Repayment amount exceeds remaining debt' }));
      }

      // Record the debt payment with user name and mode
      const creatorProfile = allProfiles.find(p => p.user_id === user?.id);
      const creatorName = creatorProfile?.full_name || 'Unknown';
      const modeNote = workerDebtRepayMode === 'salary'
        ? t('workers.deductedFromSalary', { defaultValue: 'deducted from salary' })
        : t('workers.paidSeparately', { defaultValue: 'paid separately' });
      await supabase.from('debt_payments').insert({
        debt_id: workerDebtRepayId,
        amount,
        payment_date: format(new Date(), 'yyyy-MM-dd'),
        description: `${t('workers.repaidBy', { defaultValue: 'Repaid by' })} ${creatorName} (${modeNote})`,
        created_by: user?.id,
      });

      if (workerDebtRepayMode === 'separate') {
        // Worker handed cash → credit the ORIGINAL DEBT PLACER's balance back
        // (whoever spent the money in the first place gets it back)
        const placerUserId = (debt as any)?.created_by || user?.id;
        await supabase.from('team_transfers').insert({
          user_id: placerUserId,
          amount,
          transfer_date: format(new Date(), 'yyyy-MM-dd'),
          description: `Debt repayment from ${worker.name} [DEBT_REPAYMENT]`,
          created_by: user?.id,
        });
      } else {
        // Deduct from worker's next salary → create a worker_adjustment (discount)
        await supabase.from('worker_adjustments').insert({
          worker_id: worker.id,
          workshop_id: workerDebtRepayWorkshopId,
          adjustment_type: 'discount',
          amount,
          work_date: format(new Date(), 'yyyy-MM-dd'),
          reason: `${t('workers.debtRepaymentReason', { defaultValue: 'Debt repayment' })} [DEBT_REPAYMENT]`,
          created_by: user?.id,
        });
      }

      // Check if debt is fully paid
      if (debt) {
        const existingPayments = workerDebtPayments
          .filter(p => p.debt_id === workerDebtRepayId)
          .reduce((s, p) => s + Number(p.amount), 0);
        if (existingPayments + amount >= Number(debt.amount)) {
          await supabase.from('debts').update({ is_settled: true }).eq('id', workerDebtRepayId);
        }
      }
    },
    onSuccess: () => {
      invalidateAll();
      queryClient.invalidateQueries({ queryKey: ['worker-debts'] });
      queryClient.invalidateQueries({ queryKey: ['worker-debt-payments'] });
      queryClient.invalidateQueries({ queryKey: ['user-global-balance'] });
      queryClient.invalidateQueries({ queryKey: ['team-members'] });
      queryClient.invalidateQueries({ queryKey: ['team-transfers'] });
      queryClient.invalidateQueries({ queryKey: ['worker-adjustments'] });
      setWorkerDebtRepayId(null);
      setWorkerDebtRepayAmount('');
      setWorkerDebtRepayWorkshopId('');
      setWorkerDebtRepayMode('separate');
      toast({
        title: t('workers.debtRepaymentCreated'),
        description: workerDebtRepayMode === 'salary'
          ? t('workers.debtRepaymentCreatedDescSalary', { defaultValue: 'The repayment will be deducted from the next salary payment' })
          : t('workers.debtRepaymentCreatedDescSeparate', { defaultValue: 'The repayment was recorded and your balance was credited back' })
      });
    },
    onError: (error: Error) => {
      toast({ title: t('errors.error'), description: error.message, variant: 'destructive' });
    },
  });

  const editWorkerDebt = useMutation({
    mutationFn: async () => {
      if (!editingWorkerDebt) return;
      const amount = parseFloat(editDebtAmount);
      if (!amount || amount <= 0) throw new Error('Invalid amount');
      await supabase.from('debts').update({
        amount,
        description: `${editDebtDescription || 'Worker debt'} ${WORKER_DEBT_TAG}`,
      }).eq('id', editingWorkerDebt.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['worker-debts'] });
      setEditingWorkerDebt(null);
      toast({ title: t('users.editDebt'), description: t('users.debtEditedDesc') });
    },
    onError: (error: Error) => toast({ title: t('errors.error'), description: error.message, variant: 'destructive' }),
  });

  const deleteWorkerDebt = useMutation({
    mutationFn: async (debt: any) => {
      // Delete associated debt payments first
      await supabase.from('debt_payments').delete().eq('debt_id', debt.id);
      // Delete associated worker adjustments with DEBT_REPAYMENT tag
      await supabase.from('worker_adjustments').delete().eq('worker_id', worker.id).ilike('reason', '%DEBT_REPAYMENT%');
      // Delete the debt
      await supabase.from('debts').delete().eq('id', debt.id);
    },
    onSuccess: () => {
      invalidateAll();
      queryClient.invalidateQueries({ queryKey: ['worker-debts'] });
      queryClient.invalidateQueries({ queryKey: ['worker-debt-payments'] });
      setWorkerDebtToDelete(null);
      toast({ title: t('users.deleteDebt'), description: t('users.debtDeletedDesc') });
    },
    onError: (error: Error) => toast({ title: t('errors.error'), description: error.message, variant: 'destructive' }),
  });

  // Edit advance/partial credit mutation
  const editAdvanceCredit = useMutation({
    mutationFn: async () => {
      if (!editingAdvanceCredit) return;
      const newAmount = parseFloat(editAdvanceAmount);
      if (!newAmount || newAmount <= 0) throw new Error('Invalid amount');
      
      const adjId = editingAdvanceCredit.id;
      const paymentId = editingAdvanceCredit.payment_id;
      const newCreatorId = editAdvanceCreatorId;
      
      // Update the worker_adjustments amount
      const adjReason = editingAdvanceCredit.reason || '';
      const newAdjReason = adjReason.replace(/\d[\d\s.,]*\sCFA/, `${newAmount.toLocaleString('fr-FR')} CFA`);
      await supabase.from('worker_adjustments').update({ amount: newAmount, reason: newAdjReason }).eq('id', adjId);
      
      if (paymentId) {
        const { data: currentPayment } = await supabase
          .from('payments')
          .select('*')
          .eq('id', paymentId)
          .single();
        
        if (currentPayment) {
          const oldCreatorId = currentPayment.created_by;
          const updatePayload: Record<string, any> = { amount: newAmount };
          const newPayReason = (currentPayment.reason || '').replace(/\d[\d\s.,]*\sCFA/, `${newAmount.toLocaleString('fr-FR')} CFA`);
          updatePayload.reason = newPayReason;
          
          if (newCreatorId && newCreatorId !== oldCreatorId) {
            updatePayload.created_by = newCreatorId;
            const { data: existingTransfer } = await supabase
              .from('user_transfers')
              .select('*')
              .eq('payment_id', paymentId)
              .maybeSingle();
            if (existingTransfer) {
              await supabase.from('user_transfers')
                .update({ user_id: newCreatorId, amount: newAmount })
                .eq('id', existingTransfer.id);
            }
          } else {
            const { data: existingTransfer } = await supabase
              .from('user_transfers')
              .select('id')
              .eq('payment_id', paymentId)
              .maybeSingle();
            if (existingTransfer) {
              await supabase.from('user_transfers')
                .update({ amount: newAmount })
                .eq('id', existingTransfer.id);
            }
          }
          
          await supabase.from('payments').update(updatePayload).eq('id', paymentId);
        }
      }
    },
    onSuccess: () => {
      invalidateAll();
      queryClient.invalidateQueries({ queryKey: ['all-worker-adjustments'] });
      queryClient.invalidateQueries({ queryKey: ['user-global-balance'] });
      queryClient.invalidateQueries({ queryKey: ['team-members'] });
      setEditingAdvanceCredit(null);
      toast({ title: t('workers.advanceCreditUpdated'), description: t('workers.advanceCreditUpdatedDesc') });
    },
    onError: (error: Error) => toast({ title: t('errors.error'), description: error.message, variant: 'destructive' }),
  });

  const deleteAdvanceCredit = useMutation({
    mutationFn: async (adj: any) => {
      const paymentId = adj.payment_id;
      await supabase.from('worker_adjustments').delete().eq('id', adj.id);
      if (paymentId) {
        await supabase.from('user_transfers').delete().eq('payment_id', paymentId);
        await supabase.from('payments').delete().eq('id', paymentId);
      }
    },
    onSuccess: () => {
      invalidateAll();
      queryClient.invalidateQueries({ queryKey: ['all-worker-adjustments'] });
      queryClient.invalidateQueries({ queryKey: ['user-global-balance'] });
      queryClient.invalidateQueries({ queryKey: ['team-members'] });
      setAdvanceCreditToDelete(null);
      toast({ title: t('workers.advanceCreditDeleted'), description: t('workers.advanceCreditDeletedDesc') });
    },
    onError: (error: Error) => toast({ title: t('errors.error'), description: error.message, variant: 'destructive' }),
  });

  // Edit bonus/taxi/discount adjustment mutation
  const editBonusAdjMutation = useMutation({
    mutationFn: async () => {
      if (!editingBonusAdj) return;
      const newAmount = parseFloat(editBonusAdjAmount);
      if (!newAmount || newAmount <= 0) throw new Error('Invalid amount');
      
      // Update the adjustment
      await supabase.from('worker_adjustments').update({
        amount: newAmount,
        reason: editBonusAdjReason || editingBonusAdj.reason,
      }).eq('id', editingBonusAdj.id);
      
      // If linked to a payment (paid bonus), sync the payment too
      if (editingBonusAdj.payment_id) {
        const { data: payment } = await supabase
          .from('payments')
          .select('*')
          .eq('id', editingBonusAdj.payment_id)
          .single();
        if (payment) {
          const newReason = editBonusAdjReason 
            ? `${worker.name} - ${editBonusAdjReason}`
            : payment.reason;
          await supabase.from('payments').update({
            amount: newAmount,
            reason: newReason,
          }).eq('id', editingBonusAdj.payment_id);
        }
      }
    },
    onSuccess: () => {
      invalidateAll();
      queryClient.invalidateQueries({ queryKey: ['all-worker-adjustments'] });
      queryClient.invalidateQueries({ queryKey: ['user-global-balance'] });
      queryClient.invalidateQueries({ queryKey: ['team-members'] });
      setEditingBonusAdj(null);
      toast({ title: t('workers.bonusUpdated'), description: t('workers.bonusUpdatedDesc') });
    },
    onError: (error: Error) => toast({ title: t('errors.error'), description: error.message, variant: 'destructive' }),
  });

  // Delete bonus/taxi/discount adjustment mutation
  const deleteBonusAdjMutation = useMutation({
    mutationFn: async (adj: any) => {
      const paymentId = adj.payment_id;
      await supabase.from('worker_adjustments').delete().eq('id', adj.id);
      // If linked to a payment (paid bonus), delete the payment too
      if (paymentId) {
        await supabase.from('user_transfers').delete().eq('payment_id', paymentId);
        await supabase.from('payments').delete().eq('id', paymentId);
      }
    },
    onSuccess: () => {
      invalidateAll();
      queryClient.invalidateQueries({ queryKey: ['all-worker-adjustments'] });
      queryClient.invalidateQueries({ queryKey: ['user-global-balance'] });
      queryClient.invalidateQueries({ queryKey: ['team-members'] });
      setBonusAdjToDelete(null);
      toast({ title: t('workers.bonusDeleted'), description: t('workers.bonusDeletedDesc') });
    },
    onError: (error: Error) => toast({ title: t('errors.error'), description: error.message, variant: 'destructive' }),
  });

  // ===== Day-grouped renderers (unpaid + history) =====
  type DayKey = string; // 'YYYY-MM-DD'

  const groupByDate = <T extends { work_date: string }>(items: T[]): Record<DayKey, T[]> => {
    const map: Record<DayKey, T[]> = {};
    for (const it of items) {
      const k = it.work_date;
      if (!map[k]) map[k] = [];
      map[k].push(it);
    }
    return map;
  };

  const parseLocalDate = (s: string) => {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
  };

  const renderAttendanceLine = (entry: any) => {
    const extraAmount = Number(entry.extra_amount) || 0;
    const hasExtra = Boolean(entry.has_extra && extraAmount > 0);
    const discountAmount = Number(entry.discount_amount) || 0;
    const hasDiscount = discountAmount > 0;
    const isOvertime = entry.description?.includes('Overtime');
    return (
      <div key={`att-${entry.id}`} className="flex items-start justify-between gap-2 text-xs py-1">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-medium">{t('workers.attendance', { defaultValue: 'Attendance' })}</span>
            {Number(entry.hours_worked) === 0.5 && (
              <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 text-warning border-warning">
                {t('attendance.halfDay', { defaultValue: '½ Day' })}
              </Badge>
            )}
            {isOvertime && (
              <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4 gap-0.5">
                <Clock className="w-2.5 h-2.5" />{t('attendance.overtimeShort', { defaultValue: 'OT' })}
              </Badge>
            )}
          </div>
          {isOvertime && entry.description && (
            <p className="text-[10px] text-muted-foreground line-clamp-1">{entry.description}</p>
          )}
          {hasExtra && (
            <p className="text-[10px] text-warning">
              + {extraAmount.toLocaleString('fr-FR')} {t('attendance.extra')}
              {entry.extra_reason ? ` — ${entry.extra_reason}` : ''}
            </p>
          )}
          {hasDiscount && (
            <p className="text-[10px] text-destructive">
              − {discountAmount.toLocaleString('fr-FR')} {t('attendance.discount', { defaultValue: 'Discount' })}
              {entry.discount_reason ? ` — ${entry.discount_reason}` : ''}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <span className="font-mono font-semibold text-sm">
            {Number(entry.daily_salary).toLocaleString('fr-FR')}
          </span>
          <Button variant="ghost" size="icon" onClick={() => handleEditAttendance(entry)} className="h-6 w-6">
            <Edit className="w-3 h-3" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setAttendanceToDelete(entry.id)} className="h-6 w-6 text-destructive hover:text-destructive">
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      </div>
    );
  };

  const renderAdjustmentLine = (adj: any, editable = true) => {
    const isCredit = adj.reason?.includes('[PAYMENT_CREDIT]') || adj.reason?.includes('[ADVANCE_CREDIT]');
    const isBonus = adj.adjustment_type === 'bonus' || adj.adjustment_type === 'taxi';
    const Icon = adj.adjustment_type === 'bonus' ? Sparkles : adj.adjustment_type === 'taxi' ? Clock : MinusCircle;
    const colorCls = isBonus ? 'text-success' : isCredit ? 'text-warning' : 'text-destructive';
    const label = isCredit
      ? t('workers.advance', { defaultValue: 'Advance' })
      : adj.adjustment_type === 'bonus'
        ? t('workers.bonus', { defaultValue: 'Bonus' })
        : adj.adjustment_type === 'taxi'
          ? t('adjustments.taxi', { defaultValue: 'Taxi' })
          : t('attendance.discount', { defaultValue: 'Discount' });
    const cleanReason = (adj.reason || '').replace(/\[PAYMENT_CREDIT\]|\[ADVANCE_CREDIT\]/g, '').trim();
    return (
      <div key={`adj-${adj.id}`} className="flex items-start justify-between gap-2 text-xs py-1">
        <div className="flex-1 min-w-0">
          <div className={cn('flex items-center gap-1 font-medium', colorCls)}>
            <Icon className="w-3 h-3" />
            <span>{label}</span>
          </div>
          {cleanReason && <p className="text-[10px] text-muted-foreground line-clamp-2">{cleanReason}</p>}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <span className={cn('font-mono font-semibold text-sm', colorCls)}>
            {isBonus ? '+' : '−'}{Number(adj.amount).toLocaleString('fr-FR')}
          </span>
          {editable && isCredit && adj.payment_id && (
            <>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={async (e) => {
                e.stopPropagation();
                const { data: payment } = await supabase
                  .from('payments').select('created_by, reason').eq('id', adj.payment_id).single();
                setEditingAdvanceCredit({ ...adj, _payment_created_by: payment?.created_by || '', _payment_reason: payment?.reason || '' });
                setEditAdvanceAmount(String(adj.amount));
                setEditAdvanceCreatorId(payment?.created_by || '');
              }}><Edit className="w-3 h-3" /></Button>
              <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive"
                onClick={(e) => { e.stopPropagation(); setAdvanceCreditToDelete(adj); }}>
                <Trash2 className="w-3 h-3" />
              </Button>
            </>
          )}
          {editable && !isCredit && (
            <>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => {
                e.stopPropagation();
                setEditingBonusAdj(adj);
                setEditBonusAdjAmount(String(adj.amount));
                setEditBonusAdjReason(adj.reason || '');
              }}><Edit className="w-3 h-3" /></Button>
              <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive"
                onClick={(e) => { e.stopPropagation(); setBonusAdjToDelete(adj); }}>
                <Trash2 className="w-3 h-3" />
              </Button>
            </>
          )}
        </div>
      </div>
    );
  };

  const renderUnpaidByDay = (workshopId: string, attendanceEntries: any[]) => {
    const adjustments = (unpaidAdjustments as any[]).filter(a => a.workshop_id === workshopId);
    const dates = new Set<string>([
      ...attendanceEntries.map((e: any) => e.work_date),
      ...adjustments.map((a: any) => a.work_date),
    ]);
    const sortedDates = Array.from(dates).sort((a, b) => b.localeCompare(a));
    if (sortedDates.length === 0) {
      return <p className="text-xs text-muted-foreground text-center py-2">{t('workers.noPendingPayments')}</p>;
    }
    return (
      <div className="divide-y">
        {sortedDates.map((date) => {
          const dayAtt = attendanceEntries.filter((e: any) => e.work_date === date);
          const dayAdj = adjustments.filter((a: any) => a.work_date === date);
          const dayTotal =
            dayAtt.reduce((s: number, e: any) => s + getEffectivePay(e), 0) +
            dayAdj.reduce((s: number, a: any) => {
              if (a.adjustment_type === 'bonus' || a.adjustment_type === 'taxi') return s + Number(a.amount);
              return s - Number(a.amount);
            }, 0);
          return (
            <div key={date} className="py-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold font-mono">
                  {format(parseLocalDate(date), 'EEE, dd/MM')}
                </span>
                <span className={cn('text-xs font-mono font-bold', dayTotal >= 0 ? 'text-foreground' : 'text-destructive')}>
                  {dayTotal >= 0 ? '' : '−'}{Math.abs(dayTotal).toLocaleString('fr-FR')} CFA
                </span>
              </div>
              <div className="ml-2 pl-2 border-l border-border/60 space-y-0.5">
                {dayAtt.map(renderAttendanceLine)}
                {dayAdj.map((a: any) => renderAdjustmentLine(a, true))}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // History: combined paid items by week → day
  type HistoryItem =
    | { kind: 'att'; date: string; workshopId: string; workshopName: string; entry: any }
    | { kind: 'adj'; date: string; workshopId: string; workshopName: string; entry: any };

  const historyItems = useMemo<HistoryItem[]>(() => {
    const items: HistoryItem[] = [];
    for (const e of filteredPaidAttendance as any[]) {
      items.push({ kind: 'att', date: e.work_date, workshopId: e.workshop_id, workshopName: (e.workshops as any)?.name || 'Unknown', entry: e });
    }
    for (const a of filteredPaidAdjustments as any[]) {
      items.push({ kind: 'adj', date: a.work_date, workshopId: a.workshop_id, workshopName: (a.workshops as any)?.name || 'Unknown', entry: a });
    }
    return items;
  }, [filteredPaidAttendance, filteredPaidAdjustments]);

  const historyByWeek = useMemo(() => {
    const groups: Record<string, { weekLabel: string; weekStart: Date; items: HistoryItem[] }> = {};
    for (const it of historyItems) {
      const d = parseLocalDate(it.date);
      const sunday = startOfWeek(d, { weekStartsOn: 0 });
      const key = format(sunday, 'yyyy-MM-dd');
      if (!groups[key]) {
        const saturday = addDays(sunday, 6);
        groups[key] = {
          weekStart: sunday,
          weekLabel: `${format(sunday, 'dd/MM')} – ${format(saturday, 'dd/MM/yyyy')}`,
          items: [],
        };
      }
      groups[key].items.push(it);
    }
    return Object.entries(groups)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([k, v]) => ({ key: k, ...v }));
  }, [historyItems]);

  const renderHistoryWeek = (items: HistoryItem[]) => {
    // group by workshop, then day
    const byWorkshop: Record<string, { name: string; items: HistoryItem[] }> = {};
    for (const it of items) {
      if (!byWorkshop[it.workshopId]) byWorkshop[it.workshopId] = { name: it.workshopName, items: [] };
      byWorkshop[it.workshopId].items.push(it);
    }
    return (
      <div className="space-y-3">
        {Object.entries(byWorkshop).map(([wid, { name, items: wItems }]) => {
          const dates = Array.from(new Set(wItems.map(i => i.date))).sort((a, b) => b.localeCompare(a));
          return (
            <div key={wid} className="rounded-md border bg-card/40">
              <div className="flex items-center justify-between px-2 py-1.5 border-b bg-muted/40">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Building2 className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                  <span className="text-xs font-medium truncate">{name}</span>
                </div>
              </div>
              <div className="divide-y px-2">
                {dates.map(date => {
                  const dayAtt = wItems.filter(i => i.kind === 'att' && i.date === date).map(i => i.entry);
                  const dayAdj = wItems.filter(i => i.kind === 'adj' && i.date === date).map(i => i.entry);
                  const dayTotal =
                    dayAtt.reduce((s: number, e: any) => s + Number(e.daily_salary || 0), 0) +
                    dayAdj.reduce((s: number, a: any) => {
                      if (a.adjustment_type === 'bonus' || a.adjustment_type === 'taxi') return s + Number(a.amount);
                      return s - Number(a.amount);
                    }, 0);
                  return (
                    <div key={date} className="py-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold font-mono">{format(parseLocalDate(date), 'EEE, dd/MM')}</span>
                        <span className="text-xs font-mono font-bold">{dayTotal.toLocaleString('fr-FR')} CFA</span>
                      </div>
                      <div className="ml-2 pl-2 border-l border-border/60 space-y-0.5">
                        {dayAtt.map((entry: any) => {
                          const isOvertime = entry.description?.includes('Overtime');
                          return (
                            <div key={entry.id} className="flex items-center justify-between gap-2 text-xs py-0.5">
                              <div className="flex items-center gap-1 min-w-0">
                                <span className="font-medium">{t('workers.attendance', { defaultValue: 'Attendance' })}</span>
                                {Number(entry.hours_worked) === 0.5 && (
                                  <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 text-warning border-warning">½</Badge>
                                )}
                                {isOvertime && (
                                  <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4 gap-0.5"><Clock className="w-2.5 h-2.5" />OT</Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-1 flex-shrink-0">
                                <span className="font-mono">{Number(entry.daily_salary).toLocaleString('fr-FR')}</span>
                                <Button variant="ghost" size="icon" onClick={() => deletePaidAttendance.mutate(entry)} className="h-5 w-5 text-destructive hover:text-destructive">
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                        {dayAdj.map((adj: any) => renderAdjustmentLine(adj, true))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
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

      {/* Payment Preview — mirrors the dashboard payment exactly */}
      <Card className="shadow-card">
        <CardContent className="p-3 md:p-4 space-y-2">
          {/* Stats grid */}
          <div className="grid grid-cols-4 gap-1.5">
            <div className="flex flex-col items-center justify-center rounded-md border bg-muted/30 p-1.5">
              <CalendarDays className="w-3.5 h-3.5 text-muted-foreground mb-0.5" />
              <span className="text-sm font-bold font-mono leading-none">{totalDays}</span>
              <span className="text-[9px] text-muted-foreground mt-0.5">{t('workers.workDays')}</span>
            </div>
            <div className="flex flex-col items-center justify-center rounded-md border bg-success/5 p-1.5">
              <TrendingUp className="w-3.5 h-3.5 text-success mb-0.5" />
              <span className="text-sm font-bold font-mono leading-none text-success">+{paymentPlan.totals.bonuses.toLocaleString('fr-FR')}</span>
              <span className="text-[9px] text-muted-foreground mt-0.5">{t('workers.bonuses', { defaultValue: 'Bonuses' })}</span>
            </div>
            <div className="flex flex-col items-center justify-center rounded-md border bg-destructive/5 p-1.5">
              <TrendingDown className="w-3.5 h-3.5 text-destructive mb-0.5" />
              <span className="text-sm font-bold font-mono leading-none text-destructive">−{paymentPlan.totals.realDiscounts.toLocaleString('fr-FR')}</span>
              <span className="text-[9px] text-muted-foreground mt-0.5">{t('workers.discounts', { defaultValue: 'Discounts' })}</span>
            </div>
            <div className="flex flex-col items-center justify-center rounded-md border bg-warning/5 p-1.5">
              <MinusCircle className="w-3.5 h-3.5 text-warning mb-0.5" />
              <span className="text-sm font-bold font-mono leading-none text-warning">−{paymentPlan.totals.credits.toLocaleString('fr-FR')}</span>
              <span className="text-[9px] text-muted-foreground mt-0.5">{t('workers.advance', { defaultValue: 'Advance' })}</span>
            </div>
          </div>
          {(paymentPlan.workshops.length + paymentPlan.emptyWorkshops.length) > 1 && (
            <div className="flex items-center justify-end text-[10px] text-muted-foreground">
              <Building2 className="w-3 h-3 mr-1" />
              {paymentPlan.workshops.length + paymentPlan.emptyWorkshops.length} {t('workers.sites', { defaultValue: 'sites' })}
            </div>
          )}

          <div className="space-y-0.5 text-xs">
            <div className="flex justify-between"><span className="text-muted-foreground">{t('workers.attendance', { defaultValue: 'Attendance' })}</span><span className="font-mono">+{paymentPlan.totals.attendance.toLocaleString('fr-FR')}</span></div>
            {paymentPlan.totals.bonuses > 0 && (
              <div className="flex justify-between text-success"><span>{t('workers.bonuses', { defaultValue: 'Bonuses' })}</span><span className="font-mono">+{paymentPlan.totals.bonuses.toLocaleString('fr-FR')}</span></div>
            )}
            {paymentPlan.totals.realDiscounts > 0 && (
              <div className="flex justify-between text-destructive"><span>{t('workers.discounts', { defaultValue: 'Discounts' })}</span><span className="font-mono">-{paymentPlan.totals.realDiscounts.toLocaleString('fr-FR')}</span></div>
            )}
            {paymentPlan.totals.credits > 0 && (
              <div className="flex justify-between text-warning">
                <span>{t('workers.advancesApplied', { defaultValue: 'Advances applied' })}</span>
                <span className="font-mono">-{paymentPlan.totals.creditsApplied.toLocaleString('fr-FR')}{paymentPlan.totals.creditsRemaining > 0 ? ` / -${paymentPlan.totals.credits.toLocaleString('fr-FR')}` : ''}</span>
              </div>
            )}
            {paymentPlan.totals.holidayPay > 0 && (
              <div className="flex justify-between text-primary"><span>{t('attendance.payHoliday')}</span><span className="font-mono">+{paymentPlan.totals.holidayPay.toLocaleString('fr-FR')}</span></div>
            )}
            {paymentPlan.totals.debtDeduction > 0 && (
              <div className="flex justify-between text-warning"><span>{t('workers.debtRepaymentDeduction')}</span><span className="font-mono">-{paymentPlan.totals.debtDeduction.toLocaleString('fr-FR')}</span></div>
            )}
          </div>

          <div className="border-t pt-2 flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">{t('workers.toBePaid', { defaultValue: 'To be paid' })}</span>
            <span className={cn('text-lg md:text-xl font-bold font-mono', paymentPlan.blocked ? 'text-destructive' : 'text-success')}>
              {paymentPlan.totals.toBePaid.toLocaleString('fr-FR')} CFA
            </span>
          </div>

          {paymentPlan.workshops.length > 1 && (
            <div className="flex flex-wrap gap-1 pt-1 border-t">
              {paymentPlan.workshops.map(wp => (
                <Badge key={wp.workshopId} variant="secondary" className="text-[10px] gap-1 font-mono">
                  <Building2 className="w-2.5 h-2.5" />
                  {wp.workshopName}: {wp.paymentAmount.toLocaleString('fr-FR')}
                </Badge>
              ))}
            </div>
          )}

          {paymentPlan.blocked && (
            <p className="text-[11px] text-destructive bg-destructive/10 border border-destructive/20 rounded px-2 py-1.5">
              {t('workers.advancesExceedEarnings', { defaultValue: 'Advances exceed current earnings. Cannot settle salary — adjust the advance or wait for more attendance.' })}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Single Pay Button */}
      <Button
        onClick={openPayChoiceDialog}
        disabled={paymentPlan.blocked && paymentPlan.totals.toBePaid <= 0}
        className="w-full bg-success text-success-foreground hover:bg-success/90 gap-2"
      >
        <Wallet className="w-4 h-4" />
        {t('workers.payWorker')} ({paymentPlan.totals.toBePaid.toLocaleString('fr-FR')} CFA)
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
                    {renderUnpaidByDay(workshopId, entries)}
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

              {historyByWeek.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground">
                    <p>{t('workers.noPaymentHistory')}</p>
                  </CardContent>
                </Card>
              ) : (
                <Accordion type="multiple" defaultValue={historyByWeek.slice(0, 1).map(w => w.key)} className="space-y-2">
                  {historyByWeek.map((week) => {
                    const weekAttTotal = week.items
                      .filter(i => i.kind === 'att')
                      .reduce((s, i) => s + Number((i.entry as any).daily_salary || 0), 0);
                    const weekAdjTotal = week.items
                      .filter(i => i.kind === 'adj')
                      .reduce((s, i) => {
                        const a: any = i.entry;
                        return a.adjustment_type === 'bonus' || a.adjustment_type === 'taxi'
                          ? s + Number(a.amount)
                          : s - Number(a.amount);
                      }, 0);
                    const weekTotal = weekAttTotal + weekAdjTotal;
                    const dayCount = new Set(week.items.map(i => i.date)).size;
                    return (
                      <AccordionItem key={week.key} value={week.key} className="border rounded-md bg-card shadow-card">
                        <AccordionTrigger className="px-3 py-2 hover:no-underline">
                          <div className="flex items-center justify-between w-full gap-2 pr-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <CalendarDays className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                              <div className="text-left min-w-0">
                                <p className="text-xs font-semibold font-mono truncate">{week.weekLabel}</p>
                                <p className="text-[10px] text-muted-foreground">
                                  {dayCount} {t('workers.daysShort', { defaultValue: 'd' })} · {week.items.length} {t('workers.itemsShort', { defaultValue: 'items' })}
                                </p>
                              </div>
                            </div>
                            <span className="text-sm font-mono font-bold flex-shrink-0">
                              {weekTotal.toLocaleString('fr-FR')} CFA
                            </span>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="px-3 pb-3">
                          {renderHistoryWeek(week.items)}
                        </AccordionContent>
                      </AccordionItem>
                    );
                  })}
                </Accordion>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Worker Debts Section */}
      <Card className="shadow-card">
        <CardHeader className="pb-2 px-3 pt-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <ArrowUpCircle className="w-4 h-4 text-destructive" />
              {t('workers.workerDebts')}
            </CardTitle>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1"
              onClick={() => {
                const firstWs = Object.keys(unpaidByWorkshop)[0] || (workshops.length > 0 ? workshops[0].id : '');
                setWorkerDebtWorkshopId(firstWs);
                setIsWorkerDebtFormOpen(true);
              }}
            >
              <DollarSign className="w-3 h-3" />
              {t('workers.addDebt')}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="px-3 pb-3">
          {workerDebts.length === 0 ? (
            <p className="text-center text-muted-foreground py-4 text-xs">
              {t('workers.noWorkerDebts')}
            </p>
          ) : (
            <div className="space-y-2">
              {workerDebts.map(debt => {
                const paid = workerDebtPayments
                  .filter(p => p.debt_id === debt.id)
                  .reduce((s, p) => s + Number(p.amount), 0);
                const remaining = Math.max(0, Number(debt.amount) - paid);
                const debtPaymentsForThis = workerDebtPayments.filter(p => p.debt_id === debt.id);
                return (
                  <div key={debt.id} className={cn("border rounded-lg p-2 space-y-2", (debt as any).status === 'pending' && "border-warning/40 bg-warning/5")}>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <p className="text-xs font-medium">
                            {debt.description?.replace(WORKER_DEBT_TAG, '').trim() || t('workers.workerDebt')}
                          </p>
                          {(debt as any).status === 'pending' && (
                            <Badge variant="outline" className="text-[9px] h-4 px-1 bg-warning/10 text-warning border-warning/20">
                              {t('payments.pending')}
                            </Badge>
                          )}
                        </div>
                        <p className="text-[10px] text-muted-foreground font-mono">
                          {format(new Date(debt.debt_date), 'dd/MM/yyyy')}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-mono font-bold text-destructive">
                          {remaining.toLocaleString('fr-FR')} CFA
                        </p>
                        <p className="text-[10px] text-muted-foreground font-mono">
                          {t('common.of')} {Number(debt.amount).toLocaleString('fr-FR')}
                        </p>
                      </div>
                    </div>
                    {/* Repayment history */}
                    {debtPaymentsForThis.length > 0 && (
                      <div className="space-y-1 border-t pt-1">
                        {debtPaymentsForThis.map(dp => (
                          <div key={dp.id} className="flex items-center justify-between text-[10px]">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="text-muted-foreground font-mono flex-shrink-0">
                                {format(new Date(dp.payment_date), 'dd/MM/yyyy')}
                              </span>
                              {(dp as any).created_by_name && (
                                <Badge variant="outline" className="text-[8px] h-3.5 px-1 flex-shrink-0">
                                  {(dp as any).created_by_name}
                                </Badge>
                              )}
                            </div>
                            <span className="text-success font-mono flex-shrink-0">
                              -{Number(dp.amount).toLocaleString('fr-FR')} CFA
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                    {/* Repay button - only for approved debts */}
                    {remaining > 0 && (debt as any).status === 'approved' && (
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 h-7 text-xs gap-1"
                          onClick={() => {
                            setWorkerDebtRepayId(debt.id);
                            setWorkerDebtRepayAmount('');
                            const firstWs = Object.keys(unpaidByWorkshop)[0] || (workshops.length > 0 ? workshops[0].id : '');
                            setWorkerDebtRepayWorkshopId(firstWs);
                          }}
                        >
                          <DollarSign className="w-3 h-3" />
                          {t('workers.repayDebt')}
                        </Button>
                        {role === 'admin' && (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0"
                              onClick={() => {
                                setEditingWorkerDebt(debt);
                                setEditDebtAmount(String(debt.amount));
                                setEditDebtDescription(debt.description?.replace(WORKER_DEBT_TAG, '').trim() || '');
                              }}
                            >
                              <Edit className="w-3 h-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                              onClick={() => setWorkerDebtToDelete(debt)}
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </>
                        )}
                      </div>
                    )}
                    {role === 'admin' && (remaining <= 0 || (debt as any).status !== 'approved') && (
                      <div className="flex gap-1 justify-end">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0"
                          onClick={() => {
                            setEditingWorkerDebt(debt);
                            setEditDebtAmount(String(debt.amount));
                            setEditDebtDescription(debt.description?.replace(WORKER_DEBT_TAG, '').trim() || '');
                          }}
                        >
                          <Edit className="w-3 h-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                          onClick={() => setWorkerDebtToDelete(debt)}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Worker Debt Dialog */}
      <Dialog open={isWorkerDebtFormOpen} onOpenChange={setIsWorkerDebtFormOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('workers.addDebt')}</DialogTitle>
            <DialogDescription>{t('workers.addDebtDesc', { name: worker.name })}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>{t('common.amount')} (CFA)</Label>
              <Input
                type="number"
                min="1"
                value={workerDebtAmount}
                onChange={(e) => setWorkerDebtAmount(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="space-y-2">
              <Label>{t('common.description')} ({t('common.optional')})</Label>
              <Input
                value={workerDebtDescription}
                onChange={(e) => setWorkerDebtDescription(e.target.value)}
                placeholder={t('workers.debtDescPlaceholder')}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('workers.selectWorkshop')}</Label>
              <Select value={workerDebtWorkshopId} onValueChange={setWorkerDebtWorkshopId}>
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsWorkerDebtFormOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={() => addWorkerDebt.mutate()}
              disabled={addWorkerDebt.isPending || !workerDebtAmount || parseFloat(workerDebtAmount) <= 0 || !workerDebtWorkshopId}
            >
              {addWorkerDebt.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {t('common.add')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Repay Worker Debt Dialog */}
      <Dialog open={!!workerDebtRepayId} onOpenChange={(open) => { if (!open) { setWorkerDebtRepayId(null); setWorkerDebtRepayMode('separate'); } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('workers.repayDebt')}</DialogTitle>
            <DialogDescription>{t('workers.repayDebtChooseMode', { defaultValue: 'How is the worker repaying this debt?' })}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {workerDebtRepayId && (() => {
              const debt = workerDebts.find(d => d.id === workerDebtRepayId);
              const paid = workerDebtPayments
                .filter(p => p.debt_id === workerDebtRepayId)
                .reduce((s, p) => s + Number(p.amount), 0);
              const remaining = debt ? Math.max(0, Number(debt.amount) - paid) : 0;
              return (
                <div className="text-xs p-2 rounded-lg bg-muted space-y-1">
                  <div className="flex justify-between">
                    <span>{t('debts.remaining')}:</span>
                    <span className="font-mono font-bold text-destructive">{remaining.toLocaleString('fr-FR')} CFA</span>
                  </div>
                </div>
              );
            })()}
            {/* Repayment mode selector */}
            <div className="space-y-2">
              <Label>{t('workers.repaymentMethod', { defaultValue: 'Repayment method' })}</Label>
              <RadioGroup
                value={workerDebtRepayMode}
                onValueChange={(v) => setWorkerDebtRepayMode(v as 'separate' | 'salary')}
                className="grid grid-cols-1 gap-2"
              >
                <label
                  htmlFor="repay-separate"
                  className={cn(
                    'flex items-start gap-2 p-2 rounded-lg border cursor-pointer transition-colors',
                    workerDebtRepayMode === 'separate' ? 'border-primary bg-primary/5' : 'border-border'
                  )}
                >
                  <RadioGroupItem id="repay-separate" value="separate" className="mt-0.5" />
                  <div className="flex-1">
                    <p className="text-xs font-medium">{t('workers.repayPaidSeparately', { defaultValue: 'Paid separately (cash)' })}</p>
                    <p className="text-[10px] text-muted-foreground">{t('workers.repayPaidSeparatelyDesc', { defaultValue: 'Worker handed cash. Your balance will be credited back.' })}</p>
                  </div>
                </label>
                <label
                  htmlFor="repay-salary"
                  className={cn(
                    'flex items-start gap-2 p-2 rounded-lg border cursor-pointer transition-colors',
                    workerDebtRepayMode === 'salary' ? 'border-primary bg-primary/5' : 'border-border'
                  )}
                >
                  <RadioGroupItem id="repay-salary" value="salary" className="mt-0.5" />
                  <div className="flex-1">
                    <p className="text-xs font-medium">{t('workers.repayDeductFromSalary', { defaultValue: 'Deduct from salary' })}</p>
                    <p className="text-[10px] text-muted-foreground">{t('workers.repayDeductFromSalaryDesc', { defaultValue: "Will be deducted from the worker's next salary payment." })}</p>
                  </div>
                </label>
              </RadioGroup>
            </div>

            <div className="space-y-2">
              <Label>{t('common.amount')} (CFA)</Label>
              <Input
                type="number"
                min="1"
                max={(() => {
                  const debt = workerDebts.find(d => d.id === workerDebtRepayId);
                  const paid = workerDebtPayments
                    .filter(p => p.debt_id === workerDebtRepayId)
                    .reduce((s, p) => s + Number(p.amount), 0);
                  return debt ? Math.max(0, Number(debt.amount) - paid) : undefined;
                })()}
                value={workerDebtRepayAmount}
                onChange={(e) => setWorkerDebtRepayAmount(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="space-y-2">
              <Label>{t('workers.selectWorkshop')}</Label>
              <Select value={workerDebtRepayWorkshopId} onValueChange={setWorkerDebtRepayWorkshopId}>
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWorkerDebtRepayId(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={() => repayWorkerDebt.mutate()}
              disabled={repayWorkerDebt.isPending || !workerDebtRepayAmount || parseFloat(workerDebtRepayAmount) <= 0 || !workerDebtRepayWorkshopId || (() => {
                const debt = workerDebts.find(d => d.id === workerDebtRepayId);
                const paid = workerDebtPayments
                  .filter(p => p.debt_id === workerDebtRepayId)
                  .reduce((s, p) => s + Number(p.amount), 0);
                const remaining = debt ? Math.max(0, Number(debt.amount) - paid) : 0;
                return parseFloat(workerDebtRepayAmount) > remaining;
              })()}
              className="bg-success text-success-foreground hover:bg-success/90"
            >
              {repayWorkerDebt.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {t('workers.confirmRepayment')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                disabled={paymentPlan.totals.toBePaid <= 0 || paymentPlan.blocked}
              >
                <Wallet className="w-5 h-5 text-success flex-shrink-0" />
                <div className="text-left">
                  <p className="font-medium text-sm">{t('workers.payFullSalary')}</p>
                  <p className="text-xs text-muted-foreground font-mono">{paymentPlan.totals.toBePaid.toLocaleString('fr-FR')} CFA</p>
                </div>
              </Button>

              {/* Pay Bonus */}
              <Button
                variant="outline"
                className="w-full justify-start gap-3 h-auto py-3"
                onClick={() => setPayMode('bonus')}
              >
                <Sparkles className="w-5 h-5 text-warning flex-shrink-0" />
                <div className="text-left">
                  <p className="font-medium text-sm">{t('workers.payBonusOnly')}</p>
                  <p className="text-xs text-muted-foreground">{t('workers.payBonusDesc', { defaultValue: 'Pay a custom bonus amount' })}</p>
                </div>
              </Button>

              {/* Pay Overtime */}
              <Button
                variant="outline"
                className="w-full justify-start gap-3 h-auto py-3"
                onClick={() => {
                  setPayMode('overtime');
                  setOvertimeType(null);
                  setOvertimeAmount(String(worker.hourly_rate));
                  setOvertimeHours('1');
                  setOvertimePaidNow(true);
                  const firstWs = Object.keys(unpaidByWorkshop)[0] || (workshops.length > 0 ? workshops[0].id : '');
                  setOvertimeWorkshopId(firstWs);
                }}
              >
                <Clock className="w-5 h-5 text-primary flex-shrink-0" />
                <div className="text-left">
                  <p className="font-medium text-sm">{t('workers.payOvertime', { defaultValue: 'Pay Overtime' })}</p>
                  <p className="text-xs text-muted-foreground">{t('workers.payOvertimeDesc', { defaultValue: 'Sunday work or extra hours' })}</p>
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

                {/* Holiday pay prompt */}
                {hasHolidayThisWeek && (
                  <div className="border border-primary/30 rounded-lg p-3 space-y-2 bg-primary/5">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="holidayPay"
                        checked={includeHolidayPay}
                        onChange={(e) => setIncludeHolidayPay(e.target.checked)}
                        className="rounded border-primary"
                      />
                      <label htmlFor="holidayPay" className="text-xs font-medium text-primary flex items-center gap-1.5">
                        <CalendarHeart className="w-3.5 h-3.5" />
                        {t('attendance.payHoliday')}
                      </label>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      {t('attendance.payHolidayDesc')} (+{worker.hourly_rate.toLocaleString('fr-FR')} CFA)
                    </p>
                  </div>
                )}


                {totalRemainingDebt > 0 && (
                  <div className="border border-warning/30 rounded-lg p-3 space-y-2 bg-warning/5">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="debtDeduction"
                        checked={debtDeductionEnabled}
                        onChange={(e) => {
                          setDebtDeductionEnabled(e.target.checked);
                          if (!e.target.checked) {
                            setDebtDeductionAmount('');
                            setSelectedDebtForDeduction('');
                          } else {
                            // Auto-select first approved debt
                            const firstDebt = workerDebts.find(d => (d as any).status === 'approved');
                            if (firstDebt) setSelectedDebtForDeduction(firstDebt.id);
                          }
                        }}
                        className="rounded border-warning"
                      />
                      <label htmlFor="debtDeduction" className="text-xs font-medium text-warning">
                        {t('workers.deductFromDebt')}
                      </label>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      {t('workers.deductFromDebtDesc', { amount: totalRemainingDebt.toLocaleString('fr-FR') })}
                    </p>
                    {debtDeductionEnabled && (
                      <div className="space-y-2">
                        {workerDebts.filter(d => (d as any).status === 'approved').length > 1 && (
                          <Select value={selectedDebtForDeduction} onValueChange={setSelectedDebtForDeduction}>
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder={t('workers.selectDebt')} />
                            </SelectTrigger>
                            <SelectContent>
                              {workerDebts.filter(d => (d as any).status === 'approved').map(debt => {
                                const paid = workerDebtPayments
                                  .filter(p => p.debt_id === debt.id)
                                  .reduce((s, p) => s + Number(p.amount), 0);
                                const remaining = Math.max(0, Number(debt.amount) - paid);
                                if (remaining <= 0) return null;
                                return (
                                  <SelectItem key={debt.id} value={debt.id}>
                                    {debt.description?.replace(WORKER_DEBT_TAG, '').trim() || t('workers.workerDebt')} ({remaining.toLocaleString('fr-FR')} CFA)
                                  </SelectItem>
                                );
                              })}
                            </SelectContent>
                          </Select>
                        )}
                        <Input
                          type="number"
                          min="1"
                          max={(() => {
                            const debt = workerDebts.find(d => d.id === selectedDebtForDeduction);
                            if (!debt) return totalRemainingDebt;
                            const paid = workerDebtPayments
                              .filter(p => p.debt_id === debt.id)
                              .reduce((s, p) => s + Number(p.amount), 0);
                            return Math.min(Math.max(0, Number(debt.amount) - paid), totalOwed);
                          })()}
                          value={debtDeductionAmount}
                          onChange={(e) => setDebtDeductionAmount(e.target.value)}
                          placeholder={t('workers.debtDeductionAmount')}
                          className="h-8 text-xs"
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Final total */}
                {(() => {
                  const deduction = debtDeductionEnabled ? (parseFloat(debtDeductionAmount) || 0) : 0;
                  const holiday = includeHolidayPay ? worker.hourly_rate : 0;
                  const finalAmount = totalOwed + holiday - deduction;
                  return (
                    <>
                      {deduction > 0 && (
                        <div className="flex items-center justify-between text-sm p-2 rounded-lg bg-warning/10 border border-warning/20">
                          <span className="text-warning font-medium">{t('workers.debtRepaymentDeduction')}</span>
                          <span className="font-mono font-medium text-warning">-{deduction.toLocaleString('fr-FR')} CFA</span>
                        </div>
                      )}
                      <div className="flex items-center justify-between text-base font-bold p-2 rounded-lg bg-success/10 border border-success/20">
                        <span>{t('common.total')}</span>
                        <span className="font-mono text-success">{finalAmount.toLocaleString('fr-FR')} CFA</span>
                      </div>
                    </>
                  );
                })()}
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsPayChoiceOpen(false)}>
                  {t('common.cancel')}
                </Button>
                <Button
                  onClick={() => createPayment.mutate()}
                  disabled={createPayment.isPending || (debtDeductionEnabled && (!debtDeductionAmount || parseFloat(debtDeductionAmount) <= 0 || !selectedDebtForDeduction))}
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
                  value={bonusAmount}
                  onChange={(e) => setBonusAmount(e.target.value)}
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <Label>{t('common.reason')} ({t('common.optional')})</Label>
                <Input
                  value={bonusReason}
                  onChange={(e) => setBonusReason(e.target.value)}
                  placeholder={t('workers.bonusReasonPlaceholder', { defaultValue: 'e.g. Good work, Extra effort...' })}
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsPayChoiceOpen(false)}>
                  {t('common.cancel')}
                </Button>
                <Button
                  onClick={() => payBonus.mutate()}
                  disabled={payBonus.isPending || !bonusAmount || parseFloat(bonusAmount) <= 0 || !bonusWorkshopId}
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

              {/* Step 1: Select type */}
              {!overtimeType && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">{t('workers.selectOvertimeType', { defaultValue: 'Select overtime type' })}</p>
                  <Button
                    variant="outline"
                    className="w-full justify-start gap-3 h-auto py-3"
                    onClick={() => {
                      setOvertimeType('sunday');
                      setOvertimeAmount(String(worker.hourly_rate));
                    }}
                  >
                    <Calendar className="w-5 h-5 text-primary flex-shrink-0" />
                    <div className="text-left">
                      <p className="font-medium text-sm">{t('workers.overtimeSunday', { defaultValue: 'Worked Sunday' })}</p>
                      <p className="text-xs text-muted-foreground font-mono">{worker.hourly_rate.toLocaleString('fr-FR')} CFA/{t('attendance.day')}</p>
                    </div>
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full justify-start gap-3 h-auto py-3"
                    onClick={() => {
                      setOvertimeType('hours');
                      setOvertimeAmount('');
                      setOvertimeHours('1');
                    }}
                  >
                    <Clock className="w-5 h-5 text-warning flex-shrink-0" />
                    <div className="text-left">
                      <p className="font-medium text-sm">{t('workers.overtimeHours', { defaultValue: 'Worked Extra Hours' })}</p>
                      <p className="text-xs text-muted-foreground">{t('workers.overtimeHoursDesc', { defaultValue: 'Enter custom amount' })}</p>
                    </div>
                  </Button>
                </div>
              )}

              {/* Step 2: Amount + Workshop + Payment option */}
              {overtimeType && (
                <div className="space-y-3">
                  <Button variant="ghost" size="sm" onClick={() => setOvertimeType(null)} className="gap-1 text-xs -mt-2">
                    <ArrowLeft className="w-3 h-3" /> {t('common.back')}
                  </Button>

                  <div className="space-y-2">
                    <Label>{t('workers.selectWorkshop')}</Label>
                    <Select value={overtimeWorkshopId} onValueChange={setOvertimeWorkshopId}>
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

                  {overtimeType === 'hours' && (
                    <div className="space-y-2">
                      <Label>{t('workers.numberOfHours', { defaultValue: 'Number of hours' })}</Label>
                      <Input
                        type="number"
                        min="1"
                        value={overtimeHours}
                        onChange={(e) => setOvertimeHours(e.target.value)}
                        placeholder="1"
                      />
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label>{t('common.amount')} (CFA)</Label>
                    <Input
                      type="number"
                      min="1"
                      value={overtimeAmount}
                      onChange={(e) => setOvertimeAmount(e.target.value)}
                      placeholder="0"
                    />
                    {overtimeType === 'sunday' && (
                      <p className="text-[10px] text-muted-foreground">
                        {t('workers.sundayRateNote', { defaultValue: 'Pre-filled with daily rate. You can edit.' })}
                      </p>
                    )}
                    {overtimeType === 'hours' && (
                      <p className="text-[10px] text-muted-foreground">
                        {t('workers.hoursAmountNote', { defaultValue: 'Total amount for the extra hours worked' })}
                      </p>
                    )}
                  </div>

                  {/* Paid now or add to salary */}
                  <div className="space-y-2">
                    <Label className="text-xs">{t('workers.overtimePaymentOption', { defaultValue: 'Payment option' })}</Label>
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        variant={overtimePaidNow ? 'default' : 'outline'}
                        size="sm"
                        className="h-auto py-2 text-xs"
                        onClick={() => setOvertimePaidNow(true)}
                      >
                        <DollarSign className="w-3.5 h-3.5 mr-1" />
                        {t('workers.paidNow', { defaultValue: 'Paid Now' })}
                      </Button>
                      <Button
                        variant={!overtimePaidNow ? 'default' : 'outline'}
                        size="sm"
                        className="h-auto py-2 text-xs"
                        onClick={() => setOvertimePaidNow(false)}
                      >
                        <Wallet className="w-3.5 h-3.5 mr-1" />
                        {t('workers.addToSalary', { defaultValue: 'Add to Salary' })}
                      </Button>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      {overtimePaidNow
                        ? t('workers.paidNowDesc', { defaultValue: 'Sent directly to payment dashboard without affecting salary' })
                        : t('workers.addToSalaryDesc', { defaultValue: 'Added to unpaid balance, paid with next salary' })
                      }
                    </p>
                  </div>

                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setIsPayChoiceOpen(false)}>
                      {t('common.cancel')}
                    </Button>
                    <Button
                      onClick={() => payOvertime.mutate()}
                      disabled={payOvertime.isPending || !overtimeWorkshopId || !overtimeAmount || parseFloat(overtimeAmount) <= 0}
                      className="bg-success text-success-foreground hover:bg-success/90"
                    >
                      {payOvertime.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      {t('workers.confirmPayment')}
                    </Button>
                  </DialogFooter>
                </div>
              )}
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

      {/* Delete Attendance Confirmation */}
      <AlertDialog open={!!attendanceToDelete} onOpenChange={(open) => !open && setAttendanceToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('confirmDelete.title')}</AlertDialogTitle>
            <AlertDialogDescription>{t('confirmDelete.attendance')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => attendanceToDelete && deleteAttendance.mutate(attendanceToDelete)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Paid Entry Confirmation */}
      <AlertDialog open={!!paidEntryToDelete} onOpenChange={(open) => !open && setPaidEntryToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('confirmDelete.title')}</AlertDialogTitle>
            <AlertDialogDescription>{t('confirmDelete.attendance')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => paidEntryToDelete && deletePaidAttendance.mutate(paidEntryToDelete)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* Edit Worker Debt Dialog */}
      <Dialog open={!!editingWorkerDebt} onOpenChange={(open) => !open && setEditingWorkerDebt(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('users.editDebt')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>{t('common.amount')} (CFA)</Label>
              <Input type="number" min="1" value={editDebtAmount} onChange={(e) => setEditDebtAmount(e.target.value)} placeholder="0" />
            </div>
            <div className="space-y-2">
              <Label>{t('common.description')} ({t('common.optional')})</Label>
              <Input value={editDebtDescription} onChange={(e) => setEditDebtDescription(e.target.value)} placeholder={t('workers.debtDescPlaceholder')} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingWorkerDebt(null)}>{t('common.cancel')}</Button>
            <Button onClick={() => editWorkerDebt.mutate()} disabled={editWorkerDebt.isPending || !editDebtAmount || parseFloat(editDebtAmount) <= 0}>
              {editWorkerDebt.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Worker Debt Confirmation */}
      <AlertDialog open={!!workerDebtToDelete} onOpenChange={(open) => !open && setWorkerDebtToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('confirmDelete.title')}</AlertDialogTitle>
            <AlertDialogDescription>{t('confirmDelete.debt')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => workerDebtToDelete && deleteWorkerDebt.mutate(workerDebtToDelete)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Advance Credit Dialog */}
      <Dialog open={!!editingAdvanceCredit} onOpenChange={(open) => !open && setEditingAdvanceCredit(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('workers.editAdvanceCredit')}</DialogTitle>
            <DialogDescription>{t('workers.editAdvanceCreditDesc')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>{t('common.amount')} (CFA)</Label>
              <Input
                type="number"
                min="1"
                value={editAdvanceAmount}
                onChange={(e) => setEditAdvanceAmount(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="space-y-2">
              <Label>{t('workers.whoPaid')}</Label>
              <Select value={editAdvanceCreatorId} onValueChange={setEditAdvanceCreatorId}>
                <SelectTrigger>
                  <SelectValue placeholder={t('workers.selectPayer')} />
                </SelectTrigger>
                <SelectContent>
                  {allProfiles.map((p) => (
                    <SelectItem key={p.user_id} value={p.user_id}>
                      {p.full_name || p.user_id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingAdvanceCredit(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={() => editAdvanceCredit.mutate()}
              disabled={editAdvanceCredit.isPending || !editAdvanceAmount || parseFloat(editAdvanceAmount) <= 0}
            >
              {editAdvanceCredit.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Advance Credit Confirmation */}
      <AlertDialog open={!!advanceCreditToDelete} onOpenChange={(open) => !open && setAdvanceCreditToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('confirmDelete.title')}</AlertDialogTitle>
            <AlertDialogDescription>{t('workers.deleteAdvanceCreditConfirm')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => advanceCreditToDelete && deleteAdvanceCredit.mutate(advanceCreditToDelete)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Bonus/Adjustment Dialog */}
      <Dialog open={!!editingBonusAdj} onOpenChange={(open) => !open && setEditingBonusAdj(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('workers.editBonus')}</DialogTitle>
            <DialogDescription>{t('workers.editBonusDesc')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>{t('common.amount')} (CFA)</Label>
              <Input
                type="number"
                min="1"
                value={editBonusAdjAmount}
                onChange={(e) => setEditBonusAdjAmount(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="space-y-2">
              <Label>{t('common.reason')} ({t('common.optional')})</Label>
              <Input
                value={editBonusAdjReason}
                onChange={(e) => setEditBonusAdjReason(e.target.value)}
                placeholder={t('workers.bonusReasonPlaceholder', { defaultValue: 'e.g. Good work, Extra effort...' })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingBonusAdj(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={() => editBonusAdjMutation.mutate()}
              disabled={editBonusAdjMutation.isPending || !editBonusAdjAmount || parseFloat(editBonusAdjAmount) <= 0}
            >
              {editBonusAdjMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Bonus/Adjustment Confirmation */}
      <AlertDialog open={!!bonusAdjToDelete} onOpenChange={(open) => !open && setBonusAdjToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('confirmDelete.title')}</AlertDialogTitle>
            <AlertDialogDescription>{t('workers.deleteBonusConfirm')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => bonusAdjToDelete && deleteBonusAdjMutation.mutate(bonusAdjToDelete)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
