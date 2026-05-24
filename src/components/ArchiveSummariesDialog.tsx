import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ExternalLink, FolderOpen, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface Batch {
  id: string;
  from_date: string;
  to_date: string;
  label: string;
  status: 'pending' | 'verified' | 'deleted';
  drive_folder_url: string | null;
  spreadsheet_url: string | null;
  rows_archived: Record<string, number>;
  rows_deleted: Record<string, number>;
  created_at: string;
  deleted_at: string | null;
}

export default function ArchiveSummariesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [batches, setBatches] = useState<Batch[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Batch | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    setLoading(true);
    const client: any = supabase;
    const { data, error } = await client.from('archive_batches').select('*').order('from_date', { ascending: false });
    setLoading(false);
    if (error) { toast({ title: t('errors.error'), description: error.message, variant: 'destructive' }); return; }
    setBatches(data || []);
  };

  useEffect(() => { if (open) load(); }, [open]);

  const doDelete = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      const { data, error } = await supabase.functions.invoke('delete-archived-batch', { body: { batchId: confirmDelete.id } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: t('archive.deleteDone'), description: t('archive.deleteDoneDesc') });
      setConfirmDelete(null);
      load();
    } catch (e: any) {
      toast({ title: t('errors.error'), description: e.message, variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  };

  const statusBadge = (s: string) => {
    const map: Record<string, string> = {
      pending: 'bg-yellow-500/15 text-yellow-700',
      verified: 'bg-blue-500/15 text-blue-700',
      deleted: 'bg-emerald-500/15 text-emerald-700',
    };
    return <Badge className={map[s] || ''}>{t(`archive.status.${s}`, s)}</Badge>;
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('archive.summariesTitle')}</DialogTitle>
            <DialogDescription>{t('archive.summariesDesc')}</DialogDescription>
          </DialogHeader>
          {loading && <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin" /></div>}
          {!loading && batches && batches.length === 0 && (
            <p className="text-sm text-muted-foreground py-6 text-center">{t('archive.noBatches')}</p>
          )}
          <div className="space-y-2">
            {batches?.map((b) => {
              const totalArchived = Object.values(b.rows_archived || {}).reduce((a, c) => a + Number(c || 0), 0);
              const totalDeleted = Object.values(b.rows_deleted || {}).reduce((a, c) => a + (Number(c) > 0 ? Number(c) : 0), 0);
              return (
                <Card key={b.id}>
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div>
                        <p className="font-semibold text-sm">{b.label}</p>
                        <p className="text-xs text-muted-foreground">{b.from_date} → {b.to_date}</p>
                      </div>
                      {statusBadge(b.status)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {t('archive.rowsArchived', { count: totalArchived })}
                      {b.status === 'deleted' && <> · {t('archive.rowsDeleted', { count: totalDeleted })}</>}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {b.spreadsheet_url && (
                        <Button asChild variant="outline" size="sm" className="gap-1.5 h-7">
                          <a href={b.spreadsheet_url} target="_blank" rel="noopener noreferrer"><ExternalLink className="w-3 h-3" />{t('gdrive.openSheet')}</a>
                        </Button>
                      )}
                      {b.drive_folder_url && (
                        <Button asChild variant="outline" size="sm" className="gap-1.5 h-7">
                          <a href={b.drive_folder_url} target="_blank" rel="noopener noreferrer"><FolderOpen className="w-3 h-3" />{t('gdrive.openFolder')}</a>
                        </Button>
                      )}
                      {b.status === 'verified' && (
                        <Button size="sm" variant="destructive" className="h-7" onClick={() => setConfirmDelete(b)}>
                          {t('archive.deleteArchived')}
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete !== null} onOpenChange={(o) => { if (!o && !deleting) setConfirmDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('archive.deleteConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete && t('archive.deleteConfirmDesc', { from: confirmDelete.from_date, to: confirmDelete.to_date })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); doDelete(); }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : t('archive.deleteArchived')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}