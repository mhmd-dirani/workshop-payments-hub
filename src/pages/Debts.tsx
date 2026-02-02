import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
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
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Debt Management</h2>
            <p className="text-muted-foreground">
              Track debts you owe and debts owed to you
            </p>
          </div>
          
          <Button 
            onClick={() => setIsDebtFormOpen(true)} 
            className="gap-2 gradient-primary text-primary-foreground"
          >
            <Plus className="w-4 h-4" />
            Add Debt
          </Button>
        </div>

        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="shadow-card border-destructive/20">
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-destructive/10">
                    <ArrowUpCircle className="w-6 h-6 text-destructive" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-destructive">I Owe (Remaining)</p>
                    <p className="text-2xl font-bold font-mono text-destructive">
                      -{stats.iOweRemaining.toLocaleString('fr-FR')} CFA
                    </p>
                    <p className="text-xs text-muted-foreground">
                      of {stats.iOweTotal.toLocaleString('fr-FR')} CFA total
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="shadow-card border-success/20">
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-success/10">
                    <ArrowDownCircle className="w-6 h-6 text-success" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-success">They Owe Me (Remaining)</p>
                    <p className="text-2xl font-bold font-mono text-success">
                      +{stats.theyOweRemaining.toLocaleString('fr-FR')} CFA
                    </p>
                    <p className="text-xs text-muted-foreground">
                      of {stats.theyOweTotal.toLocaleString('fr-FR')} CFA total
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="shadow-card border-primary/20">
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-primary/10">
                    <Wallet className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-primary">Net Balance</p>
                    <p className="text-2xl font-bold font-mono text-primary">
                      {stats.netBalance >= 0 ? '+' : ''}{stats.netBalance.toLocaleString('fr-FR')} CFA
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {stats.netBalance >= 0 ? 'People owe you more' : 'You owe more'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Debts Tables */}
        <Tabs defaultValue="they_owe" className="space-y-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="they_owe">They Owe Me</TabsTrigger>
            <TabsTrigger value="i_owe">I Owe Them</TabsTrigger>
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
