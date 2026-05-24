import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Archive, CheckCircle2, Flag, Trash2, FolderOpen, ExternalLink } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import DeletionPreviewDialog from './DeletionPreviewDialog';

interface Workshop { id: string; name: string; status: string; }
interface FinishedArchive {
  id: string; workshop_id: string; workshop_name: string;
  drive_folder_url: string | null; spreadsheet_urls: any;
  final_totals: any; backup_verified: boolean;
  deleted_from_database: boolean; archived_at: string; deleted_at: string | null;
}

export default function FinishedWorkshopsManager() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const [archives, setArchives] = useState<FinishedArchive[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [markFinish, setMarkFinish] = useState<Workshop | null>(null);
  const [previewArchive, setPreviewArchive] = useState<FinishedArchive | null>(null);

  const load = async () => {
    setLoading(true);
    const [{ data: ws }, { data: arch }] = await Promise.all([
      (supabase as any).from('workshops').select('id,name,status').order('name'),
      (supabase as any).from('finished_workshop_archives').select('*').order('archived_at', { ascending: false }),
    ]);
    setWorkshops(ws || []);
    setArchives(arch || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const markFinished = async (w: Workshop) => {
    setBusyId(w.id);
    try {
      const { error } = await (supabase as any).from('workshops').update({ status: 'finished' }).eq('id', w.id);
      if (error) throw error;
      toast({ title: t('finished.markedTitle'), description: t('finished.markedDesc', { name: w.name }) });
      setMarkFinish(null);
      load();
    } catch (e: any) {
      toast({ title: t('errors.error'), description: e.message, variant: 'destructive' });
    } finally { setBusyId(null); }
  };

  const reopen = async (w: Workshop) => {
    setBusyId(w.id);
    try {
      const { error } = await (supabase as any).from('workshops').update({ status: 'active' }).eq('id', w.id);
      if (error) throw error;
      load();
    } finally { setBusyId(null); }
  };

  const backup = async (w: Workshop) => {
    setBusyId(w.id);
    try {
      const { data, error } = await supabase.functions.invoke('backup-finished-workshop', { body: { workshopId: w.id } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: t('finished.backupDone'), description: t('finished.backupDoneDesc', { name: w.name }) });
      load();
    } catch (e: any) {
      toast({ title: t('errors.error'), description: e.message, variant: 'destructive' });
    } finally { setBusyId(null); }
  };

  const archiveFor = (workshopId: string) => archives.find(a => a.workshop_id === workshopId && !a.deleted_from_database);

  const statusBadge = (s: string) => {
    const cls: Record<string, string> = {
      active: 'bg-emerald-500/15 text-emerald-700',
      paused: 'bg-yellow-500/15 text-yellow-700',
      finished: 'bg-blue-500/15 text-blue-700',
      archived: 'bg-muted text-muted-foreground',
    };
    return <Badge className={cls[s] || ''}>{t(`finished.status.${s}`, s)}</Badge>;
  };

  return (
    <>
      <Card className="shadow-card">
        <CardHeader className="pb-3 px-3 md:px-6 pt-3 md:pt-6">
          <CardTitle className="text-base md:text-lg flex items-center gap-2">
            <Archive className="w-4 h-4 md:w-5 md:h-5 text-primary" />
            {t('finished.title')}
          </CardTitle>
          <CardDescription className="text-xs md:text-sm">{t('finished.description')}</CardDescription>
        </CardHeader>
        <CardContent className="px-3 md:px-6 pb-3 md:pb-6 space-y-2">
          {loading && <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin" /></div>}
          {!loading && workshops.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">{t('finished.noWorkshops')}</p>}
          {workshops.map((w) => {
            const arch = archiveFor(w.id);
            const isBusy = busyId === w.id;
            return (
              <div key={w.id} className="border rounded-lg p-2.5 space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{w.name}</p>
                    {arch && <p className="text-[10px] text-muted-foreground">{new Date(arch.archived_at).toLocaleDateString('fr-FR')}</p>}
                  </div>
                  {statusBadge(w.status)}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(w.status === 'active' || w.status === 'paused') && (
                    <Button size="sm" variant="outline" className="h-7 gap-1" disabled={isBusy} onClick={() => setMarkFinish(w)}>
                      <Flag className="w-3 h-3" />{t('finished.markAsFinished')}
                    </Button>
                  )}
                  {w.status === 'finished' && !arch && (
                    <Button size="sm" variant="default" className="h-7 gap-1" disabled={isBusy} onClick={() => backup(w)}>
                      {isBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Archive className="w-3 h-3" />}{t('finished.backupNow')}
                    </Button>
                  )}
                  {w.status === 'finished' && arch?.backup_verified && (
                    <Button size="sm" variant="destructive" className="h-7 gap-1" disabled={isBusy} onClick={() => setPreviewArchive(arch)}>
                      <Trash2 className="w-3 h-3" />{t('finished.deleteData')}
                    </Button>
                  )}
                  {w.status === 'finished' && (
                    <Button size="sm" variant="ghost" className="h-7 gap-1" disabled={isBusy} onClick={() => reopen(w)}>
                      {t('finished.reopen')}
                    </Button>
                  )}
                  {arch?.backup_verified && <Badge className="bg-emerald-500/15 text-emerald-700 gap-1 h-7"><CheckCircle2 className="w-3 h-3" />{t('finished.backupVerified')}</Badge>}
                  {arch?.spreadsheet_urls?.master && (
                    <Button asChild size="sm" variant="outline" className="h-7 gap-1.5">
                      <a href={arch.spreadsheet_urls.master} target="_blank" rel="noopener noreferrer"><ExternalLink className="w-3 h-3" />{t('gdrive.openSheet')}</a>
                    </Button>
                  )}
                  {arch?.drive_folder_url && (
                    <Button asChild size="sm" variant="outline" className="h-7 gap-1.5">
                      <a href={arch.drive_folder_url} target="_blank" rel="noopener noreferrer"><FolderOpen className="w-3 h-3" />{t('gdrive.openFolder')}</a>
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <AlertDialog open={markFinish !== null} onOpenChange={(o) => { if (!o) setMarkFinish(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('finished.markConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{markFinish && t('finished.markConfirmDesc', { name: markFinish.name })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); if (markFinish) markFinished(markFinish); }}>
              {t('finished.markAsFinished')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <DeletionPreviewDialog
        open={previewArchive !== null}
        onOpenChange={(o) => { if (!o) setPreviewArchive(null); }}
        functionName="delete-finished-workshop"
        payloadKey="archiveId"
        payloadId={previewArchive?.id || null}
        title={previewArchive ? `${t('finished.deleteData')} — ${previewArchive.workshop_name}` : ''}
        onConfirmed={() => { toast({ title: t('finished.deleted'), description: t('finished.deletedDesc') }); load(); }}
      />
    </>
  );
}
