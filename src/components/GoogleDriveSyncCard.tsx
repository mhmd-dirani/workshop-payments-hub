import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Cloud, ExternalLink, FolderOpen } from 'lucide-react';

export default function GoogleDriveSyncCard() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [syncing, setSyncing] = useState(false);
  const [spreadsheetUrl, setSpreadsheetUrl] = useState<string | null>(null);
  const [folderUrl, setFolderUrl] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<Record<string, number> | null>(null);
  const [lastFilesMirrored, setLastFilesMirrored] = useState<number | null>(null);
  const [lastFilesSkipped, setLastFilesSkipped] = useState<number | null>(null);

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
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('sync-google-sheets');
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.spreadsheetUrl) setSpreadsheetUrl(data.spreadsheetUrl);
      if (data?.folderUrl) setFolderUrl(data.folderUrl);
      if (data?.tablesExported) setLastResult(data.tablesExported);
      setLastFilesMirrored(typeof data?.filesMirrored === 'number' ? data.filesMirrored : null);
      setLastFilesSkipped(typeof data?.filesSkipped === 'number' ? data.filesSkipped : null);
      toast({ title: t('gdrive.syncDone'), description: t('gdrive.syncDoneDesc') });
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
    </Card>
  );
}