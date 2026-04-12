import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Loader2, Search } from 'lucide-react';
import PersonDebtCard from './PersonDebtCard';

interface DebtTableProps {
  debtType: 'i_owe' | 'they_owe';
  onAddPayment: (debt: any) => void;
  onEdit: (debt: any) => void;
  onAddDebtForPerson?: (personName: string) => void;
}

export default function DebtTable({ debtType, onAddPayment, onEdit, onAddDebtForPerson }: DebtTableProps) {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState('');

  const { data: debts, isLoading } = useQuery({
    queryKey: ['debts', debtType],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('debts')
        .select('*')
        .eq('debt_type', debtType)
        .order('debt_date', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: payments } = useQuery({
    queryKey: ['debt-payments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('debt_payments')
        .select('*')
        .order('payment_date', { ascending: false });
      if (error) throw error;

      // Fetch profiles to show who made each repayment
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, full_name');
      const profileMap = new Map(profiles?.map(p => [p.user_id, p.full_name]) || []);

      return (data || []).map(p => ({
        ...p,
        created_by_name: profileMap.get(p.created_by) || null,
      }));
    },
  });

  if (isLoading) {
    return (
      <Card className="shadow-card">
        <CardContent className="py-8 md:py-12 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  // Group debts by person name
  const groupedDebts = new Map<string, any[]>();
  debts?.forEach(debt => {
    const debtAny = debt as any;
    if (!debt.is_settled && !debt.description?.includes('[WORKER_DEBT]') && debtAny.status !== 'pending') {
      const existing = groupedDebts.get(debt.person_name) || [];
      existing.push(debt);
      groupedDebts.set(debt.person_name, existing);
    }
  });

  // Filter by search term
  const filteredPersons = searchTerm.trim()
    ? Array.from(groupedDebts.keys()).filter(name =>
        name.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : Array.from(groupedDebts.keys());

  // Calculate filtered total
  const getRemaining = (personDebts: any[]) => {
    return personDebts.reduce((total, debt) => {
      const paid = payments
        ?.filter(p => p.debt_id === debt.id)
        .reduce((sum, p) => sum + Number(p.amount), 0) || 0;
      return total + Math.max(0, Number(debt.amount) - paid);
    }, 0);
  };

  const filteredTotal = filteredPersons.reduce((total, personName) => {
    const personDebts = groupedDebts.get(personName) || [];
    return total + getRemaining(personDebts);
  }, 0);

  const handleAddDebt = (personName: string) => {
    if (onAddDebtForPerson) {
      onAddDebtForPerson(personName);
    }
  };

  return (
    <Card className="shadow-card">
      <CardHeader className="pb-2 px-3 md:px-6 pt-3 md:pt-6">
        <div className="flex flex-col gap-2 md:gap-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm md:text-lg">
                {debtType === 'they_owe' ? t('debts.peopleWhoOweMe') : t('debts.peopleIOwe')}
              </CardTitle>
              <CardDescription className="text-xs md:text-sm">
                {filteredPersons.length} {filteredPersons.length === 1 ? t('debts.person') : t('users.allUsers').toLowerCase()}
                {searchTerm && ` ${t('debts.matching')} "${searchTerm}"`}
              </CardDescription>
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-3 rtl:left-auto rtl:right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder={t('debts.searchByName')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="ltr:pl-9 rtl:pr-9 h-8 md:h-10 text-sm"
            />
          </div>
        </div>
        {searchTerm && filteredPersons.length > 0 && (
          <div className="mt-2 p-2 md:p-3 rounded-lg bg-muted/50">
            <p className="text-xs md:text-sm">
              <span className="text-muted-foreground">{t('debts.filteredTotal')}: </span>
              <span className={`font-mono font-bold ${debtType === 'they_owe' ? 'text-success' : 'text-destructive'}`}>
                {debtType === 'they_owe' ? '+' : '-'}{filteredTotal.toLocaleString('fr-FR')}
              </span>
            </p>
          </div>
        )}
      </CardHeader>

      <CardContent className="px-3 md:px-6 pb-3 md:pb-6">
        {filteredPersons.length === 0 ? (
          <p className="text-center text-muted-foreground py-6 text-sm">
            {t('debts.noActiveDebts')}
          </p>
        ) : (
          <div className="space-y-2 md:space-y-3">
            {filteredPersons.map(personName => (
              <PersonDebtCard
                key={personName}
                personName={personName}
                debts={groupedDebts.get(personName) || []}
                payments={payments || []}
                debtType={debtType}
                onAddDebt={handleAddDebt}
                onAddPayment={onAddPayment}
                onEditDebt={onEdit}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
