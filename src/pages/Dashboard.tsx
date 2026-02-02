import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
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
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, ArrowDownCircle, ArrowUpCircle, Wallet } from 'lucide-react';

export default function Dashboard() {
  const { role } = useAuth();
  const [selectedWorkshop, setSelectedWorkshop] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isIncomeFormOpen, setIsIncomeFormOpen] = useState(false);
  const [editingPayment, setEditingPayment] = useState<any>(null);

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
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Payment Dashboard</h2>
            <p className="text-muted-foreground">
              {role === 'admin' 
                ? 'Manage all workshop payments and income' 
                : 'View and add your payment records'}
            </p>
          </div>
          
          {selectedWorkshop && (
            <div className="flex gap-2">
              {role === 'admin' && (
                <Button 
                  onClick={() => setIsIncomeFormOpen(true)} 
                  className="gap-2 bg-success text-success-foreground hover:bg-success/90"
                >
                  <Plus className="w-4 h-4" />
                  Add Income
                </Button>
              )}
              <Button 
                onClick={() => setIsFormOpen(true)} 
                className="gap-2 bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                <Plus className="w-4 h-4" />
                Add Payment
              </Button>
            </div>
          )}
        </div>

        {/* Workshop Selector */}
        <Card className="shadow-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Select Workshop</CardTitle>
            <CardDescription>Choose a workshop to view its financial records</CardDescription>
          </CardHeader>
          <CardContent>
            <WorkshopSelector 
              selectedWorkshop={selectedWorkshop} 
              onSelect={setSelectedWorkshop} 
            />
          </CardContent>
        </Card>

        {/* User Balance Card (for non-admins - show global balance always) */}
        {role !== 'admin' && <UserBalanceCard />}


        {/* Stats Cards - 3 totals (admin only) */}
        {selectedWorkshop && stats && role === 'admin' && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="shadow-card border-success/20">
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-success/10">
                    <ArrowDownCircle className="w-6 h-6 text-success" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-success">Total Income</p>
                    <p className="text-2xl font-bold font-mono text-success">
                      +{stats.totalIncome.toLocaleString('fr-FR')} CFA
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="shadow-card border-destructive/20">
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-destructive/10">
                    <ArrowUpCircle className="w-6 h-6 text-destructive" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-destructive">Total Paid</p>
                    <p className="text-2xl font-bold font-mono text-destructive">
                      -{stats.totalPaid.toLocaleString('fr-FR')} CFA
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
                    <p className="text-sm font-medium text-primary">Balance</p>
                    <p className="text-2xl font-bold font-mono text-primary">
                      {stats.balance >= 0 ? '+' : ''}{stats.balance.toLocaleString('fr-FR')} CFA
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
            <CardContent className="py-12 text-center text-muted-foreground">
              <p>Select a workshop above to view financial records</p>
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
