import { useTranslation } from 'react-i18next';
import { useAuth } from '@/lib/auth';
import { Navigate } from 'react-router-dom';
import Layout from '@/components/Layout';
import QuickAttendanceForm from '@/components/QuickAttendanceForm';
import OvertimePaymentForm from '@/components/OvertimePaymentForm';
import AttendanceTable from '@/components/AttendanceTable';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar, History, Clock } from 'lucide-react';

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

        {/* Tabs for Entry, Overtime, and History */}
        <Tabs defaultValue="entry" className="space-y-4">
          <TabsList className="grid w-full max-w-lg grid-cols-3">
            <TabsTrigger value="entry" className="gap-1.5 text-xs md:text-sm">
              <Calendar className="w-3.5 h-3.5 md:w-4 md:h-4" />
              <span className="hidden sm:inline">{t('attendance.entry')}</span>
              <span className="sm:hidden">{t('attendance.entryShort')}</span>
            </TabsTrigger>
            <TabsTrigger value="overtime" className="gap-1.5 text-xs md:text-sm">
              <Clock className="w-3.5 h-3.5 md:w-4 md:h-4" />
              <span className="hidden sm:inline">{t('attendance.overtime')}</span>
              <span className="sm:hidden">{t('attendance.overtimeShort')}</span>
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-1.5 text-xs md:text-sm">
              <History className="w-3.5 h-3.5 md:w-4 md:h-4" />
              <span className="hidden sm:inline">{t('attendance.history')}</span>
              <span className="sm:hidden">{t('attendance.historyShort')}</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="entry">
            <QuickAttendanceForm />
          </TabsContent>

          <TabsContent value="overtime">
            <OvertimePaymentForm />
          </TabsContent>

          <TabsContent value="history">
            <AttendanceTable />
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
