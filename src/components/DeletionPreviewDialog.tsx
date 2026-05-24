import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, XCircle, Loader2, ShieldAlert, ExternalLink, FolderOpen } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  functionName: 'delete-archived-batch' | 'delete-finished-workshop';
  payloadKey: 'batchId' | 'archiveId';
  payloadId: string | null;
  title: string;
  onConfirmed: () => void;
}

export default function DeletionPreviewDialog({ open, onOpenChange, functionName, payloadKey, payloadId, title, onConfirmed }: Props) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [preview, setPreview] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [extra, setExtra] = useState<any>(null);

  useEffect(() => {
    if (!open || !payloadId) return;
    setLoading(true); setError(null); setPreview(null); setExtra(null);
    supabase.functions.invoke(functionName, { body: { [payloadKey]: payloadId, dryRun: true } })
      .then(({ data, error }) => {
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        setPreview(data?.preview || null);
        setExtra({ driveLinks: data?.driveLinks || data?.preview?.driveLinks, finalTotals: data?.finalTotals, workshop: data?.workshop, verificationPassed: data?.verificationPassed ?? data?.preview?.verificationPassed });
      })
      .catch((e: any) => setError(e.message))
      .finally(() => setLoading(false));
  }, [open, payloadId, functionName, payloadKey]);

  const confirm = async () => {
    if (!payloadId) return;
    setDeleting(true); setError(null);
    try {
      const { data, error } = await supabase.functions.invoke(functionName, { body: { [payloadKey]: payloadId } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      onConfirmed();
      onOpenChange(false);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setDeleting(false);
    }
  };

  const toDelete = preview?.toDelete || {};
  const toKeep = preview?.toKeep || {};
  const preserved = preview?.preservedTotals || extra?.finalTotals || null;
  const verificationPassed: boolean = !!extra?.verificationPassed;
  const driveLinks = extra?.driveLinks || preview?.driveLinks || {};

  const totalDelete: number = (Object.values(toDelete) as any[]).reduce((a, b) => a + Number(b || 0), 0);
  const totalKeep: number = (Object.values(toKeep) as any[]).reduce((a, b) => a + Number(b || 0), 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ShieldAlert className="w-5 h-5 text-amber-500" />{title}</DialogTitle>
          <DialogDescription>{t('archive.previewDesc')}</DialogDescription>
        </DialogHeader>

        {loading && <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin" /></div>}
        {error && <p className="text-sm text-destructive py-2">{error}</p>}

        {preview && (
          <div className="space-y-4">
            <div className="rounded-lg border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{t('archive.verification')}</span>
                {verificationPassed ? (
                  <Badge className="bg-emerald-500/15 text-emerald-700 gap-1"><CheckCircle2 className="w-3 h-3" />{t('archive.verificationPassed')}</Badge>
                ) : (
                  <Badge className="bg-destructive/15 text-destructive gap-1"><XCircle className="w-3 h-3" />{t('archive.verificationFailed')}</Badge>
                )}
              </div>
              {(driveLinks?.spreadsheetUrl || driveLinks?.driveFolderUrl || driveLinks?.master) && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {(driveLinks.spreadsheetUrl || driveLinks.master) && (
                    <Button asChild size="sm" variant="outline" className="h-7 gap-1.5">
                      <a href={driveLinks.spreadsheetUrl || driveLinks.master} target="_blank" rel="noopener noreferrer"><ExternalLink className="w-3 h-3" />{t('gdrive.openSheet')}</a>
                    </Button>
                  )}
                  {driveLinks.driveFolderUrl && (
                    <Button asChild size="sm" variant="outline" className="h-7 gap-1.5">
                      <a href={driveLinks.driveFolderUrl} target="_blank" rel="noopener noreferrer"><FolderOpen className="w-3 h-3" />{t('gdrive.openFolder')}</a>
                    </Button>
                  )}
                </div>
              )}
            </div>

            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
              <p className="text-sm font-semibold text-destructive mb-2">{t('archive.willBeDeleted')} ({totalDelete})</p>
              <ul className="text-xs space-y-0.5">
                {Object.entries(toDelete).filter(([, v]) => Number(v) > 0).map(([k, v]) => (
                  <li key={k} className="flex justify-between"><span className="text-muted-foreground">{k}</span><span className="font-mono">{String(v as any)}</span></li>
                ))}
                {totalDelete === 0 && <li className="text-muted-foreground italic">{t('archive.nothingToDelete')}</li>}
              </ul>
            </div>

            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
              <p className="text-sm font-semibold text-emerald-700 mb-2">{t('archive.willBeKept')} ({totalKeep})</p>
              <ul className="text-xs space-y-0.5">
                {Object.entries(toKeep).map(([k, v]) => (
                  <li key={k} className="flex justify-between"><span className="text-muted-foreground">{t(`archive.keep.${k}`, k)}</span><span className="font-mono">{String(v as any)}</span></li>
                ))}
              </ul>
              {preview.masterDataPreserved && (
                <p className="text-xs text-muted-foreground mt-2">{t('archive.masterPreserved')}: {preview.masterDataPreserved.join(', ')}</p>
              )}
            </div>

            {preserved && (
              <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-3">
                <p className="text-sm font-semibold text-blue-700 mb-2">{t('archive.preservedTotals')}</p>
                <ul className="text-xs space-y-0.5">
                  {Object.entries(preserved).filter(([k]) => k !== 'counts').map(([k, v]) => (
                    <li key={k} className="flex justify-between"><span className="text-muted-foreground">{k}</span><span className="font-mono">{typeof v === 'number' ? v.toLocaleString('fr-FR') : String(v)}</span></li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={deleting}>{t('common.cancel')}</Button>
          <Button
            variant="destructive"
            disabled={!verificationPassed || deleting || loading || totalDelete === 0}
            onClick={confirm}
          >
            {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : t('archive.confirmDelete')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
