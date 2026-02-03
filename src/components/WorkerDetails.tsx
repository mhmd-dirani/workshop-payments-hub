import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { format, startOfWeek } from 'date-fns';
import { 
  ArrowLeft, 
  DollarSign, 
  Wallet, 
  Calendar, 
  Loader2, 
  Building2, 
  History,
  CheckCircle2,
  Edit,
  Trash2,
  Sparkles
} from 'lucide-react';

interface Worker {
  id: string;
  name: string;
  hourly_rate: number;
  is_active: boolean;
}

interface WorkerDetailsProps {
  worker: Worker;
  onBack: () => void;
}

interface EditingAttendance {
  id: string;
  work_date: string;
  hourly_rate: number;
  workshop_id: string;
  has_extra: boolean;
  extra_amount: number;
}

// Helper function to get week range (Monday to Saturday) for a given date
function getWeekRange(date: Date): { weekLabel: string; monday: Date } {
  // Get the Monday of the week (week starts on Monday)
  const monday = startOfWeek(date, { weekStartsOn: 1 });
  // Saturday is 5 days after Monday
  const saturday = new Date(monday);
  saturday.setDate(monday.getDate() + 5);
  
  const weekLabel = `${format(monday, 'dd/MM')} - ${format(saturday, 'dd/MM')}`;
  
  return { weekLabel, monday };
}

// Group attendance entries by the week they were worked
function groupByWorkWeek(entries: any[]): Record<string, any[]> {
  return entries.reduce((acc, entry) => {
    const workDate = new Date(entry.work_date);
    const { weekLabel } = getWeekRange(workDate);
    if (!acc[weekLabel]) {
      acc[weekLabel] = [];
    }
    acc[weekLabel].push(entry);
    return acc;
  }, {} as Record<string, any[]>);
}

