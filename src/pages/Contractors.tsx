import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/lib/auth';
import { Navigate } from 'react-router-dom';
import Layout from '@/components/Layout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Users2, FileText, CreditCard } from 'lucide-react';
import ContractorsList from '@/components/contractors/ContractorsList';
import ContractsList from '@/components/contractors/ContractsList';
import ContractorPayments from '@/components/contractors/ContractorPayments';

export default function Contractors() {
  const { t } = useTranslation();
  const { user, role, loading } = useAuth();

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      </Layout>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  return (
    <Layout>
      <div className="space-y-3 md:space-y-6">
        <div>
          <h1 className="text-lg md:text-2xl font-bold flex items-center gap-2">
            <Users2 className="w-5 h-5 md:w-6 md:h-6" />
            {t('contractors.title')}
          </h1>
          <p className="text-xs md:text-sm text-muted-foreground">
            {t('contractors.description')}
          </p>
        </div>

        <Tabs defaultValue="contractors" className="space-y-4">
          <TabsList className="grid w-full max-w-lg grid-cols-3">
            <TabsTrigger value="contractors" className="gap-1 text-xs md:text-sm px-1 md:px-3">
              <Users2 className="w-3.5 h-3.5 md:w-4 md:h-4" />
              <span className="hidden sm:inline">{t('contractors.contractorsTab')}</span>
              <span className="sm:hidden">{t('contractors.contractorsTabShort')}</span>
            </TabsTrigger>
            <TabsTrigger value="contracts" className="gap-1 text-xs md:text-sm px-1 md:px-3">
              <FileText className="w-3.5 h-3.5 md:w-4 md:h-4" />
              <span className="hidden sm:inline">{t('contractors.contractsTab')}</span>
              <span className="sm:hidden">{t('contractors.contractsTabShort')}</span>
            </TabsTrigger>
            <TabsTrigger value="payments" className="gap-1 text-xs md:text-sm px-1 md:px-3">
              <CreditCard className="w-3.5 h-3.5 md:w-4 md:h-4" />
              <span className="hidden sm:inline">{t('contractors.paymentsTab')}</span>
              <span className="sm:hidden">{t('contractors.paymentsTabShort')}</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="contractors">
            <ContractorsList />
          </TabsContent>
          <TabsContent value="contracts">
            <ContractsList />
          </TabsContent>
          <TabsContent value="payments">
            <ContractorPayments />
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
