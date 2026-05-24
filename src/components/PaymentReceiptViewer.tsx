import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Eye, Download } from 'lucide-react';

interface PaymentReceiptViewerProps {
  paymentIds: string[];
  renderTrigger: (paymentId: string, hasReceipt: boolean, actions: {
    preview: () => void;
    download: () => void;
  }) => React.ReactNode;
}

/**
 * Fetches receipt files for the given payment IDs (one query) and renders
 * a per-payment trigger via render prop. Includes its own preview dialog.
 */
export default function PaymentReceiptViewer({ paymentIds, renderTrigger }: PaymentReceiptViewerProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [filesMap, setFilesMap] = useState<Map<string, any>>(new Map());
  const [previewFile, setPreviewFile] = useState<{ url: string; name: string; type: string } | null>(null);

  useEffect(() => {
    if (paymentIds.length === 0) {
      setFilesMap(new Map());
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('workshop_files')
        .select('*')
        .in('payment_id', paymentIds);
      if (cancelled) return;
      const map = new Map<string, any>();
      data?.forEach((f: any) => {
        if (!map.has(f.payment_id)) map.set(f.payment_id, f);
      });
      setFilesMap(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [paymentIds.join('|')]);

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

  return (
    <>
      {paymentIds.map((id) => {
        const file = filesMap.get(id);
        const node = renderTrigger(id, !!file, {
          preview: () => file && previewFileHandler(file),
          download: () => file && downloadFile(file),
        });
        return <span key={id} style={{ display: 'none' }}>{node}</span>;
      })}
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
    </>
  );
}

/** Lightweight pair of buttons for use inside render prop callers. */
export function ReceiptButtons({
  hasReceipt,
  onPreview,
  onDownload,
  size = 'sm',
}: {
  hasReceipt: boolean;
  onPreview: () => void;
  onDownload: () => void;
  size?: 'sm' | 'md';
}) {
  if (!hasReceipt) return null;
  const cls = size === 'sm' ? 'h-7 w-7' : 'h-8 w-8';
  const icon = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';
  return (
    <>
      <Button variant="ghost" size="icon" onClick={onPreview} className={cls}>
        <Eye className={icon} />
      </Button>
      <Button variant="ghost" size="icon" onClick={onDownload} className={cls}>
        <Download className={icon} />
      </Button>
    </>
  );
}