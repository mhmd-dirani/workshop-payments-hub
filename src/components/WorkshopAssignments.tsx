import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Loader2, FolderOpen } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

interface WorkshopAssignmentsProps {
  userId: string;
  userName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function WorkshopAssignments({ 
  userId, 
  userName, 
  open, 
  onOpenChange 
}: WorkshopAssignmentsProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedWorkshops, setSelectedWorkshops] = useState<Set<string>>(new Set());
  const [initialized, setInitialized] = useState(false);

  // Fetch all workshops (admin can see all)
  const { data: workshops, isLoading: workshopsLoading } = useQuery({
    queryKey: ['all-workshops'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workshops')
        .select('id, name')
        .order('name');
      if (error) throw error;
      return data;
    },
  });

  // Fetch current assignments for this user
  const { data: assignments, isLoading: assignmentsLoading } = useQuery({
    queryKey: ['workshop-assignments', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workshop_assignments')
        .select('workshop_id')
        .eq('user_id', userId);
      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  // Initialize selected workshops when data loads
  if (assignments && !initialized) {
    setSelectedWorkshops(new Set(assignments.map(a => a.workshop_id)));
    setInitialized(true);
  }

  // Reset initialized state when dialog closes
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setInitialized(false);
    }
    onOpenChange(newOpen);
  };

  const saveAssignments = useMutation({
    mutationFn: async (workshopIds: string[]) => {
      // Delete all existing assignments for this user
      const { error: deleteError } = await supabase
        .from('workshop_assignments')
        .delete()
        .eq('user_id', userId);
      if (deleteError) throw deleteError;

      // Insert new assignments
      if (workshopIds.length > 0) {
        const { error: insertError } = await supabase
          .from('workshop_assignments')
          .insert(
            workshopIds.map(workshopId => ({
              user_id: userId,
              workshop_id: workshopId,
            }))
          );
        if (insertError) throw insertError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workshop-assignments'] });
      toast({
        title: t('users.assignmentsUpdated'),
        description: t('users.workshopAccessUpdated'),
      });
      handleOpenChange(false);
    },
    onError: (error: Error) => {
      toast({
        title: t('errors.error'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const toggleWorkshop = (workshopId: string) => {
    const newSet = new Set(selectedWorkshops);
    if (newSet.has(workshopId)) {
      newSet.delete(workshopId);
    } else {
      newSet.add(workshopId);
    }
    setSelectedWorkshops(newSet);
  };

  const handleSave = () => {
    saveAssignments.mutate(Array.from(selectedWorkshops));
  };

  const selectAll = () => {
    if (workshops) {
      setSelectedWorkshops(new Set(workshops.map(w => w.id)));
    }
  };

  const selectNone = () => {
    setSelectedWorkshops(new Set());
  };

  const isLoading = workshopsLoading || assignmentsLoading;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderOpen className="w-5 h-5" />
            {t('users.workshopAccess')}
          </DialogTitle>
          <DialogDescription>
            {t('users.selectWorkshops')} <span className="font-medium">{userName}</span>
            <br />
            {t('users.usersOnlySeeAssigned')}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="flex gap-2 mb-2">
              <Button variant="outline" size="sm" onClick={selectAll}>
                {t('users.selectAll')}
              </Button>
              <Button variant="outline" size="sm" onClick={selectNone}>
                {t('users.selectNone')}
              </Button>
            </div>
            
            <ScrollArea className="h-[300px] rounded-md border p-4">
              <div className="space-y-3">
                {workshops?.map((workshop) => (
                  <div key={workshop.id} className="flex items-center space-x-3 rtl:space-x-reverse">
                    <Checkbox
                      id={`workshop-${workshop.id}`}
                      checked={selectedWorkshops.has(workshop.id)}
                      onCheckedChange={() => toggleWorkshop(workshop.id)}
                    />
                    <Label
                      htmlFor={`workshop-${workshop.id}`}
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                    >
                      {workshop.name}
                    </Label>
                  </div>
                ))}
                {(!workshops || workshops.length === 0) && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    {t('users.noWorkshopsAvailable')}
                  </p>
                )}
              </div>
            </ScrollArea>

            <p className="text-xs text-muted-foreground">
              {t('users.workshopsSelected', { count: selectedWorkshops.size })}
            </p>
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={saveAssignments.isPending}
            className="gradient-primary text-primary-foreground"
          >
            {saveAssignments.isPending && <Loader2 className="w-4 h-4 ltr:mr-2 rtl:ml-2 animate-spin" />}
            {t('users.saveAccess')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
