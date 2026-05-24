import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Cloud, ExternalLink, FolderOpen, History } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import ArchiveSummariesDialog from './ArchiveSummariesDialog';

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
  const [snapshotting, setSnapshotting] = useState(false);
  const [spreadsheetUrl, setSpreadsheetUrl] = useState<string | null>(null);
  const [folderUrl, setFolderUrl] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<Record<string, number> | null>(null);
  const [lastFilesMirrored, setLastFilesMirrored] = useState<number | null>(null);
  const [lastFilesSkipped, setLastFilesSkipped] = useState<number | null>(null);
  const today = new Date();
  const defaultYm = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const [fromMonth, setFromMonth] = useState<string>(defaultYm);
  const [toMonth, setToMonth] = useState<string>(defaultYm);
  const [summariesOpen, setSummariesOpen] = useState(false);
  const [lastBatchLabel, setLastBatchLabel] = useState<string | null>(null);

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
    let runSpreadsheetUrl: string | null = null;
    let runFolderUrl: string | null = null;
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
        if (data?.spreadsheetUrl) { setSpreadsheetUrl(data.spreadsheetUrl); runSpreadsheetUrl = data.spreadsheetUrl; }
        if (data?.folderUrl) { setFolderUrl(data.folderUrl); runFolderUrl = data.folderUrl; }
        if (data?.tablesExported && Object.keys(data.tablesExported).length) tablesExported = data.tablesExported;
        filesMirrored += typeof data?.filesMirrored === 'number' ? data.filesMirrored : 0;
        filesSkipped += typeof data?.filesSkipped === 'number' ? data.filesSkipped : 0;
        fileOffset = typeof data?.nextFileOffset === 'number' ? data.nextFileOffset : null;
      }

      if (tablesExported) setLastResult(tablesExported);
      setLastFilesMirrored(filesMirrored);
      setLastFilesSkipped(filesSkipped);
      if (filesSkipped > 0) {
        toast({ title: t('gdrive.syncDone'), description: t('gdrive.syncPartialDesc', { skipped: filesSkipped }) });
      } else {
        toast({ title: t('gdrive.syncDone'), description: t('gdrive.syncDoneDesc') });
      }

      // Create archive snapshot (totals preserved). Does NOT delete data.
      setSnapshotting(true);
      try {
        const { data: snap, error: snapErr } = await supabase.functions.invoke('create-archive-snapshot', {
          body: { fromDate: bounds.fromDate, toDate: bounds.toDate, spreadsheetUrl: runSpreadsheetUrl, driveFolderUrl: runFolderUrl },
        });
        if (snapErr) throw snapErr;
        if (snap?.error) throw new Error(snap.error);
        setLastBatchLabel(snap?.label || null);
        toast({ title: t('archive.snapshotDone'), description: t('archive.snapshotDoneDesc', { label: snap?.label || '' }) });
      } catch (e: any) {
        toast({ title: t('archive.snapshotFailed'), description: e.message, variant: 'destructive' });
      } finally {
        setSnapshotting(false);
      }
    } catch (e: any) {
      toast({ title: t('errors.error'), description: e.message, variant: 'destructive' });
    } finally {
      setSyncing(false);
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
        <Button onClick={sync} disabled={syncing || snapshotting} className="w-full gap-2">
          {(syncing || snapshotting) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Cloud className="w-4 h-4" />}
          {snapshotting ? t('archive.snapshotting') : syncing ? t('gdrive.syncing') : t('gdrive.syncNow')}
        </Button>

        <Button onClick={() => setSummariesOpen(true)} variant="outline" className="w-full gap-2">
          <History className="w-4 h-4" />
          {t('archive.viewSummaries')}
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
            {lastBatchLabel && <p className="text-emerald-700">{t('archive.lastBatch', { label: lastBatchLabel })}</p>}
          </div>
        )}
      </CardContent>

      <ArchiveSummariesDialog open={summariesOpen} onOpenChange={setSummariesOpen} />
    </Card>
  );
}