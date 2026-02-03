import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/lib/auth';
import { Navigate } from 'react-router-dom';
import Layout from '@/components/Layout';
import AttendanceForm from '@/components/AttendanceForm';
import AttendanceTable from '@/components/AttendanceTable';
import WorkerManager from '@/components/WorkerManager';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Calendar, Users } from 'lucide-react';

export default function Attendance() {
  const { t } = useTranslation();
  const { user, loading } = useAuth();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingAttendance, setEditingAttendance] = useState<any>(null);

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

  const handleEdit = (attendance: any) => {
    setEditingAttendance(attendance);
    setIsFormOpen(true);
  };

  const handleFormClose = (open: boolean) => {
    setIsFormOpen(open);
    if (!open) setEditingAttendance(null);
  };

  return (
    <Layout>
      <div className="space-y-3 md:space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-lg md:text-2xl font-bold flex items-center gap-2">
              <Calendar className="w-5 h-5 md:w-6 md:h-6" />
              {t('attendance.title')}
            </h1>
            <p className="text-xs md:text-sm text-muted-foreground">
              {t('attendance.description')}
            </p>
          </div>
          
          <Button
            onClick={() => setIsFormOpen(true)}
            size="sm"
            className="gap-1.5 bg-success text-success-foreground hover:bg-success/90 h-8 text-xs md:text-sm md:h-9"
          >
            <Plus className="w-3.5 h-3.5 md:w-4 md:h-4" />
            <span className="hidden xs:inline">{t('common.add')}</span> {t('attendance.addEntry')}
          </Button>
        </div>

        {/* Tabs for Workers and Attendance */}
        <Tabs defaultValue="attendance" className="space-y-4">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="attendance" className="gap-2">
              <Calendar className="w-4 h-4" />
              {t('attendance.attendance')}
            </TabsTrigger>
            <TabsTrigger value="workers" className="gap-2">
              <Users className="w-4 h-4" />
              {t('workers.title')}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="attendance">
            <AttendanceTable onEdit={handleEdit} />
          </TabsContent>

          <TabsContent value="workers">
            <WorkerManager />
          </TabsContent>
        </Tabs>

        {/* Form */}
        <AttendanceForm
          attendance={editingAttendance}
          open={isFormOpen}
          onOpenChange={handleFormClose}
        />
      </div>
    </Layout>
  );
}
