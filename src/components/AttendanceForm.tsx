import { useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
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
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { format } from 'date-fns';

const attendanceSchema = z.object({
  worker_name: z
    .string()
    .trim()
    .min(1, 'Worker name is required')
    .max(150, 'Worker name is too long'),
  workshop_name: z
    .string()
    .trim()
    .min(1, 'Workshop name is required')
    .max(150, 'Workshop name is too long'),
  work_date: z.string().min(1, 'Date is required'),
  hours_worked: z.coerce.number().min(0.5, 'Minimum 0.5 hours').max(24, 'Maximum 24 hours'),
  hourly_rate: z.coerce.number().min(1, 'Hourly rate must be at least 1'),
  description: z.string().max(500).optional(),
});

type AttendanceFormData = z.infer<typeof attendanceSchema>;

interface AttendanceFormProps {
  attendance?: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function AttendanceForm({ 
  attendance,
  open, 
  onOpenChange 
}: AttendanceFormProps) {
  const { t } = useTranslation();
  const { user, role } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isEditing = !!attendance;

  const form = useForm<AttendanceFormData>({
    resolver: zodResolver(attendanceSchema),
    defaultValues: {
      worker_name: '',
      workshop_name: '',
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
          worker_name: attendance.worker_name,
          workshop_name: attendance.workshop_name,
          work_date: attendance.work_date,
          hours_worked: attendance.hours_worked,
          hourly_rate: attendance.hourly_rate,
          description: attendance.description || '',
        });
      } else {
        form.reset({
          worker_name: '',
          workshop_name: '',
          work_date: format(new Date(), 'yyyy-MM-dd'),
          hours_worked: 8,
          hourly_rate: 1000,
          description: '',
        });
      }
    }
  }, [attendance, open, form]);

  const mutation = useMutation({
    mutationFn: async (data: AttendanceFormData) => {
      const payload = {
        worker_name: data.worker_name.trim(),
        workshop_name: data.workshop_name.trim(),
        work_date: data.work_date,
        hours_worked: data.hours_worked,
        hourly_rate: data.hourly_rate,
        description: data.description?.trim() ? data.description.trim() : null,
      };

      if (isEditing) {
        const { error } = await supabase
          .from('attendance')
          .update(payload)
          .eq('id', attendance.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('attendance')
          .insert([{ 
            ...payload,
            created_by: user?.id,
            status: role === 'admin' ? 'approved' : 'pending',
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
            <FormField
              control={form.control}
              name="worker_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('attendance.workerName')}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t('attendance.workerNamePlaceholder')}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="workshop_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('attendance.workshopName')}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t('attendance.workshopNamePlaceholder')}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="work_date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('common.date')}</FormLabel>
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

            {role !== 'admin' && (
              <p className="text-xs text-muted-foreground text-center">
                {t('attendance.awaitingApproval')}
              </p>
            )}
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
