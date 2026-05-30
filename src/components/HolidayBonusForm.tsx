import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { startOfWeek, addDays, format } from 'date-fns';
import { CalendarHeart, Loader2, Building2, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Worker {
  id: string;
  name: string;
  hourly_rate: number;
}

const HOLIDAY_BONUS_TAG = '[HOLIDAY_BONUS]';

export default function HolidayBonusForm() {
  const { t } = useTranslation();
  const { user, role } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [selectedWorkshop, setSelectedWorkshop] = useState('');

  // Current week (Sun-Sat)
  const today = new Date();
  const weekStart = startOfWeek(today, { weekStartsOn: 0 });
  const weekStartStr = format(weekStart, 'yyyy-MM-dd');
  const weekEndStr = format(addDays(weekStart, 6), 'yyyy-MM-dd');

  const { data: holidays = [], isLoading: loadingHolidays } = useQuery({
    queryKey: ['holidays', weekStartStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('holidays')
        .select('holiday_date')
        .gte('holiday_date', weekStartStr)
        .lte('holiday_date', weekEndStr)
        .order('holiday_date');
      if (error) throw error;
      return data || [];
    },
  });

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

  // Existing bonus entries this week (across all workshops) so we can show ticks
  const { data: existingBonuses = [] } = useQuery({
    queryKey: ['holiday-bonus-entries', weekStartStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('attendance')
        .select('id, worker_id, workshop_id, work_date, description')
        .gte('work_date', weekStartStr)
        .lte('work_date', weekEndStr)
        .ilike('description', `%${HOLIDAY_BONUS_TAG}%`);
      if (error) throw error;
      return data || [];
    },
  });

  // map: workerId|date -> existing row
  const bonusMap = useMemo(() => {
    const m = new Map<string, { id: string; workshop_id: string }>();
    existingBonuses.forEach((e: any) => {
      m.set(`${e.worker_id}|${e.work_date}`, { id: e.id, workshop_id: e.workshop_id });
    });
    return m;
  }, [existingBonuses]);

  const toggleBonus = useMutation({
    mutationFn: async ({
      workerId,
      holidayDate,
    }: {
      workerId: string;
      holidayDate: string;
    }) => {
      const key = `${workerId}|${holidayDate}`;
      const existing = bonusMap.get(key);
      if (existing) {
        const { error } = await supabase.from('attendance').delete().eq('id', existing.id);
        if (error) throw error;
        return;
      }
      if (!selectedWorkshop) {
        throw new Error(t('attendance.selectWorkshopFirst'));
      }
      const worker = workers.find(w => w.id === workerId);
      if (!worker) throw new Error('Worker not found');
      const { error } = await supabase.from('attendance').insert([{
        worker_id: workerId,
        workshop_id: selectedWorkshop,
        work_date: holidayDate,
        hours_worked: 1,
        hourly_rate: worker.hourly_rate,
        has_extra: false,
        extra_amount: 0,
        is_paid: false,
        description: `${t('attendance.holidayBonus', { defaultValue: 'Holiday bonus' })} ${HOLIDAY_BONUS_TAG}`,
        created_by: user?.id,
      }]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['holiday-bonus-entries'] });
      queryClient.invalidateQueries({ queryKey: ['attendance'] });
      queryClient.invalidateQueries({ queryKey: ['worker-unpaid-attendance'] });
      queryClient.invalidateQueries({ queryKey: ['all-unpaid-attendance'] });
    },
    onError: (e: Error) => {
      toast({ title: t('errors.error'), description: e.message, variant: 'destructive' });
    },
  });

  if (role !== 'admin') {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          {t('common.adminOnly', { defaultValue: 'Admins only' })}
        </CardContent>
      </Card>
    );
  }

  if (loadingHolidays || loadingWorkers || loadingWorkshops) {
    return (
      <Card>
        <CardContent className="py-8 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (holidays.length === 0) {
    return (
      <Card className="shadow-card">
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          {t('attendance.noHolidaysThisWeek', { defaultValue: 'No holidays marked this week. Tick days as holidays above.' })}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-card">
      <CardHeader className="pb-3 px-3 md:px-6 pt-3 md:pt-6">
        <CardTitle className="text-base md:text-lg flex items-center gap-2">
          <CalendarHeart className="w-4 h-4 md:w-5 md:h-5 text-primary" />
          {t('attendance.holidayBonusTitle', { defaultValue: 'Holiday Bonus' })}
        </CardTitle>
        <CardDescription className="text-xs md:text-sm">
          {t('attendance.holidayBonusDesc', { defaultValue: 'Tick each worker for each holiday to grant a full-day bonus (even if absent).' })}
        </CardDescription>
      </CardHeader>

      <CardContent className="px-3 md:px-6 pb-3 md:pb-6 space-y-4">
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
              const suggested = Math.round((worker.hourly_rate / 8) * 1.5 * 8); // full day
              return (
                <div
                  key={worker.id}
                  className="border rounded-md p-2 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium truncate">{worker.name}</span>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {worker.hourly_rate.toLocaleString('fr-FR')} CFA/{t('attendance.day')}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {holidays.map((h: any) => {
                      const key = `${worker.id}|${h.holiday_date}`;
                      const existing = bonusMap.get(key);
                      const checked = !!existing;
                      const [y, m, d] = String(h.holiday_date).split('-').map(Number);
                      const local = new Date(y, (m || 1) - 1, d || 1);
                      const pending = toggleBonus.isPending;
                      return (
                        <button
                          key={h.holiday_date}
                          type="button"
                          disabled={pending}
                          onClick={() => toggleBonus.mutate({ workerId: worker.id, holidayDate: h.holiday_date })}
                          className={cn(
                            "flex items-center gap-1.5 px-2 py-1 rounded-md border text-[11px] transition-colors",
                            checked
                              ? "bg-success/15 border-success/40 text-success"
                              : "bg-card hover:bg-muted/40 border-border",
                            pending && "opacity-50 cursor-not-allowed"
                          )}
                        >
                          <Checkbox checked={checked} className="h-3.5 w-3.5 pointer-events-none" />
                          <CalendarHeart className="w-3 h-3" />
                          <span className="font-mono">{format(local, 'EEE dd/MM')}</span>
                          {checked && <Check className="w-3 h-3" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}