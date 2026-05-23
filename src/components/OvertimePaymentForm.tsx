import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { format, startOfWeek, addDays } from 'date-fns';
import { Loader2, Clock, Building2, Users, Check, CalendarHeart } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Worker {
  id: string;
  name: string;
  hourly_rate: number;
}

interface WorkerOvertime {
  selected: boolean;
  amount: number;
}

export default function OvertimePaymentForm() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [selectedWorkshop, setSelectedWorkshop] = useState('');
  const [reason, setReason] = useState('');
  const [workerOvertime, setWorkerOvertime] = useState<Record<string, WorkerOvertime>>({});

  // Overtime always books onto the previous Sunday (or selected date if it's Sunday).
  const resolvedSunday = useMemo(() => {
    const [y, m, d] = selectedDate.split('-').map(Number);
    const local = new Date(y, (m || 1) - 1, d || 1);
    const dow = local.getDay();
    return dow === 0 ? local : addDays(local, -dow);
  }, [selectedDate]);
  const resolvedSundayStr = format(resolvedSunday, 'yyyy-MM-dd');

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

  // Fetch user role and assignments for workshop filtering
  const { data: userRole } = useQuery({
    queryKey: ['user-role-ot', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase.rpc('get_user_role', { _user_id: user.id });
      return data;
    },
    enabled: !!user?.id,
  });

  const { data: userAssignments = [] } = useQuery({
    queryKey: ['user-workshop-assignments-ot', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from('workshop_assignments')
        .select('workshop_id')
        .eq('user_id', user.id);
      if (error) throw error;
      return data?.map(a => a.workshop_id) || [];
    },
    enabled: !!user?.id,
  });

  const isAdmin = userRole === 'admin';
  const userWorkshopSet = useMemo(() => new Set(userAssignments), [userAssignments]);

  // Check if selected date is a holiday
  const { data: isHoliday = false } = useQuery({
    queryKey: ['holiday-check', selectedDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('holidays')
        .select('id')
        .eq('holiday_date', selectedDate)
        .maybeSingle();
      if (error) throw error;
      return !!data;
    },
  });

  const toggleWorker = (workerId: string) => {
    setWorkerOvertime(prev => {
      const worker = workers.find(w => w.id === workerId);
      const existing = prev[workerId];
      if (existing?.selected) {
        const next = { ...prev };
        delete next[workerId];
        return next;
      }
      return {
        ...prev,
        [workerId]: {
          selected: true,
          amount: worker?.hourly_rate || 0,
        },
      };
    });
  };

  const updateWorkerAmount = (workerId: string, amount: number) => {
    setWorkerOvertime(prev => ({
      ...prev,
      [workerId]: { ...prev[workerId], amount },
    }));
  };

  const selectAllWorkers = () => {
    const anySelected = Object.values(workerOvertime).some(v => v.selected);
    if (anySelected && Object.keys(workerOvertime).length === workers.length) {
      setWorkerOvertime({});
    } else {
      const all: Record<string, WorkerOvertime> = {};
      workers.forEach(w => {
        all[w.id] = { selected: true, amount: w.hourly_rate };
      });
      setWorkerOvertime(all);
    }
  };

  const selectedWorkers = useMemo(() => 
    Object.entries(workerOvertime).filter(([, v]) => v.selected),
    [workerOvertime]
  );

  const totalAmount = useMemo(() => 
    selectedWorkers.reduce((sum, [, v]) => sum + (v.amount || 0), 0),
    [selectedWorkers]
  );

  const createOvertimeEntries = useMutation({
    mutationFn: async () => {
      if (!selectedWorkshop || selectedWorkers.length === 0 || !reason) {
        throw new Error(t('errors.fillAllFields', { defaultValue: 'Please fill all fields' }));
      }

      // Overtime represents Sunday work — anchor work_date to the previous Sunday
      // (or the selected date itself if it is already a Sunday).
      const [y, m, d] = selectedDate.split('-').map(Number);
      const localDate = new Date(y, (m || 1) - 1, d || 1);
      const dow = localDate.getDay();
      const sundayDate = dow === 0 ? localDate : addDays(localDate, -dow);
      const sundayStr = format(sundayDate, 'yyyy-MM-dd');

      const entries = selectedWorkers.map(([workerId, data]) => {
        const worker = workers.find(w => w.id === workerId);
        return {
          worker_id: workerId,
          workshop_id: selectedWorkshop,
          work_date: sundayStr,
          hours_worked: 1,
          hourly_rate: data.amount, // Use the overtime amount as hourly_rate to satisfy CHECK > 0
          has_extra: false,
          extra_amount: 0,
          description: `${t('attendance.overtime')}: ${reason}${isHoliday ? ` [${t('attendance.holidayIncluded')}]` : ''}`,
          is_paid: false,
          created_by: user?.id,
        };
      });

      const { error } = await supabase.from('attendance').insert(entries);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendance'] });
      queryClient.invalidateQueries({ queryKey: ['worker-unpaid-attendance'] });
      queryClient.invalidateQueries({ queryKey: ['all-unpaid-attendance'] });
      
      setWorkerOvertime({});
      setReason('');
      
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
          {t('attendance.overtimePaymentDescNew', { defaultValue: 'Record overtime per worker. Each worker gets an individual entry.' })}
        </CardDescription>
      </CardHeader>

      <CardContent className="px-3 md:px-6 pb-3 md:pb-6 space-y-4">
        {/* Date and Workshop */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
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
                {workshops
                  .filter(w => isAdmin || userWorkshopSet.has(w.id))
                  .map((w) => (
                    <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Holiday indicator */}
        {isHoliday && (
          <div className="flex items-center gap-2 p-2 bg-primary/10 border border-primary/20 rounded-lg">
            <CalendarHeart className="w-4 h-4 text-primary" />
            <span className="text-xs font-medium text-primary">
              {t('attendance.dateIsHoliday', { defaultValue: 'This date is marked as a holiday' })}
            </span>
          </div>
        )}

        {resolvedSundayStr !== selectedDate && (
          <div className="text-[11px] text-muted-foreground bg-muted/40 border border-border/60 rounded-md px-2 py-1.5">
            {t('attendance.overtimeBookedOnSunday', {
              defaultValue: 'Will be recorded on Sunday {{date}}',
              date: format(resolvedSunday, 'EEE, dd/MM/yyyy'),
            })}
          </div>
        )}

        {/* Reason */}
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">
            {t('attendance.overtimeReason')}
          </Label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t('attendance.overtimeReasonPlaceholder')}
            className="min-h-[50px] text-sm"
          />
        </div>

        {/* Workers Selection with individual amounts */}
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
              {selectedWorkers.length === workers.length ? t('common.deselectAll') : t('common.selectAll')}
            </Button>
          </div>

          {workers.length === 0 ? (
            <p className="text-center text-muted-foreground py-4 text-sm">
              {t('workers.noWorkers')}
            </p>
          ) : (
            <div className="space-y-1.5 max-h-[280px] overflow-y-auto">
              {workers.map((worker) => {
                const overtime = workerOvertime[worker.id];
                const isSelected = overtime?.selected || false;
                return (
                  <div
                    key={worker.id}
                    className={cn(
                      "border rounded-md p-2 transition-colors",
                      isSelected && "border-primary bg-primary/5"
                    )}
                  >
                    <div
                      className="flex items-center gap-2 cursor-pointer"
                      onClick={() => toggleWorker(worker.id)}
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleWorker(worker.id)}
                      />
                      <span className="text-sm flex-1 truncate">{worker.name}</span>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {worker.hourly_rate.toLocaleString('fr-FR')} CFA/{t('attendance.day')}
                      </span>
                    </div>
                    {isSelected && (
                      <div className="mt-2 flex items-center gap-2">
                        <Label className="text-[10px] whitespace-nowrap">{t('common.amount')}:</Label>
                        <Input
                          type="number"
                          value={overtime.amount || ''}
                          onChange={(e) => updateWorkerAmount(worker.id, Number(e.target.value))}
                          className="h-7 text-xs font-mono flex-1"
                          onClick={(e) => e.stopPropagation()}
                        />
                        <span className="text-[10px] text-muted-foreground">CFA</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Summary */}
        {selectedWorkers.length > 0 && reason && selectedWorkshop && (
          <div className="p-3 bg-success/10 border border-success/20 rounded-lg space-y-1">
            <p className="text-xs font-medium text-success">
              {t('attendance.overtimeSummary')}
            </p>
            <p className="text-xs text-muted-foreground">
              {selectedWorkers.length} {t('attendance.workersSelected')} · {totalAmount.toLocaleString('fr-FR')} CFA {t('common.total')}
            </p>
          </div>
        )}

        {/* Submit */}
        <Button
          onClick={() => createOvertimeEntries.mutate()}
          disabled={
            createOvertimeEntries.isPending ||
            !selectedWorkshop ||
            selectedWorkers.length === 0 ||
            !reason ||
            totalAmount <= 0
          }
          className="w-full gap-2"
        >
          {createOvertimeEntries.isPending ? (
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
