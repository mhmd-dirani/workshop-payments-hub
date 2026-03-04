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
import { Plus, Phone, Edit2, UserX, UserCheck, Search } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import ContractorProfile from './ContractorProfile';

const DEFAULT_SPECIALTIES = ['painter', 'plumber', 'woodworker', 'electrician', 'tiler', 'other'];

export default function ContractorsList() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [specialty, setSpecialty] = useState('other');
  const [customSpecialty, setCustomSpecialty] = useState('');
  const [phone, setPhone] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSpecialty, setFilterSpecialty] = useState('all');
  const [selectedContractor, setSelectedContractor] = useState<any>(null);

  const { data: contractors = [], isLoading } = useQuery({
    queryKey: ['contractors'],
    queryFn: async () => {
      const { data, error } = await supabase.from('contractors').select('*').order('name');
      if (error) throw error;
      return data;
    },
  });

  // Extract unique custom specialties from existing contractors
  const customSpecialties = [...new Set(
    contractors
      .map(c => c.specialty)
      .filter(s => !DEFAULT_SPECIALTIES.includes(s))
  )];
  const allSpecialties = [...DEFAULT_SPECIALTIES, ...customSpecialties];

  const { data: summaries = {} } = useQuery({
    queryKey: ['contractor-summaries'],
    queryFn: async () => {
      const { data: payments, error } = await supabase.from('contractor_payments').select('contractor_id, amount, payment_type, id');
      if (error) throw error;
      // Get budget purchases to calculate remaining for material_budget
      const budgetIds = payments?.filter(p => p.payment_type === 'material_budget').map(p => p.id) || [];
      let budgetSpentMap: Record<string, number> = {};
      if (budgetIds.length > 0) {
        const { data: purchases } = await supabase
          .from('contractor_budget_purchases')
          .select('contractor_payment_id, amount')
          .in('contractor_payment_id', budgetIds);
        purchases?.forEach(pu => {
          budgetSpentMap[pu.contractor_payment_id] = (budgetSpentMap[pu.contractor_payment_id] || 0) + Number(pu.amount);
        });
      }
      const map: Record<string, number> = {};
      payments?.forEach(p => {
        if (p.payment_type === 'material_budget') {
          const spent = budgetSpentMap[p.id] || 0;
          map[p.contractor_id] = (map[p.contractor_id] || 0) + Math.max(0, Number(p.amount) - spent);
        } else {
          map[p.contractor_id] = (map[p.contractor_id] || 0) + Number(p.amount);
        }
      });
      return map;
    },
  });

  const { data: contractCounts = {} } = useQuery({
    queryKey: ['contractor-contract-counts'],
    queryFn: async () => {
      const { data, error } = await supabase.from('contracts').select('contractor_id, status');
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
      const finalSpecialty = specialty === 'custom' ? customSpecialty.trim() : specialty;
      if (!finalSpecialty) throw new Error('Specialty required');
      if (editingId) {
        const { error } = await supabase.from('contractors').update({ name, specialty: finalSpecialty, phone: phone || null }).eq('id', editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('contractors').insert({ name, specialty: finalSpecialty, phone: phone || null, created_by: user!.id });
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
      const { error } = await supabase.from('contractors').update({ is_active: active }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['contractors'] }),
  });

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setName('');
    setSpecialty('other');
    setCustomSpecialty('');
    setPhone('');
  };

  const startEdit = (c: any) => {
    setEditingId(c.id);
    setName(c.name);
    if (DEFAULT_SPECIALTIES.includes(c.specialty)) {
      setSpecialty(c.specialty);
      setCustomSpecialty('');
    } else {
      setSpecialty('custom');
      setCustomSpecialty(c.specialty);
    }
    setPhone(c.phone || '');
    setShowForm(true);
  };

  const getSpecialtyLabel = (s: string) => {
    if (DEFAULT_SPECIALTIES.includes(s)) return t(`contractors.specialties.${s}`);
    return s;
  };

  if (selectedContractor) {
    return <ContractorProfile contractor={selectedContractor} onBack={() => setSelectedContractor(null)} />;
  }

  const filtered = contractors
    .filter(c => showInactive || c.is_active)
    .filter(c => !searchQuery || c.name.toLowerCase().includes(searchQuery.toLowerCase()))
    .filter(c => filterSpecialty === 'all' || c.specialty === filterSpecialty);

  if (isLoading) {
    return <div className="flex justify-center py-8"><div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" /></div>;
  }

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={t('contractors.searchByName')}
              className="pl-8 h-9 text-sm"
            />
          </div>
          <Select value={filterSpecialty} onValueChange={setFilterSpecialty}>
            <SelectTrigger className="w-[140px] h-9 text-xs md:text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('common.all')}</SelectItem>
              {allSpecialties.map(s => (
                <SelectItem key={s} value={s}>{getSpecialtyLabel(s)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
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
                  <Select value={specialty} onValueChange={v => { setSpecialty(v); if (v !== 'custom') setCustomSpecialty(''); }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DEFAULT_SPECIALTIES.map(s => (
                        <SelectItem key={s} value={s}>{t(`contractors.specialties.${s}`)}</SelectItem>
                      ))}
                      {customSpecialties.map(s => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                      <SelectItem value="custom">{t('contractors.customSpecialty')}</SelectItem>
                    </SelectContent>
                  </Select>
                  {specialty === 'custom' && (
                    <Input
                      className="mt-2"
                      value={customSpecialty}
                      onChange={e => setCustomSpecialty(e.target.value)}
                      placeholder={t('contractors.customSpecialtyPlaceholder')}
                    />
                  )}
                </div>
                <div>
                  <Label>{t('contractors.phone')} ({t('common.optional')})</Label>
                  <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="0XX XXX XXXX" />
                </div>
                <Button
                  className="w-full"
                  onClick={() => saveMutation.mutate()}
                  disabled={!name.trim() || (specialty === 'custom' && !customSpecialty.trim()) || saveMutation.isPending}
                >
                  {t('common.save')}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
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
                        <button
                          className="font-semibold text-sm md:text-base text-primary hover:underline text-left"
                          onClick={() => setSelectedContractor(c)}
                        >
                          {c.name}
                        </button>
                        <Badge variant="secondary" className="text-xs">
                          {getSpecialtyLabel(c.specialty)}
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
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); startEdit(c); }}>
                        <Edit2 className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={(e) => { e.stopPropagation(); toggleActiveMutation.mutate({ id: c.id, active: !c.is_active }); }}
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
