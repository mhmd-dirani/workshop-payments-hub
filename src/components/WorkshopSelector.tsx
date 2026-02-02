import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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

export default function WorkshopSelector({ selectedWorkshop, onSelect }: WorkshopSelectorProps) {
  const { role } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newWorkshop, setNewWorkshop] = useState({ name: '', description: '' });

  const { data: workshops, isLoading } = useQuery({
    queryKey: ['workshops'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workshops')
        .select('*')
        .order('name');
      if (error) throw error;
      return data;
    },
  });

  const createWorkshop = useMutation({
    mutationFn: async (workshop: { name: string; description: string }) => {
      const { data, error } = await supabase
        .from('workshops')
        .insert([{ name: workshop.name, description: workshop.description }])
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['workshops'] });
      setIsDialogOpen(false);
      setNewWorkshop({ name: '', description: '' });
      onSelect(data.id);
      toast({
        title: 'Workshop created',
        description: `"${data.name}" has been added successfully`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleCreate = () => {
    if (!newWorkshop.name.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter a workshop name',
        variant: 'destructive',
      });
      return;
    }
    createWorkshop.mutate(newWorkshop);
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading workshops...
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
              <SelectValue placeholder="Select a workshop" />
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
                No workshops yet
              </div>
            )}
          </SelectContent>
        </Select>
      </div>

      {role === 'admin' && (
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2 gradient-primary text-primary-foreground">
              <Plus className="w-4 h-4" />
              New Workshop
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Workshop</DialogTitle>
              <DialogDescription>
                Add a new workshop to track payments for
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Workshop Name</Label>
                <Input
                  id="name"
                  placeholder="e.g., Photography Workshop 2024"
                  value={newWorkshop.name}
                  onChange={(e) => setNewWorkshop(prev => ({ ...prev, name: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description (optional)</Label>
                <Textarea
                  id="description"
                  placeholder="Brief description of the workshop"
                  value={newWorkshop.description}
                  onChange={(e) => setNewWorkshop(prev => ({ ...prev, description: e.target.value }))}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleCreate} 
                disabled={createWorkshop.isPending}
                className="gradient-primary text-primary-foreground"
              >
                {createWorkshop.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Create Workshop
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
