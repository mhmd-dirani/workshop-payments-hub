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
import { Loader2, Check, ChevronsUpDown } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

const attendanceSchema = z.object({
  worker_id: z.string().min(1, 'Worker is required'),
  workshop_id: z.string().min(1, 'Workshop is required'),
  work_date: z.string().min(1, 'Date is required'),
  hours_worked: z.coerce.number().min(0.5, 'Minimum 0.5 hours').max(24, 'Maximum 24 hours'),
  hourly_rate: z.coerce.number().min(1, 'Hourly rate must be at least 1'),
  description: z.string().max(500).optional(),
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
        });
      } else {
        form.reset({
          worker_id: preselectedWorkerId || '',
          workshop_id: preselectedWorkshopId || '',
          work_date: format(new Date(), 'yyyy-MM-dd'),
          hours_worked: 8,
          hourly_rate: 1000,
          description: '',
        });
      }
    }
  }, [attendance, open, form, preselectedWorkerId, preselectedWorkshopId]);

  const mutation = useMutation({
    mutationFn: async (data: AttendanceFormData) => {
      const dailySalary = data.hours_worked * data.hourly_rate;
      
      if (isEditing) {
        const { error } = await supabase
          .from('attendance')
          .update({
            worker_id: data.worker_id,
            workshop_id: data.workshop_id,
            work_date: data.work_date,
            hours_worked: data.hours_worked,
            hourly_rate: data.hourly_rate,
            daily_salary: dailySalary,
            description: data.description || null,
          })
          .eq('id', attendance.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('attendance')
          .insert([{
            worker_id: data.worker_id,
            workshop_id: data.workshop_id,
            work_date: data.work_date,
            hours_worked: data.hours_worked,
            hourly_rate: data.hourly_rate,
            daily_salary: dailySalary,
            description: data.description || null,
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

  const dailySalary = form.watch('hours_worked') * form.watch('hourly_rate');
  const selectedWorker = workers.find(w => w.id === form.watch('worker_id'));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? t('attendance.editEntry') : t('attendance.addEntry')}
          </DialogTitle>
          <DialogDescription>
            {t('attendance.recordDailyWork')}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Worker Selection with Combobox */}
            <FormField
              control={form.control}
              name="worker_id"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>{t('attendance.worker')} *</FormLabel>
                  <Popover open={workerOpen} onOpenChange={setWorkerOpen}>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={workerOpen}
                          className="w-full justify-between font-normal"
                        >
                          {selectedWorker?.name || t('attendance.selectWorker')}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                      <Command>
                        <CommandInput placeholder={t('common.search')} />
                        <CommandList className="max-h-[200px]">
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
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
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
                  <FormLabel>{t('common.workshop')} *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={t('workshops.selectWorkshop')} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {workshops.map((workshop) => (
                        <SelectItem key={workshop.id} value={workshop.id}>
                          {workshop.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="work_date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('common.date')} *</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="hours_worked"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('attendance.hours')}</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.5" min="0.5" max="24" {...field} />
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
                    <FormLabel>{t('attendance.hourlyRate')}</FormLabel>
                    <FormControl>
                      <Input type="number" min="1" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Daily salary preview */}
            <div className="p-3 rounded-lg bg-success/10 border border-success/20">
              <p className="text-sm text-muted-foreground">{t('attendance.dailySalary')}</p>
              <p className="text-xl font-bold font-mono text-success">
                {dailySalary.toLocaleString('fr-FR')} CFA
              </p>
            </div>

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('common.description')} ({t('common.optional')})</FormLabel>
                  <FormControl>
                    <Textarea placeholder={t('attendance.workNotes')} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {t('common.cancel')}
              </Button>
              <Button
                type="submit"
                disabled={mutation.isPending}
                className="bg-success text-success-foreground hover:bg-success/90"
              >
                {mutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {isEditing ? t('common.save') : t('common.add')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
