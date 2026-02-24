import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
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
import { format } from 'date-fns';
import { Loader2, Plus, Minus, Sparkles, MinusCircle, Edit, Trash2, Check, ChevronsUpDown, Calendar, Building2, Car } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Adjustment {
  id: string;
  worker_id: string;
  adjustment_type: string;
  amount: number;
  reason: string | null;
  work_date: string;
  workshop_id: string;
  is_paid: boolean;
  workers?: { name: string } | null;
  workshops?: { name: string } | null;
}

export default function WorkerAdjustmentsForm() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [selectedWorkshop, setSelectedWorkshop] = useState('');
  const [selectedWorker, setSelectedWorker] = useState('');
  const [workerOpen, setWorkerOpen] = useState(false);
  const [adjustmentType, setAdjustmentType] = useState<'bonus' | 'discount' | 'taxi'>('bonus');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [editingAdjustment, setEditingAdjustment] = useState<Adjustment | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editReason, setEditReason] = useState('');

  const { data: workers = [] } = useQuery({
    queryKey: ['workers-active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workers')
        .select('id, name, hourly_rate')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data || [];
    },
  });

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

  // Fetch today's adjustments for selected workshop
  const { data: todayAdjustments = [], isLoading: loadingAdjustments } = useQuery({
    queryKey: ['worker-adjustments', selectedDate, selectedWorkshop],
    queryFn: async () => {
      if (!selectedWorkshop) return [];
      const { data, error } = await supabase
        .from('worker_adjustments')
        .select('*, workers:worker_id(name), workshops:workshop_id(name)')
        .eq('work_date', selectedDate)
        .eq('workshop_id', selectedWorkshop)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as Adjustment[];
    },
    enabled: !!selectedWorkshop,
  });

  const addAdjustment = useMutation({
    mutationFn: async () => {
      if (!selectedWorker || !selectedWorkshop || !amount || !user?.id) return;
      const { error } = await supabase
        .from('worker_adjustments')
        .insert({
          worker_id: selectedWorker,
          workshop_id: selectedWorkshop,
          adjustment_type: adjustmentType,
          amount: Number(amount),
          reason: reason.trim() || null,
          work_date: selectedDate,
          created_by: user.id,
        });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['worker-adjustments'] });
      queryClient.invalidateQueries({ queryKey: ['all-worker-adjustments'] });
      setAmount('');
      setReason('');
      toast({
        title: t('adjustments.added'),
        description: t('adjustments.addedDesc'),
      });
    },
    onError: (error: Error) => {
      toast({ title: t('errors.error'), description: error.message, variant: 'destructive' });
    },
  });

  const updateAdjustment = useMutation({
    mutationFn: async () => {
      if (!editingAdjustment) return;
      const { error } = await supabase
        .from('worker_adjustments')
        .update({
          amount: Number(editAmount),
          reason: editReason.trim() || null,
        })
        .eq('id', editingAdjustment.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['worker-adjustments'] });
      queryClient.invalidateQueries({ queryKey: ['all-worker-adjustments'] });
      setEditingAdjustment(null);
      toast({ title: t('adjustments.updated'), description: t('adjustments.updatedDesc') });
    },
    onError: (error: Error) => {
      toast({ title: t('errors.error'), description: error.message, variant: 'destructive' });
    },
  });

  const deleteAdjustment = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('worker_adjustments')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['worker-adjustments'] });
      queryClient.invalidateQueries({ queryKey: ['all-worker-adjustments'] });
      toast({ title: t('adjustments.deleted'), description: t('adjustments.deletedDesc') });
    },
    onError: (error: Error) => {
      toast({ title: t('errors.error'), description: error.message, variant: 'destructive' });
    },
  });

  const openEdit = (adj: Adjustment) => {
    setEditingAdjustment(adj);
    setEditAmount(adj.amount.toString());
    setEditReason(adj.reason || '');
  };

  const selectedWorkerObj = workers.find(w => w.id === selectedWorker);
  const canSubmit = selectedWorker && selectedWorkshop && amount && Number(amount) > 0;

  const totalBonuses = todayAdjustments
    .filter(a => a.adjustment_type === 'bonus')
    .reduce((sum, a) => sum + Number(a.amount), 0);
  const totalTaxi = todayAdjustments
    .filter(a => a.adjustment_type === 'taxi')
    .reduce((sum, a) => sum + Number(a.amount), 0);
  const totalDiscounts = todayAdjustments
    .filter(a => a.adjustment_type === 'discount')
    .reduce((sum, a) => sum + Number(a.amount), 0);

  return (
    <>
      <Card className="shadow-card">
        <CardHeader className="pb-3 px-3 md:px-6 pt-3 md:pt-6">
          <CardTitle className="text-base md:text-lg flex items-center gap-2">
            <Sparkles className="w-4 h-4 md:w-5 md:h-5" />
            {t('adjustments.title')}
          </CardTitle>
          <CardDescription className="text-xs md:text-sm">
            {t('adjustments.description')}
          </CardDescription>
        </CardHeader>

        <CardContent className="px-3 md:px-6 pb-3 md:pb-6 space-y-4">
          {/* Date and Workshop */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" />
                {t('common.date')}
              </Label>
              <Input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
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
          </div>

          {!selectedWorkshop ? (
            <p className="text-center text-muted-foreground py-6 text-sm">
              {t('attendance.selectWorkshopFirst')}
            </p>
          ) : (
            <>
              {/* Add adjustment form */}
              <div className="space-y-3 p-3 border rounded-lg">
                {/* Worker selector */}
                <div className="space-y-1.5">
                  <Label className="text-xs">{t('attendance.worker')}</Label>
                  <Popover open={workerOpen} onOpenChange={setWorkerOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        className="w-full justify-between font-normal h-9 text-sm"
                      >
                        <span className="truncate">{selectedWorkerObj?.name || t('attendance.selectWorker')}</span>
                        <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-50" />
                      </Button>
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
                                  setSelectedWorker(worker.id);
                                  setWorkerOpen(false);
                                }}
                                className="text-sm"
                              >
                                <Check className={cn("mr-2 h-3.5 w-3.5", selectedWorker === worker.id ? "opacity-100" : "opacity-0")} />
                                {worker.name}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>

                {/* Type + Amount + Reason */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1.5 col-span-2">
                    <Label className="text-xs">{t('adjustments.type')}</Label>
                    <div className="flex gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant={adjustmentType === 'bonus' ? 'default' : 'outline'}
                        onClick={() => setAdjustmentType('bonus')}
                        className={cn("flex-1 h-8 text-xs gap-1", adjustmentType === 'bonus' && "bg-success text-success-foreground hover:bg-success/90")}
                      >
                        <Plus className="w-3 h-3" />
                        {t('adjustments.bonus')}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={adjustmentType === 'taxi' ? 'default' : 'outline'}
                        onClick={() => setAdjustmentType('taxi')}
                        className={cn("flex-1 h-8 text-xs gap-1", adjustmentType === 'taxi' && "bg-blue-600 text-white hover:bg-blue-700")}
                      >
                        <Car className="w-3 h-3" />
                        {t('adjustments.taxi')}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={adjustmentType === 'discount' ? 'default' : 'outline'}
                        onClick={() => setAdjustmentType('discount')}
                        className={cn("flex-1 h-8 text-xs gap-1", adjustmentType === 'discount' && "bg-destructive text-destructive-foreground hover:bg-destructive/90")}
                      >
                        <Minus className="w-3 h-3" />
                        {t('adjustments.discount')}
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t('common.amount')}</Label>
                    <Input
                      type="number"
                      min="1"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0 CFA"
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">{t('common.reason')} ({t('common.optional')})</Label>
                  <Input
                    type="text"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder={t('adjustments.reasonPlaceholder')}
                    className="h-8 text-xs"
                  />
                </div>

                <Button
                  onClick={() => addAdjustment.mutate()}
                  disabled={!canSubmit || addAdjustment.isPending}
                  size="sm"
                  className={cn(
                    "w-full gap-1.5",
                    adjustmentType === 'bonus'
                      ? "bg-success text-success-foreground hover:bg-success/90"
                      : adjustmentType === 'taxi'
                      ? "bg-blue-600 text-white hover:bg-blue-700"
                      : "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  )}
                >
                  {addAdjustment.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : adjustmentType === 'bonus' ? (
                    <Plus className="w-3.5 h-3.5" />
                  ) : adjustmentType === 'taxi' ? (
                    <Car className="w-3.5 h-3.5" />
                  ) : (
                    <Minus className="w-3.5 h-3.5" />
                  )}
                  {t('adjustments.addAdjustment')}
                </Button>
              </div>

              {/* Today's adjustments list */}
              {loadingAdjustments ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : todayAdjustments.length > 0 ? (
                <div className="space-y-2">
                  {/* Summary */}
                  <div className="flex items-center gap-3 text-xs flex-wrap">
                    {totalBonuses > 0 && (
                      <Badge variant="secondary" className="gap-1 bg-success/15 text-success">
                        <Sparkles className="w-3 h-3" />
                        +{totalBonuses.toLocaleString('fr-FR')} CFA
                      </Badge>
                    )}
                    {totalTaxi > 0 && (
                      <Badge variant="secondary" className="gap-1 bg-blue-600/15 text-blue-600">
                        <Car className="w-3 h-3" />
                        +{totalTaxi.toLocaleString('fr-FR')} CFA
                      </Badge>
                    )}
                    {totalDiscounts > 0 && (
                      <Badge variant="secondary" className="gap-1 bg-destructive/15 text-destructive">
                        <MinusCircle className="w-3 h-3" />
                        -{totalDiscounts.toLocaleString('fr-FR')} CFA
                      </Badge>
                    )}
                  </div>

                  {/* List */}
                  {todayAdjustments.map((adj) => (
                    <div
                      key={adj.id}
                      className={cn(
                        "flex items-center justify-between p-2.5 border rounded-lg",
                        adj.adjustment_type === 'bonus' ? "border-success/30 bg-success/5" 
                          : adj.adjustment_type === 'taxi' ? "border-blue-600/30 bg-blue-600/5"
                          : "border-destructive/30 bg-destructive/5",
                        adj.is_paid && "opacity-60"
                      )}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          {adj.adjustment_type === 'bonus' ? (
                            <Sparkles className="w-3 h-3 text-success shrink-0" />
                          ) : adj.adjustment_type === 'taxi' ? (
                            <Car className="w-3 h-3 text-blue-600 shrink-0" />
                          ) : (
                            <MinusCircle className="w-3 h-3 text-destructive shrink-0" />
                          )}
                          <span className="text-sm font-medium truncate">
                            {(adj.workers as any)?.name}
                          </span>
                          {adj.is_paid && (
                            <Badge variant="secondary" className="text-[10px]">{t('adjustments.paid')}</Badge>
                          )}
                        </div>
                        {adj.reason && (
                          <p className="text-[10px] text-muted-foreground mt-0.5 ml-4.5 line-clamp-1">
                            {adj.reason}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0 ml-2">
                        <span className={cn(
                          "text-sm font-mono font-medium",
                          adj.adjustment_type === 'discount' ? 'text-destructive' : adj.adjustment_type === 'taxi' ? 'text-blue-600' : 'text-success'
                        )}>
                          {adj.adjustment_type === 'discount' ? '-' : '+'}{Number(adj.amount).toLocaleString('fr-FR')}
                        </span>
                        {!adj.is_paid && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEdit(adj)}
                              className="h-6 w-6"
                            >
                              <Edit className="w-3 h-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => deleteAdjustment.mutate(adj.id)}
                              className="h-6 w-6 text-destructive hover:text-destructive"
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-4 text-xs">
                  {t('adjustments.noAdjustments')}
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={!!editingAdjustment} onOpenChange={(open) => !open && setEditingAdjustment(null)}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle className="text-base">{t('adjustments.editAdjustment')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">{t('common.amount')}</Label>
              <Input
                type="number"
                min="1"
                value={editAmount}
                onChange={(e) => setEditAmount(e.target.value)}
                className="h-9 text-sm font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t('common.reason')}</Label>
              <Input
                type="text"
                value={editReason}
                onChange={(e) => setEditReason(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setEditingAdjustment(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              size="sm"
              onClick={() => updateAdjustment.mutate()}
              disabled={updateAdjustment.isPending || !editAmount || Number(editAmount) <= 0}
            >
              {updateAdjustment.isPending && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
              {t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
