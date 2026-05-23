import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SHEETS_GW = 'https://connector-gateway.lovable.dev/google_sheets/v4';
const DRIVE_GW = 'https://connector-gateway.lovable.dev/google_drive/drive/v3';

const SPREADSHEET_NAME = 'Workshop_Master_Database';

// Friendly column labels per table. Keys are db columns; values are sheet headers.
// Columns NOT listed are excluded from the export (keeps sheets clean).
// Foreign-key columns ending with _id are resolved to names via lookup maps.
type TableSpec = {
  table: string;
  sheet: string;
  columns: { key: string; label: string; resolve?: 'workshop' | 'worker' | 'user' | 'contractor' | 'contract' | 'debt' | 'payment' }[];
};

const TABLE_SPECS: TableSpec[] = [
  { table: 'workshops', sheet: 'Workshops', columns: [
    { key: 'name', label: 'Workshop' },
    { key: 'description', label: 'Description' },
    { key: 'created_by', label: 'Created By', resolve: 'user' },
    { key: 'created_at', label: 'Created At' },
  ]},
  { table: 'workers', sheet: 'Workers', columns: [
    { key: 'name', label: 'Worker' },
    { key: 'category', label: 'Category' },
    { key: 'hourly_rate', label: 'Hourly Rate' },
    { key: 'is_active', label: 'Active' },
    { key: 'created_by', label: 'Created By', resolve: 'user' },
    { key: 'created_at', label: 'Created At' },
  ]},
  { table: 'attendance', sheet: 'Attendance', columns: [
    { key: 'work_date', label: 'Date' },
    { key: 'worker_id', label: 'Worker', resolve: 'worker' },
    { key: 'workshop_id', label: 'Workshop', resolve: 'workshop' },
    { key: 'hours_worked', label: 'Hours Worked' },
    { key: 'hourly_rate', label: 'Hourly Rate' },
    { key: 'daily_salary', label: 'Daily Salary' },
    { key: 'has_extra', label: 'Has Extra' },
    { key: 'extra_amount', label: 'Extra Amount' },
    { key: 'extra_reason', label: 'Extra Reason' },
    { key: 'discount_amount', label: 'Discount' },
    { key: 'discount_reason', label: 'Discount Reason' },
    { key: 'description', label: 'Notes' },
    { key: 'is_paid', label: 'Paid' },
    { key: 'created_by', label: 'Recorded By', resolve: 'user' },
    { key: 'created_at', label: 'Recorded At' },
  ]},
  { table: 'worker_adjustments', sheet: 'Worker Adjustments', columns: [
    { key: 'work_date', label: 'Date' },
    { key: 'worker_id', label: 'Worker', resolve: 'worker' },
    { key: 'workshop_id', label: 'Workshop', resolve: 'workshop' },
    { key: 'adjustment_type', label: 'Type' },
    { key: 'amount', label: 'Amount' },
    { key: 'reason', label: 'Reason' },
    { key: 'is_paid', label: 'Paid' },
    { key: 'created_by', label: 'Created By', resolve: 'user' },
    { key: 'created_at', label: 'Created At' },
  ]},
  { table: 'payments', sheet: 'Payments', columns: [
    { key: 'payment_date', label: 'Date' },
    { key: 'workshop_id', label: 'Workshop', resolve: 'workshop' },
    { key: 'paid_to', label: 'Paid To' },
    { key: 'amount', label: 'Amount' },
    { key: 'payment_type', label: 'Method' },
    { key: 'reason', label: 'Reason' },
    { key: 'status', label: 'Status' },
    { key: 'rejection_reason', label: 'Rejection Reason' },
    { key: 'created_by', label: 'Requested By', resolve: 'user' },
    { key: 'approved_by', label: 'Approved By', resolve: 'user' },
    { key: 'approved_at', label: 'Approved At' },
    { key: 'created_at', label: 'Created At' },
  ]},
  { table: 'personal_payments', sheet: 'Personal Payments', columns: [
    { key: 'payment_date', label: 'Date' },
    { key: 'user_id', label: 'Team Member', resolve: 'user' },
    { key: 'paid_to', label: 'Paid To' },
    { key: 'amount', label: 'Amount' },
    { key: 'reason', label: 'Reason' },
    { key: 'created_by', label: 'Recorded By', resolve: 'user' },
    { key: 'created_at', label: 'Created At' },
  ]},
  { table: 'income', sheet: 'Income', columns: [
    { key: 'income_date', label: 'Date' },
    { key: 'workshop_id', label: 'Workshop', resolve: 'workshop' },
    { key: 'amount', label: 'Amount' },
    { key: 'description', label: 'Description' },
    { key: 'created_by', label: 'Recorded By', resolve: 'user' },
    { key: 'created_at', label: 'Created At' },
  ]},
  { table: 'debts', sheet: 'Debts', columns: [
    { key: 'debt_date', label: 'Date' },
    { key: 'person_name', label: 'Person' },
    { key: 'amount', label: 'Amount' },
    { key: 'debt_type', label: 'Type' },
    { key: 'description', label: 'Description' },
    { key: 'status', label: 'Status' },
    { key: 'is_settled', label: 'Settled' },
    { key: 'created_by', label: 'Created By', resolve: 'user' },
    { key: 'created_at', label: 'Created At' },
  ]},
  { table: 'debt_payments', sheet: 'Debt Payments', columns: [
    { key: 'payment_date', label: 'Date' },
    { key: 'debt_id', label: 'Debt', resolve: 'debt' },
    { key: 'amount', label: 'Amount' },
    { key: 'description', label: 'Description' },
    { key: 'created_by', label: 'Recorded By', resolve: 'user' },
    { key: 'created_at', label: 'Created At' },
  ]},
  { table: 'contractors', sheet: 'Contractors', columns: [
    { key: 'name', label: 'Contractor' },
    { key: 'specialty', label: 'Specialty' },
    { key: 'phone', label: 'Phone' },
    { key: 'is_active', label: 'Active' },
    { key: 'created_by', label: 'Created By', resolve: 'user' },
    { key: 'created_at', label: 'Created At' },
  ]},
  { table: 'contracts', sheet: 'Contracts', columns: [
    { key: 'contractor_id', label: 'Contractor', resolve: 'contractor' },
    { key: 'workshop_id', label: 'Workshop', resolve: 'workshop' },
    { key: 'total_amount', label: 'Total Amount' },
    { key: 'status', label: 'Status' },
    { key: 'description', label: 'Description' },
    { key: 'created_by', label: 'Created By', resolve: 'user' },
    { key: 'created_at', label: 'Created At' },
  ]},
  { table: 'contractor_payments', sheet: 'Contractor Payments', columns: [
    { key: 'payment_date', label: 'Date' },
    { key: 'contractor_id', label: 'Contractor', resolve: 'contractor' },
    { key: 'workshop_id', label: 'Workshop', resolve: 'workshop' },
    { key: 'contract_id', label: 'Contract', resolve: 'contract' },
    { key: 'amount', label: 'Amount' },
    { key: 'payment_type', label: 'Type' },
    { key: 'description', label: 'Description' },
    { key: 'created_by', label: 'Recorded By', resolve: 'user' },
    { key: 'created_at', label: 'Created At' },
  ]},
  { table: 'contractor_budget_purchases', sheet: 'Contractor Purchases', columns: [
    { key: 'purchase_date', label: 'Date' },
    { key: 'contractor_payment_id', label: 'Related Payment' },
    { key: 'amount', label: 'Amount' },
    { key: 'description', label: 'Description' },
    { key: 'receipt_file_name', label: 'Receipt File' },
    { key: 'created_by', label: 'Created By', resolve: 'user' },
    { key: 'created_at', label: 'Created At' },
  ]},
  { table: 'team_transfers', sheet: 'Team Transfers', columns: [
    { key: 'transfer_date', label: 'Date' },
    { key: 'user_id', label: 'Team Member', resolve: 'user' },
    { key: 'amount', label: 'Amount' },
    { key: 'description', label: 'Description' },
    { key: 'created_by', label: 'Created By', resolve: 'user' },
    { key: 'created_at', label: 'Created At' },
  ]},
  { table: 'user_transfers', sheet: 'User Transfers', columns: [
    { key: 'transfer_date', label: 'Date' },
    { key: 'user_id', label: 'Team Member', resolve: 'user' },
    { key: 'workshop_id', label: 'Workshop', resolve: 'workshop' },
    { key: 'amount', label: 'Amount' },
    { key: 'description', label: 'Description' },
    { key: 'created_by', label: 'Created By', resolve: 'user' },
    { key: 'created_at', label: 'Created At' },
  ]},
  { table: 'profiles', sheet: 'Team Members', columns: [
    { key: 'user_id', label: 'User', resolve: 'user' },
    { key: 'full_name', label: 'Full Name' },
    { key: 'created_at', label: 'Joined At' },
  ]},
  { table: 'user_roles', sheet: 'User Roles', columns: [
    { key: 'user_id', label: 'User', resolve: 'user' },
    { key: 'role', label: 'Role' },
    { key: 'created_at', label: 'Assigned At' },
  ]},
  { table: 'holidays', sheet: 'Holidays', columns: [
    { key: 'holiday_date', label: 'Date' },
    { key: 'created_by', label: 'Added By', resolve: 'user' },
    { key: 'created_at', label: 'Added At' },
  ]},
  { table: 'workshop_assignments', sheet: 'Workshop Assignments', columns: [
    { key: 'workshop_id', label: 'Workshop', resolve: 'workshop' },
    { key: 'user_id', label: 'Team Member', resolve: 'user' },
    { key: 'assigned_by', label: 'Assigned By', resolve: 'user' },
    { key: 'created_at', label: 'Assigned At' },
  ]},
  { table: 'co_admin_member_assignments', sheet: 'Co-Admin Assignments', columns: [
    { key: 'co_admin_user_id', label: 'Co-Admin', resolve: 'user' },
    { key: 'member_user_id', label: 'Member', resolve: 'user' },
    { key: 'assigned_by', label: 'Assigned By', resolve: 'user' },
    { key: 'created_at', label: 'Assigned At' },
  ]},
  { table: 'workshop_files', sheet: 'Workshop Files', columns: [
    { key: 'created_at', label: 'Uploaded At' },
    { key: 'workshop_id', label: 'Workshop', resolve: 'workshop' },
    { key: 'file_name', label: 'File Name' },
    { key: 'file_type', label: 'Type' },
    { key: 'uploaded_by', label: 'Uploaded By', resolve: 'user' },
  ]},
];

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
          sheets: TABLE_SPECS.map((s) => ({ properties: { title: s.sheet } })),
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
      const missing = TABLE_SPECS.filter((s) => !existing.has(s.sheet));
      if (missing.length > 0) {
        await fetch(`${SHEETS_GW}/spreadsheets/${spreadsheetId}:batchUpdate`, {
          method: 'POST',
          headers: gwHeaders(LOVABLE_API_KEY, SHEETS_API_KEY),
          body: JSON.stringify({
            requests: missing.map((s) => ({ addSheet: { properties: { title: s.sheet } } })),
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

    // Build lookup maps (id -> friendly name) for all FK resolutions
    const fetchAll = async (table: string, cols: string) => {
      const all: any[] = [];
      const ps = 1000;
      for (let from = 0; ; from += ps) {
        const { data, error } = await admin.from(table as any).select(cols).range(from, from + ps - 1);
        if (error || !data || data.length === 0) break;
        all.push(...data);
        if (data.length < ps) break;
      }
      return all;
    };

    const [wsRows, wkRows, prRows, ctRows, cnRows, dbRows] = await Promise.all([
      fetchAll('workshops', 'id,name'),
      fetchAll('workers', 'id,name'),
      fetchAll('profiles', 'user_id,full_name'),
      fetchAll('contractors', 'id,name'),
      fetchAll('contracts', 'id,description,total_amount'),
      fetchAll('debts', 'id,person_name,debt_date'),
    ]);

    const workshopMap = new Map(wsRows.map((r: any) => [r.id, r.name]));
    const workerMap = new Map(wkRows.map((r: any) => [r.id, r.name]));
    const userMap = new Map(prRows.map((r: any) => [r.user_id, r.full_name || '(unnamed)']));
    const contractorMap = new Map(ctRows.map((r: any) => [r.id, r.name]));
    const contractMap = new Map(cnRows.map((r: any) => [r.id, r.description || `Contract ${String(r.id).slice(0, 8)}`]));
    const debtMap = new Map(dbRows.map((r: any) => [r.id, `${r.person_name} (${r.debt_date})`]));

    const resolveValue = (val: any, resolver?: string): string => {
      if (val === null || val === undefined || val === '') return '';
      if (!resolver) {
        if (typeof val === 'object') return JSON.stringify(val);
        return String(val);
      }
      const id = String(val);
      const lookup = resolver === 'workshop' ? workshopMap
        : resolver === 'worker' ? workerMap
        : resolver === 'user' ? userMap
        : resolver === 'contractor' ? contractorMap
        : resolver === 'contract' ? contractMap
        : resolver === 'debt' ? debtMap
        : null;
      const name = lookup?.get(id);
      return name ?? '(unknown)';
    };

    const formatCell = (v: any): string => {
      if (v === null || v === undefined) return '';
      if (typeof v === 'boolean') return v ? 'Yes' : 'No';
      if (typeof v === 'object') return JSON.stringify(v);
      return String(v);
    };

    // Export each table
    const tablesExported: Record<string, number> = {};
    for (const spec of TABLE_SPECS) {
      // Paginate
      const rows: any[] = [];
      const pageSize = 1000;
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await admin.from(spec.table as any).select('*').range(from, from + pageSize - 1);
        if (error) {
          console.error(`Read ${spec.table}:`, error.message);
          break;
        }
        if (!data || data.length === 0) break;
        rows.push(...data);
        if (data.length < pageSize) break;
      }

      const headers = spec.columns.map((c) => c.label);
      const values = rows.map((r) =>
        spec.columns.map((c) => {
          if (c.resolve) return resolveValue(r[c.key], c.resolve);
          return formatCell(r[c.key]);
        })
      );

      // Clear sheet (overwrite — never duplicate)
      await fetch(`${SHEETS_GW}/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(spec.sheet)}!A:ZZ:clear`, {
        method: 'POST',
        headers: gwHeaders(LOVABLE_API_KEY, SHEETS_API_KEY),
      });

      // Write
      const writeBody = { values: [headers, ...values] };
      const writeRes = await fetch(
        `${SHEETS_GW}/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(spec.sheet)}!A1?valueInputOption=USER_ENTERED`,
        {
          method: 'PUT',
          headers: gwHeaders(LOVABLE_API_KEY, SHEETS_API_KEY),
          body: JSON.stringify(writeBody),
        }
      );
      if (!writeRes.ok) {
        const txt = await writeRes.text();
        console.error(`Write ${spec.sheet}:`, txt);
      }
      tablesExported[spec.sheet] = rows.length;
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