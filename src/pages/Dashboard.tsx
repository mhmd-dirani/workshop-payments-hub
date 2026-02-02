import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import Layout from '@/components/Layout';
import WorkshopSelector from '@/components/WorkshopSelector';
import PaymentTable from '@/components/PaymentTable';
import PaymentForm from '@/components/PaymentForm';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, DollarSign, Clock, CheckCircle } from 'lucide-react';

export default function Dashboard() {
  const { role } = useAuth();
  const [selectedWorkshop, setSelectedWorkshop] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingPayment, setEditingPayment] = useState<any>(null);

  const { data: stats } = useQuery({
    queryKey: ['payment-stats', selectedWorkshop],
    queryFn: async () => {
      if (!selectedWorkshop) return null;
      
      const { data, error } = await supabase
        .from('payments')
        .select('amount, status')
        .eq('workshop_id', selectedWorkshop);
      
      if (error) throw error;
      
      const total = data.filter(p => p.status === 'approved').reduce((sum, p) => sum + Number(p.amount), 0);
      const pending = data.filter(p => p.status === 'pending').length;
      const approved = data.filter(p => p.status === 'approved').length;
      
      return { total, pending, approved };
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
                ? 'Manage all workshop payments' 
                : 'View and add your payment records'}
            </p>
          </div>
          
          {selectedWorkshop && (
            <Button 
              onClick={() => setIsFormOpen(true)} 
              className="gap-2 gradient-primary text-primary-foreground"
            >
              <Plus className="w-4 h-4" />
              Add Payment
            </Button>
          )}
        </div>

        {/* Workshop Selector */}
        <Card className="shadow-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Select Workshop</CardTitle>
            <CardDescription>Choose a workshop to view its payment records</CardDescription>
          </CardHeader>
          <CardContent>
            <WorkshopSelector 
              selectedWorkshop={selectedWorkshop} 
              onSelect={setSelectedWorkshop} 
            />
          </CardContent>
        </Card>

        {/* Stats Cards */}
        {selectedWorkshop && stats && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="shadow-card">
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-primary/10">
                    <DollarSign className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Approved</p>
                    <p className="text-2xl font-bold font-mono">
                      {stats.total.toLocaleString('fr-FR')} CFA
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="shadow-card">
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-warning/10">
                    <Clock className="w-6 h-6 text-warning" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Pending</p>
                    <p className="text-2xl font-bold">{stats.pending}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="shadow-card">
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-success/10">
                    <CheckCircle className="w-6 h-6 text-success" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Approved</p>
                    <p className="text-2xl font-bold">{stats.approved}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Payment Table */}
        {selectedWorkshop ? (
          <PaymentTable workshopId={selectedWorkshop} onEdit={handleEdit} />
        ) : (
          <Card className="shadow-card">
            <CardContent className="py-12 text-center text-muted-foreground">
              <p>Select a workshop above to view payment records</p>
            </CardContent>
          </Card>
        )}

        {/* Payment Form Dialog */}
        {selectedWorkshop && (
          <PaymentForm
            workshopId={selectedWorkshop}
            payment={editingPayment}
            open={isFormOpen}
            onOpenChange={handleFormClose}
          />
        )}
      </div>
    </Layout>
  );
}
