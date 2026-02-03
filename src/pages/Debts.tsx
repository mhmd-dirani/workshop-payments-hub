import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import Layout from '@/components/Layout';
import DebtForm from '@/components/DebtForm';
import DebtTable from '@/components/DebtTable';
import DebtPaymentForm from '@/components/DebtPaymentForm';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, ArrowDownCircle, ArrowUpCircle, Wallet } from 'lucide-react';
import { Navigate } from 'react-router-dom';

export default function Debts() {
  const { t } = useTranslation();
  const { role } = useAuth();
  const [isDebtFormOpen, setIsDebtFormOpen] = useState(false);
  const [isPaymentFormOpen, setIsPaymentFormOpen] = useState(false);
  const [selectedDebt, setSelectedDebt] = useState<any>(null);
  const [editingDebt, setEditingDebt] = useState<any>(null);

  // Only admins can access this page
  if (role !== 'admin') {
    return <Navigate to="/" replace />;
  }

  const { data: stats } = useQuery({
    queryKey: ['debt-stats'],
    queryFn: async () => {
      // Fetch all debts
      const { data: debts, error: debtsError } = await supabase
        .from('debts')
        .select('id, amount, debt_type, is_settled');
      
      if (debtsError) throw debtsError;

      // Fetch all debt payments
      const { data: payments, error: paymentsError } = await supabase
        .from('debt_payments')
        .select('debt_id, amount');
      
      if (paymentsError) throw paymentsError;

      // Calculate payments per debt
      const paymentsByDebt: Record<string, number> = {};
      payments?.forEach(p => {
        paymentsByDebt[p.debt_id] = (paymentsByDebt[p.debt_id] || 0) + Number(p.amount);
      });

      // Calculate totals
      let iOweTotal = 0;
      let iOweRemaining = 0;
      let theyOweTotal = 0;
      let theyOweRemaining = 0;

      debts?.forEach(debt => {
        const paid = paymentsByDebt[debt.id] || 0;
        const remaining = Number(debt.amount) - paid;

        if (debt.debt_type === 'i_owe') {
          iOweTotal += Number(debt.amount);
          iOweRemaining += Math.max(0, remaining);
        } else {
          theyOweTotal += Number(debt.amount);
          theyOweRemaining += Math.max(0, remaining);
        }
      });

      return {
        iOweTotal,
        iOweRemaining,
        theyOweTotal,
        theyOweRemaining,
        netBalance: theyOweRemaining - iOweRemaining
      };
    },
  });

  const handleAddPayment = (debt: any) => {
    setSelectedDebt(debt);
    setIsPaymentFormOpen(true);
  };

  const handleEditDebt = (debt: any) => {
    setEditingDebt(debt);
    setIsDebtFormOpen(true);
  };

  const handleFormClose = (open: boolean) => {
    setIsDebtFormOpen(open);
    if (!open) setEditingDebt(null);
  };

  return (
    <Layout>
      <div className="space-y-3 md:space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-lg md:text-2xl font-bold tracking-tight">{t('debts.title')}</h2>
            <p className="text-xs md:text-sm text-muted-foreground">
              {t('debts.description')}
            </p>
          </div>
          
          <Button 
            onClick={() => setIsDebtFormOpen(true)} 
            size="sm"
            className="gap-1.5 gradient-primary text-primary-foreground h-8 text-xs md:text-sm md:h-9"
          >
            <Plus className="w-3.5 h-3.5 md:w-4 md:h-4" />
            <span className="hidden xs:inline">{t('common.add')}</span> {t('debts.addDebt')}
          </Button>
        </div>

        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-3 gap-2 md:gap-4">
            <Card className="shadow-card border-destructive/20">
              <CardContent className="p-2 md:pt-6 md:px-6">
                <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-4">
                  <div className="hidden md:flex p-3 rounded-xl bg-destructive/10">
                    <ArrowUpCircle className="w-6 h-6 text-destructive" />
                  </div>
                  <div className="text-center md:text-left">
                    <div className="flex items-center justify-center md:justify-start gap-1 text-destructive">
                      <ArrowUpCircle className="w-3 h-3 md:hidden" />
                      <p className="text-[10px] md:text-sm font-medium">{t('debts.iOwe')}</p>
                    </div>
                    <p className="text-sm md:text-2xl font-bold font-mono text-destructive">
                      -{stats.iOweRemaining.toLocaleString('fr-FR')}
                    </p>
                    <p className="hidden md:block text-xs text-muted-foreground">
                      {t('common.of')} {stats.iOweTotal.toLocaleString('fr-FR')} {t('common.total')}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="shadow-card border-success/20">
              <CardContent className="p-2 md:pt-6 md:px-6">
                <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-4">
                  <div className="hidden md:flex p-3 rounded-xl bg-success/10">
                    <ArrowDownCircle className="w-6 h-6 text-success" />
                  </div>
                  <div className="text-center md:text-left">
                    <div className="flex items-center justify-center md:justify-start gap-1 text-success">
                      <ArrowDownCircle className="w-3 h-3 md:hidden" />
                      <p className="text-[10px] md:text-sm font-medium">{t('debts.theyOwe')}</p>
                    </div>
                    <p className="text-sm md:text-2xl font-bold font-mono text-success">
                      +{stats.theyOweRemaining.toLocaleString('fr-FR')}
                    </p>
                    <p className="hidden md:block text-xs text-muted-foreground">
                      {t('common.of')} {stats.theyOweTotal.toLocaleString('fr-FR')} {t('common.total')}
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
                      <p className="text-[10px] md:text-sm font-medium">{t('debts.netPosition')}</p>
                    </div>
                    <p className="text-sm md:text-2xl font-bold font-mono text-primary">
                      {stats.netBalance >= 0 ? '+' : ''}{stats.netBalance.toLocaleString('fr-FR')}
                    </p>
                    <p className="hidden md:block text-xs text-muted-foreground">
                      {stats.netBalance >= 0 ? t('debts.peopleOweYouMore') : t('debts.youOweMore')}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
        {/* Debts Tables */}
        <Tabs defaultValue="they_owe" className="space-y-3 md:space-y-4">
          <TabsList className="grid w-full grid-cols-2 h-9 md:h-10">
            <TabsTrigger value="they_owe" className="text-xs md:text-sm">{t('debts.theyOweMe')}</TabsTrigger>
            <TabsTrigger value="i_owe" className="text-xs md:text-sm">{t('debts.iOweThem')}</TabsTrigger>
          </TabsList>
          
          <TabsContent value="they_owe">
            <DebtTable 
              debtType="they_owe" 
              onAddPayment={handleAddPayment}
              onEdit={handleEditDebt}
            />
          </TabsContent>
          
          <TabsContent value="i_owe">
            <DebtTable 
              debtType="i_owe" 
              onAddPayment={handleAddPayment}
              onEdit={handleEditDebt}
            />
          </TabsContent>
        </Tabs>

        {/* Forms */}
        <DebtForm
          debt={editingDebt}
          open={isDebtFormOpen}
          onOpenChange={handleFormClose}
        />
        
        {selectedDebt && (
          <DebtPaymentForm
            debt={selectedDebt}
            open={isPaymentFormOpen}
            onOpenChange={setIsPaymentFormOpen}
          />
        )}
      </div>
    </Layout>
  );
}