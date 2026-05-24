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

async function trashDriveFile(fileId: string, lovableKey: string, driveKey: string) {
  await fetch(`${DRIVE_GW}/files/${fileId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${lovableKey}`, 'X-Connection-Api-Key': driveKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ trashed: true }),
  });
}

async function mergeDuplicateFolder(canonicalId: string, duplicateId: string, lovableKey: string, driveKey: string) {
  const headers = { Authorization: `Bearer ${lovableKey}`, 'X-Connection-Api-Key': driveKey };
  let pageToken = '';
  do {
    const q = `${driveQueryLiteral(duplicateId)} in parents and trashed=false`;
    const res = await fetch(`${DRIVE_GW}/files?q=${encodeURIComponent(q)}&fields=nextPageToken,files(id,name)&pageSize=1000${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`, { headers });
    if (!res.ok) throw new Error(`Duplicate folder scan failed: ${res.status} ${await res.text()}`);
    const data = await res.json();
    for (const child of data.files || []) {
      const move = await fetch(`${DRIVE_GW}/files/${child.id}?addParents=${canonicalId}&removeParents=${duplicateId}&fields=id`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!move.ok) console.warn('Duplicate folder child move failed:', child.id, await move.text());
    }
    pageToken = data.nextPageToken || '';
  } while (pageToken);
  await trashDriveFile(duplicateId, lovableKey, driveKey);
}

function safeDriveName(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, '_').trim() || 'Unknown Workshop';
}

function normalizeFileCategory(value: unknown, storagePath: string): 'receipts' | 'files' | 'checks' {
  const category = String(value || '').toLowerCase();
  const path = `/${storagePath.toLowerCase()}`;
  if (category === 'receipt' || path.includes('/receipts/') || path.includes('/receipt/')) return 'receipts';
  if (category === 'check' || path.includes('/checks/') || path.includes('/check/') || path.includes('/income/')) return 'checks';
  return 'files';
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
  const search = await fetch(`${DRIVE_GW}/files?q=${encodeURIComponent(q)}&fields=files(id,name,createdTime)&pageSize=1000&orderBy=createdTime`, { headers });
  if (!search.ok) throw new Error(`Folder search failed for "${name}": ${search.status} ${await search.text()}`);
  const sj = await search.json();
  if (sj.files && sj.files.length > 0) {
    const canonical = sj.files[0];
    for (const duplicate of sj.files.slice(1)) {
      await mergeDuplicateFolder(canonical.id, duplicate.id, lovableKey, driveKey).catch((e) => console.warn('Duplicate folder merge failed:', duplicate.id, e));
    }
    return canonical.id;
  }

  const create = await fetch(`${DRIVE_GW}/files`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      mimeType: 'application/vnd.google-apps.folder',
      ...(parentId ? { parents: [parentId] } : {}),
    }),
  });
  if (!create.ok) throw new Error(`Folder create failed for "${name}": ${create.status} ${await create.text()}`);
  const cj = await create.json();
  if (!cj.id) throw new Error(`Folder create failed: ${JSON.stringify(cj)}`);
  return cj.id;
}

async function findExistingDriveFiles(name: string, parentId: string, lovableKey: string, driveKey: string) {
  const headers = {
    Authorization: `Bearer ${lovableKey}`,
    'X-Connection-Api-Key': driveKey,
  };
  const q = `name=${driveQueryLiteral(name)} and ${driveQueryLiteral(parentId)} in parents and trashed=false`;
  const search = await fetch(`${DRIVE_GW}/files?q=${encodeURIComponent(q)}&fields=files(id,name,createdTime)&pageSize=1000&orderBy=createdTime`, { headers });
  if (!search.ok) throw new Error(`Drive duplicate lookup failed: ${search.status} ${await search.text()}`);
  const sj = await search.json();
  return sj.files || [];
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
    const { workshopId, workshopName, storagePath, fileName, fileType, fileCategory, createdAt } = body;
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
    const categoryFolderId = await findOrCreateFolder(normalizeFileCategory(fileCategory, storagePath), workshopFolderId, LOVABLE_API_KEY, DRIVE_API_KEY);
    const driveFileName = `${String(createdAt || new Date().toISOString()).slice(0, 16).replace('T', ' ').replace(':', '-')} - ${safeDriveName(fileName)}`;
    const existingFiles = await findExistingDriveFiles(driveFileName, categoryFolderId, LOVABLE_API_KEY, DRIVE_API_KEY);
    const existingFileId = existingFiles[0]?.id;

    // Multipart upload
    const boundary = `----lovable-${Date.now()}`;
    const metadata = existingFileId ? { name: driveFileName } : { name: driveFileName, parents: [categoryFolderId] };
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

    const upload = await fetch(existingFileId ? `${DRIVE_UPLOAD}/${existingFileId}?uploadType=multipart&fields=id,webViewLink` : `${DRIVE_UPLOAD}?uploadType=multipart&fields=id,webViewLink`, {
      method: existingFileId ? 'PATCH' : 'POST',
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
    for (const duplicate of existingFiles.slice(1)) {
      await trashDriveFile(duplicate.id, LOVABLE_API_KEY, DRIVE_API_KEY).catch((err) => console.warn('Duplicate trash failed:', duplicate.id, err));
    }

    return new Response(
      JSON.stringify({ success: true, driveFileId: uj.id, driveLink: uj.webViewLink, workshopFolderId, categoryFolderId }),
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