import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { format, startOfWeek, endOfWeek, subWeeks } from 'date-fns';
import { Loader2, Trash2, Edit, Calendar, Clock, DollarSign } from 'lucide-react';

interface AttendanceTableProps {
  userId?: string;
  onEdit?: (attendance: any) => void;
}

export default function AttendanceTable({ userId, onEdit }: AttendanceTableProps) {
  const { t } = useTranslation();
  const { user, role } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [weekOffset, setWeekOffset] = useState(0);

  const targetUserId = userId || user?.id;

  // Calculate week range
  const currentDate = subWeeks(new Date(), weekOffset);
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 6 }); // Saturday
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: 6 });

  const { data, isLoading } = useQuery({
    queryKey: ['attendance', targetUserId, weekOffset],
    queryFn: async () => {
      let query = supabase
        .from('attendance')
        .select('*')
        .gte('work_date', format(weekStart, 'yyyy-MM-dd'))
        .lte('work_date', format(weekEnd, 'yyyy-MM-dd'))
        .order('work_date', { ascending: false });

      if (targetUserId) {
        query = query.eq('user_id', targetUserId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });

  const deleteAttendance = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('attendance').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendance'] });
      toast({ title: t('attendance.deleted'), description: t('attendance.deletedDesc') });
    },
  });

  const totalHours = data?.reduce((sum, a) => sum + Number(a.hours_worked), 0) || 0;
  const totalSalary = data?.reduce((sum, a) => sum + Number(a.daily_salary), 0) || 0;

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-card">
      <CardHeader className="pb-2 px-3 md:px-6 pt-3 md:pt-6">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base md:text-lg flex items-center gap-2">
                <Calendar className="w-4 h-4 md:w-5 md:h-5" />
                {t('attendance.weeklyAttendance')}
              </CardTitle>
              <CardDescription className="text-xs md:text-sm">
                {format(weekStart, 'MMM d')} - {format(weekEnd, 'MMM d, yyyy')}
              </CardDescription>
            </div>
            <Select
              value={weekOffset.toString()}
              onValueChange={(v) => setWeekOffset(parseInt(v))}
            >
              <SelectTrigger className="w-[140px] h-8 text-xs md:text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">{t('attendance.thisWeek')}</SelectItem>
                <SelectItem value="1">{t('attendance.lastWeek')}</SelectItem>
                <SelectItem value="2">2 {t('attendance.weeksAgo')}</SelectItem>
                <SelectItem value="3">3 {t('attendance.weeksAgo')}</SelectItem>
                <SelectItem value="4">4 {t('attendance.weeksAgo')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Weekly summary */}
          <div className="grid grid-cols-2 gap-2 md:gap-4">
            <div className="p-2 md:p-3 rounded-lg bg-primary/10 border border-primary/20">
              <div className="flex items-center gap-1.5 text-primary">
                <Clock className="w-3.5 h-3.5 md:w-4 md:h-4" />
                <span className="text-[10px] md:text-xs font-medium">{t('attendance.totalHours')}</span>
              </div>
              <p className="text-lg md:text-xl font-bold font-mono text-primary">
                {totalHours}h
              </p>
            </div>
            <div className="p-2 md:p-3 rounded-lg bg-success/10 border border-success/20">
              <div className="flex items-center gap-1.5 text-success">
                <DollarSign className="w-3.5 h-3.5 md:w-4 md:h-4" />
                <span className="text-[10px] md:text-xs font-medium">{t('attendance.weeklySalary')}</span>
              </div>
              <p className="text-lg md:text-xl font-bold font-mono text-success">
                {totalSalary.toLocaleString('fr-FR')}
              </p>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-3 md:px-6 pb-3 md:pb-6">
        {!data || data.length === 0 ? (
          <p className="text-center text-muted-foreground py-6 text-sm">
            {t('attendance.noEntriesThisWeek')}
          </p>
        ) : (
          <>
            {/* Mobile view */}
            <div className="md:hidden space-y-2">
              {data.map((entry) => (
                <div key={entry.id} className="border rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <Badge variant="outline" className="text-[10px] font-mono">
                        {format(new Date(entry.work_date), 'EEE, dd/MM')}
                      </Badge>
                      <p className="text-sm mt-1">
                        {entry.hours_worked}h × {Number(entry.hourly_rate).toLocaleString('fr-FR')}
                      </p>
                      {entry.description && (
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {entry.description}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="font-mono font-bold text-success">
                        {Number(entry.daily_salary).toLocaleString('fr-FR')}
                      </p>
                      <div className="flex gap-1 mt-1 justify-end">
                        {onEdit && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => onEdit(entry)}
                            className="h-6 w-6"
                          >
                            <Edit className="w-3 h-3" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteAttendance.mutate(entry.id)}
                          className="h-6 w-6 text-destructive hover:text-destructive"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop view */}
            <div className="hidden md:block rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('common.date')}</TableHead>
                    <TableHead>{t('attendance.hours')}</TableHead>
                    <TableHead>{t('attendance.rate')}</TableHead>
                    <TableHead>{t('attendance.dailySalary')}</TableHead>
                    <TableHead>{t('common.description')}</TableHead>
                    <TableHead className="text-end">{t('common.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="font-mono">
                        {format(new Date(entry.work_date), 'EEE, MMM d')}
                      </TableCell>
                      <TableCell>{entry.hours_worked}h</TableCell>
                      <TableCell className="font-mono">
                        {Number(entry.hourly_rate).toLocaleString('fr-FR')}
                      </TableCell>
                      <TableCell className="font-mono font-bold text-success">
                        {Number(entry.daily_salary).toLocaleString('fr-FR')}
                      </TableCell>
                      <TableCell className="text-muted-foreground max-w-xs truncate">
                        {entry.description || '-'}
                      </TableCell>
                      <TableCell className="text-end">
                        <div className="flex justify-end gap-1">
                          {onEdit && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => onEdit(entry)}
                              className="h-8 w-8"
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteAttendance.mutate(entry.id)}
                            className="h-8 w-8 text-destructive hover:text-destructive"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
