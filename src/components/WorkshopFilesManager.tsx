import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import JSZip from 'jszip';
import { 
  Loader2, 
  Upload, 
  Map as MapIcon, 
  Receipt, 
  Trash2, 
  Download,
  FileImage,
  FileText,
  Camera,
  Eye,
  Banknote,
  FolderDown
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface WorkshopFilesManagerProps {
  workshopId: string;
  workshopName: string;
}

const categorizeFile = (file: { file_path: string; payment_id?: string | null; income_id?: string | null }): 'map' | 'receipt' | 'income' => {
  if (file.payment_id) return 'receipt';
  if (file.income_id) return 'income';
  // Check folder names used in uploads: /receipts/, /receipt/
  if (file.file_path.includes('/receipts/') || file.file_path.includes('/receipt/')) return 'receipt';
  // Check folder names used for income checks: /checks/, /income/
  if (file.file_path.includes('/checks/') || file.file_path.includes('/income/')) return 'income';
  return 'map';
};

export default function WorkshopFilesManager({ workshopId, workshopName }: WorkshopFilesManagerProps) {
  const { t } = useTranslation();
  const { user, role } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [previewFile, setPreviewFile] = useState<{ url: string; name: string; type: string } | null>(null);
  const [fileToDelete, setFileToDelete] = useState<any>(null);
  const mapInputRef = useRef<HTMLInputElement>(null);
  const receiptInputRef = useRef<HTMLInputElement>(null);

  // Fetch all workshop files including payment receipts
  const { data: allFiles, isLoading } = useQuery({
    queryKey: ['workshop-files-all', workshopId],
    queryFn: async () => {
      // Get all files for this workshop
      const { data: filesData, error: filesError } = await supabase
        .from('workshop_files')
        .select('*')
        .eq('workshop_id', workshopId)
        .order('created_at', { ascending: false });
      
      if (filesError) throw filesError;

      // Get payment info for files with payment_id
      const paymentIds = filesData?.filter(f => f.payment_id).map(f => f.payment_id) || [];
      const paymentsMap = new Map<string, any>();
      
      if (paymentIds.length > 0) {
        const { data: paymentsData } = await supabase
          .from('payments')
          .select('id, paid_to, reason, amount, payment_date, created_by')
          .in('id', paymentIds);
        
        paymentsData?.forEach(p => paymentsMap.set(p.id, p));
      }

      // Get profiles for creators
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('user_id, full_name');
      
      const profileMap = new Map(profilesData?.map(p => [p.user_id, p.full_name]) || []);

      return filesData?.map(file => {
        const payment = file.payment_id ? paymentsMap.get(file.payment_id) : null;
        return {
          ...file,
          payment,
          uploader_name: profileMap.get(file.uploaded_by) || 'Unknown',
          creator_name: payment ? profileMap.get(payment.created_by) || 'Unknown' : null,
        };
      }) || [];
    },
  });

  const uploadFile = async (file: File, category: 'map' | 'receipt') => {
    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const safeName = (workshopName || workshopId).replace(/[^a-zA-Z0-9\u0600-\u06FF\s-]/g, '').trim();
      const categoryFolder = category === 'receipt' ? 'receipts' : 'files';
      const fileName = `${safeName}/${categoryFolder}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('workshop-files')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { error: dbError } = await supabase
        .from('workshop_files')
        .insert([{
          workshop_id: workshopId,
          file_type: file.type,
          file_name: file.name,
          file_path: fileName,
          uploaded_by: user?.id,
        }]);

      if (dbError) throw dbError;

      queryClient.invalidateQueries({ queryKey: ['workshop-files-all', workshopId] });
      toast({
        title: t('files.uploaded'),
        description: t('files.uploadedDesc'),
      });
    } catch (error: any) {
      toast({
        title: t('errors.error'),
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
    }
  };

  const deleteFile = useMutation({
    mutationFn: async (file: any) => {
      const { error: storageError } = await supabase.storage
        .from('workshop-files')
        .remove([file.file_path]);

      if (storageError) throw storageError;

      const { error: dbError } = await supabase
        .from('workshop_files')
        .delete()
        .eq('id', file.id);

      if (dbError) throw dbError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workshop-files-all', workshopId] });
      queryClient.invalidateQueries({ queryKey: ['workshop-files', workshopId] });
      setFileToDelete(null);
      toast({ title: t('files.deleted'), description: t('files.deletedDesc') });
    },
  });

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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, category: 'map' | 'receipt') => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
        toast({
          title: t('errors.error'),
          description: t('payments.invalidFileType'),
          variant: 'destructive',
        });
        return;
      }
      uploadFile(file, category);
    }
    e.target.value = '';
  };

  const downloadAllFiles = async () => {
    setDownloadingAll(true);
    try {
      const zip = new JSZip();
      const safeName = workshopName || 'workshop';

      // 1) Download uploaded storage files - fetch ALL files from DB directly
      const { data: dbFiles } = await supabase
        .from('workshop_files')
        .select('*')
        .eq('workshop_id', workshopId);

      if (dbFiles && dbFiles.length > 0) {
        // Download files in parallel batches of 5
        const batchSize = 5;
        for (let i = 0; i < dbFiles.length; i += batchSize) {
          const batch = dbFiles.slice(i, i + batchSize);
          const results = await Promise.allSettled(
            batch.map(async (file) => {
              const { data, error } = await supabase.storage
                .from('workshop-files')
                .download(file.file_path);
              if (error || !data) return null;
              const category = categorizeFile(file);
              const folderName = category === 'receipt' ? 'receipts' : category === 'income' ? 'checks' : 'files';
              // Use unique name to avoid collisions
              const ext = file.file_name.split('.').pop() || 'bin';
              const uniqueName = `${file.file_name.replace(/\.[^.]+$/, '')}_${file.id.slice(0, 6)}.${ext}`;
              return { path: `${safeName}/${folderName}/${uniqueName}`, data };
            })
          );
          results.forEach(r => {
            if (r.status === 'fulfilled' && r.value) {
              zip.file(r.value.path, r.value.data);
            }
          });
        }
      }

      // 2) Fetch workers map (id -> name)
      const { data: workersData } = await supabase.from('workers').select('id, name, category');
      const workerMap = new Map(workersData?.map(w => [w.id, w.name]) || []);
      const workerCatMap = new Map(workersData?.map(w => [w.id, w.category]) || []);

      // 3) Fetch profiles map (user_id -> full_name)
      const { data: profilesData } = await supabase.from('profiles').select('user_id, full_name');
      const profileMap = new Map(profilesData?.map(p => [p.user_id, p.full_name || 'Unknown']) || []);

      // 4) Attendance CSV - grouped by date
      const { data: attendanceData } = await supabase
        .from('attendance')
        .select('*')
        .eq('workshop_id', workshopId)
        .order('work_date', { ascending: true });

      if (attendanceData && attendanceData.length > 0) {
        const csvHeader = 'Date,Worker,Category,Hours,Hourly Rate,Daily Salary,Extra,Description,Paid';
        const csvRows: string[] = [];
        let lastDate = '';
        attendanceData.forEach(a => {
          const wName = workerMap.get(a.worker_id) || a.worker_id;
          const wCat = workerCatMap.get(a.worker_id) || 'worker';
          const dateStr = a.work_date === lastDate ? '' : a.work_date;
          lastDate = a.work_date;
          csvRows.push(`${dateStr},"${wName}","${wCat}",${a.hours_worked},${a.hourly_rate},${a.daily_salary || 0},${a.extra_amount || 0},"${(a.description || '').replace(/"/g, '""')}",${a.is_paid ? 'Yes' : 'No'}`);
        });
        zip.file(`${safeName}/attendance.csv`, '\uFEFF' + csvHeader + '\n' + csvRows.join('\n'));
      }

      // 5) Worker Adjustments CSV - grouped by date
      const { data: adjustmentsData } = await supabase
        .from('worker_adjustments')
        .select('*')
        .eq('workshop_id', workshopId)
        .order('work_date', { ascending: true });

      if (adjustmentsData && adjustmentsData.length > 0) {
        const csvHeader = 'Date,Worker,Type,Amount,Reason,Paid';
        const csvRows: string[] = [];
        let lastDate = '';
        adjustmentsData.forEach(a => {
          const wName = workerMap.get(a.worker_id) || a.worker_id;
          const dateStr = a.work_date === lastDate ? '' : a.work_date;
          lastDate = a.work_date;
          csvRows.push(`${dateStr},"${wName}","${a.adjustment_type}",${a.amount},"${(a.reason || '').replace(/"/g, '""')}",${a.is_paid ? 'Yes' : 'No'}`);
        });
        zip.file(`${safeName}/adjustments.csv`, '\uFEFF' + csvHeader + '\n' + csvRows.join('\n'));
      }

      // 6) Payments CSV - grouped by date
      const { data: paymentsData } = await supabase
        .from('payments')
        .select('*')
        .eq('workshop_id', workshopId)
        .order('payment_date', { ascending: true });

      if (paymentsData && paymentsData.length > 0) {
        const csvHeader = 'Date,Paid To,Amount,Reason,Status,Added By';
        const csvRows: string[] = [];
        let lastDate = '';
        paymentsData.forEach(p => {
          const addedBy = profileMap.get(p.created_by) || p.created_by;
          const dateStr = p.payment_date === lastDate ? '' : p.payment_date;
          lastDate = p.payment_date;
          const cleanReason = (p.reason || '').replace(/\u202F/g, ' ').replace(/\u00A0/g, ' ').replace(/"/g, '""');
          csvRows.push(`${dateStr},"${p.paid_to}",${p.amount},"${cleanReason}","${p.status}","${addedBy}"`);
        });
        zip.file(`${safeName}/payments.csv`, '\uFEFF' + csvHeader + '\n' + csvRows.join('\n'));
      }

      // 7) Income CSV - grouped by date
      const { data: incomeData } = await supabase
        .from('income')
        .select('*')
        .eq('workshop_id', workshopId)
        .order('income_date', { ascending: true });

      if (incomeData && incomeData.length > 0) {
        const csvHeader = 'Date,Amount,Description,Added By';
        const csvRows: string[] = [];
        let lastDate = '';
        incomeData.forEach(i => {
          const addedBy = profileMap.get(i.created_by) || i.created_by;
          const dateStr = i.income_date === lastDate ? '' : i.income_date;
          lastDate = i.income_date;
          csvRows.push(`${dateStr},${i.amount},"${(i.description || '').replace(/\u202F/g, ' ').replace(/\u00A0/g, ' ').replace(/"/g, '""')}","${addedBy}"`);
        });
        zip.file(`${safeName}/income.csv`, '\uFEFF' + csvHeader + '\n' + csvRows.join('\n'));
      }

      // 8) Summary text file
      const totalIncome = incomeData?.reduce((s, i) => s + Number(i.amount), 0) || 0;
      const totalApprovedPayments = paymentsData?.filter(p => p.status === 'approved').reduce((s, p) => s + Number(p.amount), 0) || 0;
      const totalPendingPayments = paymentsData?.filter(p => p.status === 'pending').reduce((s, p) => s + Number(p.amount), 0) || 0;
      const balance = totalIncome - totalApprovedPayments;
      const totalAttendanceDays = attendanceData?.length || 0;

      const summary = [
        `Workshop: ${safeName}`,
        `Export Date: ${format(new Date(), 'yyyy-MM-dd HH:mm')}`,
        ``,
        `=== Financial Summary ===`,
        `Total Income: ${totalIncome.toLocaleString('fr-FR')} CFA`,
        `Total Approved Payments: ${totalApprovedPayments.toLocaleString('fr-FR')} CFA`,
        `Total Pending Payments: ${totalPendingPayments.toLocaleString('fr-FR')} CFA`,
        `Balance: ${balance.toLocaleString('fr-FR')} CFA`,
        ``,
        `=== Work Summary ===`,
        `Total Attendance Days: ${totalAttendanceDays}`,
        `Total Workers: ${new Set(attendanceData?.map(a => a.worker_id) || []).size}`,
        `Total Uploaded Files: ${dbFiles?.length || 0}`,
      ].join('\n');

      zip.file(`${safeName}/summary.txt`, summary);

      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${safeName}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error: any) {
      toast({ title: t('errors.error'), description: error.message, variant: 'destructive' });
    } finally {
      setDownloadingAll(false);
    }
  };

  // Categorize files
  const maps = allFiles?.filter(f => categorizeFile(f) === 'map') || [];
  const receipts = allFiles?.filter(f => categorizeFile(f) === 'receipt') || [];
  const incomeFiles = allFiles?.filter(f => categorizeFile(f) === 'income') || [];

  const getFileIcon = (fileType: string) => {
    if (fileType.startsWith('image/')) {
      return <FileImage className="w-4 h-4" />;
    }
    return <FileText className="w-4 h-4" />;
  };

  const isImage = (fileType: string) => fileType.startsWith('image/');

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="shadow-card">
        <CardHeader className="pb-2 px-3 md:px-6 pt-3 md:pt-6">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base md:text-lg">{t('files.workshopFiles')}</CardTitle>
              <CardDescription className="text-xs md:text-sm">
                {t('files.mapsAndReceipts')}
              </CardDescription>
            </div>
            {(
              <Button
                variant="outline"
                size="sm"
                onClick={downloadAllFiles}
                disabled={downloadingAll}
                className="gap-1.5"
              >
                {downloadingAll ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FolderDown className="w-3.5 h-3.5" />}
                <span className="hidden sm:inline">{t('files.downloadAll')}</span>
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent className="px-3 md:px-6 pb-3 md:pb-6">
          <Tabs defaultValue="maps">
            <TabsList className="grid w-full grid-cols-3 h-9">
              <TabsTrigger value="maps" className="text-xs md:text-sm gap-1.5">
                <MapIcon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{t('files.maps')}</span> ({maps.length})
              </TabsTrigger>
              <TabsTrigger value="receipts" className="text-xs md:text-sm gap-1.5">
                <Receipt className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{t('files.receipts')}</span> ({receipts.length})
              </TabsTrigger>
              <TabsTrigger value="income" className="text-xs md:text-sm gap-1.5">
                <Banknote className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{t('files.bankChecks')}</span> ({incomeFiles.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="maps" className="mt-3 space-y-3">
              {role === 'admin' && (
                <div className="flex gap-2">
                  <input
                    ref={mapInputRef}
                    type="file"
                    accept="image/*,.pdf"
                    className="hidden"
                    onChange={(e) => handleFileChange(e, 'map')}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => mapInputRef.current?.click()}
                    disabled={uploading}
                    className="gap-1.5"
                  >
                    {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                    {t('files.uploadMap')}
                  </Button>
                </div>
              )}

              {maps.length === 0 ? (
                <p className="text-center text-muted-foreground py-6 text-sm">
                  {t('files.noMaps')}
                </p>
              ) : (
                <div className="space-y-2">
                  {maps.map((file) => (
                    <div key={file.id} className="flex items-center justify-between p-2 rounded-lg border">
                      <div className="flex items-center gap-2 min-w-0">
                        {getFileIcon(file.file_type)}
                        <span className="text-sm truncate">{file.file_name}</span>
                      </div>
                      <div className="flex gap-1">
                        {isImage(file.file_type) && (
                          <Button variant="ghost" size="icon" onClick={() => previewFileHandler(file)} className="h-7 w-7">
                            <Eye className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" onClick={() => downloadFile(file)} className="h-7 w-7">
                          <Download className="w-3.5 h-3.5" />
                        </Button>
                        {role === 'admin' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteFile.mutate(file)}
                            className="h-7 w-7 text-destructive hover:text-destructive"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="receipts" className="mt-3 space-y-3">
              <div className="flex gap-2">
                <input
                  ref={receiptInputRef}
                  type="file"
                  accept="image/*,.pdf"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => handleFileChange(e, 'receipt')}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => receiptInputRef.current?.click()}
                  disabled={uploading}
                  className="gap-1.5"
                >
                  {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
                  {t('files.captureReceipt')}
                </Button>
              </div>

              {receipts.length === 0 ? (
                <p className="text-center text-muted-foreground py-6 text-sm">
                  {t('files.noReceipts')}
                </p>
              ) : (
                <div className="space-y-2">
                  {receipts.map((file) => (
                    <Card key={file.id} className="border">
                      <CardContent className="p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              {getFileIcon(file.file_type)}
                              <span className="text-sm font-medium truncate">{file.file_name}</span>
                            </div>
                            {file.payment && (
                              <div className="text-xs text-muted-foreground space-y-0.5">
                                <p><span className="font-medium">{t('payments.paidTo')}:</span> {file.payment.paid_to}</p>
                                <p><span className="font-medium">{t('common.amount')}:</span> {Number(file.payment.amount).toLocaleString('fr-FR')} CFA</p>
                                <p><span className="font-medium">{t('common.reason')}:</span> {file.payment.reason}</p>
                                <p><span className="font-medium">{t('common.date')}:</span> {format(new Date(file.payment.payment_date), 'MMM d, yyyy')}</p>
                                <p><span className="font-medium">{t('payments.addedBy')}:</span> {file.creator_name}</p>
                              </div>
                            )}
                            {!file.payment && (
                              <p className="text-xs text-muted-foreground">
                                {t('files.uploadedBy')}: {file.uploader_name}
                              </p>
                            )}
                          </div>
                          <div className="flex gap-1 flex-shrink-0">
                            {isImage(file.file_type) && (
                              <Button variant="ghost" size="icon" onClick={() => previewFileHandler(file)} className="h-7 w-7">
                                <Eye className="w-3.5 h-3.5" />
                              </Button>
                            )}
                            <Button variant="ghost" size="icon" onClick={() => downloadFile(file)} className="h-7 w-7">
                              <Download className="w-3.5 h-3.5" />
                            </Button>
                            {role === 'admin' && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => deleteFile.mutate(file)}
                                className="h-7 w-7 text-destructive hover:text-destructive"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="income" className="mt-3 space-y-3">
              {incomeFiles.length === 0 ? (
                <p className="text-center text-muted-foreground py-6 text-sm">
                  {t('files.noBankChecks')}
                </p>
              ) : (
                <div className="space-y-2">
                  {incomeFiles.map((file) => (
                    <div key={file.id} className="flex items-center justify-between p-2 rounded-lg border">
                      <div className="flex items-center gap-2 min-w-0">
                        {getFileIcon(file.file_type)}
                        <div className="min-w-0">
                          <span className="text-sm truncate block">{file.file_name}</span>
                          <span className="text-xs text-muted-foreground">{file.uploader_name}</span>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        {isImage(file.file_type) && (
                          <Button variant="ghost" size="icon" onClick={() => previewFileHandler(file)} className="h-7 w-7">
                            <Eye className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" onClick={() => downloadFile(file)} className="h-7 w-7">
                          <Download className="w-3.5 h-3.5" />
                        </Button>
                        {role === 'admin' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteFile.mutate(file)}
                            className="h-7 w-7 text-destructive hover:text-destructive"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Image Preview Dialog */}
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
