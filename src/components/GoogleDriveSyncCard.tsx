import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Cloud, ExternalLink, FolderOpen, Archive } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
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

function monthBounds(fromYm: string, toYm: string): { fromDate: string; toDate: string } | null {
  if (!/^\d{4}-\d{2}$/.test(fromYm) || !/^\d{4}-\d{2}$/.test(toYm)) return null;
  if (toYm < fromYm) return null;
  const fromDate = `${fromYm}-01`;
  const [ty, tm] = toYm.split('-').map(Number);
  const last = new Date(ty, tm, 0).getDate();
  const toDate = `${toYm}-${String(last).padStart(2, '0')}`;
  return { fromDate, toDate };
}

export default function GoogleDriveSyncCard() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [syncing, setSyncing] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [spreadsheetUrl, setSpreadsheetUrl] = useState<string | null>(null);
  const [folderUrl, setFolderUrl] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<Record<string, number> | null>(null);
  const [lastFilesMirrored, setLastFilesMirrored] = useState<number | null>(null);
  const [lastFilesSkipped, setLastFilesSkipped] = useState<number | null>(null);
  const today = new Date();
  const defaultYm = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const [fromMonth, setFromMonth] = useState<string>(defaultYm);
  const [toMonth, setToMonth] = useState<string>(defaultYm);
  const [archivePrompt, setArchivePrompt] = useState<{ fromDate: string; toDate: string } | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('app_settings').select('key, value')
        .in('key', ['master_spreadsheet_id', 'master_drive_folder_id']);
      const sid = data?.find((d) => d.key === 'master_spreadsheet_id')?.value;
      const fid = data?.find((d) => d.key === 'master_drive_folder_id')?.value;
      if (sid) setSpreadsheetUrl(`https://docs.google.com/spreadsheets/d/${sid}/edit`);
      if (fid) setFolderUrl(`https://drive.google.com/drive/folders/${fid}`);
    })();
  }, []);

  const sync = async () => {
    const bounds = monthBounds(fromMonth, toMonth);
    if (!bounds) {
      toast({ title: t('errors.error'), description: t('gdrive.invalidRange'), variant: 'destructive' });
      return;
    }
    setSyncing(true);
    try {
      let fileOffset: number | null = 0;
      let filesMirrored = 0;
      let filesSkipped = 0;
      let tablesExported: Record<string, number> | null = null;

      while (fileOffset !== null) {
        const { data, error } = await supabase.functions.invoke('sync-google-sheets', {
          body: {
            fromDate: bounds.fromDate,
            toDate: bounds.toDate,
            fileOffset,
            fileLimit: 5,
            fileBatchSize: 5,
            filesOnly: fileOffset > 0,
          },
        });
        if (error) throw error;
        if (data?.error && typeof data?.filesSkipped !== 'number') throw new Error(data.error);
        if (data?.spreadsheetUrl) setSpreadsheetUrl(data.spreadsheetUrl);
        if (data?.folderUrl) setFolderUrl(data.folderUrl);
        if (data?.tablesExported && Object.keys(data.tablesExported).length) tablesExported = data.tablesExported;
        filesMirrored += typeof data?.filesMirrored === 'number' ? data.filesMirrored : 0;
        filesSkipped += typeof data?.filesSkipped === 'number' ? data.filesSkipped : 0;
        fileOffset = typeof data?.nextFileOffset === 'number' ? data.nextFileOffset : null;
      }

      if (tablesExported) setLastResult(tablesExported);
      setLastFilesMirrored(filesMirrored);
      setLastFilesSkipped(filesSkipped);
      toast({
        title: filesSkipped > 0 ? t('errors.error') : t('gdrive.syncDone'),
        description: filesSkipped > 0 ? t('gdrive.syncPartialDesc', { skipped: filesSkipped }) : t('gdrive.syncDoneDesc'),
        variant: filesSkipped > 0 ? 'destructive' : 'default',
      });
      setArchivePrompt(bounds);
    } catch (e: any) {
      toast({ title: t('errors.error'), description: e.message, variant: 'destructive' });
    } finally {
      setSyncing(false);
    }
  };

  const archive = async () => {
    if (!archivePrompt) return;
    setArchiving(true);
    try {
      const { data, error } = await supabase.functions.invoke('archive-synced-data', {
        body: { fromDate: archivePrompt.fromDate, toDate: archivePrompt.toDate },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const total: number = Object.values(data?.deletedCounts || {}).reduce<number>((a, b) => a + (Number(b) > 0 ? Number(b) : 0), 0);
      toast({ title: t('gdrive.archiveDone'), description: t('gdrive.archiveDoneDesc', { count: total as number }) });
      setArchivePrompt(null);
    } catch (e: any) {
      toast({ title: t('errors.error'), description: e.message, variant: 'destructive' });
    } finally {
      setArchiving(false);
    }
  };

  const totalRows = lastResult ? Object.values(lastResult).reduce((a, b) => a + b, 0) : null;

  return (
    <Card className="shadow-card">
      <CardHeader className="pb-3 px-3 md:px-6 pt-3 md:pt-6">
        <CardTitle className="text-base md:text-lg flex items-center gap-2">
          <Cloud className="w-4 h-4 md:w-5 md:h-5 text-primary" />
          {t('gdrive.title')}
        </CardTitle>
        <CardDescription className="text-xs md:text-sm">{t('gdrive.description')}</CardDescription>
      </CardHeader>
      <CardContent className="px-3 md:px-6 pb-3 md:pb-6 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label htmlFor="gdrive-from" className="text-xs">{t('gdrive.fromMonth')}</Label>
            <Input id="gdrive-from" type="month" value={fromMonth} onChange={(e) => setFromMonth(e.target.value)} className="h-9" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="gdrive-to" className="text-xs">{t('gdrive.toMonth')}</Label>
            <Input id="gdrive-to" type="month" value={toMonth} onChange={(e) => setToMonth(e.target.value)} className="h-9" />
          </div>
        </div>
        <Button onClick={sync} disabled={syncing} className="w-full gap-2">
          {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Cloud className="w-4 h-4" />}
          {syncing ? t('gdrive.syncing') : t('gdrive.syncNow')}
        </Button>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {spreadsheetUrl && (
            <Button asChild variant="outline" size="sm" className="gap-1.5">
              <a href={spreadsheetUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="w-3.5 h-3.5" />
                {t('gdrive.openSheet')}
              </a>
            </Button>
          )}
          {folderUrl && (
            <Button asChild variant="outline" size="sm" className="gap-1.5">
              <a href={folderUrl} target="_blank" rel="noopener noreferrer">
                <FolderOpen className="w-3.5 h-3.5" />
                {t('gdrive.openFolder')}
              </a>
            </Button>
          )}
        </div>

        {totalRows !== null && (
          <div className="text-xs text-muted-foreground space-y-1">
            <p>{t('gdrive.lastSync', { count: totalRows })}</p>
            {lastFilesMirrored !== null && (
              <p>{t('gdrive.filesMirrored', { count: lastFilesMirrored, skipped: lastFilesSkipped ?? 0 })}</p>
            )}
          </div>
        )}
      </CardContent>

      <AlertDialog open={archivePrompt !== null} onOpenChange={(o) => { if (!o && !archiving) setArchivePrompt(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Archive className="w-5 h-5 text-primary" />
              {t('gdrive.archiveTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {archivePrompt ? t('gdrive.archiveDesc', { from: archivePrompt.fromDate, to: archivePrompt.toDate }) : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={archiving}>{t('gdrive.keepData')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); archive(); }}
              disabled={archiving}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {archiving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Archive className="w-4 h-4 mr-2" />}
              {t('gdrive.deleteSyncedData')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}