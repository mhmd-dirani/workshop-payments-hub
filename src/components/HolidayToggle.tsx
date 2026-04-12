import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { startOfWeek, addDays, format, isSameDay } from 'date-fns';
import { CalendarHeart, Loader2 } from 'lucide-react';

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

export default function HolidayToggle() {
  const { t } = useTranslation();
  const { user, role } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Get current week (Sun-Sat)
  const today = new Date();
  const weekStart = startOfWeek(today, { weekStartsOn: 0 });
  const weekDays = useMemo(() => 
    Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart.toISOString()]
  );

  const weekStartStr = format(weekStart, 'yyyy-MM-dd');
  const weekEndStr = format(addDays(weekStart, 6), 'yyyy-MM-dd');

  const { data: holidays = [], isLoading } = useQuery({
    queryKey: ['holidays', weekStartStr],
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

  const holidayDates = useMemo(() => 
    new Set(holidays.map(h => h.holiday_date)),
    [holidays]
  );

  const toggleHoliday = useMutation({
    mutationFn: async (date: Date) => {
      const dateStr = format(date, 'yyyy-MM-dd');
      const existing = holidays.find(h => h.holiday_date === dateStr);
      if (existing) {
        const { error } = await supabase.from('holidays').delete().eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('holidays').insert({
          holiday_date: dateStr,
          created_by: user?.id,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['holidays'] });
      toast({ title: t('common.success'), description: t('attendance.holidayUpdated') });
    },
    onError: (error: Error) => {
      toast({ title: t('errors.error'), description: error.message, variant: 'destructive' });
    },
  });

  if (role !== 'admin') return null;
  if (isLoading) return null;

  return (
    <Card className="shadow-card">
      <CardHeader className="pb-2 px-3 pt-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <CalendarHeart className="w-4 h-4 text-primary" />
          {t('attendance.holidays')}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-3">
        <div className="flex flex-wrap gap-1.5">
          {weekDays.map((day, i) => {
            const dateStr = format(day, 'yyyy-MM-dd');
            const isHoliday = holidayDates.has(dateStr);
            const isToday = isSameDay(day, today);
            return (
              <Button
                key={i}
                variant={isHoliday ? 'default' : 'outline'}
                size="sm"
                className={`h-auto py-1 px-2 flex flex-col gap-0 ${isHoliday ? 'bg-primary text-primary-foreground' : ''} ${isToday ? 'ring-1 ring-primary' : ''}`}
                onClick={() => toggleHoliday.mutate(day)}
                disabled={toggleHoliday.isPending}
              >
                <span className="text-[10px] font-medium">{t(`days.${DAY_KEYS[i]}`)}</span>
                <span className="text-[10px] font-mono">{format(day, 'dd')}</span>
                {isHoliday && <Badge variant="secondary" className="text-[8px] px-0.5 py-0 h-3 mt-0.5">🎉</Badge>}
              </Button>
            );
          })}
        </div>
        {holidayDates.size > 0 && (
          <p className="text-[10px] text-muted-foreground mt-2">
            {t('attendance.holidayNote')}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
