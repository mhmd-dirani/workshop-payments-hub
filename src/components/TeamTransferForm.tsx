import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
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
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

interface TeamMember {
  user_id: string;
  full_name: string | null;
}

interface TeamTransferFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member: TeamMember | null;
}

export default function TeamTransferForm({ open, onOpenChange, member }: TeamTransferFormProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [transferDate, setTransferDate] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    if (open) {
      setAmount('');
      setDescription('');
      setTransferDate(new Date().toISOString().split('T')[0]);
    }
  }, [open]);

  const transferMutation = useMutation({
    mutationFn: async () => {
      if (!member || !user) throw new Error('Missing required data');

      const numAmount = parseFloat(amount);
      if (isNaN(numAmount) || numAmount <= 0) {
        throw new Error(t('validation.amountPositive'));
      }

      const { error } = await supabase
        .from('team_transfers')
        .insert([{
          user_id: member.user_id,
          amount: numAmount,
          transfer_date: transferDate,
          description: description.trim() || null,
          created_by: user.id,
        }]);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-members'] });
      queryClient.invalidateQueries({ queryKey: ['team-transfers'] });
      queryClient.invalidateQueries({ queryKey: ['user-global-balance'] });
      onOpenChange(false);
      toast({
        title: t('team.transferAdded'),
        description: `${t('team.fundsAddedTo')} ${member?.full_name || t('team.teamMember')}`,
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    transferMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('team.addMoneyToMember')}</DialogTitle>
          <DialogDescription>
            {t('team.transferFunds')}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="amount">{t('common.amount')} *</Label>
            <Input
              id="amount"
              type="number"
              step="1"
              min="1"
              placeholder={t('common.amount')}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="transfer_date">{t('common.date')} *</Label>
            <Input
              id="transfer_date"
              type="date"
              value={transferDate}
              onChange={(e) => setTransferDate(e.target.value)}
              max={new Date().toISOString().split('T')[0]}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">{t('common.description')} ({t('common.optional')})</Label>
            <Textarea
              id="description"
              placeholder={t('common.description')}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <DialogFooter className="pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              disabled={transferMutation.isPending || !amount}
              className="gradient-primary text-primary-foreground"
            >
              {transferMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {t('team.addFunds')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}