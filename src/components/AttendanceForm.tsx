import { useEffect, useState } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Check, ChevronsUpDown, Plus } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

const attendanceSchema = z.object({
  worker_id: z.string().min(1, 'Worker is required'),
  workshop_id: z.string().min(1, 'Workshop is required'),
  work_date: z.string().min(1, 'Date is required'),
  hours_worked: z.coerce.number().min(0.5, 'Minimum 0.5 hours').max(24, 'Maximum 24 hours'),
  hourly_rate: z.coerce.number().min(1, 'Hourly rate must be at least 1'),
  description: z.string().max(500).optional(),
  has_extra: z.boolean().default(false),
  extra_amount: z.coerce.number().min(0).default(0),
});

type AttendanceFormData = z.infer<typeof attendanceSchema>;

interface AttendanceFormProps {
  attendance?: any;
  preselectedWorkerId?: string;
  preselectedWorkshopId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function AttendanceForm({ 
  attendance, 
  preselectedWorkerId,
  preselectedWorkshopId,
  open, 
  onOpenChange 
}: AttendanceFormProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isEditing = !!attendance;
  const [workerOpen, setWorkerOpen] = useState(false);

  // Fetch active workers
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

  // Fetch workshops
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

  const form = useForm<AttendanceFormData>({
    resolver: zodResolver(attendanceSchema),
    defaultValues: {
      worker_id: preselectedWorkerId || '',
      workshop_id: preselectedWorkshopId || '',
      work_date: format(new Date(), 'yyyy-MM-dd'),
      hours_worked: 8,
      hourly_rate: 1000,
      description: '',
      has_extra: false,
      extra_amount: 0,
    },
  });

  useEffect(() => {
    if (open) {
      if (attendance) {
        form.reset({
          worker_id: attendance.worker_id,
          workshop_id: attendance.workshop_id,
          work_date: attendance.work_date,
          hours_worked: attendance.hours_worked,
          hourly_rate: attendance.hourly_rate,
          description: attendance.description || '',
          has_extra: attendance.has_extra || false,
          extra_amount: attendance.extra_amount || 0,
        });
      } else {
        form.reset({
          worker_id: preselectedWorkerId || '',
          workshop_id: preselectedWorkshopId || '',
          work_date: format(new Date(), 'yyyy-MM-dd'),
          hours_worked: 8,
          hourly_rate: 1000,
          description: '',
          has_extra: false,
          extra_amount: 0,
        });
      }
    }
  }, [attendance, open, form, preselectedWorkerId, preselectedWorkshopId]);

  const mutation = useMutation({
    mutationFn: async (data: AttendanceFormData) => {
      const extraAmount = data.has_extra ? data.extra_amount : 0;
      if (isEditing) {
        const { error } = await supabase
          .from('attendance')
          .update({
            worker_id: data.worker_id,
            workshop_id: data.workshop_id,
            work_date: data.work_date,
            hours_worked: data.hours_worked,
            hourly_rate: data.hourly_rate,
            description: data.description || null,
            has_extra: data.has_extra,
            extra_amount: extraAmount,
          })
          .eq('id', attendance.id);
        if (error) throw error;
      } else {
        const extraAmount = data.has_extra ? data.extra_amount : 0;
        const { error } = await supabase
          .from('attendance')
          .insert([{
            worker_id: data.worker_id,
            workshop_id: data.workshop_id,
            work_date: data.work_date,
            hours_worked: data.hours_worked,
            hourly_rate: data.hourly_rate,
            description: data.description || null,
            has_extra: data.has_extra,
            extra_amount: extraAmount,
            created_by: user?.id,
          }]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendance'] });
      queryClient.invalidateQueries({ queryKey: ['weekly-salary'] });
      onOpenChange(false);
      toast({
        title: isEditing ? t('attendance.updated') : t('attendance.added'),
        description: isEditing ? t('attendance.updatedDesc') : t('attendance.addedDesc'),
      });
    },
    onError: (error: Error) => {
      toast({
        title: t('errors.error'),
        description: error.message.includes('duplicate') 
          ? t('attendance.duplicateError') 
          : error.message,
        variant: 'destructive',
      });
    },
  });

  const onSubmit = (data: AttendanceFormData) => {
    mutation.mutate(data);
  };

  const hasExtra = form.watch('has_extra');
  const extraAmount = form.watch('extra_amount');
  const hourlyRate = form.watch('hourly_rate');

  // When the user toggles "Worked Extra" on, pre-fill with daily_salary / 8 * 1.5
  // (only if no value entered yet, so manual edits are preserved)
  useEffect(() => {
    if (hasExtra && (!extraAmount || Number(extraAmount) === 0)) {
      const suggested = Math.round((Number(hourlyRate) || 0) / 8 * 1.5);
      if (suggested > 0) {
        form.setValue('extra_amount', suggested, { shouldValidate: true });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasExtra]);
  const baseSalary = form.watch('hours_worked') * form.watch('hourly_rate');
  const dailySalary = baseSalary + (hasExtra ? Number(extraAmount) : 0);
  const selectedWorker = workers.find(w => w.id === form.watch('worker_id'));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm max-h-[90vh] overflow-y-auto">
        <DialogHeader className="pb-2">
          <DialogTitle className="text-base">
            {isEditing ? t('attendance.editEntry') : t('attendance.addEntry')}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
            {/* Worker & Workshop in 2 columns on desktop */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Worker Selection with Combobox */}
              <FormField
                control={form.control}
                name="worker_id"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel className="text-xs">{t('attendance.worker')} *</FormLabel>
                    <Popover open={workerOpen} onOpenChange={setWorkerOpen}>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            role="combobox"
                            aria-expanded={workerOpen}
                            className="w-full justify-between font-normal h-9 text-sm"
                          >
                            <span className="truncate">{selectedWorker?.name || t('attendance.selectWorker')}</span>
                            <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                        <Command>
                          <CommandInput placeholder={t('common.search')} className="h-8 text-sm" />
                          <CommandList className="max-h-[150px]">
                            <CommandEmpty>{t('workers.noWorkers')}</CommandEmpty>
                            <CommandGroup>
                              {workers.map((worker) => (
                                <CommandItem
                                  key={worker.id}
                                  value={worker.name}
                                  onSelect={() => {
                                    form.setValue('worker_id', worker.id);
                                    setWorkerOpen(false);
                                  }}
                                  className="text-sm"
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-3.5 w-3.5",
                                      field.value === worker.id ? "opacity-100" : "opacity-0"
                                    )}
                                  />
                                  {worker.name}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Workshop Selection */}
              <FormField
                control={form.control}
                name="workshop_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">{t('common.workshop')} *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="h-9 text-sm">
                          <SelectValue placeholder={t('workshops.selectWorkshop')} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {workshops.map((workshop) => (
                          <SelectItem key={workshop.id} value={workshop.id} className="text-sm">
                            {workshop.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Date, Hours, Rate in a row */}
            <div className="grid grid-cols-3 gap-2">
              <FormField
                control={form.control}
                name="work_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">{t('common.date')} *</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} className="h-9 text-sm" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="hours_worked"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">{t('attendance.hours')}</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.5" min="0.5" max="24" {...field} className="h-9 text-sm" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="hourly_rate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">{t('attendance.hourlyRate')}</FormLabel>
                    <FormControl>
                      <Input type="number" min="1" {...field} className="h-9 text-sm" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Extra work toggle and amount */}
            <div className="space-y-2">
              <FormField
                control={form.control}
                name="has_extra"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-2">
                    <div className="space-y-0.5">
                      <FormLabel className="text-xs font-medium">{t('attendance.workedExtra')}</FormLabel>
                      <p className="text-[10px] text-muted-foreground">{t('attendance.workedExtraDesc')}</p>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              {hasExtra && (
                <FormField
                  control={form.control}
                  name="extra_amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">{t('attendance.extraAmount')}</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Plus className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                          <Input 
                            type="number" 
                            min="0" 
                            {...field} 
                            className="h-9 text-sm pl-8" 
                            placeholder="0"
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>

            {/* Daily salary preview - compact */}
            <div className="p-2 rounded-lg bg-success/10 border border-success/20 space-y-1">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">{t('attendance.baseSalary')}</p>
                <p className="text-sm font-mono">{baseSalary.toLocaleString('fr-FR')} CFA</p>
              </div>
              {hasExtra && extraAmount > 0 && (
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">{t('attendance.extraAmount')}</p>
                  <p className="text-sm font-mono text-primary">+{Number(extraAmount).toLocaleString('fr-FR')} CFA</p>
                </div>
              )}
              <div className="flex items-center justify-between pt-1 border-t border-success/20">
                <p className="text-xs font-medium">{t('attendance.totalSalary')}</p>
                <p className="text-base font-bold font-mono text-success">
                  {dailySalary.toLocaleString('fr-FR')} CFA
                </p>
              </div>
            </div>

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">{t('common.description')} ({t('common.optional')})</FormLabel>
                  <FormControl>
                    <Textarea placeholder={t('attendance.workNotes')} {...field} className="min-h-[60px] text-sm" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="gap-2 sm:gap-0 pt-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} size="sm">
                {t('common.cancel')}
              </Button>
              <Button
                type="submit"
                disabled={mutation.isPending}
                size="sm"
                className="bg-success text-success-foreground hover:bg-success/90"
              >
                {mutation.isPending && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                {isEditing ? t('common.save') : t('common.add')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
