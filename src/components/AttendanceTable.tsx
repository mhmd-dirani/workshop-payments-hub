import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { useToast } from '@/hooks/use-toast';
import { format, startOfWeek, endOfWeek, subWeeks } from 'date-fns';
import { Loader2, Trash2, Edit, Calendar, DollarSign, Building2, X, Plus, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AttendanceTableProps {
  workerId?: string;
  workshopId?: string;
  onEdit?: (attendance: any) => void;
}

export default function AttendanceTable({ workerId, workshopId, onEdit }: AttendanceTableProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [timeFilter, setTimeFilter] = useState('0');
  const [filterWorkshopId, setFilterWorkshopId] = useState(workshopId || 'all');
  const [filterWorkerId, setFilterWorkerId] = useState(workerId || 'all');
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [entryToDelete, setEntryToDelete] = useState<string | null>(null);

  const isAllTime = timeFilter === 'all';
  const isSpecificDate = timeFilter === 'date';
  const weekOffset = (isAllTime || isSpecificDate) ? 0 : parseInt(timeFilter);
  const currentDate = subWeeks(new Date(), weekOffset);
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 });
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: 0 });

  // Fetch workers for filter
  const { data: workers = [] } = useQuery({
    queryKey: ['workers-active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workers')
        .select('id, name')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch workshops for filter
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

  // Get selected worker name for flexible filtering
  const selectedWorkerName = workers.find(w => w.id === filterWorkerId)?.name || '';

  const { data, isLoading } = useQuery({
    queryKey: ['attendance', timeFilter, filterWorkerId, filterWorkshopId, selectedDate?.toISOString(), selectedWorkerName],
    queryFn: async () => {
      let query = supabase
        .from('attendance')
        .select(`*, workers:worker_id(id, name), workshops:workshop_id(id, name)`)
        .order('work_date', { ascending: false });

      // Apply date filters based on filter type
      if (isSpecificDate && selectedDate) {
        query = query.eq('work_date', format(selectedDate, 'yyyy-MM-dd'));
      } else if (!isAllTime) {
        query = query
          .gte('work_date', format(weekStart, 'yyyy-MM-dd'))
          .lte('work_date', format(weekEnd, 'yyyy-MM-dd'));
      }

      // For worker filter: search by worker_id OR by name in description (for overtime records)
      // We'll fetch all and filter client-side to handle the OR condition with description search
      if (filterWorkshopId && filterWorkshopId !== 'all') {
        query = query.eq('workshop_id', filterWorkshopId);
      }

      const { data, error } = await query;
      if (error) throw error;
      
      let results = data || [];
      
      // Client-side filtering for worker - allows matching by worker_id OR by name in description
      if (filterWorkerId && filterWorkerId !== 'all' && selectedWorkerName) {
        results = results.filter(entry => {
          // Match by worker_id (normal attendance)
          if (entry.worker_id === filterWorkerId) return true;
          // Match by name in description (overtime records contain all worker names)
          if (entry.description && entry.description.toLowerCase().includes(selectedWorkerName.toLowerCase())) return true;
          return false;
        });
      }
      
      return results;
    },
  });

  const deleteAttendance = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('attendance').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendance'] });
      setEntryToDelete(null);
      toast({ title: t('attendance.deleted'), description: t('attendance.deletedDesc') });
    },
  });

  // Count unique days, not transactions
  const uniqueDays = new Set(data?.map(a => a.work_date) || []);
  const totalDays = uniqueDays.size;
  // Calculate total: for overtime use extra_amount, for normal use daily_salary - discount_amount
  const totalSalary = data?.reduce((sum, a) => {
    const isOvertime = a.has_extra && a.extra_amount && !a.extra_reason;
    const discount = Number(a.discount_amount) || 0;
    return sum + (isOvertime ? Number(a.extra_amount) : (Number(a.daily_salary) - discount));
  }, 0) || 0;

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
    <>
    <Card className="shadow-card">
      <CardHeader className="pb-2 px-3 md:px-6 pt-3 md:pt-6">
        <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <CardTitle className="text-base md:text-lg flex items-center gap-2">
                  <Calendar className="w-4 h-4 md:w-5 md:h-5" />
                  {isAllTime ? t('attendance.allTime') : isSpecificDate ? t('attendance.specificDate') : t('attendance.weeklyAttendance')}
                </CardTitle>
                <CardDescription className="text-xs md:text-sm">
                  {isAllTime 
                    ? t('attendance.showingAllRecords') 
                    : isSpecificDate && selectedDate 
                      ? format(selectedDate, 'EEEE, MMM d, yyyy')
                      : `${format(weekStart, 'MMM d')} - ${format(weekEnd, 'MMM d, yyyy')}`}
                </CardDescription>
              </div>
              <div className="flex gap-2 items-center">
                <Select
                  value={timeFilter}
                  onValueChange={(value) => {
                    setTimeFilter(value);
                    if (value !== 'date') {
                      setSelectedDate(undefined);
                    }
                  }}
                >
                  <SelectTrigger className="w-[120px] h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">{t('attendance.thisWeek')}</SelectItem>
                    <SelectItem value="1">{t('attendance.lastWeek')}</SelectItem>
                    <SelectItem value="2">2 {t('attendance.weeksAgo')}</SelectItem>
                    <SelectItem value="3">3 {t('attendance.weeksAgo')}</SelectItem>
                    <SelectItem value="4">4 {t('attendance.weeksAgo')}</SelectItem>
                    <SelectItem value="all">{t('attendance.allTime')}</SelectItem>
                    <SelectItem value="date">{t('attendance.specificDate')}</SelectItem>
                  </SelectContent>
                </Select>
                
                {timeFilter === 'date' && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className={cn(
                          "h-8 text-xs justify-start text-left font-normal",
                          !selectedDate && "text-muted-foreground"
                        )}
                      >
                        <Calendar className="mr-2 h-3 w-3" />
                        {selectedDate ? format(selectedDate, 'dd/MM/yyyy') : t('attendance.pickDate')}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="end">
                      <CalendarComponent
                        mode="single"
                        selected={selectedDate}
                        onSelect={setSelectedDate}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                )}
                
                {selectedDate && timeFilter === 'date' && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setSelectedDate(undefined)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>

          {/* Filters */}
          <div className="flex gap-2 flex-wrap">
            <Select value={filterWorkerId} onValueChange={setFilterWorkerId}>
              <SelectTrigger className="w-[140px] h-8 text-xs">
                <SelectValue placeholder={t('attendance.allWorkers')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('attendance.allWorkers')}</SelectItem>
                {workers.map((w) => (
                  <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterWorkshopId} onValueChange={setFilterWorkshopId}>
              <SelectTrigger className="w-[140px] h-8 text-xs">
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

          {/* Weekly summary */}
          <div className="grid grid-cols-2 gap-2 md:gap-4">
            <div className="p-2 md:p-3 rounded-lg bg-primary/10 border border-primary/20">
              <div className="flex items-center gap-1.5 text-primary">
                <Calendar className="w-3.5 h-3.5 md:w-4 md:h-4" />
                <span className="text-[10px] md:text-xs font-medium">{t('attendance.totalDays')}</span>
              </div>
              <p className="text-lg md:text-xl font-bold font-mono text-primary">
                {totalDays} {t('common.days')}
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
              {data.map((entry) => {
                const isOvertimeRecord = entry.has_extra && entry.extra_amount;
                const discountAmt = Number(entry.discount_amount) || 0;
                const baseAmount = isOvertimeRecord ? Number(entry.extra_amount) : Number(entry.daily_salary);
                const displayAmount = isOvertimeRecord ? baseAmount : (baseAmount - discountAmt);
                const displayName = isOvertimeRecord && entry.description 
                  ? entry.description.replace(`${t('attendance.overtime')}: `, '').split(' - ')[0]
                  : (entry.workers as any)?.name;
                
                const hasBonus = !isOvertimeRecord && entry.has_extra && Number(entry.extra_amount) > 0;
                const hasDiscount = discountAmt > 0;
                
                return (
                  <div key={entry.id} className="border rounded-lg p-3">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{displayName}</span>
                          {isOvertimeRecord && (
                            <Badge variant="outline" className="text-[10px] border-warning text-warning">
                              {t('attendance.overtime')}
                            </Badge>
                          )}
                          {hasBonus && (
                            <Badge variant="outline" className="text-[10px] border-success text-success">
                              <Plus className="w-2 h-2 mr-0.5" />
                              {Number(entry.extra_amount).toLocaleString('fr-FR')}
                            </Badge>
                          )}
                          {hasDiscount && (
                            <Badge variant="outline" className="text-[10px] border-destructive text-destructive">
                              <Minus className="w-2 h-2 mr-0.5" />
                              {discountAmt.toLocaleString('fr-FR')}
                            </Badge>
                          )}
                          <Badge variant="outline" className="text-[10px]">
                            <Building2 className="w-2.5 h-2.5 mr-1" />
                            {(entry.workshops as any)?.name}
                          </Badge>
                        </div>
                        <Badge variant="secondary" className="text-[10px] font-mono">
                          {format(new Date(entry.work_date), 'EEE, dd/MM')}
                        </Badge>
                        {!isOvertimeRecord && (
                          <p className="text-sm font-mono">
                            {Number(entry.hourly_rate).toLocaleString('fr-FR')} CFA
                          </p>
                        )}
                        {entry.extra_reason && (
                          <p className="text-xs text-success truncate">
                            <Plus className="w-2.5 h-2.5 inline mr-0.5" />{entry.extra_reason}
                          </p>
                        )}
                        {entry.discount_reason && (
                          <p className="text-xs text-destructive truncate">
                            <Minus className="w-2.5 h-2.5 inline mr-0.5" />{entry.discount_reason}
                          </p>
                        )}
                        {entry.description && !isOvertimeRecord && !entry.extra_reason && !entry.discount_reason && (
                          <p className="text-xs text-muted-foreground truncate">{entry.description}</p>
                        )}
                        {isOvertimeRecord && entry.description && (
                          <p className="text-xs text-muted-foreground truncate">
                            {entry.description.split(' - ')[1] || ''}
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="font-mono font-bold text-success">
                          {displayAmount.toLocaleString('fr-FR')}
                        </p>
                        <div className="flex gap-1 mt-1 justify-end">
                          {onEdit && (
                            <Button variant="ghost" size="icon" onClick={() => onEdit(entry)} className="h-6 w-6">
                              <Edit className="w-3 h-3" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setEntryToDelete(entry.id)}
                            className="h-6 w-6 text-destructive hover:text-destructive"
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop view */}
            <div className="hidden md:block rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('attendance.worker')}</TableHead>
                    <TableHead>{t('common.workshop')}</TableHead>
                    <TableHead>{t('common.date')}</TableHead>
                    <TableHead>{t('attendance.dailyRate')}</TableHead>
                    <TableHead>{t('common.description')}</TableHead>
                    <TableHead className="text-end">{t('common.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((entry) => {
                    const isOvertimeRecord = entry.has_extra && entry.extra_amount && !entry.extra_reason;
                    const discountAmt = Number(entry.discount_amount) || 0;
                    const baseAmount = isOvertimeRecord ? Number(entry.extra_amount) : Number(entry.daily_salary);
                    const displayAmount = isOvertimeRecord ? baseAmount : (baseAmount - discountAmt);
                    const displayName = isOvertimeRecord && entry.description 
                      ? entry.description.replace(`${t('attendance.overtime')}: `, '').split(' - ')[0]
                      : (entry.workers as any)?.name;
                    const displayDescription = isOvertimeRecord && entry.description
                      ? entry.description.split(' - ')[1] || ''
                      : entry.description;

                    const hasBonus = !isOvertimeRecord && entry.has_extra && Number(entry.extra_amount) > 0;
                    const hasDiscount = discountAmt > 0;
                    
                    return (
                      <TableRow key={entry.id}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            {displayName}
                            {isOvertimeRecord && (
                              <Badge variant="outline" className="text-[10px] border-warning text-warning">
                                {t('attendance.overtime')}
                              </Badge>
                            )}
                            {hasBonus && (
                              <Badge variant="outline" className="text-[10px] border-success text-success">
                                <Plus className="w-2 h-2 mr-0.5" />
                                {Number(entry.extra_amount).toLocaleString('fr-FR')}
                              </Badge>
                            )}
                            {hasDiscount && (
                              <Badge variant="outline" className="text-[10px] border-destructive text-destructive">
                                <Minus className="w-2 h-2 mr-0.5" />
                                {discountAmt.toLocaleString('fr-FR')}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {(entry.workshops as any)?.name}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono">
                          {format(new Date(entry.work_date), 'EEE, MMM d')}
                        </TableCell>
                        <TableCell className="font-mono font-bold text-success">
                          {displayAmount.toLocaleString('fr-FR')} CFA
                        </TableCell>
                        <TableCell className="text-muted-foreground max-w-xs">
                          <div className="space-y-0.5">
                            {entry.extra_reason && (
                              <p className="text-xs text-success truncate">
                                <Plus className="w-2.5 h-2.5 inline mr-0.5" />{entry.extra_reason}
                              </p>
                            )}
                            {entry.discount_reason && (
                              <p className="text-xs text-destructive truncate">
                                <Minus className="w-2.5 h-2.5 inline mr-0.5" />{entry.discount_reason}
                              </p>
                            )}
                            {displayDescription && !entry.extra_reason && !entry.discount_reason && (
                              <span className="truncate">{displayDescription}</span>
                            )}
                            {!displayDescription && !entry.extra_reason && !entry.discount_reason && '-'}
                          </div>
                        </TableCell>
                        <TableCell className="text-end">
                          <div className="flex justify-end gap-1">
                            {onEdit && (
                              <Button variant="ghost" size="icon" onClick={() => onEdit(entry)} className="h-8 w-8">
                                <Edit className="w-4 h-4" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setEntryToDelete(entry.id)}
                              className="h-8 w-8 text-destructive hover:text-destructive"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>

    {/* Delete Attendance Confirmation */}
    <AlertDialog open={!!entryToDelete} onOpenChange={(open) => !open && setEntryToDelete(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('confirmDelete.title')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('confirmDelete.attendance')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => entryToDelete && deleteAttendance.mutate(entryToDelete)}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {t('common.delete')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
