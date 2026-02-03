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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { Loader2, Check, Calendar, Building2, Users, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

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
  const [workerHours, setWorkerHours] = useState<Record<string, string>>({});
  const [savedWorkers, setSavedWorkers] = useState<Set<string>>(new Set());

  // Fetch active workers with their rates
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

  // Fetch existing attendance for selected date/workshop
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

  // Set initial hours from existing attendance
  useState(() => {
    const initialHours: Record<string, string> = {};
    existingAttendance.forEach((a) => {
      initialHours[a.worker_id] = a.hours_worked.toString();
    });
    if (Object.keys(initialHours).length > 0) {
      setWorkerHours(initialHours);
    }
  });

  const saveAttendance = useMutation({
    mutationFn: async ({ workerId, hours }: { workerId: string; hours: number }) => {
      const worker = workers.find(w => w.id === workerId);
      if (!worker) throw new Error('Worker not found');

      // Check if attendance already exists
      const { data: existing } = await supabase
        .from('attendance')
        .select('id')
        .eq('worker_id', workerId)
        .eq('workshop_id', selectedWorkshop)
        .eq('work_date', selectedDate)
        .single();

      if (existing) {
        // Update existing
        const { error } = await supabase
          .from('attendance')
          .update({
            hours_worked: hours,
            hourly_rate: worker.hourly_rate,
          })
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        // Insert new
        const { error } = await supabase
          .from('attendance')
          .insert([{
            worker_id: workerId,
            workshop_id: selectedWorkshop,
            work_date: selectedDate,
            hours_worked: hours,
            hourly_rate: worker.hourly_rate,
            created_by: user?.id,
          }]);
        if (error) throw error;
      }
    },
    onSuccess: (_, { workerId }) => {
      queryClient.invalidateQueries({ queryKey: ['attendance'] });
      queryClient.invalidateQueries({ queryKey: ['existing-attendance'] });
      setSavedWorkers(prev => new Set([...prev, workerId]));
      // Clear the saved indicator after 2 seconds
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

  const handleHoursChange = (workerId: string, value: string) => {
    setWorkerHours(prev => ({ ...prev, [workerId]: value }));
  };

  const handleSave = (workerId: string) => {
    const hours = parseFloat(workerHours[workerId] || '0');
    if (hours > 0 && selectedWorkshop) {
      saveAttendance.mutate({ workerId, hours });
    }
  };

  const handleSaveAll = () => {
    Object.entries(workerHours).forEach(([workerId, hours]) => {
      const numHours = parseFloat(hours);
      if (numHours > 0) {
        saveAttendance.mutate({ workerId, hours: numHours });
      }
    });
    toast({ title: t('attendance.savedAll'), description: t('attendance.savedAllDesc') });
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
        {/* Date and Workshop Selection */}
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
                <SelectValue placeholder={t('workshops.selectWorkshop')} />
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
          <>
            {/* Workers List */}
            <div className="space-y-2">
              {workers.map((worker) => {
                const hours = parseFloat(workerHours[worker.id] || '0');
                const dailySalary = hours * worker.hourly_rate;
                const isSaved = savedWorkers.has(worker.id);
                const existingEntry = existingAttendance.find(a => a.worker_id === worker.id);

                return (
                  <div
                    key={worker.id}
                    className={cn(
                      "border rounded-lg p-3 transition-colors",
                      isSaved && "border-success bg-success/5"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm truncate">{worker.name}</span>
                          {existingEntry && !isSaved && (
                            <Badge variant="secondary" className="text-[10px]">
                              {t('attendance.recorded')}
                            </Badge>
                          )}
                          {isSaved && (
                            <Badge className="text-[10px] bg-success text-success-foreground">
                              <Check className="w-2.5 h-2.5 mr-1" />
                              {t('common.saved')}
                            </Badge>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground font-mono">
                          {worker.hourly_rate.toLocaleString('fr-FR')} CFA/h
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            step="0.5"
                            min="0"
                            max="24"
                            placeholder="0"
                            value={workerHours[worker.id] || existingEntry?.hours_worked || ''}
                            onChange={(e) => handleHoursChange(worker.id, e.target.value)}
                            className="w-16 h-8 text-sm text-center"
                          />
                          <span className="text-xs text-muted-foreground">h</span>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleSave(worker.id)}
                          disabled={!workerHours[worker.id] || saveAttendance.isPending}
                          className="h-8 w-8 p-0"
                        >
                          {saveAttendance.isPending ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Check className="w-3.5 h-3.5" />
                          )}
                        </Button>
                      </div>
                    </div>
                    {hours > 0 && (
                      <div className="mt-2 pt-2 border-t flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">
                          {hours}h × {worker.hourly_rate.toLocaleString('fr-FR')}
                        </span>
                        <span className="font-mono font-bold text-success">
                          = {dailySalary.toLocaleString('fr-FR')} CFA
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Save All Button */}
            {Object.values(workerHours).some(h => parseFloat(h) > 0) && (
              <Button
                onClick={handleSaveAll}
                className="w-full bg-success text-success-foreground hover:bg-success/90 gap-2"
                disabled={saveAttendance.isPending}
              >
                {saveAttendance.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                <Clock className="w-4 h-4" />
                {t('attendance.saveAll')}
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
