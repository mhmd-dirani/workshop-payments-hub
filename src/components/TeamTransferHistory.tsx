import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { format } from 'date-fns';
import { ArrowDownCircle, Pencil, Trash2, Loader2 } from 'lucide-react';

interface TeamTransferHistoryProps {
  userId: string;
  onTransferChange?: () => void;
}

interface Transfer {
  id: string;
  user_id: string;
  amount: number;
  transfer_date: string;
  description: string | null;
  created_by: string;
  created_at: string;
  admin_name: string;
}

export default function TeamTransferHistory({ userId, onTransferChange }: TeamTransferHistoryProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editingTransfer, setEditingTransfer] = useState<Transfer | null>(null);
  const [deletingTransfer, setDeletingTransfer] = useState<Transfer | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editDescription, setEditDescription] = useState('');

  const { data: transfers, isLoading } = useQuery({
    queryKey: ['team-transfers', userId],
    queryFn: async () => {
      const { data: transfersData, error } = await supabase
        .from('team_transfers')
        .select('*')
        .eq('user_id', userId)
        .order('transfer_date', { ascending: false });

      if (error) throw error;

      // Get admin names
      const adminIds = [...new Set(transfersData?.map(t => t.created_by) || [])];
      if (adminIds.length === 0) return [];

      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, full_name')
        .in('user_id', adminIds);

      const profileMap = new Map(profiles?.map(p => [p.user_id, p.full_name]) || []);

      return transfersData?.map(t => ({
        ...t,
        admin_name: profileMap.get(t.created_by) || 'Admin',
      })) || [];
    },
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editingTransfer) return;
      
      const numAmount = parseFloat(editAmount);
      if (isNaN(numAmount) || numAmount <= 0) {
        throw new Error('Amount must be greater than 0');
      }

      const { error } = await supabase
        .from('team_transfers')
        .update({
          amount: numAmount,
          transfer_date: editDate,
          description: editDescription.trim() || null,
        })
        .eq('id', editingTransfer.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-transfers', userId] });
      queryClient.invalidateQueries({ queryKey: ['team-members'] });
      queryClient.invalidateQueries({ queryKey: ['total-team-transfers'] });
      setEditingTransfer(null);
      onTransferChange?.();
      toast({ title: 'Transfer updated successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!deletingTransfer) return;

      const { error } = await supabase
        .from('team_transfers')
        .delete()
        .eq('id', deletingTransfer.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-transfers', userId] });
      queryClient.invalidateQueries({ queryKey: ['team-members'] });
      queryClient.invalidateQueries({ queryKey: ['total-team-transfers'] });
      setDeletingTransfer(null);
      onTransferChange?.();
      toast({ title: 'Transfer deleted successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const openEditDialog = (transfer: Transfer) => {
    setEditingTransfer(transfer);
    setEditAmount(String(transfer.amount));
    setEditDate(transfer.transfer_date);
    setEditDescription(transfer.description || '');
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-40" />
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!transfers || transfers.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-8 text-center text-muted-foreground">
          No transfers received yet
        </CardContent>
      </Card>
    );
  }

  const totalReceived = transfers.reduce((sum, t) => sum + Number(t.amount), 0);

  return (
    <>
      <Card className="shadow-card border-success/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2 text-success">
            <ArrowDownCircle className="w-5 h-5" />
            Transfer History (Received)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-success/5">
                  <TableHead>Date</TableHead>
                  <TableHead>From</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transfers.map((transfer) => (
                  <TableRow key={transfer.id} className="animate-fade-in">
                    <TableCell className="font-mono text-sm">
                      {format(new Date(transfer.transfer_date), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell className="font-medium">
                      {transfer.admin_name}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {transfer.description || '-'}
                    </TableCell>
                    <TableCell className="text-right font-mono font-medium text-success">
                      +{Number(transfer.amount).toLocaleString('fr-FR')} CFA
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => openEditDialog(transfer)}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => setDeletingTransfer(transfer)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Total */}
          <div className="flex justify-end pt-2 border-t">
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Total Received</p>
              <p className="text-xl font-bold font-mono text-success">
                +{totalReceived.toLocaleString('fr-FR')} CFA
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={!!editingTransfer} onOpenChange={(open) => !open && setEditingTransfer(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Transfer</DialogTitle>
            <DialogDescription>
              Update the transfer details
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit_amount">Amount *</Label>
              <Input
                id="edit_amount"
                type="number"
                step="1"
                min="1"
                value={editAmount}
                onChange={(e) => setEditAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit_date">Date *</Label>
              <Input
                id="edit_date"
                type="date"
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
                max={new Date().toISOString().split('T')[0]}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit_description">Description</Label>
              <Textarea
                id="edit_description"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingTransfer(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => updateMutation.mutate()}
              disabled={updateMutation.isPending}
              className="gradient-primary text-primary-foreground"
            >
              {updateMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingTransfer} onOpenChange={(open) => !open && setDeletingTransfer(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Transfer</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this transfer of{' '}
              <span className="font-bold text-foreground">
                {deletingTransfer && Number(deletingTransfer.amount).toLocaleString('fr-FR')} CFA
              </span>
              ? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Delete
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