export default function WorkerDetails({ worker, onBack }: WorkerDetailsProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isPayOpen, setIsPayOpen] = useState(false);
  const [editingAttendance, setEditingAttendance] = useState<EditingAttendance | null>(null);

  // Fetch unpaid attendance for this worker
  const { data: unpaidAttendance = [], isLoading: loadingUnpaid } = useQuery({
    queryKey: ['worker-unpaid-attendance', worker.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('attendance')
        .select(`
          *,
          workshops:workshop_id(id, name)
        `)
        .eq('worker_id', worker.id)
        .eq('is_paid', false)
        .order('work_date', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch paid/archived attendance
  const { data: paidAttendance = [], isLoading: loadingPaid } = useQuery({
    queryKey: ['worker-paid-attendance', worker.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('attendance')
        .select(`
          *,
          workshops:workshop_id(id, name),
          payments:payment_id(id, status, payment_date, reason)
        `)
        .eq('worker_id', worker.id)
        .eq('is_paid', true)
        .order('work_date', { ascending: false })
        .limit(50);
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

  const totalOwed = unpaidAttendance.reduce((sum, a) => sum + Number(a.daily_salary), 0);
  const totalDays = unpaidAttendance.length;

  // Group unpaid by workshop for display
  const unpaidByWorkshop = unpaidAttendance.reduce((acc, entry) => {
    const workshopId = entry.workshop_id;
    const workshopName = (entry.workshops as any)?.name || 'Unknown';
    if (!acc[workshopId]) {
      acc[workshopId] = { name: workshopName, total: 0, entries: [] };
    }
    acc[workshopId].total += Number(entry.daily_salary);
    acc[workshopId].entries.push(entry);
    return acc;
  }, {} as Record<string, { name: string; total: number; entries: any[] }>);

  // Update attendance mutation
  const updateAttendance = useMutation({
    mutationFn: async ({ id, work_date, hourly_rate, workshop_id, has_extra, extra_amount }: EditingAttendance) => {
      const { error } = await supabase
        .from('attendance')
        .update({ 
          work_date, 
          hourly_rate, 
          workshop_id,
          has_extra,
          extra_amount: has_extra ? extra_amount : 0,
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['worker-unpaid-attendance'] });
      queryClient.invalidateQueries({ queryKey: ['attendance'] });
      setEditingAttendance(null);
      toast({ title: t('attendance.updated'), description: t('attendance.updatedDesc') });
    },
    onError: (error: Error) => {
      toast({ title: t('errors.error'), description: error.message, variant: 'destructive' });
    },
  });

  // Delete attendance mutation
  const deleteAttendance = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('attendance').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['worker-unpaid-attendance'] });
      queryClient.invalidateQueries({ queryKey: ['attendance'] });
      toast({ title: t('attendance.deleted'), description: t('attendance.deletedDesc') });
    },
    onError: (error: Error) => {
      toast({ title: t('errors.error'), description: error.message, variant: 'destructive' });
    },
  });

  // Create payment mutation - pays ALL unpaid work across ALL workshops
  // Groups payments by workshop AND by work week, using "Travailleur" as paid_to
  const createPayment = useMutation({
    mutationFn: async () => {
      const results: any[] = [];
      
      // First, group all unpaid attendance by work week
      const byWeek = groupByWorkWeek(unpaidAttendance);
      
      // Process each week separately
      for (const [weekLabel, weekEntries] of Object.entries(byWeek)) {
        // Group this week's entries by workshop
        const byWorkshop = (weekEntries as any[]).reduce((acc, entry) => {
          const workshopId = entry.workshop_id;
          if (!acc[workshopId]) {
            acc[workshopId] = { entries: [], total: 0 };
          }
          acc[workshopId].entries.push(entry);
          acc[workshopId].total += Number(entry.daily_salary);
          return acc;
        }, {} as Record<string, { entries: any[]; total: number }>);
        
        // Process each workshop for this week
        for (const [workshopId, workshopData] of Object.entries(byWorkshop) as [string, { entries: any[]; total: number }][]) {
          const { entries, total } = workshopData;
          // Check if there's already a "Travailleur" payment for this week in this workshop
          const { data: existingPayment } = await supabase
            .from('payments')
            .select('*')
            .eq('workshop_id', workshopId)
            .eq('paid_to', 'Travailleur')
            .eq('reason', weekLabel)
            .single();
          
          let paymentId: string;
          
          if (existingPayment) {
            // Update existing payment by adding this worker's amount
            const newAmount = Number(existingPayment.amount) + (total as number);
            const { error: updateError } = await supabase
              .from('payments')
              .update({ amount: newAmount })
              .eq('id', existingPayment.id);
            
            if (updateError) throw updateError;
            paymentId = existingPayment.id;
          } else {
            // Create new payment for this workshop and week
            const { data: payment, error: paymentError } = await supabase
              .from('payments')
              .insert([{
                workshop_id: workshopId,
                paid_to: 'Travailleur',
                reason: weekLabel,
                amount: total as number,
                payment_date: format(new Date(), 'yyyy-MM-dd'),
                created_by: user?.id,
                status: 'pending',
              }])
              .select()
              .single();
            
            if (paymentError) throw paymentError;
            paymentId = payment.id;
          }
          
          // Mark attendance entries as paid and link to payment
          const entryIds = (entries as any[]).map((a: any) => a.id);
          
          if (entryIds.length > 0) {
            const { error: updateError } = await supabase
              .from('attendance')
              .update({ is_paid: true, payment_id: paymentId })
              .in('id', entryIds);
            
            if (updateError) throw updateError;
          }
          
          results.push({ workshopId, weekLabel, paymentId, amount: total });
        }
      }
      
      return results;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['worker-unpaid-attendance'] });
      queryClient.invalidateQueries({ queryKey: ['worker-paid-attendance'] });
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      setIsPayOpen(false);
      toast({ 
        title: t('workers.paymentCreated'), 
        description: t('workers.paymentCreatedDesc') 
      });
    },
    onError: (error: Error) => {
      toast({ title: t('errors.error'), description: error.message, variant: 'destructive' });
    },
  });

  const handlePay = () => {
    if (totalOwed > 0) {
      createPayment.mutate();
    }
  };

  const openPayDialog = () => {
    setIsPayOpen(true);
  };

  const handleEditAttendance = (entry: any) => {
    setEditingAttendance({
      id: entry.id,
      work_date: entry.work_date,
      hourly_rate: Number(entry.hourly_rate),
      workshop_id: entry.workshop_id,
      has_extra: entry.has_extra || false,
      extra_amount: Number(entry.extra_amount) || 0,
    });
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingAttendance) {
      updateAttendance.mutate(editingAttendance);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack} className="h-8 w-8">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-lg md:text-2xl font-bold">{worker.name}</h1>
          <p className="text-xs md:text-sm text-muted-foreground font-mono">
            {worker.hourly_rate.toLocaleString('fr-FR')} CFA
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="shadow-card">
          <CardContent className="p-3 md:p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Calendar className="w-4 h-4" />
              <span className="text-xs">{t('workers.workDays')}</span>
            </div>
            <p className="text-xl md:text-2xl font-bold font-mono mt-1">{totalDays}</p>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardContent className="p-3 md:p-4">
            <div className="flex items-center gap-2 text-warning">
              <Wallet className="w-4 h-4" />
              <span className="text-xs">{t('workers.totalOwed')}</span>
            </div>
            <p className="text-xl md:text-2xl font-bold font-mono text-warning mt-1">
              {totalOwed.toLocaleString('fr-FR')} CFA
            </p>
          </CardContent>
        </Card>

      </div>

      {/* Pay Button - Only show if there's money owed */}
      {totalOwed > 0 && (
        <Button 
          onClick={() => openPayDialog()} 
          className="w-full bg-success text-success-foreground hover:bg-success/90 gap-2"
        >
          <Wallet className="w-4 h-4" />
          {t('workers.payWorker')}
        </Button>
      )}

      {/* Tabs for unpaid/history */}
      <Tabs defaultValue="unpaid" className="space-y-4">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="unpaid" className="gap-2">
            <DollarSign className="w-4 h-4" />
            {t('workers.unpaid')}
            {unpaidAttendance.length > 0 && (
              <Badge variant="secondary" className="ml-1">{unpaidAttendance.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-2">
            <History className="w-4 h-4" />
            {t('workers.paymentHistory')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="unpaid">
          {loadingUnpaid ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : Object.keys(unpaidByWorkshop).length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                <CheckCircle2 className="w-12 h-12 mx-auto mb-2 text-success" />
                <p>{t('workers.noPendingPayments')}</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {Object.entries(unpaidByWorkshop).map(([workshopId, { name, total, entries }]) => (
                <Card key={workshopId} className="shadow-card">
                  <CardHeader className="pb-2 px-3 pt-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-muted-foreground" />
                        <CardTitle className="text-sm">{name}</CardTitle>
                      </div>
                      <Badge variant="outline" className="text-xs font-mono">
                        {total.toLocaleString('fr-FR')} CFA
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="px-3 pb-3">
                    <div className="space-y-1">
                      {entries.map((entry) => (
                        <div key={entry.id} className="flex items-center justify-between text-sm py-2 border-b last:border-0">
                          <div className="flex flex-col">
                            <span className="font-mono text-xs">
                              {format(new Date(entry.work_date), 'EEE, dd/MM')}
                            </span>
                            {entry.has_extra && (
                              <div className="flex items-center gap-1 mt-0.5">
                                <Sparkles className="w-3 h-3 text-warning" />
                                <span className="text-[10px] text-warning">
                                  +{Number(entry.extra_amount).toLocaleString('fr-FR')} {t('attendance.extra')}
                                </span>
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="text-right">
                              <span className="font-mono font-medium">
                                {Number(entry.daily_salary).toLocaleString('fr-FR')} CFA
                              </span>
                              {entry.has_extra && (
                                <p className="text-[10px] text-muted-foreground font-mono">
                                  ({Number(entry.hourly_rate).toLocaleString('fr-FR')} + {Number(entry.extra_amount).toLocaleString('fr-FR')})
                                </p>
                              )}
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEditAttendance(entry)}
                              className="h-6 w-6"
                            >
                              <Edit className="w-3 h-3" />
                            </Button>
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
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="history">
          {loadingPaid ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : paidAttendance.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                <p>{t('workers.noPaymentHistory')}</p>
              </CardContent>
            </Card>
          ) : (
            <Card className="shadow-card">
              <CardContent className="p-0">
                <div className="md:hidden">
                  {paidAttendance.map((entry) => (
                    <div key={entry.id} className="p-3 border-b last:border-0">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-mono text-xs">
                            {format(new Date(entry.work_date), 'EEE, dd/MM/yyyy')}
                          </p>
                          <Badge variant="outline" className="text-[10px] mt-1">
                            {(entry.workshops as any)?.name}
                          </Badge>
                          {entry.has_extra && (
                            <div className="flex items-center gap-1 mt-1">
                              <Sparkles className="w-3 h-3 text-warning" />
                              <span className="text-[10px] text-warning">
                                +{Number(entry.extra_amount).toLocaleString('fr-FR')}
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="font-mono font-medium text-muted-foreground">
                            {Number(entry.daily_salary).toLocaleString('fr-FR')} CFA
                          </p>
                          <Badge 
                            variant={(entry.payments as any)?.status === 'approved' ? 'default' : 'secondary'}
                            className="text-[10px] mt-1"
                          >
                            {(entry.payments as any)?.status || 'paid'}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('common.date')}</TableHead>
                        <TableHead>{t('common.workshop')}</TableHead>
                        <TableHead>{t('attendance.dailySalary')}</TableHead>
                        <TableHead>{t('attendance.extra')}</TableHead>
                        <TableHead>{t('common.status')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paidAttendance.map((entry) => (
                        <TableRow key={entry.id}>
                          <TableCell className="font-mono">
                            {format(new Date(entry.work_date), 'MMM d, yyyy')}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{(entry.workshops as any)?.name}</Badge>
                          </TableCell>
                          <TableCell className="font-mono">
                            {Number(entry.daily_salary).toLocaleString('fr-FR')} CFA
                          </TableCell>
                          <TableCell>
                            {entry.has_extra ? (
                              <Badge variant="secondary" className="gap-1">
                                <Sparkles className="w-3 h-3" />
                                +{Number(entry.extra_amount).toLocaleString('fr-FR')}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge 
                              variant={(entry.payments as any)?.status === 'approved' ? 'default' : 'secondary'}
                            >
                              {(entry.payments as any)?.status || 'paid'}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Pay Dialog - Simple confirmation */}
      <Dialog open={isPayOpen} onOpenChange={setIsPayOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('workers.payWorker')}</DialogTitle>
            <DialogDescription>
              {t('workers.payAllDescription', { name: worker.name })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Summary of what will be paid */}
            <div className="space-y-2">
              <p className="text-sm font-medium">{t('workers.paymentSummary')}:</p>
              {Object.entries(unpaidByWorkshop).map(([workshopId, { name, total }]) => (
                <div key={workshopId} className="flex items-center justify-between text-sm p-2 rounded-lg bg-muted">
                  <span className="flex items-center gap-2">
                    <Building2 className="w-3.5 h-3.5" />
                    {name}
                  </span>
                  <span className="font-mono font-medium">{total.toLocaleString('fr-FR')} CFA</span>
                </div>
              ))}
              <div className="flex items-center justify-between text-base font-bold p-2 rounded-lg bg-success/10 border border-success/20">
                <span>{t('common.total')}</span>
                <span className="font-mono text-success">{totalOwed.toLocaleString('fr-FR')} CFA</span>
              </div>
            </div>
            
            <p className="text-xs text-muted-foreground">
              {t('workers.weeklyPaymentNote')}
            </p>
            
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsPayOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button
                onClick={handlePay}
                disabled={createPayment.isPending}
                className="bg-success text-success-foreground hover:bg-success/90"
              >
                {createPayment.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {t('workers.confirmPayment')}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Attendance Dialog */}
      <Dialog open={!!editingAttendance} onOpenChange={(open) => !open && setEditingAttendance(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('attendance.editAttendance')}</DialogTitle>
            <DialogDescription>
              {t('attendance.updateAttendance')}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveEdit} className="space-y-4">
            <div className="space-y-2">
              <Label>{t('common.date')}</Label>
              <Input
                type="date"
                value={editingAttendance?.work_date || ''}
                onChange={(e) => setEditingAttendance(prev => prev ? { ...prev, work_date: e.target.value } : null)}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('attendance.dailyRate')} (CFA)</Label>
              <Input
                type="number"
                min="1"
                value={editingAttendance?.hourly_rate || ''}
                onChange={(e) => setEditingAttendance(prev => prev ? { ...prev, hourly_rate: Number(e.target.value) } : null)}
                placeholder="0"
              />
            </div>
            <div className="space-y-2">
              <Label>{t('common.workshop')}</Label>
              <Select 
                value={editingAttendance?.workshop_id || ''} 
                onValueChange={(v) => setEditingAttendance(prev => prev ? { ...prev, workshop_id: v } : null)}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('workshopSelector.selectWorkshop')} />
                </SelectTrigger>
                <SelectContent>
                  {workshops.map((w) => (
                    <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {/* Extra Work Section */}
            <div className="space-y-3 pt-2 border-t">
              <div className="flex items-center justify-between">
                <Label htmlFor="edit-has-extra" className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-warning" />
                  {t('attendance.workedExtra')}
                </Label>
                <Switch
                  id="edit-has-extra"
                  checked={editingAttendance?.has_extra || false}
                  onCheckedChange={(checked) => setEditingAttendance(prev => prev ? { ...prev, has_extra: checked } : null)}
                />
              </div>
              {editingAttendance?.has_extra && (
                <div className="space-y-2">
                  <Label>{t('attendance.extraAmount')} (CFA)</Label>
                  <Input
                    type="number"
                    min="0"
                    value={editingAttendance?.extra_amount || ''}
                    onChange={(e) => setEditingAttendance(prev => prev ? { ...prev, extra_amount: Number(e.target.value) } : null)}
                    placeholder="0"
                  />
                </div>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditingAttendance(null)}>
                {t('common.cancel')}
              </Button>
              <Button
                type="submit"
                disabled={updateAttendance.isPending}
              >
                {updateAttendance.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {t('common.save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
