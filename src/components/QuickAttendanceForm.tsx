import { useState } from 'react';
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

  const attendedWorkerIds = new Set(existingAttendance.map(a => a.worker_id));

  const saveAttendance = useMutation({
    mutationFn: async (workerId: string) => {
      const worker = workers.find(w => w.id === workerId);
      if (!worker) throw new Error('Worker not found');

      const { data: existing } = await supabase
        .from('attendance')
        .select('id')
        .eq('worker_id', workerId)
        .eq('workshop_id', selectedWorkshop)
        .eq('work_date', selectedDate)
        .single();

      if (existing) return;

      const { error } = await supabase
        .from('attendance')
        .insert([{
          worker_id: workerId,
          workshop_id: selectedWorkshop,
          work_date: selectedDate,
          hours_worked: 1,
          hourly_rate: worker.hourly_rate,
          has_extra: false,
          extra_amount: 0,
          created_by: user?.id,
        }]);
      if (error) throw error;
    },
    onSuccess: (_, workerId) => {
      queryClient.invalidateQueries({ queryKey: ['attendance'] });
      queryClient.invalidateQueries({ queryKey: ['existing-attendance'] });
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
    },
    onError: (error: Error) => {
      toast({ title: t('errors.error'), description: error.message, variant: 'destructive' });
    },
  });

  const handleToggleAttendance = (workerId: string) => {
    if (attendedWorkerIds.has(workerId)) {
      removeAttendance.mutate(workerId);
    } else {
      saveAttendance.mutate(workerId);
    }
  };

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
                {workshops.map((w) => (
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
              const isAttended = attendedWorkerIds.has(worker.id);
              const isSaved = savedWorkers.has(worker.id);
              const isPending = saveAttendance.isPending || removeAttendance.isPending;

              return (
                <WorkerAttendanceCard
                  key={worker.id}
                  worker={worker}
                  isAttended={isAttended}
                  isSaved={isSaved}
                  isPending={isPending}
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
