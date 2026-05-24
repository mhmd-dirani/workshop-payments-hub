import { supabase } from '@/integrations/supabase/client';

type MirrorWorkshopFileParams = {
  workshopId: string;
  workshopName?: string | null;
  storagePath: string;
  fileName: string;
  fileType?: string | null;
  fileCategory?: 'receipt' | 'file' | 'check';
  createdAt?: string | null;
};

export function mirrorWorkshopFileToDrive(params: MirrorWorkshopFileParams) {
  return supabase.functions.invoke('mirror-workshop-file', {
    body: {
      workshopId: params.workshopId,
      workshopName: params.workshopName || params.workshopId,
      storagePath: params.storagePath,
      fileName: params.fileName,
      fileType: params.fileType || 'application/octet-stream',
      fileCategory: params.fileCategory,
      createdAt: params.createdAt || new Date().toISOString(),
    },
  }).catch((err) => {
    console.warn('Drive mirror failed:', err);
    return null;
  });
}
