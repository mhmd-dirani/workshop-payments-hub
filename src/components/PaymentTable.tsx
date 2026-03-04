import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { translatePaidTo, translateReason } from '@/lib/payment-display-utils';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { Pencil, Trash2, Clock, CheckCircle, XCircle, Search, DollarSign, Paperclip, Eye, Download } from 'lucide-react';

interface PaymentTableProps {
  workshopId: string;
  onEdit?: (payment: any) => void;
}

export default function PaymentTable({ workshopId, onEdit }: PaymentTableProps) {
  const { t } = useTranslation();
  const { user, role } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [searchTerm, setSearchTerm] = useState('');
  const [previewFile, setPreviewFile] = useState<{ url: string; name: string; type: string } | null>(null);
  const [paymentToDelete, setPaymentToDelete] = useState<any>(null);

  const { data: payments, isLoading } = useQuery({
    queryKey: ['payments', workshopId],
    queryFn: async () => {
      let query = supabase
        .from('payments')
        .select('*')
        .eq('workshop_id', workshopId)
        .order('payment_date', { ascending: false });
      
      const { data: paymentsData, error: paymentsError } = await query;
      if (paymentsError) throw paymentsError;
      
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('user_id, full_name');
      
      const profileMap = new Map(profilesData?.map(p => [p.user_id, p.full_name]) || []);
      
      const paymentIds = paymentsData.map(p => p.id);
      const { data: filesData } = await supabase
        .from('workshop_files')
        .select('*')
        .in('payment_id', paymentIds);
      
      const filesMap = new Map<string, any[]>();
      filesData?.forEach(file => {
        const existing = filesMap.get(file.payment_id) || [];
        existing.push(file);
        filesMap.set(file.payment_id, existing);
      });
      
      return paymentsData.map(payment => ({
        ...payment,
        creator_name: profileMap.get(payment.created_by) || 'Unknown',
        files: filesMap.get(payment.id) || []
      }));
    },
    enabled: !!workshopId,
  });

  const filteredPayments = useMemo(() => {
    if (!payments) return [];
    
    let filtered = payments.filter(p => p.status !== 'rejected');
    
    if (role !== 'admin' && role !== 'co_admin' && user) {
      filtered = filtered.filter(p => p.created_by === user.id);
    }
    
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(p => 
        p.paid_to.toLowerCase().includes(term) ||
        (p.creator_name && p.creator_name.toLowerCase().includes(term))
      );
    }
    
    return filtered;
  }, [payments, role, user, searchTerm]);

  const searchTotal = useMemo(() => {
    if (!searchTerm.trim()) return null;
    return filteredPayments
      .filter(p => p.status === 'approved')
      .reduce((sum, p) => sum + Number(p.amount), 0);
  }, [filteredPayments, searchTerm]);

  const deletePayment = useMutation({
    mutationFn: async (payment: any) => {
      const { data: linkedAttendance, error: linkedAttendanceError } = await supabase
        .from('attendance')
        .select('id, description')
        .eq('payment_id', payment.id);
      if (linkedAttendanceError) throw linkedAttendanceError;

      if (linkedAttendance && linkedAttendance.length > 0) {
        const creditIds = linkedAttendance
          .filter((a) => (a.description || '').includes('[ADVANCE_CREDIT]'))
          .map((a) => a.id);

        const normalIds = linkedAttendance
          .filter((a) => !(a.description || '').includes('[ADVANCE_CREDIT]'))
          .map((a) => a.id);

        if (creditIds.length > 0) {
          const { error: creditDeleteError } = await supabase.from('attendance').delete().in('id', creditIds);
          if (creditDeleteError) throw creditDeleteError;
        }

        if (normalIds.length > 0) {
          const { error: attendanceRevertError } = await supabase
            .from('attendance')
            .update({ is_paid: false, payment_id: null })
            .in('id', normalIds);
          if (attendanceRevertError) throw attendanceRevertError;
        }
      }

      const { data: linkedAdjustments, error: linkedAdjustmentsError } = await supabase
        .from('worker_adjustments')
        .select('id, reason')
        .eq('payment_id', payment.id);
      if (linkedAdjustmentsError) throw linkedAdjustmentsError;

      const creditAdjIds = (linkedAdjustments || [])
        .filter((a) => (a.reason || '').includes('[PAYMENT_CREDIT]'))
        .map((a) => a.id);
      const normalAdjIds = (linkedAdjustments || [])
        .filter((a) => !(a.reason || '').includes('[PAYMENT_CREDIT]'))
        .map((a) => a.id);

      if (creditAdjIds.length > 0) {
        const { error: creditAdjDeleteError } = await supabase.from('worker_adjustments').delete().in('id', creditAdjIds);
        if (creditAdjDeleteError) throw creditAdjDeleteError;
      }

      if (normalAdjIds.length > 0) {
        const { error: adjustmentsRevertError } = await supabase
          .from('worker_adjustments')
          .update({ is_paid: false, payment_id: null })
          .in('id', normalAdjIds);
        if (adjustmentsRevertError) throw adjustmentsRevertError;
      }

      if (payment.paid_to === 'Travailleur Overtime') {
        const { error: attendanceDeleteError } = await supabase
          .from('attendance')
          .delete()
          .eq('payment_id', payment.id);
        if (attendanceDeleteError) throw attendanceDeleteError;
      }

      await supabase
        .from('user_transfers')
        .delete()
        .eq('workshop_id', workshopId)
        .eq('amount', payment.amount)
        .eq('transfer_date', payment.payment_date);

      await supabase
        .from('user_transfers')
        .delete()
        .eq('payment_id', payment.id);

      // Delete linked contractor_payments
      await supabase
        .from('contractor_payments')
        .delete()
        .eq('payment_id', payment.id);

      const { error } = await supabase
        .from('payments')
        .delete()
        .eq('id', payment.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments', workshopId] });
      queryClient.invalidateQueries({ queryKey: ['pending-payments'] });
      queryClient.invalidateQueries({ queryKey: ['user-transfers'] });
      queryClient.invalidateQueries({ queryKey: ['user-balance'] });
      queryClient.invalidateQueries({ queryKey: ['workshop-stats', workshopId] });
      queryClient.invalidateQueries({ queryKey: ['worker-paid-attendance'] });
      queryClient.invalidateQueries({ queryKey: ['worker-unpaid-attendance'] });
      queryClient.invalidateQueries({ queryKey: ['worker-paid-adjustments'] });
      queryClient.invalidateQueries({ queryKey: ['worker-unpaid-adjustments'] });
      queryClient.invalidateQueries({ queryKey: ['attendance'] });
      queryClient.invalidateQueries({ queryKey: ['contractor-payments'] });
      queryClient.invalidateQueries({ queryKey: ['contractor-summaries'] });
      setPaymentToDelete(null);
      toast({
        title: t('payments.paymentDeleted'),
        description: t('payments.paymentDeletedDesc'),
      });
    },
    onError: (error: Error) => {
      toast({
        title: t('errors.error'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const previewFileHandler = async (file: any) => {
    const { data, error } = await supabase.storage
      .from('workshop-files')
      .download(file.file_path);

    if (error) {
      toast({ title: t('errors.error'), description: error.message, variant: 'destructive' });
      return;
    }

    const url = URL.createObjectURL(data);
    setPreviewFile({ url, name: file.file_name, type: file.file_type });
  };

  const downloadFile = async (file: any) => {
    const { data, error } = await supabase.storage
      .from('workshop-files')
      .download(file.file_path);

    if (error) {
      toast({ title: t('errors.error'), description: error.message, variant: 'destructive' });
      return;
    }

    const url = URL.createObjectURL(data);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.file_name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return (
          <Badge className="bg-success/10 text-success border-success/20 gap-1">
            <CheckCircle className="w-3 h-3" />
            {t('payments.approved')}
          </Badge>
        );
      case 'rejected':
        return (
          <Badge className="bg-destructive/10 text-destructive border-destructive/20 gap-1">
            <XCircle className="w-3 h-3" />
            {t('payments.rejected')}
          </Badge>
        );
      default:
        return (
          <Badge className="bg-warning/10 text-warning border-warning/20 gap-1">
            <Clock className="w-3 h-3" />
            {t('payments.pending')}
          </Badge>
        );
    }
  };

  const canEdit = (payment: any) => {
    if (role === 'admin') return true;
    return payment.created_by === user?.id && payment.status === 'pending';
  };

  const canDelete = (payment: any) => {
    if (role === 'admin') return true;
    return payment.created_by === user?.id && payment.status === 'pending';
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (!filteredPayments || filteredPayments.length === 0) {
    return (
      <div className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={t('payments.searchByName')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="text-center py-12 text-muted-foreground">
          <p>{searchTerm ? t('payments.noMatchingPayments') : t('payments.noPayments')}</p>
          <p className="text-sm mt-1">{searchTerm ? t('payments.tryDifferentSearch') : t('payments.clickToAdd')}</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3 md:space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={t('payments.searchByName')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 h-9 md:h-10"
          />
        </div>

        {searchTerm.trim() && searchTotal !== null && (
          <Card className="bg-destructive/5 border-destructive/20">
            <CardContent className="py-3 px-3 md:px-6">
              <div className="flex items-center gap-2 md:gap-3">
                <div className="p-1.5 md:p-2 rounded-lg bg-destructive/10">
                  <DollarSign className="w-4 h-4 md:w-5 md:h-5 text-destructive" />
                </div>
                <div>
                  <p className="text-xs md:text-sm text-destructive font-medium">
                    {t('payments.totalPaidTo')} "{searchTerm}"
                  </p>
                  <p className="text-base md:text-xl font-bold font-mono text-destructive">
                    -{searchTotal.toLocaleString('fr-FR')} CFA
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Mobile Card View */}
        <div className="md:hidden space-y-2">
          {filteredPayments.map((payment) => (
            <Card key={payment.id} className="shadow-card">
              <CardContent className="p-3">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <p className="font-medium text-sm truncate">{payment.paid_to}</p>
                      {payment.files?.length > 0 && (
                        <Paperclip className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground whitespace-pre-line break-words">{payment.reason}</p>
                  </div>
                  <div className="text-right ml-2 flex-shrink-0">
                    <p className="font-mono font-bold text-sm text-destructive">
                      -{Number(payment.amount).toLocaleString('fr-FR')}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {format(new Date(payment.payment_date), 'MMM d')}
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    {getStatusBadge(payment.status)}
                    <span className="text-[10px] text-muted-foreground truncate">{payment.creator_name}</span>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    {payment.files?.length > 0 && (
                      <>
                        <Button variant="ghost" size="icon" onClick={() => previewFileHandler(payment.files[0])} className="h-7 w-7">
                          <Eye className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => downloadFile(payment.files[0])} className="h-7 w-7">
                          <Download className="w-3.5 h-3.5" />
                        </Button>
                      </>
                    )}
                    {canEdit(payment) && onEdit && (
                      <Button variant="ghost" size="icon" onClick={() => onEdit(payment)} className="h-7 w-7">
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                    )}
                    {canDelete(payment) && (
                      <Button variant="ghost" size="icon" onClick={() => setPaymentToDelete(payment)} className="h-7 w-7 text-destructive">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Desktop Table View */}
        <div className="hidden md:block rounded-lg border bg-card shadow-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>{t('common.date')}</TableHead>
                <TableHead>{t('payments.paidTo')}</TableHead>
                <TableHead>{t('common.reason')}</TableHead>
                <TableHead className="text-right">{t('common.amount')}</TableHead>
                <TableHead>{t('common.status')}</TableHead>
                <TableHead>{t('payments.addedBy')}</TableHead>
                <TableHead className="text-right">{t('common.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPayments.map((payment) => (
                <TableRow key={payment.id} className="animate-fade-in">
                  <TableCell className="font-mono text-sm">
                    {format(new Date(payment.payment_date), 'MMM d, yyyy')}
                  </TableCell>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-1">
                      {payment.paid_to}
                      {payment.files?.length > 0 && (
                        <Paperclip className="w-3.5 h-3.5 text-muted-foreground" />
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="max-w-[300px] whitespace-pre-line break-words">{payment.reason}</TableCell>
                  <TableCell className="text-right font-mono font-medium text-destructive">
                    -{Number(payment.amount).toLocaleString('fr-FR')} CFA
                  </TableCell>
                  <TableCell>{getStatusBadge(payment.status)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {payment.creator_name}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {payment.files?.length > 0 && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => previewFileHandler(payment.files[0])}
                            className="h-8 w-8"
                            title={t('common.view')}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => downloadFile(payment.files[0])}
                            className="h-8 w-8"
                            title={t('common.download')}
                          >
                            <Download className="w-4 h-4" />
                          </Button>
                        </>
                      )}
                      {canEdit(payment) && onEdit && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onEdit(payment)}
                          className="h-8 w-8"
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                      )}
                      {canDelete(payment) && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setPaymentToDelete(payment)}
                          className="h-8 w-8 text-destructive hover:text-destructive"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Delete Payment Confirmation */}
      <AlertDialog open={!!paymentToDelete} onOpenChange={(open) => !open && setPaymentToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('confirmDelete.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('confirmDelete.payment', { amount: paymentToDelete ? Number(paymentToDelete.amount).toLocaleString('fr-FR') : '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => paymentToDelete && deletePayment.mutate(paymentToDelete)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* File Preview Dialog */}
      <Dialog open={!!previewFile} onOpenChange={() => setPreviewFile(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="truncate">{previewFile?.name}</DialogTitle>
          </DialogHeader>
          {previewFile && (
            <div className="flex items-center justify-center">
              {previewFile.type.startsWith('image/') ? (
                <img 
                  src={previewFile.url} 
                  alt={previewFile.name}
                  className="max-w-full max-h-[70vh] object-contain rounded-lg"
                />
              ) : (
                <iframe 
                  src={previewFile.url}
                  className="w-full h-[70vh] rounded-lg"
                  title={previewFile.name}
                />
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
