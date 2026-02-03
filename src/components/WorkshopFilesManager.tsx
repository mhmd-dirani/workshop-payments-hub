import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { 
  Loader2, 
  Upload, 
  Map, 
  Receipt, 
  Trash2, 
  Download,
  FileImage,
  FileText,
  Camera
} from 'lucide-react';

interface WorkshopFilesManagerProps {
  workshopId: string;
  workshopName: string;
}

export default function WorkshopFilesManager({ workshopId, workshopName }: WorkshopFilesManagerProps) {
  const { t } = useTranslation();
  const { user, role } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const mapInputRef = useRef<HTMLInputElement>(null);
  const receiptInputRef = useRef<HTMLInputElement>(null);

  const { data: files, isLoading } = useQuery({
    queryKey: ['workshop-files', workshopId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workshop_files')
        .select('*')
        .eq('workshop_id', workshopId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const uploadFile = async (file: File, fileType: 'map' | 'receipt') => {
    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${workshopId}/${fileType}/${Date.now()}.${fileExt}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('workshop-files')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // Save metadata
      const { error: dbError } = await supabase
        .from('workshop_files')
        .insert([{
          workshop_id: workshopId,
          file_type: fileType,
          file_name: file.name,
          file_path: fileName,
          uploaded_by: user?.id,
        }]);

      if (dbError) throw dbError;

      queryClient.invalidateQueries({ queryKey: ['workshop-files', workshopId] });
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
      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from('workshop-files')
        .remove([file.file_path]);

      if (storageError) throw storageError;

      // Delete metadata
      const { error: dbError } = await supabase
        .from('workshop_files')
        .delete()
        .eq('id', file.id);

      if (dbError) throw dbError;
    },
    onSuccess: () => {
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, fileType: 'map' | 'receipt') => {
    const file = e.target.files?.[0];
    if (file) {
      uploadFile(file, fileType);
    }
    e.target.value = '';
  };

  const maps = files?.filter(f => f.file_type === 'map') || [];
  const receipts = files?.filter(f => f.file_type === 'receipt') || [];

  const getFileIcon = (fileName: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext || '')) {
      return <FileImage className="w-4 h-4" />;
    }
    return <FileText className="w-4 h-4" />;
  };

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
    <Card className="shadow-card">
      <CardHeader className="pb-2 px-3 md:px-6 pt-3 md:pt-6">
        <CardTitle className="text-base md:text-lg">{t('files.workshopFiles')}</CardTitle>
        <CardDescription className="text-xs md:text-sm">
          {t('files.mapsAndReceipts')}
        </CardDescription>
      </CardHeader>

      <CardContent className="px-3 md:px-6 pb-3 md:pb-6">
        <Tabs defaultValue="maps">
          <TabsList className="grid w-full grid-cols-2 h-9">
            <TabsTrigger value="maps" className="text-xs md:text-sm gap-1.5">
              <Map className="w-3.5 h-3.5" />
              {t('files.maps')} ({maps.length})
            </TabsTrigger>
            <TabsTrigger value="receipts" className="text-xs md:text-sm gap-1.5">
              <Receipt className="w-3.5 h-3.5" />
              {t('files.receipts')} ({receipts.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="maps" className="mt-3 space-y-3">
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

            {maps.length === 0 ? (
              <p className="text-center text-muted-foreground py-6 text-sm">
                {t('files.noMaps')}
              </p>
            ) : (
              <div className="space-y-2">
                {maps.map((file) => (
                  <div key={file.id} className="flex items-center justify-between p-2 rounded-lg border">
                    <div className="flex items-center gap-2 min-w-0">
                      {getFileIcon(file.file_name)}
                      <span className="text-sm truncate">{file.file_name}</span>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => downloadFile(file)}
                        className="h-7 w-7"
                      >
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
                  <div key={file.id} className="flex items-center justify-between p-2 rounded-lg border">
                    <div className="flex items-center gap-2 min-w-0">
                      {getFileIcon(file.file_name)}
                      <span className="text-sm truncate">{file.file_name}</span>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => downloadFile(file)}
                        className="h-7 w-7"
                      >
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
  );
}
