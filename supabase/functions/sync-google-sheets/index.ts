import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SHEETS_GW = 'https://connector-gateway.lovable.dev/google_sheets/v4';
const DRIVE_GW = 'https://connector-gateway.lovable.dev/google_drive/drive/v3';

const TABLES = [
  'workshops', 'workers', 'attendance', 'worker_adjustments',
  'payments', 'personal_payments', 'income', 'debts', 'debt_payments',
  'contractors', 'contracts', 'contractor_payments', 'contractor_budget_purchases',
  'team_transfers', 'user_transfers', 'profiles', 'user_roles', 'holidays',
  'workshop_assignments', 'co_admin_member_assignments', 'workshop_files',
];

const SPREADSHEET_NAME = 'Workshop_Master_Database';

function gwHeaders(lovableKey: string, sheetsKey: string) {
  return {
    Authorization: `Bearer ${lovableKey}`,
    'X-Connection-Api-Key': sheetsKey,
    'Content-Type': 'application/json',
  };
}

function driveHeaders(lovableKey: string, driveKey: string) {
  return {
    Authorization: `Bearer ${lovableKey}`,
    'X-Connection-Api-Key': driveKey,
    'Content-Type': 'application/json',
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const SHEETS_API_KEY = Deno.env.get('GOOGLE_SHEETS_API_KEY');
    const DRIVE_API_KEY = Deno.env.get('GOOGLE_DRIVE_API_KEY');
    if (!LOVABLE_API_KEY || !SHEETS_API_KEY || !DRIVE_API_KEY) {
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
    const userId = claims.claims.sub;

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Admin check
    const { data: roleRow } = await admin
      .from('user_roles').select('role').eq('user_id', userId).eq('role', 'admin').maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: 'Admin only' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get or create spreadsheet
    const { data: setting } = await admin.from('app_settings')
      .select('value').eq('key', 'master_spreadsheet_id').maybeSingle();
    let spreadsheetId = setting?.value || null;

    // Verify spreadsheet still exists
    if (spreadsheetId) {
      const check = await fetch(`${SHEETS_GW}/spreadsheets/${spreadsheetId}?fields=spreadsheetId`, {
        headers: gwHeaders(LOVABLE_API_KEY, SHEETS_API_KEY),
      });
      if (!check.ok) spreadsheetId = null;
    }

    if (!spreadsheetId) {
      const createRes = await fetch(`${SHEETS_GW}/spreadsheets`, {
        method: 'POST',
        headers: gwHeaders(LOVABLE_API_KEY, SHEETS_API_KEY),
        body: JSON.stringify({
          properties: { title: SPREADSHEET_NAME },
          sheets: TABLES.map((t) => ({ properties: { title: t } })),
        }),
      });
      if (!createRes.ok) {
        const txt = await createRes.text();
        throw new Error(`Create spreadsheet failed: ${createRes.status} ${txt}`);
      }
      const created = await createRes.json();
      spreadsheetId = created.spreadsheetId;
      await admin.from('app_settings').upsert({
        key: 'master_spreadsheet_id', value: spreadsheetId, updated_by: userId, updated_at: new Date().toISOString(),
      });
    } else {
      // Make sure all tabs exist
      const meta = await fetch(`${SHEETS_GW}/spreadsheets/${spreadsheetId}?fields=sheets.properties`, {
        headers: gwHeaders(LOVABLE_API_KEY, SHEETS_API_KEY),
      }).then((r) => r.json());
      const existing = new Set<string>((meta.sheets || []).map((s: any) => s.properties.title));
      const missing = TABLES.filter((t) => !existing.has(t));
      if (missing.length > 0) {
        await fetch(`${SHEETS_GW}/spreadsheets/${spreadsheetId}:batchUpdate`, {
          method: 'POST',
          headers: gwHeaders(LOVABLE_API_KEY, SHEETS_API_KEY),
          body: JSON.stringify({
            requests: missing.map((title) => ({ addSheet: { properties: { title } } })),
          }),
        });
      }
    }

    // Ensure Workshop_Files folder exists
    let folderId: string | null = null;
    const { data: folderSetting } = await admin.from('app_settings')
      .select('value').eq('key', 'master_drive_folder_id').maybeSingle();
    folderId = folderSetting?.value || null;
    if (folderId) {
      const c = await fetch(`${DRIVE_GW}/files/${folderId}?fields=id,trashed`, {
        headers: driveHeaders(LOVABLE_API_KEY, DRIVE_API_KEY),
      });
      if (!c.ok) folderId = null;
      else {
        const j = await c.json();
        if (j.trashed) folderId = null;
      }
    }
    if (!folderId) {
      const f = await fetch(`${DRIVE_GW}/files`, {
        method: 'POST',
        headers: driveHeaders(LOVABLE_API_KEY, DRIVE_API_KEY),
        body: JSON.stringify({ name: 'Workshop_Files', mimeType: 'application/vnd.google-apps.folder' }),
      });
      const fj = await f.json();
      folderId = fj.id;
      if (folderId) {
        await admin.from('app_settings').upsert({
          key: 'master_drive_folder_id', value: folderId, updated_by: userId, updated_at: new Date().toISOString(),
        });
      }
    }

    // Export each table
    const tablesExported: Record<string, number> = {};
    for (const table of TABLES) {
      // Paginate
      const rows: any[] = [];
      const pageSize = 1000;
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await admin.from(table as any).select('*').range(from, from + pageSize - 1);
        if (error) {
          console.error(`Read ${table}:`, error.message);
          break;
        }
        if (!data || data.length === 0) break;
        rows.push(...data);
        if (data.length < pageSize) break;
      }

      let headers: string[] = [];
      let values: any[][] = [];
      if (rows.length > 0) {
        headers = Object.keys(rows[0]);
        values = rows.map((r) => headers.map((h) => {
          const v = r[h];
          if (v === null || v === undefined) return '';
          if (typeof v === 'object') return JSON.stringify(v);
          return String(v);
        }));
      } else {
        headers = ['(empty table)'];
      }

      // Clear sheet
      await fetch(`${SHEETS_GW}/spreadsheets/${spreadsheetId}/values/${table}!A:ZZ:clear`, {
        method: 'POST',
        headers: gwHeaders(LOVABLE_API_KEY, SHEETS_API_KEY),
      });

      // Write
      const writeBody = { values: [headers, ...values] };
      const writeRes = await fetch(
        `${SHEETS_GW}/spreadsheets/${spreadsheetId}/values/${table}!A1?valueInputOption=RAW`,
        {
          method: 'PUT',
          headers: gwHeaders(LOVABLE_API_KEY, SHEETS_API_KEY),
          body: JSON.stringify(writeBody),
        }
      );
      if (!writeRes.ok) {
        const txt = await writeRes.text();
        console.error(`Write ${table}:`, txt);
      }
      tablesExported[table] = rows.length;
    }

    return new Response(
      JSON.stringify({
        success: true,
        spreadsheetId,
        spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
        folderId,
        folderUrl: folderId ? `https://drive.google.com/drive/folders/${folderId}` : null,
        tablesExported,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    console.error('sync-google-sheets error:', e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});