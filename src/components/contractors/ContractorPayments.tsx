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
import { Plus, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

const PAYMENT_TYPES = ['advance', 'product', 'work_payment'];

export default function ContractorPayments() {
  const { t } = useTranslation();
  const { user, role } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [contractorId, setContractorId] = useState('');
  const [contractId, setContractId] = useState('');
  const [workshopId, setWorkshopId] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentType, setPaymentType] = useState('advance');
  const [description, setDescription] = useState('');
  const [paymentDate, setPaymentDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [filterContractor, setFilterContractor] = useState('all');

  const { data: contractors = [] } = useQuery({
    queryKey: ['contractors'],
    queryFn: async () => {
      const { data, error } = await supabase.from('contractors').select('*').order('name');
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

  const { data: contracts = [] } = useQuery({
    queryKey: ['contracts', contractorId],
    queryFn: async () => {
      if (!contractorId) return [];
      const { data, error } = await supabase
        .from('contracts')
        .select('*')
        .eq('contractor_id', contractorId)
        .eq('status', 'active')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!contractorId,
  });

  const { data: payments = [], isLoading } = useQuery({
    queryKey: ['contractor-payments', filterContractor],
    queryFn: async () => {
      let query = supabase
        .from('contractor_payments')
        .select('*')
        .order('payment_date', { ascending: false });
      if (filterContractor !== 'all') {
        query = query.eq('contractor_id', filterContractor);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const workshopForPayment = workshopId || (contracts.find(c => c.id === contractId)?.workshop_id);
      if (!workshopForPayment) throw new Error('No workshop');

      const contractorName = contractors.find(c => c.id === contractorId)?.name || '';
      const typeLabel = t(`contractors.paymentTypes.${paymentType}`);
      const reason = `[${t('contractors.contractor')}] ${contractorName} - ${typeLabel}${description ? ': ' + description : ''}`;

      // Create the main payment record
      const { data: paymentRecord, error: paymentError } = await supabase
        .from('payments')
        .insert({
          workshop_id: workshopForPayment,
          amount: Number(amount),
          payment_date: paymentDate,
          paid_to: contractorName,
          reason,
          created_by: user!.id,
        })
        .select()
        .single();
      if (paymentError) throw paymentError;

      // Create contractor payment record
      const { error } = await supabase.from('contractor_payments').insert({
        contractor_id: contractorId,
        contract_id: contractId || null,
        workshop_id: workshopForPayment,
        amount: Number(amount),
        payment_type: paymentType,
        description: description || null,
        payment_date: paymentDate,
        payment_id: paymentRecord.id,
        created_by: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contractor-payments'] });
      queryClient.invalidateQueries({ queryKey: ['contractor-summaries'] });
      queryClient.invalidateQueries({ queryKey: ['contract-payments-summary'] });
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      toast({ title: t('contractors.paymentAdded') });
      resetForm();
    },
    onError: () => toast({ title: t('errors.error'), variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (payment: any) => {
      // Delete the linked main payment too
      if (payment.payment_id) {
        await supabase.from('payments').delete().eq('id', payment.payment_id);
      }
      const { error } = await supabase.from('contractor_payments').delete().eq('id', payment.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contractor-payments'] });
      queryClient.invalidateQueries({ queryKey: ['contractor-summaries'] });
      queryClient.invalidateQueries({ queryKey: ['contract-payments-summary'] });
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      toast({ title: t('contractors.paymentDeleted') });
    },
  });

  const resetForm = () => {
    setShowForm(false);
    setContractorId('');
    setContractId('');
    setWorkshopId('');
    setAmount('');
    setPaymentType('advance');
    setDescription('');
    setPaymentDate(format(new Date(), 'yyyy-MM-dd'));
  };

  const getContractorName = (id: string) => contractors.find(c => c.id === id)?.name || '?';
  const getWorkshopName = (id: string) => workshops.find(w => w.id === id)?.name || '?';

  // When contractor is selected and has contracts, auto-fill workshop
  const handleContractorChange = (id: string) => {
    setContractorId(id);
    setContractId('');
    setWorkshopId('');
  };

  const handleContractChange = (id: string) => {
    setContractId(id);
    const contract = contracts.find(c => c.id === id);
    if (contract) setWorkshopId(contract.workshop_id);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Select value={filterContractor} onValueChange={setFilterContractor}>
          <SelectTrigger className="w-[180px] h-9 text-xs md:text-sm">
            <SelectValue placeholder={t('contractors.filterByContractor')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('common.all')}</SelectItem>
            {contractors.map(c => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Dialog open={showForm} onOpenChange={(open) => { if (!open) resetForm(); else setShowForm(true); }}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1">
              <Plus className="w-4 h-4" />
              {t('contractors.addPayment')}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t('contractors.addPayment')}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>{t('contractors.contractor')}</Label>
                <Select value={contractorId} onValueChange={handleContractorChange}>
                  <SelectTrigger><SelectValue placeholder={t('contractors.selectContractor')} /></SelectTrigger>
                  <SelectContent>
                    {contractors.filter(c => c.is_active).map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name} - {t(`contractors.specialties.${c.specialty}`)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {contractorId && contracts.length > 0 && (
                <div>
                  <Label>{t('contractors.contract')} ({t('common.optional')})</Label>
                  <Select value={contractId} onValueChange={handleContractChange}>
                    <SelectTrigger><SelectValue placeholder={t('contractors.selectContract')} /></SelectTrigger>
                    <SelectContent>
                      {contracts.map(c => (
                        <SelectItem key={c.id} value={c.id}>
                          {getWorkshopName(c.workshop_id)} {c.total_amount ? `(${Number(c.total_amount).toLocaleString('fr-FR')} CFA)` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {(!contractId || contracts.length === 0) && (
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
              )}

              <div>
                <Label>{t('contractors.paymentType')}</Label>
                <Select value={paymentType} onValueChange={setPaymentType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAYMENT_TYPES.map(pt => (
                      <SelectItem key={pt} value={pt}>{t(`contractors.paymentTypes.${pt}`)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>{t('common.amount')}</Label>
                <Input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" />
              </div>

              <div>
                <Label>{t('common.date')}</Label>
                <Input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} />
              </div>

              <div>
                <Label>{t('common.description')} ({t('common.optional')})</Label>
                <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder={t('contractors.paymentDescPlaceholder')} rows={2} />
              </div>

              <Button 
                className="w-full" 
                onClick={() => createMutation.mutate()} 
                disabled={!contractorId || !(workshopId || contractId) || !amount || Number(amount) <= 0 || createMutation.isPending}
              >
                {t('common.save')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8"><div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" /></div>
      ) : payments.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">{t('contractors.noPayments')}</CardContent></Card>
      ) : (
        <div className="grid gap-2">
          {payments.map(p => (
            <Card key={p.id}>
              <CardContent className="p-3 flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm">{getContractorName(p.contractor_id)}</span>
                    <Badge variant="outline" className="text-xs">{getWorkshopName(p.workshop_id)}</Badge>
                    <Badge variant="secondary" className="text-xs">{t(`contractors.paymentTypes.${p.payment_type}`)}</Badge>
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                    <span>{p.payment_date}</span>
                    {p.description && <span>· {p.description}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm whitespace-nowrap">{Number(p.amount).toLocaleString('fr-FR')} CFA</span>
                  {role === 'admin' && (
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => deleteMutation.mutate(p)}>
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
