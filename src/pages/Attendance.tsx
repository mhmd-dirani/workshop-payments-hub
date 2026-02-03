import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/lib/auth';
import { Navigate } from 'react-router-dom';
import Layout from '@/components/Layout';
import QuickAttendanceForm from '@/components/QuickAttendanceForm';
import AttendanceTable from '@/components/AttendanceTable';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar, History } from 'lucide-react';

export default function Attendance() {
  const { t } = useTranslation();
  const { user, loading } = useAuth();

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
        {/* Header */}
        <div>
          <h1 className="text-lg md:text-2xl font-bold flex items-center gap-2">
            <Calendar className="w-5 h-5 md:w-6 md:h-6" />
            {t('attendance.title')}
          </h1>
          <p className="text-xs md:text-sm text-muted-foreground">
            {t('attendance.description')}
          </p>
        </div>

        {/* Tabs for Entry and History */}
        <Tabs defaultValue="entry" className="space-y-4">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="entry" className="gap-2">
              <Calendar className="w-4 h-4" />
              {t('attendance.entry')}
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-2">
              <History className="w-4 h-4" />
              {t('attendance.history')}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="entry">
            <QuickAttendanceForm />
          </TabsContent>

          <TabsContent value="history">
            <AttendanceTable />
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
