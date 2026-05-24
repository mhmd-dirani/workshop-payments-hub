import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Eye, Download } from 'lucide-react';

/**
 * Loads receipt files for a list of payment IDs in one query and exposes
 * a ready-to-render button group + preview dialog.
 */
export function usePaymentReceipts(paymentIds: string[]) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [filesMap, setFilesMap] = useState<Map<string, any>>(new Map());
  const [previewFile, setPreviewFile] = useState<{ url: string; name: string; type: string } | null>(null);

  const key = paymentIds.join('|');
  useEffect(() => {
    if (paymentIds.length === 0) {
      setFilesMap(new Map());
      return;
    }
    let cancelled = false;
    (async () => {
      const { fetchAllPages } = await import('@/lib/paginate');
      const paymentIdSet = new Set(paymentIds);
      const data = await fetchAllPages<any>((from, to) =>
        supabase
          .from('workshop_files')
          .select('*')
          .not('payment_id', 'is', null)
          .order('created_at', { ascending: false })
          .range(from, to)
      );
      if (cancelled) return;
      const map = new Map<string, any>();
      data?.forEach((f: any) => {
        if (paymentIdSet.has(f.payment_id) && !map.has(f.payment_id)) map.set(f.payment_id, f);
      });
      setFilesMap(map);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

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

  const ReceiptButtons = ({ paymentId, size = 'sm' }: { paymentId: string; size?: 'sm' | 'md' }) => {
    const file = filesMap.get(paymentId);
    if (!file) return null;
    const cls = size === 'sm' ? 'h-7 w-7' : 'h-8 w-8';
    const icon = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';
    return (
      <>
        <Button
          variant="ghost"
          size="icon"
          onClick={(e) => { e.stopPropagation(); previewFileHandler(file); }}
          className={cls}
          title={t('common.view')}
        >
          <Eye className={icon} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={(e) => { e.stopPropagation(); downloadFile(file); }}
          className={cls}
          title={t('common.download')}
        >
          <Download className={icon} />
        </Button>
      </>
    );
  };

  const PreviewDialog = () => (
    <Dialog open={!!previewFile} onOpenChange={() => setPreviewFile(null)}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-auto">
        <DialogHeader>
          <DialogTitle className="truncate">{previewFile?.name}</DialogTitle>
        </DialogHeader>
        {previewFile && (
          <div className="flex items-center justify-center">
            {previewFile.type?.startsWith('image/') ? (
              <img
                src={previewFile.url}
                alt={previewFile.name}
                className="max-w-full max-h-[70vh] object-contain rounded-lg"
              />
            ) : (
              <iframe src={previewFile.url} className="w-full h-[70vh] rounded-lg" title={previewFile.name} />
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );

  return { filesMap, ReceiptButtons, PreviewDialog };
}