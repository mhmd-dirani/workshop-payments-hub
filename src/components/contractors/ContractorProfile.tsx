import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ArrowLeft, Phone, ChevronDown, ChevronUp } from 'lucide-react';

interface Props {
  contractor: any;
  onBack: () => void;
}

export default function ContractorProfile({ contractor, onBack }: Props) {
  const { t } = useTranslation();
  const [expandedBudgets, setExpandedBudgets] = useState<Set<string>>(new Set());

  const { data: workshops = [] } = useQuery({
    queryKey: ['workshops'],
    queryFn: async () => {
      const { data, error } = await supabase.from('workshops').select('*').order('name');
      if (error) throw error;
      return data;
    },
  });

  const { data: contracts = [] } = useQuery({
    queryKey: ['contractor-profile-contracts', contractor.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contracts')
        .select('*')
        .eq('contractor_id', contractor.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: payments = [] } = useQuery({
    queryKey: ['contractor-profile-payments', contractor.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contractor_payments')
        .select('*')
        .eq('contractor_id', contractor.id)
        .order('payment_date', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: contractPaymentSums = {} } = useQuery({
    queryKey: ['contractor-profile-contract-sums', contractor.id],
    queryFn: async () => {
      const map: Record<string, number> = {};
      payments.forEach(p => {
        if (p.contract_id) {
          map[p.contract_id] = (map[p.contract_id] || 0) + Number(p.amount);
        }
      });
      return map;
    },
    enabled: payments.length > 0,
  });

  // Fetch budget purchases for all material_budget payments
  const budgetPaymentIds = payments.filter(p => p.payment_type === 'material_budget').map(p => p.id);
  const { data: budgetPurchasesMap = {} } = useQuery({
    queryKey: ['profile-budget-purchases', budgetPaymentIds.join(',')],
    queryFn: async () => {
      if (budgetPaymentIds.length === 0) return {};
      const { data, error } = await supabase
        .from('contractor_budget_purchases')
        .select('*')
        .in('contractor_payment_id', budgetPaymentIds)
        .order('purchase_date', { ascending: false });
      if (error) throw error;
      const map: Record<string, any[]> = {};
      data?.forEach(p => {
        if (!map[p.contractor_payment_id]) map[p.contractor_payment_id] = [];
        map[p.contractor_payment_id].push(p);
      });
      return map;
    },
    enabled: budgetPaymentIds.length > 0,
  });

  const getWorkshopName = (id: string) => workshops.find(w => w.id === id)?.name || '?';

  const toggleBudget = (id: string) => {
    const next = new Set(expandedBudgets);
    next.has(id) ? next.delete(id) : next.add(id);
    setExpandedBudgets(next);
  };

  const workshopIds = [...new Set([
    ...contracts.map(c => c.workshop_id),
    ...payments.filter(p => p.workshop_id).map(p => p.workshop_id),
  ])];

  const totalPaid = payments.reduce((s, p) => {
    if (p.payment_type === 'material_budget') {
      const purchases = budgetPurchasesMap[p.id] || [];
      const spent = purchases.reduce((ps: number, pu: any) => ps + Number(pu.amount), 0);
      return s + Math.max(0, Number(p.amount) - spent);
    }
    return s + Number(p.amount);
  }, 0);

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" className="gap-1" onClick={onBack}>
        <ArrowLeft className="w-4 h-4" />
        {t('common.back')}
      </Button>

      <Card>
        <CardContent className="p-3 md:p-4">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="font-bold text-base md:text-lg">{contractor.name}</h2>
            <Badge variant="secondary">{String(t(`contractors.specialties.${contractor.specialty}`, { defaultValue: contractor.specialty }))}</Badge>
            {!contractor.is_active && <Badge variant="outline">{t('workers.inactive')}</Badge>}
          </div>
          {contractor.phone && (
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
              <Phone className="w-3 h-3" /> {contractor.phone}
            </p>
          )}
          <div className="flex gap-4 mt-2 text-sm flex-wrap">
            <span>{t('contractors.profileContracts')}: <strong>{contracts.length}</strong></span>
            <span>{t('contractors.profilePayments')}: <strong>{payments.length}</strong></span>
            <span>{t('common.total')}: <strong>{totalPaid.toLocaleString('fr-FR')} CFA</strong></span>
          </div>
        </CardContent>
      </Card>

      {workshopIds.map(wId => {
        const wContracts = contracts.filter(c => c.workshop_id === wId);
        const wPayments = payments.filter(p => p.workshop_id === wId);
        const wTotal = wPayments.reduce((s, p) => {
          if (p.payment_type === 'material_budget') {
            const purchases = budgetPurchasesMap[p.id] || [];
            const spent = purchases.reduce((ps: number, pu: any) => ps + Number(pu.amount), 0);
            return s + Math.max(0, Number(p.amount) - spent);
          }
          return s + Number(p.amount);
        }, 0);

        return (
          <Card key={wId}>
            <CardContent className="p-3 md:p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm md:text-base">{getWorkshopName(wId)}</h3>
                <span className="text-sm font-bold">{wTotal.toLocaleString('fr-FR')} CFA</span>
              </div>

              {wContracts.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">{t('contractors.contractsTab')}</p>
                  {wContracts.map(c => {
                    const paid = contractPaymentSums[c.id] || 0;
                    const total = Number(c.total_amount) || 0;
                    const progress = total > 0 ? Math.min((paid / total) * 100, 100) : 0;
                    return (
                      <div key={c.id} className="p-2 bg-muted/50 rounded-md space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant={c.status === 'active' ? 'default' : 'secondary'} className="text-xs">
                            {t(`contractors.status.${c.status}`)}
                          </Badge>
                          {c.description && <span className="text-xs">{c.description}</span>}
                        </div>
                        {total > 0 && (
                          <>
                            <div className="flex justify-between text-xs">
                              <span>{paid.toLocaleString('fr-FR')} / {total.toLocaleString('fr-FR')} CFA</span>
                              <span>{t('contractors.remaining')}: {(total - paid).toLocaleString('fr-FR')}</span>
                            </div>
                            <Progress value={progress} className="h-1.5" />
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {wPayments.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">{t('contractors.paymentsTab')}</p>
                  {wPayments.map(p => {
                    const isBudget = p.payment_type === 'material_budget';
                    const purchases = budgetPurchasesMap[p.id] || [];
                    const budgetSpent = purchases.reduce((s: number, pr: any) => s + Number(pr.amount), 0);
                    const budgetTotal = Number(p.amount);
                    const isOpen = expandedBudgets.has(p.id);

                    return (
                      <div key={p.id} className={`rounded ${isBudget ? 'border border-primary/20 bg-muted/20' : 'bg-muted/30'}`}>
                        <div
                          className={`flex items-center justify-between text-xs p-1.5 ${isBudget ? 'cursor-pointer' : ''}`}
                          onClick={() => isBudget && toggleBudget(p.id)}
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <span className="text-muted-foreground">{p.payment_date}</span>
                            <Badge variant={isBudget ? 'default' : 'outline'} className="text-[10px]">
                              {t(`contractors.paymentTypes.${p.payment_type}`)}
                            </Badge>
                            {p.description && <span className="truncate max-w-[120px]">{p.description}</span>}
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="font-medium whitespace-nowrap">{budgetTotal.toLocaleString('fr-FR')} CFA</span>
                            {isBudget && (isOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                          </div>
                        </div>

                        {isBudget && (
                          <div className="px-1.5 pb-1">
                            <div className="flex justify-between text-[10px] text-muted-foreground">
                              <span>{t('contractors.spent')}: {budgetSpent.toLocaleString('fr-FR')}</span>
                              <span>{t('contractors.remaining')}: {(budgetTotal - budgetSpent).toLocaleString('fr-FR')}</span>
                            </div>
                            <Progress value={budgetTotal > 0 ? Math.min((budgetSpent / budgetTotal) * 100, 100) : 0} className="h-1" />
                          </div>
                        )}

                        {isBudget && isOpen && purchases.length > 0 && (
                          <div className="px-1.5 pb-1.5 space-y-1">
                            {purchases.map((pr: any) => (
                              <div key={pr.id} className="flex items-center justify-between text-[10px] p-1 bg-background rounded">
                                <div className="flex items-center gap-1">
                                  <span className="text-muted-foreground">{pr.purchase_date}</span>
                                  {pr.description && <span>{pr.description}</span>}
                                  {pr.receipt_file_path && <span>📎</span>}
                                </div>
                                <span className="font-medium">{Number(pr.amount).toLocaleString('fr-FR')} CFA</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}

      {/* General budgets (no workshop) */}
      {payments.filter(p => !p.workshop_id && p.payment_type === 'material_budget').length > 0 && (
        <Card>
          <CardContent className="p-3 md:p-4 space-y-3">
            <h3 className="font-semibold text-sm md:text-base">{t('contractors.paymentTypes.material_budget')}</h3>
            <div className="space-y-1">
              {payments.filter(p => !p.workshop_id && p.payment_type === 'material_budget').map(p => {
                const purchases = budgetPurchasesMap[p.id] || [];
                const budgetSpent = purchases.reduce((s: number, pr: any) => s + Number(pr.amount), 0);
                const budgetTotal = Number(p.amount);
                const isOpen = expandedBudgets.has(p.id);

                return (
                  <div key={p.id} className="rounded border border-primary/20 bg-muted/20">
                    <div className="flex items-center justify-between text-xs p-1.5 cursor-pointer" onClick={() => toggleBudget(p.id)}>
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className="text-muted-foreground">{p.payment_date}</span>
                        {p.description && <span className="truncate max-w-[120px]">{p.description}</span>}
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="font-medium whitespace-nowrap">{budgetTotal.toLocaleString('fr-FR')} CFA</span>
                        {isOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      </div>
                    </div>
                    <div className="px-1.5 pb-1">
                      <div className="flex justify-between text-[10px] text-muted-foreground">
                        <span>{t('contractors.spent')}: {budgetSpent.toLocaleString('fr-FR')}</span>
                        <span>{t('contractors.remaining')}: {(budgetTotal - budgetSpent).toLocaleString('fr-FR')}</span>
                      </div>
                      <Progress value={budgetTotal > 0 ? Math.min((budgetSpent / budgetTotal) * 100, 100) : 0} className="h-1" />
                    </div>
                    {isOpen && purchases.length > 0 && (
                      <div className="px-1.5 pb-1.5 space-y-1">
                        {purchases.map((pr: any) => (
                          <div key={pr.id} className="flex items-center justify-between text-[10px] p-1 bg-background rounded">
                            <div className="flex items-center gap-1">
                              <span className="text-muted-foreground">{pr.purchase_date}</span>
                              {pr.description && <span>{pr.description}</span>}
                              {pr.receipt_file_path && <span>📎</span>}
                            </div>
                            <span className="font-medium">{Number(pr.amount).toLocaleString('fr-FR')} CFA</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {workshopIds.length === 0 && payments.filter(p => !p.workshop_id).length === 0 && (
        <Card><CardContent className="py-8 text-center text-muted-foreground">{t('contractors.noPayments')}</CardContent></Card>
      )}
    </div>
  );
}
