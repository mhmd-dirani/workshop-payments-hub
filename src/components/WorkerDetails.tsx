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
  CalendarHeart
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
  const [overtimePaidNow, setOvertimePaidNow] = useState(true);
  const [isWorkerDebtFormOpen, setIsWorkerDebtFormOpen] = useState(false);
  const [workerDebtAmount, setWorkerDebtAmount] = useState('');
  const [workerDebtDescription, setWorkerDebtDescription] = useState('');
  const [workerDebtWorkshopId, setWorkerDebtWorkshopId] = useState('');
  const [workerDebtRepayId, setWorkerDebtRepayId] = useState<string | null>(null);
  const [workerDebtRepayAmount, setWorkerDebtRepayAmount] = useState('');
  const [workerDebtRepayWorkshopId, setWorkerDebtRepayWorkshopId] = useState('');
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
      const debtDeduction = debtDeductionEnabled ? (parseFloat(debtDeductionAmount) || 0) : 0;
      const holidayPay = includeHolidayPay ? worker.hourly_rate : 0;
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
      
      // Collect all workshop IDs that have attendance or adjustments
      const allWorkshopIds = new Set([...Object.keys(byWorkshop), ...Object.keys(adjByWorkshop)]);
      
      // Distribute debt deduction proportionally across workshops
      let remainingDeduction = debtDeduction;
      const workshopTotals: Record<string, number> = {};
      for (const workshopId of allWorkshopIds) {
        const workshopData = byWorkshop[workshopId] || { entries: [], total: 0 };
        const workshopAdj = adjByWorkshop[workshopId] || [];
        const bonusAdj = workshopAdj.filter(a => a.adjustment_type === 'bonus' || a.adjustment_type === 'taxi');
        const discountAdj = workshopAdj.filter(a => a.adjustment_type === 'discount');
        const adjBonuses = bonusAdj.reduce((s, a) => s + Number(a.amount), 0);
        const adjDiscounts = discountAdj.reduce((s, a) => s + Number(a.amount), 0);
        workshopTotals[workshopId] = workshopData.total + adjBonuses - adjDiscounts;
      }
      const grandTotalBeforeDeduction = Object.values(workshopTotals).reduce((s, v) => s + Math.max(v, 0), 0);
      
      for (const workshopId of allWorkshopIds) {
        const workshopData = byWorkshop[workshopId] || { entries: [], total: 0 };
        const { entries, total } = workshopData;
        
        const workshopAdj = adjByWorkshop[workshopId] || [];
        const bonusAdj = workshopAdj.filter(a => a.adjustment_type === 'bonus' || a.adjustment_type === 'taxi');
        const discountAdj = workshopAdj.filter(a => a.adjustment_type === 'discount');
        const adjBonuses = bonusAdj.reduce((s, a) => s + Number(a.amount), 0);
        const adjDiscounts = discountAdj.reduce((s, a) => s + Number(a.amount), 0);
        let finalTotal = total + adjBonuses - adjDiscounts;
        
        // Debt deduction is just a note - salary amount remains unchanged
        let workshopDeduction = 0;
        
        if (finalTotal <= 0 && entries.length === 0 && workshopAdj.length === 0) continue;
        
        let reason = buildWorkerPaymentReason(entries, workerNames, workshopAdj);
        
        // Add holiday pay to the first workshop
        if (holidayPay > 0 && workshopId === Array.from(allWorkshopIds)[0]) {
          finalTotal += holidayPay;
          reason += `\n[${t('attendance.holidayIncluded')}: +${holidayPay.toLocaleString('fr-FR')} CFA]`;
        }
        if (debtDeduction > 0 && finalTotal > 0 && grandTotalBeforeDeduction > 0) {
          // Calculate proportional note amount but DON'T deduct from finalTotal
          workshopDeduction = Math.min(
            remainingDeduction,
            Math.round((finalTotal / grandTotalBeforeDeduction) * debtDeduction)
          );
          remainingDeduction -= workshopDeduction;
          reason += `\n[${t('workers.debtRepaymentReason')}: ${workshopDeduction.toLocaleString('fr-FR')} CFA]`;
        }
        
        const categoryLabel = 'Travailleur';

        const { data: payment, error: paymentError } = await supabase
          .from('payments')
          .insert([{
            workshop_id: workshopId,
            paid_to: categoryLabel,
            reason,
            amount: Math.max(finalTotal, 0),
            payment_date: format(new Date(), 'yyyy-MM-dd'),
            created_by: user?.id,
            status: role === 'admin' ? 'approved' : 'pending',
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
      
      // Record debt repayment if deduction was applied
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
      const typeLabel = overtimeType === 'sunday' ? t('workers.overtimeSunday', { defaultValue: 'Sunday work' }) : t('workers.overtimeHours', { defaultValue: 'Extra hours' });
      const reason = `${worker.name} - ${t('workers.payOvertime', { defaultValue: 'Overtime' })}: ${typeLabel}`;

      if (overtimePaidNow) {
        // Paid now: create payment + paid attendance entry
        const { data: payment, error: paymentError } = await supabase
          .from('payments')
          .insert([{
            workshop_id: overtimeWorkshopId,
            paid_to: categoryLabel,
            reason,
            amount,
            payment_date: format(new Date(), 'yyyy-MM-dd'),
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
          work_date: format(new Date(), 'yyyy-MM-dd'),
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
          work_date: format(new Date(), 'yyyy-MM-dd'),
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
      const { error } = await supabase.from('debts').insert({
        person_name: worker.name,
        amount,
        debt_type: 'they_owe',
        debt_date: format(new Date(), 'yyyy-MM-dd'),
        description: `${workerDebtDescription || 'Worker debt'} ${WORKER_DEBT_TAG}`,
        created_by: user?.id,
        status: isAdmin ? 'approved' : 'pending',
      } as any);
      if (error) throw error;

      // 2. Deduct from placer's balance via personal_payments (NOT dashboard payments)
      const { error: ppError } = await supabase.from('personal_payments').insert({
        user_id: user?.id,
        paid_to: worker.name,
        reason: `Worker debt - ${workerDebtDescription || 'Debt'} [WORKER_DEBT]`,
        amount,
        payment_date: format(new Date(), 'yyyy-MM-dd'),
        created_by: user?.id,
      });
      if (ppError) throw ppError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['worker-debts'] });
      queryClient.invalidateQueries({ queryKey: ['personal-payments'] });
      queryClient.invalidateQueries({ queryKey: ['user-global-balance'] });
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

      // Record the debt payment with user name
      const creatorProfile = allProfiles.find(p => p.user_id === user?.id);
      const creatorName = creatorProfile?.full_name || 'Unknown';
      await supabase.from('debt_payments').insert({
        debt_id: workerDebtRepayId,
        amount,
        payment_date: format(new Date(), 'yyyy-MM-dd'),
        description: `${t('workers.repaidBy', { defaultValue: 'Repaid by' })} ${creatorName}`,
        created_by: user?.id,
      });

      // Increase the repayer's balance via team_transfers (money returned)
      await supabase.from('team_transfers').insert({
        user_id: user?.id,
        amount,
        transfer_date: format(new Date(), 'yyyy-MM-dd'),
        description: `Debt repayment from ${worker.name} [DEBT_REPAYMENT]`,
        created_by: user?.id,
      });

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
      queryClient.invalidateQueries({ queryKey: ['team-transfers'] });
      setWorkerDebtRepayId(null);
      setWorkerDebtRepayAmount('');
      setWorkerDebtRepayWorkshopId('');
      toast({ title: t('workers.debtRepaymentCreated'), description: t('workers.debtRepaymentCreatedDesc') });
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
      setBonusAdjToDelete(null);
      toast({ title: t('workers.bonusDeleted'), description: t('workers.bonusDeletedDesc') });
    },
    onError: (error: Error) => toast({ title: t('errors.error'), description: error.message, variant: 'destructive' }),
  });

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
                            <div className="flex items-center gap-1">
                              <Badge variant={adj.adjustment_type === 'discount' ? 'destructive' : 'secondary'} className="gap-1 font-mono text-xs">
                                {adj.adjustment_type === 'discount' ? '-' : '+'}{Number(adj.amount).toLocaleString('fr-FR')}
                              </Badge>
                              {/* Edit/Delete for advance/partial credits */}
                              {(adj.reason?.includes('[PAYMENT_CREDIT]') || adj.reason?.includes('[ADVANCE_CREDIT]')) && adj.payment_id && (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6"
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      const { data: payment } = await supabase
                                        .from('payments')
                                        .select('created_by, reason')
                                        .eq('id', adj.payment_id)
                                        .single();
                                      setEditingAdvanceCredit({
                                        ...adj,
                                        _payment_created_by: payment?.created_by || '',
                                        _payment_reason: payment?.reason || '',
                                      });
                                      setEditAdvanceAmount(String(adj.amount));
                                      setEditAdvanceCreatorId(payment?.created_by || '');
                                    }}
                                  >
                                    <Edit className="w-3 h-3" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 text-destructive hover:text-destructive"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setAdvanceCreditToDelete(adj);
                                    }}
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </Button>
                                </>
                              )}
                              {/* Edit/Delete for bonus/taxi/discount adjustments (non-credit) */}
                              {!(adj.reason?.includes('[PAYMENT_CREDIT]') || adj.reason?.includes('[ADVANCE_CREDIT]')) && (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingBonusAdj(adj);
                                      setEditBonusAdjAmount(String(adj.amount));
                                      setEditBonusAdjReason(adj.reason || '');
                                    }}
                                  >
                                    <Edit className="w-3 h-3" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 text-destructive hover:text-destructive"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setBonusAdjToDelete(adj);
                                    }}
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </Button>
                                </>
                              )}
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
                            {adj.adjustment_type === 'bonus' || adj.adjustment_type === 'taxi' ? (
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
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingBonusAdj(adj);
                                setEditBonusAdjAmount(String(adj.amount));
                                setEditBonusAdjReason(adj.reason || '');
                              }}
                            >
                              <Edit className="w-3 h-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-destructive hover:text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                setBonusAdjToDelete(adj);
                              }}
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
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
                        const isOvertime = entry.description?.includes('Overtime');
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
                            const isOvertime = entry.description?.includes('Overtime');
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
      <Dialog open={!!workerDebtRepayId} onOpenChange={(open) => !open && setWorkerDebtRepayId(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('workers.repayDebt')}</DialogTitle>
            <DialogDescription>{t('workers.repayDebtDesc')}</DialogDescription>
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
            <p className="text-[10px] text-muted-foreground">
              {t('workers.repayDebtNote')}
            </p>
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
                disabled={totalOwed <= 0}
              >
                <Wallet className="w-5 h-5 text-success flex-shrink-0" />
                <div className="text-left">
                  <p className="font-medium text-sm">{t('workers.payFullSalary')}</p>
                  <p className="text-xs text-muted-foreground font-mono">{totalOwed.toLocaleString('fr-FR')} CFA</p>
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
