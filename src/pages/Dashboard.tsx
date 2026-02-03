import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import Layout from '@/components/Layout';
import WorkshopSelector from '@/components/WorkshopSelector';
import PaymentTable from '@/components/PaymentTable';
import PaymentForm from '@/components/PaymentForm';
import IncomeForm from '@/components/IncomeForm';
import IncomeTable from '@/components/IncomeTable';
import UserIncomeTable from '@/components/UserIncomeTable';
import RejectedPayments from '@/components/RejectedPayments';
import UserBalanceCard from '@/components/UserBalanceCard';
import PersonalPaymentsTable from '@/components/PersonalPaymentsTable';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, ArrowDownCircle, ArrowUpCircle, Wallet, TrendingUp, HandCoins, Crown } from 'lucide-react';

export default function Dashboard() {
  const { t } = useTranslation();
  const { role } = useAuth();
  const [selectedWorkshop, setSelectedWorkshop] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isIncomeFormOpen, setIsIncomeFormOpen] = useState(false);
  const [editingPayment, setEditingPayment] = useState<any>(null);
  const [wealthRevealed, setWealthRevealed] = useState(false);
  // Fetch global wealth stats for admin (all workshops combined + debts)
  const { data: globalStats } = useQuery({
    queryKey: ['global-wealth-stats'],
    queryFn: async () => {
      // Get all workshops income
      const { data: allIncome } = await supabase
        .from('income')
        .select('amount');
      const totalIncome = allIncome?.reduce((sum, i) => sum + Number(i.amount), 0) || 0;

      // Get all approved payments
      const { data: allPayments } = await supabase
        .from('payments')
        .select('amount')
        .eq('status', 'approved');
      const totalPaid = allPayments?.reduce((sum, p) => sum + Number(p.amount), 0) || 0;

      // Total balance across all workshops
      const totalBalance = totalIncome - totalPaid;

      // Get debts - what others owe me (they_owe type)
      const { data: theyOweDebts } = await supabase
        .from('debts')
        .select('amount, is_settled')
        .eq('debt_type', 'they_owe')
        .eq('is_settled', false);
      
      // Get debt payments for they_owe
      const theyOweIds = theyOweDebts?.map(d => d) || [];
      const { data: theyOwePayments } = await supabase
        .from('debt_payments')
        .select('amount, debt_id');
      
      // Calculate net they owe (original - payments made)
      const { data: allTheyOweDebts } = await supabase
        .from('debts')
        .select('id, amount')
        .eq('debt_type', 'they_owe')
        .eq('is_settled', false);
      
      let theyOweTotal = 0;
      allTheyOweDebts?.forEach(debt => {
        const payments = theyOwePayments?.filter(p => p.debt_id === debt.id) || [];
        const paidSoFar = payments.reduce((sum, p) => sum + Number(p.amount), 0);
        theyOweTotal += Number(debt.amount) - paidSoFar;
      });

      // Get debts - what I owe others (i_owe type)
      const { data: allIOweDebts } = await supabase
        .from('debts')
        .select('id, amount')
        .eq('debt_type', 'i_owe')
        .eq('is_settled', false);
      
      let iOweTotal = 0;
      allIOweDebts?.forEach(debt => {
        const payments = theyOwePayments?.filter(p => p.debt_id === debt.id) || [];
        const paidSoFar = payments.reduce((sum, p) => sum + Number(p.amount), 0);
        iOweTotal += Number(debt.amount) - paidSoFar;
      });

      // Net debts = what they owe me - what I owe them
      const netDebts = theyOweTotal - iOweTotal;

      // Overall wealth = total balance + net debts
      const overallWealth = totalBalance + netDebts;

      return {
        totalBalance,
        netDebts,
        theyOweTotal,
        iOweTotal,
        overallWealth,
      };
    },
    enabled: role === 'admin',
  });

  const { data: stats } = useQuery({
    queryKey: ['workshop-stats', selectedWorkshop],
    queryFn: async () => {
      if (!selectedWorkshop) return null;
      
      // Fetch approved payments (expenses)
      const { data: payments, error: paymentsError } = await supabase
        .from('payments')
        .select('amount, status')
        .eq('workshop_id', selectedWorkshop)
        .eq('status', 'approved');
      
      if (paymentsError) throw paymentsError;
      
      const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount), 0);

      // Fetch income
      const { data: income, error: incomeError } = await supabase
        .from('income')
        .select('amount')
        .eq('workshop_id', selectedWorkshop);
      
      if (incomeError) throw incomeError;
      
      const totalIncome = income?.reduce((sum, i) => sum + Number(i.amount), 0) || 0;
      
      return { 
        totalPaid, 
        totalIncome, 
        balance: totalIncome - totalPaid 
      };
    },
    enabled: !!selectedWorkshop,
  });

  const handleEdit = (payment: any) => {
    setEditingPayment(payment);
    setIsFormOpen(true);
  };

  const handleFormClose = (open: boolean) => {
    setIsFormOpen(open);
    if (!open) setEditingPayment(null);
  };

  return (
    <Layout>
      <div className="space-y-3 md:space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-3">
          <div>
            <h2 className="text-lg md:text-2xl font-bold tracking-tight">{t('dashboard.title')}</h2>
            <p className="text-xs md:text-sm text-muted-foreground">
              {role === 'admin' 
                ? t('dashboard.adminDescription')
                : role === 'co_admin'
                ? t('dashboard.coAdminDescription')
                : t('dashboard.userDescription')}
            </p>
          </div>
        </div>

        {/* Global Wealth Stats for Admin (always visible) */}
        {role === 'admin' && globalStats && (
          <div 
            className="grid grid-cols-3 gap-2 md:gap-4 cursor-pointer select-none"
            onClick={() => setWealthRevealed(!wealthRevealed)}
          >
            <Card className="shadow-card border-primary/20">
              <CardContent className="p-2 md:pt-6 md:px-6">
                <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-4">
                  <div className="hidden md:flex p-3 rounded-xl bg-primary/10">
                    <TrendingUp className="w-6 h-6 text-primary" />
                  </div>
                  <div className="text-center md:text-left">
                    <div className="flex items-center justify-center md:justify-start gap-1 text-primary">
                      <TrendingUp className="w-3 h-3 md:hidden" />
                      <p className="text-[10px] md:text-sm font-medium">{t('dashboard.projects')}</p>
                    </div>
                    <p className={`text-sm md:text-2xl font-bold font-mono transition-all duration-300 ${globalStats.totalBalance >= 0 ? 'text-primary' : 'text-destructive'} ${!wealthRevealed ? 'blur-md' : 'blur-none'}`}>
                      {globalStats.totalBalance >= 0 ? '+' : ''}{globalStats.totalBalance.toLocaleString('fr-FR')}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="shadow-card border-warning/20">
              <CardContent className="p-2 md:pt-6 md:px-6">
                <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-4">
                  <div className="hidden md:flex p-3 rounded-xl bg-warning/10">
                    <HandCoins className="w-6 h-6 text-warning" />
                  </div>
                  <div className="text-center md:text-left">
                    <div className="flex items-center justify-center md:justify-start gap-1 text-warning">
                      <HandCoins className="w-3 h-3 md:hidden" />
                      <p className="text-[10px] md:text-sm font-medium">{t('dashboard.netDebts')}</p>
                    </div>
                    <p className={`text-sm md:text-2xl font-bold font-mono transition-all duration-300 ${globalStats.netDebts >= 0 ? 'text-success' : 'text-destructive'} ${!wealthRevealed ? 'blur-md' : 'blur-none'}`}>
                      {globalStats.netDebts >= 0 ? '+' : ''}{globalStats.netDebts.toLocaleString('fr-FR')}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="shadow-card border-accent/20 bg-gradient-to-br from-accent/5 to-primary/5">
              <CardContent className="p-2 md:pt-6 md:px-6">
                <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-4">
                  <div className="hidden md:flex p-3 rounded-xl bg-accent/10">
                    <Crown className="w-6 h-6 text-accent" />
                  </div>
                  <div className="text-center md:text-left">
                    <div className="flex items-center justify-center md:justify-start gap-1 text-accent">
                      <Crown className="w-3 h-3 md:hidden" />
                      <p className="text-[10px] md:text-sm font-medium">{t('dashboard.overall')}</p>
                    </div>
                    <p className={`text-sm md:text-2xl font-bold font-mono transition-all duration-300 ${globalStats.overallWealth >= 0 ? 'text-accent' : 'text-destructive'} ${!wealthRevealed ? 'blur-md' : 'blur-none'}`}>
                      {globalStats.overallWealth >= 0 ? '+' : ''}{globalStats.overallWealth.toLocaleString('fr-FR')}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Action Buttons */}
        {selectedWorkshop && (
          <div className="flex gap-2">
            {role === 'admin' && (
              <Button 
                onClick={() => setIsIncomeFormOpen(true)} 
                size="sm"
                className="gap-1.5 bg-success text-success-foreground hover:bg-success/90 h-8 text-xs md:text-sm md:h-9"
              >
                <Plus className="w-3.5 h-3.5 md:w-4 md:h-4" />
                <span className="hidden xs:inline">{t('common.add')}</span> {t('dashboard.income')}
              </Button>
            )}
            <Button 
              onClick={() => setIsFormOpen(true)} 
              size="sm"
              className="gap-1.5 bg-destructive text-destructive-foreground hover:bg-destructive/90 h-8 text-xs md:text-sm md:h-9"
            >
              <Plus className="w-3.5 h-3.5 md:w-4 md:h-4" />
              <span className="hidden xs:inline">{t('common.add')}</span> {t('payments.title')}
            </Button>
          </div>
        )}

        {/* Workshop Selector */}
        <Card className="shadow-card">
          <CardHeader className="pb-2 px-3 md:px-6 pt-3 md:pt-6">
            <CardTitle className="text-base md:text-lg">{t('dashboard.selectWorkshop')}</CardTitle>
            <CardDescription className="text-xs md:text-sm">{t('dashboard.chooseWorkshop')}</CardDescription>
          </CardHeader>
          <CardContent className="px-3 md:px-6 pb-3 md:pb-6">
            <WorkshopSelector 
              selectedWorkshop={selectedWorkshop} 
              onSelect={setSelectedWorkshop} 
            />
          </CardContent>
        </Card>

        {/* User Balance Card and Personal Payments (for non-admins - show global balance always) */}
        {role !== 'admin' && role !== 'co_admin' && (
          <>
            <UserBalanceCard />
            <PersonalPaymentsTable />
          </>
        )}


        {/* Stats Cards - 3 totals (admin only) */}
        {selectedWorkshop && stats && role === 'admin' && (
          <div className="grid grid-cols-3 gap-2 md:gap-4">
            <Card className="shadow-card border-success/20">
              <CardContent className="p-2 md:pt-6 md:px-6">
                <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-4">
                  <div className="hidden md:flex p-3 rounded-xl bg-success/10">
                    <ArrowDownCircle className="w-6 h-6 text-success" />
                  </div>
                  <div className="text-center md:text-left">
                    <div className="flex items-center justify-center md:justify-start gap-1 text-success">
                      <ArrowDownCircle className="w-3 h-3 md:hidden" />
                      <p className="text-[10px] md:text-sm font-medium">{t('dashboard.income')}</p>
                    </div>
                    <p className="text-sm md:text-2xl font-bold font-mono text-success">
                      +{stats.totalIncome.toLocaleString('fr-FR')}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="shadow-card border-destructive/20">
              <CardContent className="p-2 md:pt-6 md:px-6">
                <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-4">
                  <div className="hidden md:flex p-3 rounded-xl bg-destructive/10">
                    <ArrowUpCircle className="w-6 h-6 text-destructive" />
                  </div>
                  <div className="text-center md:text-left">
                    <div className="flex items-center justify-center md:justify-start gap-1 text-destructive">
                      <ArrowUpCircle className="w-3 h-3 md:hidden" />
                      <p className="text-[10px] md:text-sm font-medium">{t('dashboard.paid')}</p>
                    </div>
                    <p className="text-sm md:text-2xl font-bold font-mono text-destructive">
                      -{stats.totalPaid.toLocaleString('fr-FR')}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="shadow-card border-primary/20">
              <CardContent className="p-2 md:pt-6 md:px-6">
                <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-4">
                  <div className="hidden md:flex p-3 rounded-xl bg-primary/10">
                    <Wallet className="w-6 h-6 text-primary" />
                  </div>
                  <div className="text-center md:text-left">
                    <div className="flex items-center justify-center md:justify-start gap-1 text-primary">
                      <Wallet className="w-3 h-3 md:hidden" />
                      <p className="text-[10px] md:text-sm font-medium">{t('dashboard.balance')}</p>
                    </div>
                    <p className="text-sm md:text-2xl font-bold font-mono text-primary">
                      {stats.balance >= 0 ? '+' : ''}{stats.balance.toLocaleString('fr-FR')}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Income Table (admin only) */}
        {selectedWorkshop && role === 'admin' && (
          <IncomeTable workshopId={selectedWorkshop} />
        )}

        {/* User Income Table (transfers received - for non-admins, global) */}
        {selectedWorkshop && role !== 'admin' && (
          <UserIncomeTable />
        )}

        {/* Payment Table */}
        {selectedWorkshop ? (
          <>
            <PaymentTable workshopId={selectedWorkshop} onEdit={handleEdit} />
            <RejectedPayments workshopId={selectedWorkshop} />
          </>
        ) : (
          <Card className="shadow-card">
            <CardContent className="py-8 md:py-12 text-center text-muted-foreground text-sm">
              <p>{t('dashboard.selectWorkshopToView')}</p>
            </CardContent>
          </Card>
        )}

        {/* Payment Form Dialog */}
        {selectedWorkshop && (
          <>
            <PaymentForm
              workshopId={selectedWorkshop}
              payment={editingPayment}
              open={isFormOpen}
              onOpenChange={handleFormClose}
            />
            {role === 'admin' && (
              <IncomeForm
                workshopId={selectedWorkshop}
                open={isIncomeFormOpen}
                onOpenChange={setIsIncomeFormOpen}
              />
            )}
          </>
        )}
      </div>
    </Layout>
  );
}