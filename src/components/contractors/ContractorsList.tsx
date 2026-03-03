import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, Phone, Edit2, UserX, UserCheck } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const SPECIALTIES = ['painter', 'plumber', 'woodworker', 'electrician', 'tiler', 'other'];

export default function ContractorsList() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [specialty, setSpecialty] = useState('other');
  const [phone, setPhone] = useState('');
  const [showInactive, setShowInactive] = useState(false);

  const { data: contractors = [], isLoading } = useQuery({
    queryKey: ['contractors'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contractors')
        .select('*')
        .order('name');
      if (error) throw error;
      return data;
    },
  });

  // Get contract/payment summaries
  const { data: summaries = {} } = useQuery({
    queryKey: ['contractor-summaries'],
    queryFn: async () => {
      const { data: payments, error } = await supabase
        .from('contractor_payments')
        .select('contractor_id, amount');
      if (error) throw error;
      const map: Record<string, number> = {};
      payments?.forEach(p => {
        map[p.contractor_id] = (map[p.contractor_id] || 0) + Number(p.amount);
      });
      return map;
    },
  });

  const { data: contractCounts = {} } = useQuery({
    queryKey: ['contractor-contract-counts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contracts')
        .select('contractor_id, status');
      if (error) throw error;
      const map: Record<string, { active: number; total: number }> = {};
      data?.forEach(c => {
        if (!map[c.contractor_id]) map[c.contractor_id] = { active: 0, total: 0 };
        map[c.contractor_id].total++;
        if (c.status === 'active') map[c.contractor_id].active++;
      });
      return map;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editingId) {
        const { error } = await supabase
          .from('contractors')
          .update({ name, specialty, phone: phone || null })
          .eq('id', editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('contractors')
          .insert({ name, specialty, phone: phone || null, created_by: user!.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contractors'] });
      toast({ title: t(editingId ? 'contractors.updated' : 'contractors.added') });
      resetForm();
    },
    onError: () => toast({ title: t('errors.error'), variant: 'destructive' }),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase
        .from('contractors')
        .update({ is_active: active })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contractors'] });
    },
  });

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setName('');
    setSpecialty('other');
    setPhone('');
  };

  const startEdit = (c: any) => {
    setEditingId(c.id);
    setName(c.name);
    setSpecialty(c.specialty);
    setPhone(c.phone || '');
    setShowForm(true);
  };

  const filtered = contractors.filter(c => showInactive || c.is_active);

  if (isLoading) {
    return <div className="flex justify-center py-8"><div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Button size="sm" variant="outline" onClick={() => setShowInactive(!showInactive)}>
          {showInactive ? t('workers.hideInactive') : t('workers.showInactive')}
        </Button>
        <Dialog open={showForm} onOpenChange={(open) => { if (!open) resetForm(); else setShowForm(true); }}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1">
              <Plus className="w-4 h-4" />
              {t('contractors.add')}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>{editingId ? t('contractors.edit') : t('contractors.add')}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>{t('common.name')}</Label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder={t('contractors.namePlaceholder')} />
              </div>
              <div>
                <Label>{t('contractors.specialty')}</Label>
                <Select value={specialty} onValueChange={setSpecialty}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SPECIALTIES.map(s => (
                      <SelectItem key={s} value={s}>{t(`contractors.specialties.${s}`)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t('contractors.phone')} ({t('common.optional')})</Label>
                <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="0XX XXX XXXX" />
              </div>
              <Button 
                className="w-full" 
                onClick={() => saveMutation.mutate()} 
                disabled={!name.trim() || saveMutation.isPending}
              >
                {t('common.save')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {filtered.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">{t('contractors.noContractors')}</CardContent></Card>
      ) : (
        <div className="grid gap-2 md:gap-3">
          {filtered.map(c => {
            const totalPaid = summaries[c.id] || 0;
            const counts = contractCounts[c.id] || { active: 0, total: 0 };
            return (
              <Card key={c.id} className={!c.is_active ? 'opacity-60' : ''}>
                <CardContent className="p-3 md:p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-sm md:text-base">{c.name}</h3>
                        <Badge variant="secondary" className="text-xs">
                          {t(`contractors.specialties.${c.specialty}`)}
                        </Badge>
                        {!c.is_active && <Badge variant="outline" className="text-xs">{t('workers.inactive')}</Badge>}
                      </div>
                      {c.phone && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                          <Phone className="w-3 h-3" /> {c.phone}
                        </p>
                      )}
                      <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                        {counts.total > 0 && (
                          <span>{counts.active} {t('contractors.activeContracts')} / {counts.total}</span>
                        )}
                        {totalPaid > 0 && (
                          <span className="font-medium text-foreground">{totalPaid.toLocaleString('fr-FR')} CFA {t('contractors.totalPaid')}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => startEdit(c)}>
                        <Edit2 className="w-3.5 h-3.5" />
                      </Button>
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className="h-8 w-8"
                        onClick={() => toggleActiveMutation.mutate({ id: c.id, active: !c.is_active })}
                      >
                        {c.is_active ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                      </Button>
                    </div>
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
