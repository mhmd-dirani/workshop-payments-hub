import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Plus, CheckCircle, XCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function ContractsList() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [contractorId, setContractorId] = useState('');
  const [workshopId, setWorkshopId] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [description, setDescription] = useState('');

  const { data: contractors = [] } = useQuery({
    queryKey: ['contractors'],
    queryFn: async () => {
      const { data, error } = await supabase.from('contractors').select('*').eq('is_active', true).order('name');
      if (error) throw error;
      return data;
    },
  });

  const { data: workshops = [] } = useQuery({
    queryKey: ['workshops'],
    queryFn: async () => {
      const { data, error } = await supabase.from('workshops').select('*').order('name');
      if (error) throw error;
      return data;
    },
  });

  const { data: contracts = [], isLoading } = useQuery({
    queryKey: ['contracts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contracts')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Get payments per contract
  const { data: paymentsByContract = {} } = useQuery({
    queryKey: ['contract-payments-summary'],
    queryFn: async () => {
      const { data, error } = await supabase.from('contractor_payments').select('contract_id, amount');
      if (error) throw error;
      const map: Record<string, number> = {};
      data?.forEach(p => {
        if (p.contract_id) {
          map[p.contract_id] = (map[p.contract_id] || 0) + Number(p.amount);
        }
      });
      return map;
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('contracts').insert({
        contractor_id: contractorId,
        workshop_id: workshopId,
        total_amount: totalAmount ? Number(totalAmount) : null,
        description: description || null,
        created_by: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      queryClient.invalidateQueries({ queryKey: ['contractor-contract-counts'] });
      toast({ title: t('contractors.contractCreated') });
      resetForm();
    },
    onError: () => toast({ title: t('errors.error'), variant: 'destructive' }),
  });

  const toggleStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from('contracts').update({ status }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      queryClient.invalidateQueries({ queryKey: ['contractor-contract-counts'] });
    },
  });

  const resetForm = () => {
    setShowForm(false);
    setContractorId('');
    setWorkshopId('');
    setTotalAmount('');
    setDescription('');
  };

  const getContractorName = (id: string) => contractors.find(c => c.id === id)?.name || '?';
  const getWorkshopName = (id: string) => workshops.find(w => w.id === id)?.name || '?';

  if (isLoading) {
    return <div className="flex justify-center py-8"><div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={showForm} onOpenChange={(open) => { if (!open) resetForm(); else setShowForm(true); }}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1">
              <Plus className="w-4 h-4" />
              {t('contractors.addContract')}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>{t('contractors.addContract')}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>{t('contractors.contractor')}</Label>
                <Select value={contractorId} onValueChange={setContractorId}>
                  <SelectTrigger><SelectValue placeholder={t('contractors.selectContractor')} /></SelectTrigger>
                  <SelectContent>
                    {contractors.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t('common.workshop')}</Label>
                <Select value={workshopId} onValueChange={setWorkshopId}>
                  <SelectTrigger><SelectValue placeholder={t('dashboard.selectWorkshop')} /></SelectTrigger>
                  <SelectContent>
                    {workshops.map(w => (
                      <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t('contractors.totalAmount')} ({t('common.optional')})</Label>
                <Input type="number" value={totalAmount} onChange={e => setTotalAmount(e.target.value)} placeholder={t('contractors.totalAmountPlaceholder')} />
              </div>
              <div>
                <Label>{t('common.description')} ({t('common.optional')})</Label>
                <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder={t('contractors.contractDescPlaceholder')} rows={2} />
              </div>
              <Button 
                className="w-full" 
                onClick={() => createMutation.mutate()} 
                disabled={!contractorId || !workshopId || createMutation.isPending}
              >
                {t('common.save')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {contracts.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">{t('contractors.noContracts')}</CardContent></Card>
      ) : (
        <div className="grid gap-2 md:gap-3">
          {contracts.map(contract => {
            const paid = paymentsByContract[contract.id] || 0;
            const total = Number(contract.total_amount) || 0;
            const progress = total > 0 ? Math.min((paid / total) * 100, 100) : 0;
            const remaining = total > 0 ? total - paid : 0;

            return (
              <Card key={contract.id}>
                <CardContent className="p-3 md:p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-sm md:text-base">{getContractorName(contract.contractor_id)}</h3>
                        <Badge variant="outline" className="text-xs">{getWorkshopName(contract.workshop_id)}</Badge>
                        <Badge variant={contract.status === 'active' ? 'default' : 'secondary'} className="text-xs">
                          {t(`contractors.status.${contract.status}`)}
                        </Badge>
                      </div>
                      {contract.description && (
                        <p className="text-xs text-muted-foreground mt-1">{contract.description}</p>
                      )}
                      <div className="mt-2 space-y-1">
                        {total > 0 ? (
                          <>
                            <div className="flex justify-between text-xs">
                              <span>{paid.toLocaleString('fr-FR')} / {total.toLocaleString('fr-FR')} CFA</span>
                              <span className="text-muted-foreground">{t('contractors.remaining')}: {remaining.toLocaleString('fr-FR')}</span>
                            </div>
                            <Progress value={progress} className="h-2" />
                          </>
                        ) : (
                          <p className="text-xs">
                            {t('contractors.totalPaid')}: <span className="font-medium">{paid.toLocaleString('fr-FR')} CFA</span>
                          </p>
                        )}
                      </div>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={() => toggleStatusMutation.mutate({
                        id: contract.id,
                        status: contract.status === 'active' ? 'completed' : 'active',
                      })}
                    >
                      {contract.status === 'active' ? <CheckCircle className="w-4 h-4 text-primary" /> : <XCircle className="w-4 h-4" />}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
