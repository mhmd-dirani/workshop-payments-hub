import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
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
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, Users, Trash2, Edit, UserX, UserCheck } from 'lucide-react';

interface Worker {
  id: string;
  name: string;
  is_active: boolean;
  created_at: string;
}

export default function WorkerManager() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingWorker, setEditingWorker] = useState<Worker | null>(null);
  const [workerToDelete, setWorkerToDelete] = useState<Worker | null>(null);
  const [workerName, setWorkerName] = useState('');
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
    mutationFn: async (name: string) => {
      const { error } = await supabase.from('workers').insert([{
        name: name.trim(),
        created_by: user?.id,
      }]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workers'] });
      setIsAddOpen(false);
      setWorkerName('');
      toast({ title: t('workers.added'), description: t('workers.addedDesc') });
    },
    onError: (error: Error) => {
      toast({ title: t('errors.error'), description: error.message, variant: 'destructive' });
    },
  });

  const updateWorker = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase
        .from('workers')
        .update({ name: name.trim() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workers'] });
      setEditingWorker(null);
      setWorkerName('');
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
      toast({
        title: vars.is_active ? t('workers.activated') : t('workers.deactivated'),
        description: vars.is_active ? t('workers.activatedDesc') : t('workers.deactivatedDesc'),
      });
    },
  });

  const deleteWorker = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('workers').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workers'] });
      setWorkerToDelete(null);
      toast({ title: t('workers.deleted'), description: t('workers.deletedDesc') });
    },
  });

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (workerName.trim()) {
      addWorker.mutate(workerName);
    }
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingWorker && workerName.trim()) {
      updateWorker.mutate({ id: editingWorker.id, name: workerName });
    }
  };

  const openEdit = (worker: Worker) => {
    setEditingWorker(worker);
    setWorkerName(worker.name);
  };

  return (
    <>
      <Card className="shadow-card">
        <CardHeader className="pb-3 px-3 md:px-6 pt-3 md:pt-6">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="text-base md:text-lg flex items-center gap-2">
                <Users className="w-4 h-4 md:w-5 md:h-5" />
                {t('workers.title')}
              </CardTitle>
              <CardDescription className="text-xs md:text-sm">
                {t('workers.description')}
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant={showInactive ? "secondary" : "outline"}
                size="sm"
                onClick={() => setShowInactive(!showInactive)}
                className="text-xs h-8"
              >
                {showInactive ? t('workers.hideInactive') : t('workers.showInactive')}
              </Button>
              <Button
                size="sm"
                onClick={() => setIsAddOpen(true)}
                className="gap-1 h-8 text-xs bg-success text-success-foreground hover:bg-success/90"
              >
                <Plus className="w-3.5 h-3.5" />
                {t('workers.addWorker')}
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="px-3 md:px-6 pb-3 md:pb-6">
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
                  className={`border rounded-lg p-3 flex items-center justify-between ${
                    !worker.is_active ? 'opacity-60 bg-muted/50' : ''
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${worker.is_active ? 'bg-success' : 'bg-muted-foreground'}`} />
                    <span className="font-medium text-sm">{worker.name}</span>
                    {!worker.is_active && (
                      <Badge variant="secondary" className="text-[10px]">
                        {t('workers.inactive')}
                      </Badge>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEdit(worker)}
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
                        toggleWorkerStatus.mutate({ id: worker.id, is_active: !worker.is_active });
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
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        setWorkerToDelete(worker);
                      }}
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      title={t('common.delete')}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
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
            <Input
              placeholder={t('workers.workerName')}
              value={workerName}
              onChange={(e) => setWorkerName(e.target.value)}
              autoFocus
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button
                type="submit"
                disabled={!workerName.trim() || addWorker.isPending}
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
            <Input
              placeholder={t('workers.workerName')}
              value={workerName}
              onChange={(e) => setWorkerName(e.target.value)}
              autoFocus
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditingWorker(null)}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={!workerName.trim() || updateWorker.isPending}>
                {updateWorker.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {t('common.save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!workerToDelete} onOpenChange={(open) => !open && setWorkerToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('workers.deleteConfirm')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('workers.deleteWarning', { name: workerToDelete?.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => workerToDelete && deleteWorker.mutate(workerToDelete.id)}
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
