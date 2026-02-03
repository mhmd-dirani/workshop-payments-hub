import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Plus, Loader2, FolderOpen } from 'lucide-react';

interface WorkshopSelectorProps {
  selectedWorkshop: string | null;
  onSelect: (workshopId: string) => void;
}

interface User {
  user_id: string;
  full_name: string | null;
}

export default function WorkshopSelector({ selectedWorkshop, onSelect }: WorkshopSelectorProps) {
  const { t } = useTranslation();
  const { role, user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newWorkshop, setNewWorkshop] = useState({ name: '', description: '' });
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);

  const { data: workshops, isLoading } = useQuery({
    queryKey: ['workshops', role],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workshops')
        .select('*')
        .order('name');
      if (error) throw error;
      // Hide "Dettes" workshop from non-admin users
      if (role !== 'admin') {
        return data.filter(w => w.name.toLowerCase() !== 'dettes');
      }
      return data;
    },
  });

  // Fetch non-admin users for assignment
  const { data: availableUsers } = useQuery({
    queryKey: ['users-for-workshop-assignment'],
    queryFn: async () => {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, full_name');

      const { data: roles } = await supabase
        .from('user_roles')
        .select('user_id, role');

      const roleMap = new Map(roles?.map(r => [r.user_id, r.role]) || []);
      
      // Filter to only non-admin users
      return profiles?.filter(p => roleMap.get(p.user_id) !== 'admin') || [];
    },
    enabled: role === 'admin' && isDialogOpen,
  });

  const createWorkshop = useMutation({
    mutationFn: async (workshop: { name: string; description: string }) => {
      // Create the workshop
      const { data, error } = await supabase
        .from('workshops')
        .insert([{ name: workshop.name, description: workshop.description, created_by: user?.id }])
        .select()
        .single();
      if (error) throw error;

      // Assign selected users to the workshop
      if (selectedUsers.length > 0) {
        const assignments = selectedUsers.map(userId => ({
          workshop_id: data.id,
          user_id: userId,
          assigned_by: user?.id,
        }));

        const { error: assignError } = await supabase
          .from('workshop_assignments')
          .insert(assignments);
        
        if (assignError) throw assignError;
      }

      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['workshops'] });
      queryClient.invalidateQueries({ queryKey: ['workshop-assignments'] });
      setIsDialogOpen(false);
      setNewWorkshop({ name: '', description: '' });
      setSelectedUsers([]);
      onSelect(data.id);
      toast({
        title: t('workshopSelector.workshopCreated'),
        description: `"${data.name}" ${t('workshopSelector.workshopCreatedDesc')}${selectedUsers.length > 0 ? ` ${t('workshopSelector.withUsersAssigned', { count: selectedUsers.length })}` : ''}`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: t('errors.error'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleCreate = () => {
    if (!newWorkshop.name.trim()) {
      toast({
        title: t('errors.error'),
        description: t('validation.enterWorkshopName'),
        variant: 'destructive',
      });
      return;
    }
    createWorkshop.mutate(newWorkshop);
  };

  const toggleUserSelection = (userId: string) => {
    setSelectedUsers(prev => 
      prev.includes(userId) 
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const handleDialogOpenChange = (open: boolean) => {
    setIsDialogOpen(open);
    if (!open) {
      setNewWorkshop({ name: '', description: '' });
      setSelectedUsers([]);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
        {t('common.loadingWorkshops')}
      </div>
    );
  }

  return (
    <div className="flex flex-col sm:flex-row gap-3">
      <div className="flex-1">
        <Select value={selectedWorkshop || ''} onValueChange={onSelect}>
          <SelectTrigger className="h-11">
            <div className="flex items-center gap-2">
              <FolderOpen className="w-4 h-4 text-muted-foreground" />
              <SelectValue placeholder={t('workshopSelector.selectWorkshop')} />
            </div>
          </SelectTrigger>
          <SelectContent>
            {workshops?.map((workshop) => (
              <SelectItem key={workshop.id} value={workshop.id}>
                {workshop.name}
              </SelectItem>
            ))}
            {(!workshops || workshops.length === 0) && (
              <div className="py-6 text-center text-sm text-muted-foreground">
                {t('workshopSelector.noWorkshopsYet')}
              </div>
            )}
          </SelectContent>
        </Select>
      </div>

      {role === 'admin' && (
        <Dialog open={isDialogOpen} onOpenChange={handleDialogOpenChange}>
          <DialogTrigger asChild>
            <Button className="gap-2 gradient-primary text-primary-foreground">
              <Plus className="w-4 h-4" />
              {t('workshopSelector.newWorkshop')}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{t('workshopSelector.createNewWorkshop')}</DialogTitle>
              <DialogDescription>
                {t('workshopSelector.addWorkshopAndAssign')}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">{t('workshopSelector.workshopName')} *</Label>
                <Input
                  id="name"
                  placeholder={t('workshopSelector.workshopNamePlaceholder')}
                  value={newWorkshop.name}
                  onChange={(e) => setNewWorkshop(prev => ({ ...prev, name: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">{t('workshopSelector.workshopDescription')}</Label>
                <Textarea
                  id="description"
                  placeholder={t('workshopSelector.workshopDescPlaceholder')}
                  value={newWorkshop.description}
                  onChange={(e) => setNewWorkshop(prev => ({ ...prev, description: e.target.value }))}
                />
              </div>

              {/* User Assignment Section */}
              {availableUsers && availableUsers.length > 0 && (
                <div className="space-y-2">
                  <Label>{t('workshopSelector.assignUsers')}</Label>
                  <div className="border rounded-lg p-3 max-h-40 overflow-y-auto space-y-2">
                    {availableUsers.map((u) => (
                      <div key={u.user_id} className="flex items-center space-x-2 rtl:space-x-reverse">
                        <Checkbox
                          id={u.user_id}
                          checked={selectedUsers.includes(u.user_id)}
                          onCheckedChange={() => toggleUserSelection(u.user_id)}
                        />
                        <Label 
                          htmlFor={u.user_id} 
                          className="text-sm font-normal cursor-pointer"
                        >
                          {u.full_name || t('team.unnamedUser')}
                        </Label>
                      </div>
                    ))}
                  </div>
                  {selectedUsers.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {selectedUsers.length} {t('workshopSelector.usersSelected')}
                    </p>
                  )}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => handleDialogOpenChange(false)}>
                {t('common.cancel')}
              </Button>
              <Button 
                onClick={handleCreate} 
                disabled={createWorkshop.isPending}
                className="gradient-primary text-primary-foreground"
              >
                {createWorkshop.isPending && <Loader2 className="w-4 h-4 ltr:mr-2 rtl:ml-2 animate-spin" />}
                {t('workshopSelector.createWorkshop')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
