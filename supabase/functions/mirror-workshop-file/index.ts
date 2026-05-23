import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const DRIVE_GW = 'https://connector-gateway.lovable.dev/google_drive/drive/v3';
const DRIVE_UPLOAD = 'https://connector-gateway.lovable.dev/google_drive/upload/drive/v3/files';

function driveQueryLiteral(value: string) {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function safeDriveName(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, '_').trim() || 'Unknown Workshop';
}

async function findOrCreateFolder(
  name: string,
  parentId: string | null,
  lovableKey: string,
  driveKey: string,
): Promise<string> {
  const headers = {
    Authorization: `Bearer ${lovableKey}`,
    'X-Connection-Api-Key': driveKey,
  };
  const qParent = parentId ? ` and ${driveQueryLiteral(parentId)} in parents` : '';
  const q = `name=${driveQueryLiteral(name)} and mimeType='application/vnd.google-apps.folder' and trashed=false${qParent}`;
  const search = await fetch(`${DRIVE_GW}/files?q=${encodeURIComponent(q)}&fields=files(id,name)`, { headers });
  const sj = await search.json();
  if (sj.files && sj.files.length > 0) return sj.files[0].id;

  const create = await fetch(`${DRIVE_GW}/files`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      mimeType: 'application/vnd.google-apps.folder',
      ...(parentId ? { parents: [parentId] } : {}),
    }),
  });
  const cj = await create.json();
  if (!cj.id) throw new Error(`Folder create failed: ${JSON.stringify(cj)}`);
  return cj.id;
}

async function deleteExistingDriveFiles(name: string, parentId: string, lovableKey: string, driveKey: string) {
  const headers = {
    Authorization: `Bearer ${lovableKey}`,
    'X-Connection-Api-Key': driveKey,
  };
  const q = `name=${driveQueryLiteral(name)} and ${driveQueryLiteral(parentId)} in parents and trashed=false`;
  const search = await fetch(`${DRIVE_GW}/files?q=${encodeURIComponent(q)}&fields=files(id,name)`, { headers });
  const sj = await search.json();
  for (const file of sj.files || []) {
    await fetch(`${DRIVE_GW}/files/${file.id}`, { method: 'DELETE', headers });
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const DRIVE_API_KEY = Deno.env.get('GOOGLE_DRIVE_API_KEY');
    if (!LOVABLE_API_KEY || !DRIVE_API_KEY) {
      return new Response(JSON.stringify({ error: 'Missing connector keys' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: claims, error: claimsErr } = await userClient.auth.getClaims(authHeader.replace('Bearer ', ''));
    if (claimsErr || !claims?.claims?.sub) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { workshopId, workshopName, storagePath, fileName, fileType, createdAt } = body;
    if (!workshopId || !workshopName || !storagePath || !fileName) {
      return new Response(JSON.stringify({ error: 'Missing fields' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Download file from supabase storage
    const { data: blob, error: dlErr } = await admin.storage.from('workshop-files').download(storagePath);
    if (dlErr || !blob) throw new Error(`Storage download failed: ${dlErr?.message}`);

    // Get or create root folder
    const { data: rootSetting } = await admin.from('app_settings')
      .select('value').eq('key', 'master_drive_folder_id').maybeSingle();
    let rootId = rootSetting?.value || null;
    if (rootId) {
      const c = await fetch(`${DRIVE_GW}/files/${rootId}?fields=id,trashed`, {
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, 'X-Connection-Api-Key': DRIVE_API_KEY },
      });
      if (!c.ok) rootId = null;
      else if ((await c.json()).trashed) rootId = null;
    }
    if (!rootId) {
      rootId = await findOrCreateFolder('Workshop_Files', null, LOVABLE_API_KEY, DRIVE_API_KEY);
      await admin.from('app_settings').upsert({
        key: 'master_drive_folder_id', value: rootId, updated_at: new Date().toISOString(),
      });
    }

    // Workshop subfolder
    const safeName = safeDriveName(workshopName || workshopId);
    const workshopFolderId = await findOrCreateFolder(safeName, rootId, LOVABLE_API_KEY, DRIVE_API_KEY);
    const driveFileName = `${String(createdAt || new Date().toISOString()).slice(0, 16).replace('T', ' ').replace(':', '-')} - ${safeDriveName(fileName)}`;
    await deleteExistingDriveFiles(driveFileName, workshopFolderId, LOVABLE_API_KEY, DRIVE_API_KEY);

    // Multipart upload
    const boundary = `----lovable-${Date.now()}`;
    const metadata = {
      name: driveFileName,
      parents: [workshopFolderId],
    };
    const fileBytes = new Uint8Array(await blob.arrayBuffer());
    const enc = new TextEncoder();
    const pre = enc.encode(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\nContent-Type: ${fileType || 'application/octet-stream'}\r\n\r\n`,
    );
    const post = enc.encode(`\r\n--${boundary}--`);
    const bodyBytes = new Uint8Array(pre.length + fileBytes.length + post.length);
    bodyBytes.set(pre, 0);
    bodyBytes.set(fileBytes, pre.length);
    bodyBytes.set(post, pre.length + fileBytes.length);

    const upload = await fetch(`${DRIVE_UPLOAD}?uploadType=multipart&fields=id,webViewLink`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        'X-Connection-Api-Key': DRIVE_API_KEY,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: bodyBytes,
    });
    if (!upload.ok) {
      const txt = await upload.text();
      throw new Error(`Drive upload failed: ${upload.status} ${txt}`);
    }
    const uj = await upload.json();

    return new Response(
      JSON.stringify({ success: true, driveFileId: uj.id, driveLink: uj.webViewLink, workshopFolderId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    console.error('mirror-workshop-file error:', e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});