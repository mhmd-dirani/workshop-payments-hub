import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { Loader2, Calendar, Building2, Users } from 'lucide-react';
import WorkerAttendanceCard from './WorkerAttendanceCard';

interface Worker {
  id: string;
  name: string;
  hourly_rate: number;
}

interface DailyAttendanceSummaryRow {
  worker_id: string;
  total_hours: number | string;
  hidden_hours: number | string;
  visible_entries: Array<{
    workshop_id: string;
    hours_worked: number | string;
  }> | null;
}

export default function QuickAttendanceForm() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [selectedWorkshop, setSelectedWorkshop] = useState('');
  const [savedWorkers, setSavedWorkers] = useState<Set<string>>(new Set());

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

  // Fetch user's workshop assignments
  const { data: userAssignments = [] } = useQuery({
    queryKey: ['user-workshop-assignments', user?.id],
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

  // Check if user is admin (admins see all workshop names)
  const { data: userRole } = useQuery({
    queryKey: ['user-role-check', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase.rpc('get_user_role', { _user_id: user.id });
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  const isAdmin = userRole === 'admin';
  const userWorkshopSet = useMemo(() => new Set(userAssignments), [userAssignments]);

  // Current workshop attendance
  const { data: existingAttendance = [] } = useQuery({
    queryKey: ['existing-attendance', selectedDate, selectedWorkshop],
    queryFn: async () => {
      if (!selectedWorkshop) return [];
      const { data, error } = await supabase
        .from('attendance')
        .select('worker_id, hours_worked')
        .eq('work_date', selectedDate)
        .eq('workshop_id', selectedWorkshop);
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedWorkshop,
  });

  // Privacy-safe daily summary across all workshops
  const { data: allDateAttendanceSummary = [], isLoading: loadingDailySummary } = useQuery({
    queryKey: ['daily-attendance-summary', selectedDate],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_worker_daily_attendance_summary', {
        _work_date: selectedDate,
      });
      if (error) throw error;
      return (data || []) as DailyAttendanceSummaryRow[];
    },
  });

  const attendanceMap = new Map(existingAttendance.map(a => [a.worker_id, a]));

  const workerConflictMap = new Map<string, {
    visibleWorkshops: Map<string, number>;
    hiddenHours: number;
    totalHours: number;
  }>();

  allDateAttendanceSummary.forEach((row) => {
    workerConflictMap.set(row.worker_id, {
      visibleWorkshops: new Map(
        (row.visible_entries || []).map((entry) => [entry.workshop_id, Number(entry.hours_worked)])
      ),
      hiddenHours: Number(row.hidden_hours) || 0,
      totalHours: Number(row.total_hours) || 0,
    });
  });

  const workshopNameMap = new Map(workshops.map(w => [w.id, w.name]));

  const saveAttendance = useMutation({
    mutationFn: async ({ workerId, halfDay }: { workerId: string; halfDay: boolean }) => {
      const worker = workers.find(w => w.id === workerId);
      if (!worker) throw new Error('Worker not found');

      // Fresh DB check for cross-workshop conflicts
      const { data: freshSummary, error: summaryError } = await (supabase as any).rpc(
        'get_worker_daily_attendance_summary',
        { _work_date: selectedDate }
      );
      if (summaryError) throw summaryError;

      const workerSummary = ((freshSummary || []) as DailyAttendanceSummaryRow[]).find(
        (entry) => entry.worker_id === workerId
      );
      const visibleEntries = workerSummary?.visible_entries || [];
      const currentEntry = visibleEntries.find((entry) => entry.workshop_id === selectedWorkshop);
      
      // Already exists in this workshop
      if (currentEntry) return;

      const otherTotalHours = Math.max(
        (Number(workerSummary?.total_hours) || 0) - Number(currentEntry?.hours_worked || 0),
        0
      );

      // If worker already has full day (1 hour) elsewhere, block entirely
      if (otherTotalHours >= 1) {
        throw new Error(t('attendance.alreadyFullDay', { defaultValue: 'Worker already has a full day in another workshop' }));
      }

      // If worker has half day elsewhere, only allow half day here
      if (otherTotalHours === 0.5 && !halfDay) {
        throw new Error(t('attendance.onlyHalfDayAllowed', { defaultValue: 'Worker already has ½ day elsewhere. Only ½ day allowed here.' }));
      }

      // If worker already has half day elsewhere and trying another half day — that's the max (0.5 + 0.5 = 1)
      // This is allowed — two half days = one full day across two workshops

      const hoursWorked = halfDay ? 0.5 : 1;

      const { error } = await supabase
        .from('attendance')
        .insert([{
          worker_id: workerId,
          workshop_id: selectedWorkshop,
          work_date: selectedDate,
          hours_worked: hoursWorked,
          hourly_rate: worker.hourly_rate,
          has_extra: false,
          extra_amount: 0,
          created_by: user?.id,
        }]);
      if (error) throw error;
    },
    onSuccess: (_, { workerId }) => {
      queryClient.invalidateQueries({ queryKey: ['attendance'] });
      queryClient.invalidateQueries({ queryKey: ['existing-attendance'] });
      queryClient.invalidateQueries({ queryKey: ['daily-attendance-summary'] });
      setSavedWorkers(prev => new Set([...prev, workerId]));
      setTimeout(() => {
        setSavedWorkers(prev => {
          const next = new Set(prev);
          next.delete(workerId);
          return next;
        });
      }, 2000);
    },
    onError: (error: Error) => {
      toast({ title: t('errors.error'), description: error.message, variant: 'destructive' });
    },
  });

  const removeAttendance = useMutation({
    mutationFn: async (workerId: string) => {
      const { error } = await supabase
        .from('attendance')
        .delete()
        .eq('worker_id', workerId)
        .eq('workshop_id', selectedWorkshop)
        .eq('work_date', selectedDate);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendance'] });
      queryClient.invalidateQueries({ queryKey: ['existing-attendance'] });
      queryClient.invalidateQueries({ queryKey: ['daily-attendance-summary'] });
    },
    onError: (error: Error) => {
      toast({ title: t('errors.error'), description: error.message, variant: 'destructive' });
    },
  });

  const handleToggleAttendance = (workerId: string, halfDay?: boolean) => {
    if (attendanceMap.has(workerId)) {
      removeAttendance.mutate(workerId);
    } else {
      saveAttendance.mutate({ workerId, halfDay: halfDay ?? false });
    }
  };

  const isLoading = loadingWorkers || loadingWorkshops || loadingDailySummary;

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
          <Users className="w-4 h-4 md:w-5 md:h-5" />
          {t('attendance.quickEntry')}
        </CardTitle>
        <CardDescription className="text-xs md:text-sm">
          {t('attendance.quickEntryDesc')}
        </CardDescription>
      </CardHeader>

      <CardContent className="px-3 md:px-6 pb-3 md:pb-6 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" />
              {t('common.date')}
            </label>
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="h-9 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5" />
              {t('common.workshop')}
            </label>
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

        {!selectedWorkshop ? (
          <p className="text-center text-muted-foreground py-6 text-sm">
            {t('attendance.selectWorkshopFirst')}
          </p>
        ) : workers.length === 0 ? (
          <p className="text-center text-muted-foreground py-6 text-sm">
            {t('workers.noWorkers')}
          </p>
        ) : (
          <div className="space-y-2">
            {workers.map((worker) => {
              const currentAttendance = attendanceMap.get(worker.id);
              const isAttended = !!currentAttendance;
              const isHalfDay = isAttended && Number(currentAttendance.hours_worked) === 0.5;
              const isSaved = savedWorkers.has(worker.id);
              const isPending = saveAttendance.isPending || removeAttendance.isPending;
              
              // Check conflict state from allDateAttendance
              const conflict = workerConflictMap.get(worker.id);
               const otherEntries = conflict 
                 ? Array.from(conflict.visibleWorkshops.entries()).filter(([wsId]) => wsId !== selectedWorkshop)
                : [];
               const visibleOtherHours = otherEntries.reduce((sum, [, h]) => sum + h, 0);
               const hiddenHours = conflict?.hiddenHours || 0;
               const otherTotalHours = visibleOtherHours + hiddenHours;
              
              // Determine what to show
              let otherWorkshopName: string | undefined;
              let isBlocked = false;
              
              if (!isAttended && otherEntries.length > 0) {
                // Build descriptive label - show "other site" for workshops user isn't assigned to
                 const otherLabels = otherEntries.map(([wsId, hours]) => {
                  const canSeeWorkshop = isAdmin || userWorkshopSet.has(wsId);
                  const name = canSeeWorkshop ? (workshopNameMap.get(wsId) || '?') : t('attendance.otherSite', { defaultValue: 'Other site' });
                  return hours === 0.5 ? `½ @ ${name}` : `${t('attendance.fullDay')} @ ${name}`;
                });
                 if (hiddenHours > 0) {
                   otherLabels.push(
                     hiddenHours === 0.5
                       ? `½ @ ${t('attendance.otherSite', { defaultValue: 'Other site' })}`
                       : `${t('attendance.fullDay')} @ ${t('attendance.otherSite', { defaultValue: 'Other site' })}`
                   );
                 }
                otherWorkshopName = otherLabels.join(' + ');
                // If total hours across other workshops >= 1, block entirely
                if (otherTotalHours >= 1) {
                  isBlocked = true;
                }
              }

              return (
                <WorkerAttendanceCard
                  key={worker.id}
                  worker={worker}
                  isAttended={isAttended}
                  isHalfDay={isHalfDay}
                  isSaved={isSaved}
                  isPending={isPending}
                  otherWorkshopName={otherWorkshopName}
                  isBlocked={isBlocked}
                  onToggleAttendance={handleToggleAttendance}
                />
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
