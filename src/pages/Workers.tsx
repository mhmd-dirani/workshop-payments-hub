import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/lib/auth';
import { Navigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import Layout from '@/components/Layout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, Users, Edit, UserX, UserCheck, ChevronRight, Wallet } from 'lucide-react';
import WorkerDetails from '@/components/WorkerDetails';

interface Worker {
  id: string;
  name: string;
  hourly_rate: number;
  is_active: boolean;
  created_at: string;
}

export default function Workers() {
  const { t } = useTranslation();
  const { user, loading } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingWorker, setEditingWorker] = useState<Worker | null>(null);
  const [workerToToggle, setWorkerToToggle] = useState<Worker | null>(null);
  const [selectedWorker, setSelectedWorker] = useState<Worker | null>(null);
  const [workerName, setWorkerName] = useState('');
  const [workerRate, setWorkerRate] = useState('1000');
  const [showInactive, setShowInactive] = useState(false);

  const { data: workers = [], isLoading } = useQuery({
    queryKey: ['workers', showInactive],
    queryFn: async () => {
      let query = supabase
        .from('workers')
        .select('*')
        .order('name');
      
      if (!showInactive) {
        query = query.eq('is_active', true);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data as Worker[];
    },
  });

  const addWorker = useMutation({
    mutationFn: async ({ name, hourly_rate }: { name: string; hourly_rate: number }) => {
      const { error } = await supabase.from('workers').insert([{
        name: name.trim(),
        hourly_rate,
        created_by: user?.id,
      }]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workers'] });
      setIsAddOpen(false);
      setWorkerName('');
      setWorkerRate('1000');
      toast({ title: t('workers.added'), description: t('workers.addedDesc') });
    },
    onError: (error: Error) => {
      toast({ title: t('errors.error'), description: error.message, variant: 'destructive' });
    },
  });

  const updateWorker = useMutation({
    mutationFn: async ({ id, name, hourly_rate }: { id: string; name: string; hourly_rate: number }) => {
      const { error } = await supabase
        .from('workers')
        .update({ name: name.trim(), hourly_rate })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workers'] });
      setEditingWorker(null);
      setWorkerName('');
      setWorkerRate('1000');
      toast({ title: t('workers.updated'), description: t('workers.updatedDesc') });
    },
  });

  const toggleWorkerStatus = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('workers')
        .update({ is_active })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['workers'] });
      setWorkerToToggle(null);
      toast({
        title: vars.is_active ? t('workers.activated') : t('workers.deactivated'),
        description: vars.is_active ? t('workers.activatedDesc') : t('workers.deactivatedDesc'),
      });
    },
  });

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (workerName.trim() && workerRate) {
      addWorker.mutate({ name: workerName, hourly_rate: parseFloat(workerRate) });
    }
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingWorker && workerName.trim() && workerRate) {
      updateWorker.mutate({ id: editingWorker.id, name: workerName, hourly_rate: parseFloat(workerRate) });
    }
  };

  const openEdit = (worker: Worker, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingWorker(worker);
    setWorkerName(worker.name);
    setWorkerRate(worker.hourly_rate.toString());
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      </Layout>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // If a worker is selected, show their details
  if (selectedWorker) {
    return (
      <Layout>
        <WorkerDetails 
          worker={selectedWorker} 
          onBack={() => setSelectedWorker(null)} 
        />
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-3 md:space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-lg md:text-2xl font-bold flex items-center gap-2">
              <Users className="w-5 h-5 md:w-6 md:h-6" />
              {t('workers.title')}
            </h1>
            <p className="text-xs md:text-sm text-muted-foreground">
              {t('workers.manageDescription')}
            </p>
          </div>
          
          <Button
            onClick={() => setIsAddOpen(true)}
            size="sm"
            className="gap-1.5 bg-success text-success-foreground hover:bg-success/90 h-8 text-xs md:text-sm md:h-9"
          >
            <Plus className="w-3.5 h-3.5 md:w-4 md:h-4" />
            {t('workers.addWorker')}
          </Button>
        </div>

        {/* Filter toggle */}
        <div className="flex gap-2">
          <Button
            variant={showInactive ? "secondary" : "outline"}
            size="sm"
            onClick={() => setShowInactive(!showInactive)}
            className="text-xs h-8"
          >
            {showInactive ? t('workers.hideInactive') : t('workers.showInactive')}
          </Button>
        </div>

        {/* Workers Grid */}
        <Card className="shadow-card">
          <CardContent className="p-3 md:p-6">
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : workers.length === 0 ? (
              <p className="text-center text-muted-foreground py-8 text-sm">
                {t('workers.noWorkers')}
              </p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {workers.map((worker) => (
                  <div
                    key={worker.id}
                    onClick={() => worker.is_active && setSelectedWorker(worker)}
                    className={`border rounded-lg p-3 transition-colors ${
                      worker.is_active 
                        ? 'cursor-pointer hover:bg-muted/50' 
                        : 'opacity-60 bg-muted/50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <div className={`w-2 h-2 rounded-full shrink-0 ${worker.is_active ? 'bg-success' : 'bg-muted-foreground'}`} />
                        <div className="min-w-0">
                          <span className="font-medium text-sm block truncate">{worker.name}</span>
                          <span className="text-xs text-muted-foreground font-mono">
                            {worker.hourly_rate.toLocaleString('fr-FR')} CFA/h
                          </span>
                        </div>
                        {!worker.is_active && (
                          <Badge variant="secondary" className="text-[10px] shrink-0">
                            {t('workers.inactive')}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => openEdit(worker, e)}
                          className="h-7 w-7"
                          title={t('common.edit')}
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            setWorkerToToggle(worker);
                          }}
                          className="h-7 w-7"
                          title={worker.is_active ? t('workers.deactivate') : t('workers.activate')}
                        >
                          {worker.is_active ? (
                            <UserX className="w-3.5 h-3.5 text-warning" />
                          ) : (
                            <UserCheck className="w-3.5 h-3.5 text-success" />
                          )}
                        </Button>
                        {worker.is_active && (
                          <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Add Worker Dialog */}
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>{t('workers.addWorker')}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAddSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">{t('workers.workerName')}</Label>
                <Input
                  id="name"
                  placeholder={t('workers.workerName')}
                  value={workerName}
                  onChange={(e) => setWorkerName(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rate">{t('attendance.hourlyRate')} (CFA)</Label>
                <Input
                  id="rate"
                  type="number"
                  min="1"
                  placeholder="1000"
                  value={workerRate}
                  onChange={(e) => setWorkerRate(e.target.value)}
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>
                  {t('common.cancel')}
                </Button>
                <Button
                  type="submit"
                  disabled={!workerName.trim() || !workerRate || addWorker.isPending}
                  className="bg-success text-success-foreground hover:bg-success/90"
                >
                  {addWorker.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {t('common.add')}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Edit Worker Dialog */}
        <Dialog open={!!editingWorker} onOpenChange={(open) => !open && setEditingWorker(null)}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>{t('workers.editWorker')}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">{t('workers.workerName')}</Label>
                <Input
                  id="edit-name"
                  placeholder={t('workers.workerName')}
                  value={workerName}
                  onChange={(e) => setWorkerName(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-rate">{t('attendance.hourlyRate')} (CFA)</Label>
                <Input
                  id="edit-rate"
                  type="number"
                  min="1"
                  placeholder="1000"
                  value={workerRate}
                  onChange={(e) => setWorkerRate(e.target.value)}
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditingWorker(null)}>
                  {t('common.cancel')}
                </Button>
                <Button type="submit" disabled={!workerName.trim() || !workerRate || updateWorker.isPending}>
                  {updateWorker.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {t('common.save')}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Toggle Status Confirmation */}
        <AlertDialog open={!!workerToToggle} onOpenChange={(open) => !open && setWorkerToToggle(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {workerToToggle?.is_active ? t('workers.deactivateConfirm') : t('workers.activateConfirm')}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {workerToToggle?.is_active 
                  ? t('workers.deactivateWarning', { name: workerToToggle?.name })
                  : t('workers.activateWarning', { name: workerToToggle?.name })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => workerToToggle && toggleWorkerStatus.mutate({ 
                  id: workerToToggle.id, 
                  is_active: !workerToToggle.is_active 
                })}
                className={workerToToggle?.is_active 
                  ? "bg-warning text-warning-foreground hover:bg-warning/90"
                  : "bg-success text-success-foreground hover:bg-success/90"
                }
              >
                {workerToToggle?.is_active ? t('workers.deactivate') : t('workers.activate')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </Layout>
  );
}
