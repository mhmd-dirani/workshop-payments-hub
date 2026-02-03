import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
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
  Banknote
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

const categorizeFile = (filePath: string): 'map' | 'receipt' | 'payment' | 'income' => {
  if (filePath.includes('/map/')) return 'map';
  if (filePath.includes('/receipt/')) return 'receipt';
  if (filePath.includes('/income/')) return 'income';
  return 'payment';
};

export default function WorkshopFilesManager({ workshopId, workshopName: _workshopName }: WorkshopFilesManagerProps) {
  const { t } = useTranslation();
  const { user, role } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [previewFile, setPreviewFile] = useState<{ url: string; name: string; type: string } | null>(null);
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
      const fileName = `${workshopId}/${category}/${Date.now()}.${fileExt}`;

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

  // Categorize files
  const maps = allFiles?.filter(f => categorizeFile(f.file_path) === 'map') || [];
  const receipts = allFiles?.filter(f => f.payment_id || categorizeFile(f.file_path) === 'receipt') || [];
  const incomeFiles = allFiles?.filter(f => categorizeFile(f.file_path) === 'income') || [];

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
          <CardTitle className="text-base md:text-lg">{t('files.workshopFiles')}</CardTitle>
          <CardDescription className="text-xs md:text-sm">
            {t('files.mapsAndReceipts')}
          </CardDescription>
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
