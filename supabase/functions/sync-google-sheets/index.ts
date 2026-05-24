import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SHEETS_GW = 'https://connector-gateway.lovable.dev/google_sheets/v4';
const DRIVE_GW = 'https://connector-gateway.lovable.dev/google_drive/drive/v3';
const DRIVE_UPLOAD = 'https://connector-gateway.lovable.dev/google_drive/upload/drive/v3/files';
const SPREADSHEET_NAME = 'Workshop_Master_Database';
const DASHBOARD_SHEET = 'Main Dashboard';
const LEGACY_DASHBOARD_SHEET = 'Dashboard';
const DEFAULT_FILE_BATCH_SIZE = 5;
const MAX_FILE_BATCH_SIZE = 10;

type Resolver = 'workshop' | 'worker' | 'user' | 'contractor' | 'contract' | 'debt' | 'payment' | 'contractorPayment';
type TableSpec = {
  table: string;
  sheet: string;
  columns: { key: string; label: string; resolve?: Resolver; type?: 'amount' | 'date' | 'datetime' }[];
};

const TABLE_SPECS: TableSpec[] = [
  { table: 'workshops', sheet: 'Workshops', columns: [
    { key: 'name', label: 'Workshop' },
    { key: 'description', label: 'Description' },
    { key: 'created_by', label: 'Created By', resolve: 'user' },
    { key: 'created_at', label: 'Created At', type: 'datetime' },
  ]},
  { table: 'workers', sheet: 'Workers', columns: [
    { key: 'name', label: 'Worker' },
    { key: 'category', label: 'Category' },
    { key: 'hourly_rate', label: 'Hourly Rate', type: 'amount' },
    { key: 'is_active', label: 'Active' },
    { key: 'created_by', label: 'Created By', resolve: 'user' },
    { key: 'created_at', label: 'Created At', type: 'datetime' },
  ]},
  { table: 'attendance', sheet: 'Attendance', columns: [
    { key: 'work_date', label: 'Date', type: 'date' },
    { key: 'worker_id', label: 'Worker', resolve: 'worker' },
    { key: 'workshop_id', label: 'Workshop', resolve: 'workshop' },
    { key: 'hours_worked', label: 'Hours Worked' },
    { key: 'hourly_rate', label: 'Hourly Rate', type: 'amount' },
    { key: 'daily_salary', label: 'Daily Salary', type: 'amount' },
    { key: 'has_extra', label: 'Has Extra' },
    { key: 'extra_amount', label: 'Extra Amount', type: 'amount' },
    { key: 'extra_reason', label: 'Extra Reason' },
    { key: 'discount_amount', label: 'Discount', type: 'amount' },
    { key: 'discount_reason', label: 'Discount Reason' },
    { key: 'description', label: 'Notes' },
    { key: 'is_paid', label: 'Paid' },
    { key: 'created_by', label: 'Recorded By', resolve: 'user' },
    { key: 'created_at', label: 'Recorded At', type: 'datetime' },
  ]},
  { table: 'worker_adjustments', sheet: 'Worker Adjustments', columns: [
    { key: 'work_date', label: 'Date', type: 'date' },
    { key: 'worker_id', label: 'Worker', resolve: 'worker' },
    { key: 'workshop_id', label: 'Workshop', resolve: 'workshop' },
    { key: 'adjustment_type', label: 'Type' },
    { key: 'amount', label: 'Amount', type: 'amount' },
    { key: 'reason', label: 'Reason' },
    { key: 'is_paid', label: 'Paid' },
    { key: 'payment_id', label: 'Related Payment', resolve: 'payment' },
    { key: 'created_by', label: 'Created By', resolve: 'user' },
    { key: 'created_at', label: 'Created At', type: 'datetime' },
  ]},
  { table: 'payments', sheet: 'Payments', columns: [
    { key: 'payment_date', label: 'Date', type: 'date' },
    { key: 'workshop_id', label: 'Workshop', resolve: 'workshop' },
    { key: 'paid_to', label: 'Paid To' },
    { key: 'amount', label: 'Amount', type: 'amount' },
    { key: 'payment_type', label: 'Method' },
    { key: 'reason', label: 'Reason' },
    { key: 'status', label: 'Status' },
    { key: 'rejection_reason', label: 'Rejection Reason' },
    { key: 'created_by', label: 'Requested By', resolve: 'user' },
    { key: 'approved_by', label: 'Approved By', resolve: 'user' },
    { key: 'approved_at', label: 'Approved At', type: 'datetime' },
    { key: 'created_at', label: 'Created At', type: 'datetime' },
  ]},
  { table: 'personal_payments', sheet: 'Personal Payments', columns: [
    { key: 'payment_date', label: 'Date', type: 'date' },
    { key: 'user_id', label: 'Team Member', resolve: 'user' },
    { key: 'paid_to', label: 'Paid To' },
    { key: 'amount', label: 'Amount', type: 'amount' },
    { key: 'reason', label: 'Reason' },
    { key: 'created_by', label: 'Recorded By', resolve: 'user' },
    { key: 'created_at', label: 'Created At', type: 'datetime' },
  ]},
  { table: 'income', sheet: 'Income', columns: [
    { key: 'income_date', label: 'Date', type: 'date' },
    { key: 'workshop_id', label: 'Workshop', resolve: 'workshop' },
    { key: 'amount', label: 'Amount', type: 'amount' },
    { key: 'description', label: 'Description' },
    { key: 'created_by', label: 'Recorded By', resolve: 'user' },
    { key: 'created_at', label: 'Created At', type: 'datetime' },
  ]},
  { table: 'debts', sheet: 'Debts', columns: [
    { key: 'debt_date', label: 'Date', type: 'date' },
    { key: 'person_name', label: 'Person' },
    { key: 'amount', label: 'Amount', type: 'amount' },
    { key: 'debt_type', label: 'Type' },
    { key: 'description', label: 'Description' },
    { key: 'status', label: 'Status' },
    { key: 'is_settled', label: 'Settled' },
    { key: 'created_by', label: 'Created By', resolve: 'user' },
    { key: 'created_at', label: 'Created At', type: 'datetime' },
  ]},
  { table: 'debt_payments', sheet: 'Debt Payments', columns: [
    { key: 'payment_date', label: 'Date', type: 'date' },
    { key: 'debt_id', label: 'Debt', resolve: 'debt' },
    { key: 'amount', label: 'Amount', type: 'amount' },
    { key: 'description', label: 'Description' },
    { key: 'created_by', label: 'Recorded By', resolve: 'user' },
    { key: 'created_at', label: 'Created At', type: 'datetime' },
  ]},
  { table: 'contractors', sheet: 'Contractors', columns: [
    { key: 'name', label: 'Contractor' },
    { key: 'specialty', label: 'Specialty' },
    { key: 'phone', label: 'Phone' },
    { key: 'is_active', label: 'Active' },
    { key: 'created_by', label: 'Created By', resolve: 'user' },
    { key: 'created_at', label: 'Created At', type: 'datetime' },
  ]},
  { table: 'contracts', sheet: 'Contracts', columns: [
    { key: 'contractor_id', label: 'Contractor', resolve: 'contractor' },
    { key: 'workshop_id', label: 'Workshop', resolve: 'workshop' },
    { key: 'total_amount', label: 'Total Amount', type: 'amount' },
    { key: 'status', label: 'Status' },
    { key: 'description', label: 'Description' },
    { key: 'created_by', label: 'Created By', resolve: 'user' },
    { key: 'created_at', label: 'Created At', type: 'datetime' },
  ]},
  { table: 'contractor_payments', sheet: 'Contractor Payments', columns: [
    { key: 'payment_date', label: 'Date', type: 'date' },
    { key: 'contractor_id', label: 'Contractor', resolve: 'contractor' },
    { key: 'workshop_id', label: 'Workshop', resolve: 'workshop' },
    { key: 'contract_id', label: 'Contract', resolve: 'contract' },
    { key: 'amount', label: 'Amount', type: 'amount' },
    { key: 'payment_type', label: 'Type' },
    { key: 'description', label: 'Description' },
    { key: 'payment_id', label: 'Dashboard Payment', resolve: 'payment' },
    { key: 'created_by', label: 'Recorded By', resolve: 'user' },
    { key: 'created_at', label: 'Created At', type: 'datetime' },
  ]},
  { table: 'contractor_budget_purchases', sheet: 'Contractor Purchases', columns: [
    { key: 'purchase_date', label: 'Date', type: 'date' },
    { key: 'contractor_payment_id', label: 'Material Budget', resolve: 'contractorPayment' },
    { key: 'payment_id', label: 'Dashboard Payment', resolve: 'payment' },
    { key: 'amount', label: 'Amount', type: 'amount' },
    { key: 'description', label: 'Description' },
    { key: 'receipt_file_name', label: 'Receipt File' },
    { key: 'created_by', label: 'Created By', resolve: 'user' },
    { key: 'created_at', label: 'Created At', type: 'datetime' },
  ]},
  { table: 'team_transfers', sheet: 'Team Transfers', columns: [
    { key: 'transfer_date', label: 'Date', type: 'date' },
    { key: 'user_id', label: 'Team Member', resolve: 'user' },
    { key: 'amount', label: 'Amount', type: 'amount' },
    { key: 'description', label: 'Description' },
    { key: 'created_by', label: 'Created By', resolve: 'user' },
    { key: 'created_at', label: 'Created At', type: 'datetime' },
  ]},
  { table: 'user_transfers', sheet: 'User Transfers', columns: [
    { key: 'transfer_date', label: 'Date', type: 'date' },
    { key: 'user_id', label: 'Team Member', resolve: 'user' },
    { key: 'workshop_id', label: 'Workshop', resolve: 'workshop' },
    { key: 'amount', label: 'Amount', type: 'amount' },
    { key: 'payment_id', label: 'Related Payment', resolve: 'payment' },
    { key: 'description', label: 'Description' },
    { key: 'created_by', label: 'Created By', resolve: 'user' },
    { key: 'created_at', label: 'Created At', type: 'datetime' },
  ]},
  { table: 'profiles', sheet: 'Team Members', columns: [
    { key: 'full_name', label: 'Team Member' },
    { key: 'created_at', label: 'Joined At', type: 'datetime' },
  ]},
  { table: 'user_roles', sheet: 'User Roles', columns: [
    { key: 'user_id', label: 'Team Member', resolve: 'user' },
    { key: 'role', label: 'Role' },
    { key: 'created_at', label: 'Assigned At', type: 'datetime' },
  ]},
  { table: 'holidays', sheet: 'Holidays', columns: [
    { key: 'holiday_date', label: 'Date', type: 'date' },
    { key: 'created_by', label: 'Added By', resolve: 'user' },
    { key: 'created_at', label: 'Added At', type: 'datetime' },
  ]},
  { table: 'workshop_assignments', sheet: 'Workshop Assignments', columns: [
    { key: 'workshop_id', label: 'Workshop', resolve: 'workshop' },
    { key: 'user_id', label: 'Team Member', resolve: 'user' },
    { key: 'assigned_by', label: 'Assigned By', resolve: 'user' },
    { key: 'created_at', label: 'Assigned At', type: 'datetime' },
  ]},
  { table: 'co_admin_member_assignments', sheet: 'Co-Admin Assignments', columns: [
    { key: 'co_admin_user_id', label: 'Co-Admin', resolve: 'user' },
    { key: 'member_user_id', label: 'Assigned Member', resolve: 'user' },
    { key: 'assigned_by', label: 'Assigned By', resolve: 'user' },
    { key: 'created_at', label: 'Assigned At', type: 'datetime' },
  ]},
  { table: 'workshop_files', sheet: 'Workshop Files', columns: [
    { key: 'created_at', label: 'Uploaded At', type: 'datetime' },
    { key: 'workshop_id', label: 'Workshop', resolve: 'workshop' },
    { key: 'file_name', label: 'File Name' },
    { key: 'file_type', label: 'Type' },
    { key: 'payment_id', label: 'Payment', resolve: 'payment' },
    { key: 'income_id', label: 'Income Record' },
    { key: 'uploaded_by', label: 'Uploaded By', resolve: 'user' },
  ]},
];

const allSheetTitles = [DASHBOARD_SHEET, ...TABLE_SPECS.map((s) => s.sheet)];

function gwHeaders(lovableKey: string, sheetsKey: string) {
  return { Authorization: `Bearer ${lovableKey}`, 'X-Connection-Api-Key': sheetsKey, 'Content-Type': 'application/json' };
}

function driveHeaders(lovableKey: string, driveKey: string, json = true) {
  return {
    Authorization: `Bearer ${lovableKey}`,
    'X-Connection-Api-Key': driveKey,
    ...(json ? { 'Content-Type': 'application/json' } : {}),
  };
}

function quoteSheet(title: string) {
  return `'${title.replace(/'/g, "''")}'`;
}

function rangeA1(sheet: string, range: string) {
  return `${quoteSheet(sheet)}!${range}`;
}

function cleanText(value: string) {
  return value
    .replace(/\[(WORKER_DEBT|ADVANCE_DEBT)\]/gi, '')
    .replace(/\[(DEBT_REPAYMENT|PAYMENT|TRANSFER|ADJUSTMENT):[0-9a-f-]{36}\]/gi, '[$1]')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function formatAmount(amount: unknown) {
  const n = Number(amount || 0);
  return Number.isFinite(n) ? n.toLocaleString('fr-FR') : String(amount || '');
}

function safeDriveName(name: string) {
  return (name || 'Unknown Workshop').replace(/[\\/:*?"<>|]/g, '_').trim() || 'Unknown Workshop';
}

function fileDriveCategory(file: { file_path?: string | null; payment_id?: string | null; income_id?: string | null }): 'receipts' | 'files' | 'checks' {
  if (file.payment_id) return 'receipts';
  if (file.income_id) return 'checks';
  const filePath = String(file.file_path || '');
  const path = `/${filePath.toLowerCase()}`;
  const firstFolder = filePath.split('/')[0] || '';
  if (path.includes('/files/') || path.includes('/file/') || path.includes('/maps/') || path.includes('/map/')) return 'files';
  if (path.includes('/receipts/') || path.includes('/receipt/')) return 'receipts';
  if (path.includes('/checks/') || path.includes('/check/') || path.includes('/income/')) return 'checks';
  if (/^[0-9a-f-]{36}$/i.test(firstFolder)) return 'receipts';
  return 'files';
}

function driveQueryLiteral(value: string) {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function driveFileName(row: any) {
  const date = row.created_at
    ? String(row.created_at).slice(0, 16).replace('T', ' ').replace(':', '-')
    : new Date().toISOString().slice(0, 16).replace('T', ' ').replace(':', '-');
  const original = safeDriveName(row.file_name || 'file');
  return `${date} - ${original}`;
}

async function findOrCreateFolder(name: string, parentId: string | null, lovableKey: string, driveKey: string): Promise<string> {
  const qParent = parentId ? ` and ${driveQueryLiteral(parentId)} in parents` : '';
  const q = `name=${driveQueryLiteral(name)} and mimeType='application/vnd.google-apps.folder' and trashed=false${qParent}`;
  const search = await fetch(`${DRIVE_GW}/files?q=${encodeURIComponent(q)}&fields=files(id,name,createdTime)&pageSize=1000&orderBy=createdTime`, {
    headers: driveHeaders(lovableKey, driveKey, false),
  });
  if (!search.ok) throw new Error(`Folder search failed for "${name}": ${search.status} ${await search.text()}`);
  const sj = await search.json();
  if (sj.files?.length) return sj.files[0].id;

  const create = await fetch(`${DRIVE_GW}/files`, {
    method: 'POST',
    headers: driveHeaders(lovableKey, driveKey),
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', ...(parentId ? { parents: [parentId] } : {}) }),
  });
  if (!create.ok) throw new Error(`Folder create failed for "${name}": ${create.status} ${await create.text()}`);
  const cj = await create.json();
  if (!cj.id) throw new Error(`Folder create failed: ${JSON.stringify(cj)}`);
  return cj.id;
}

async function uploadDriveFile(lovableKey: string, driveKey: string, folderId: string, name: string, blob: Blob, mimeType: string, existingFileId?: string) {
  const boundary = `----lovable-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const metadata = existingFileId ? { name } : { name, parents: [folderId] };
  const fileBytes = new Uint8Array(await blob.arrayBuffer());
  const enc = new TextEncoder();
  const pre = enc.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\nContent-Type: ${mimeType || 'application/octet-stream'}\r\n\r\n`,
  );
  const post = enc.encode(`\r\n--${boundary}--`);
  const bodyBytes = new Uint8Array(pre.length + fileBytes.length + post.length);
  bodyBytes.set(pre, 0);
  bodyBytes.set(fileBytes, pre.length);
  bodyBytes.set(post, pre.length + fileBytes.length);

  const url = existingFileId
    ? `${DRIVE_UPLOAD}/${existingFileId}?uploadType=multipart&fields=id,webViewLink`
    : `${DRIVE_UPLOAD}?uploadType=multipart&fields=id,webViewLink`;
  const upload = await fetch(url, {
    method: existingFileId ? 'PATCH' : 'POST',
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      'X-Connection-Api-Key': driveKey,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body: bodyBytes,
  });
  if (!upload.ok) throw new Error(`Drive upload failed: ${upload.status} ${await upload.text()}`);
  return upload.json();
}

async function trashDriveFile(lovableKey: string, driveKey: string, fileId: string) {
  await fetch(`${DRIVE_GW}/files/${fileId}`, {
    method: 'PATCH',
    headers: driveHeaders(lovableKey, driveKey),
    body: JSON.stringify({ trashed: true }),
  });
}

async function replaceDriveFile(lovableKey: string, driveKey: string, folderId: string, name: string, blob: Blob, mimeType: string) {
  const q = `name=${driveQueryLiteral(name)} and ${driveQueryLiteral(folderId)} in parents and trashed=false`;
  const search = await fetch(`${DRIVE_GW}/files?q=${encodeURIComponent(q)}&fields=files(id,name,createdTime)&pageSize=1000&orderBy=createdTime`, {
    headers: driveHeaders(lovableKey, driveKey, false),
  });
  if (!search.ok) throw new Error(`Drive duplicate lookup failed: ${search.status} ${await search.text()}`);
  const existing = await search.json();
  const files = existing.files || [];
  const updated = await uploadDriveFile(lovableKey, driveKey, folderId, name, blob, mimeType, files[0]?.id);
  for (const duplicate of files.slice(1)) {
    await trashDriveFile(lovableKey, driveKey, duplicate.id).catch((e) => console.warn('Duplicate trash failed:', duplicate.id, e));
  }
  return updated;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const SHEETS_API_KEY = Deno.env.get('GOOGLE_SHEETS_API_KEY');
    const DRIVE_API_KEY = Deno.env.get('GOOGLE_DRIVE_API_KEY');
    if (!LOVABLE_API_KEY || !SHEETS_API_KEY || !DRIVE_API_KEY) {
      return new Response(JSON.stringify({ error: 'Missing connector keys' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
    const { data: claims, error: claimsErr } = await userClient.auth.getClaims(authHeader.replace('Bearer ', ''));
    if (claimsErr || !claims?.claims?.sub) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const userId = claims.claims.sub;

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: roleRow } = await admin.from('user_roles').select('role').eq('user_id', userId).eq('role', 'admin').maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: 'Admin only' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    let options: any = {};
    try { options = await req.json(); } catch { options = {}; }
    const fileBatchSize = Math.max(1, Math.min(Number(options?.fileBatchSize) || DEFAULT_FILE_BATCH_SIZE, MAX_FILE_BATCH_SIZE));

    const fetchAll = async (table: string, cols = '*') => {
      const all: any[] = [];
      const ps = 1000;
      for (let from = 0; ; from += ps) {
        const { data, error } = await admin.from(table as any).select(cols).range(from, from + ps - 1);
        if (error) throw new Error(`Read ${table} failed: ${error.message}`);
        if (!data?.length) break;
        all.push(...data);
        if (data.length < ps) break;
      }
      return all;
    };

    const [wsRows, wkRows, prRows, ctRows, cnRows, dbRows, payRows, cpRows] = await Promise.all([
      fetchAll('workshops', 'id,name'),
      fetchAll('workers', 'id,name,category'),
      fetchAll('profiles', 'user_id,full_name'),
      fetchAll('contractors', 'id,name'),
      fetchAll('contracts', 'id,description,total_amount,contractor_id,workshop_id'),
      fetchAll('debts', 'id,person_name,debt_date,amount,debt_type'),
      fetchAll('payments', 'id,paid_to,amount,payment_date,reason,workshop_id,status,created_by'),
      fetchAll('contractor_payments', 'id,contractor_id,contract_id,workshop_id,amount,payment_date,payment_type,description'),
    ]);

    const workshopMap = new Map(wsRows.map((r: any) => [r.id, r.name || 'Unnamed workshop']));
    const workerMap = new Map(wkRows.map((r: any) => [r.id, r.name || 'Unnamed worker']));
    const userMap = new Map(prRows.map((r: any) => [r.user_id, r.full_name || 'Unnamed team member']));
    const contractorMap = new Map(ctRows.map((r: any) => [r.id, r.name || 'Unnamed contractor']));
    const paymentMap = new Map(payRows.map((r: any) => [r.id, `${cleanText(r.paid_to || 'Payment')} · ${formatAmount(r.amount)} · ${r.payment_date || ''}`]));
    const debtMap = new Map(dbRows.map((r: any) => [r.id, `${cleanText(r.person_name || 'Debt')} · ${cleanText(r.debt_type || '')} · ${formatAmount(r.amount)} · ${r.debt_date || ''}`]));
    const contractMap = new Map(cnRows.map((r: any) => [
      r.id,
      `${contractorMap.get(r.contractor_id) || 'Contractor'} · ${workshopMap.get(r.workshop_id) || 'Workshop'} · ${cleanText(r.description || (r.total_amount ? formatAmount(r.total_amount) : 'Contract'))}`,
    ]));
    const contractorPaymentMap = new Map(cpRows.map((r: any) => [
      r.id,
      `${contractorMap.get(r.contractor_id) || 'Contractor'} · ${cleanText(r.payment_type || 'Payment')} · ${formatAmount(r.amount)} · ${r.payment_date || ''}`,
    ]));

    const resolveValue = (val: any, resolver?: Resolver): string => {
      if (val === null || val === undefined || val === '') return '';
      if (!resolver) return typeof val === 'object' ? JSON.stringify(val) : cleanText(String(val));
      const lookup = resolver === 'workshop' ? workshopMap
        : resolver === 'worker' ? workerMap
        : resolver === 'user' ? userMap
        : resolver === 'contractor' ? contractorMap
        : resolver === 'contract' ? contractMap
        : resolver === 'debt' ? debtMap
        : resolver === 'payment' ? paymentMap
        : resolver === 'contractorPayment' ? contractorPaymentMap
        : null;
      return cleanText(String(lookup?.get(String(val)) || `Unknown ${resolver}`));
    };

    const formatCell = (v: any): string | number => {
      if (v === null || v === undefined) return '';
      if (typeof v === 'boolean') return v ? 'Yes' : 'No';
      if (typeof v === 'number') return v;
      if (typeof v === 'object') return cleanText(JSON.stringify(v));
      const text = cleanText(String(v));
      const numeric = Number(text);
      return text !== '' && Number.isFinite(numeric) && /^-?\d+(\.\d+)?$/.test(text) ? numeric : text;
    };

    const { data: setting } = await admin.from('app_settings').select('value').eq('key', 'master_spreadsheet_id').maybeSingle();
    let spreadsheetId = setting?.value || null;

    if (spreadsheetId) {
      const check = await fetch(`${SHEETS_GW}/spreadsheets/${spreadsheetId}?fields=spreadsheetId`, { headers: gwHeaders(LOVABLE_API_KEY, SHEETS_API_KEY) });
      if (!check.ok) spreadsheetId = null;
    }

    if (!spreadsheetId) {
      const createRes = await fetch(`${SHEETS_GW}/spreadsheets`, {
        method: 'POST',
        headers: gwHeaders(LOVABLE_API_KEY, SHEETS_API_KEY),
        body: JSON.stringify({ properties: { title: SPREADSHEET_NAME }, sheets: allSheetTitles.map((title) => ({ properties: { title } })) }),
      });
      if (!createRes.ok) throw new Error(`Create spreadsheet failed: ${createRes.status} ${await createRes.text()}`);
      const created = await createRes.json();
      spreadsheetId = created.spreadsheetId;
      await admin.from('app_settings').upsert({ key: 'master_spreadsheet_id', value: spreadsheetId, updated_by: userId, updated_at: new Date().toISOString() });
    }

    const metaRes = await fetch(`${SHEETS_GW}/spreadsheets/${spreadsheetId}?fields=sheets.properties`, { headers: gwHeaders(LOVABLE_API_KEY, SHEETS_API_KEY) });
    if (!metaRes.ok) throw new Error(`Read spreadsheet metadata failed: ${metaRes.status} ${await metaRes.text()}`);
    let meta = await metaRes.json();
    const existing = new Set<string>((meta.sheets || []).map((s: any) => s.properties.title));
    const legacyDashboard = (meta.sheets || []).find((s: any) => s.properties.title === LEGACY_DASHBOARD_SHEET);
    if (!existing.has(DASHBOARD_SHEET) && legacyDashboard) {
      const renameRes = await fetch(`${SHEETS_GW}/spreadsheets/${spreadsheetId}:batchUpdate`, {
        method: 'POST',
        headers: gwHeaders(LOVABLE_API_KEY, SHEETS_API_KEY),
        body: JSON.stringify({ requests: [{ updateSheetProperties: { properties: { sheetId: legacyDashboard.properties.sheetId, title: DASHBOARD_SHEET, index: 0 }, fields: 'title,index' } }] }),
      });
      if (!renameRes.ok) throw new Error(`Rename dashboard sheet failed: ${renameRes.status} ${await renameRes.text()}`);
      meta = await fetch(`${SHEETS_GW}/spreadsheets/${spreadsheetId}?fields=sheets.properties`, { headers: gwHeaders(LOVABLE_API_KEY, SHEETS_API_KEY) }).then((r) => r.json());
      existing.clear();
      (meta.sheets || []).forEach((s: any) => existing.add(s.properties.title));
    }
    for (const title of allSheetTitles) {
      if (existing.has(title)) continue;
      const addRes = await fetch(`${SHEETS_GW}/spreadsheets/${spreadsheetId}:batchUpdate`, {
        method: 'POST',
        headers: gwHeaders(LOVABLE_API_KEY, SHEETS_API_KEY),
        body: JSON.stringify({ requests: [{ addSheet: { properties: { title } } }] }),
      });
      if (!addRes.ok) {
        const body = await addRes.text();
        if (!body.includes('already exists')) throw new Error(`Add missing sheet "${title}" failed: ${addRes.status} ${body}`);
      }
      existing.add(title);
    }
    meta = await fetch(`${SHEETS_GW}/spreadsheets/${spreadsheetId}?fields=sheets.properties`, { headers: gwHeaders(LOVABLE_API_KEY, SHEETS_API_KEY) }).then((r) => r.json());
    const sheetIds = new Map<string, number>((meta.sheets || []).map((s: any) => [s.properties.title, s.properties.sheetId]));

    let folderId: string | null = null;
    const { data: folderSetting } = await admin.from('app_settings').select('value').eq('key', 'master_drive_folder_id').maybeSingle();
    folderId = folderSetting?.value || null;
    if (folderId) {
      const c = await fetch(`${DRIVE_GW}/files/${folderId}?fields=id,trashed`, { headers: driveHeaders(LOVABLE_API_KEY, DRIVE_API_KEY, false) });
      if (!c.ok || (await c.json()).trashed) folderId = null;
    }
    if (!folderId) {
      folderId = await findOrCreateFolder('Workshop_Files', null, LOVABLE_API_KEY, DRIVE_API_KEY);
      await admin.from('app_settings').upsert({ key: 'master_drive_folder_id', value: folderId, updated_by: userId, updated_at: new Date().toISOString() });
    }

    const tablesExported: Record<string, number> = {};
    const formattingRequests: any[] = [];
    const clearRanges: string[] = [];
    const valueUpdates: { range: string; values: any[][] }[] = [];

    for (const spec of TABLE_SPECS) {
      const rows = await fetchAll(spec.table, '*');
      const headers = spec.columns.map((c) => c.label);
      const values = rows.map((r) => spec.columns.map((c) => c.resolve ? resolveValue(r[c.key], c.resolve) : formatCell(r[c.key])));
      clearRanges.push(rangeA1(spec.sheet, 'A:ZZ'));
      valueUpdates.push({ range: rangeA1(spec.sheet, 'A1'), values: [headers, ...values] });
      tablesExported[spec.sheet] = rows.length;

      const sheetId = sheetIds.get(spec.sheet);
      if (sheetId !== undefined) {
        formattingRequests.push(
          { updateSheetProperties: { properties: { sheetId, gridProperties: { frozenRowCount: 1 } }, fields: 'gridProperties.frozenRowCount' } },
          { repeatCell: { range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: headers.length }, cell: { userEnteredFormat: { backgroundColor: { red: 0.05, green: 0.12, blue: 0.18 }, textFormat: { foregroundColor: { red: 1, green: 1, blue: 1 }, bold: true }, horizontalAlignment: 'CENTER', wrapStrategy: 'WRAP' } }, fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,wrapStrategy)' } },
          { setBasicFilter: { filter: { range: { sheetId, startRowIndex: 0, endRowIndex: Math.max(rows.length + 1, 2), startColumnIndex: 0, endColumnIndex: headers.length } } } },
          { autoResizeDimensions: { dimensions: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: headers.length } } },
        );
        spec.columns.forEach((column, index) => {
          if (column.type === 'amount') {
            formattingRequests.push({ repeatCell: { range: { sheetId, startRowIndex: 1, startColumnIndex: index, endColumnIndex: index + 1 }, cell: { userEnteredFormat: { numberFormat: { type: 'NUMBER', pattern: '#,##0' } } }, fields: 'userEnteredFormat.numberFormat' } });
          }
        });
      }
    }

    const dashboardValues = buildDashboardValues(wsRows.map((w: any) => w.name).filter(Boolean));
    clearRanges.push(rangeA1(DASHBOARD_SHEET, 'A:Z'));
    valueUpdates.push({ range: rangeA1(DASHBOARD_SHEET, 'A1'), values: dashboardValues });

    const clearRes = await fetch(`${SHEETS_GW}/spreadsheets/${spreadsheetId}/values:batchClear`, {
      method: 'POST',
      headers: gwHeaders(LOVABLE_API_KEY, SHEETS_API_KEY),
      body: JSON.stringify({ ranges: clearRanges }),
    });
    if (!clearRes.ok) throw new Error(`Clear spreadsheet failed: ${clearRes.status} ${await clearRes.text()}`);

    const writeRes = await fetch(`${SHEETS_GW}/spreadsheets/${spreadsheetId}/values:batchUpdate`, {
      method: 'POST',
      headers: gwHeaders(LOVABLE_API_KEY, SHEETS_API_KEY),
      body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data: valueUpdates }),
    });
    if (!writeRes.ok) throw new Error(`Write spreadsheet failed: ${writeRes.status} ${await writeRes.text()}`);

    const dashId = sheetIds.get(DASHBOARD_SHEET);
    if (dashId !== undefined) {
      formattingRequests.push(
        { updateSheetProperties: { properties: { sheetId: dashId, index: 0, gridProperties: { frozenRowCount: 4, hideGridlines: true } }, fields: 'index,gridProperties.frozenRowCount,gridProperties.hideGridlines' } },
        { repeatCell: { range: { sheetId: dashId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 10 }, cell: { userEnteredFormat: { backgroundColor: { red: 0.03, green: 0.09, blue: 0.13 }, textFormat: { foregroundColor: { red: 1, green: 1, blue: 1 }, bold: true, fontSize: 18 }, horizontalAlignment: 'CENTER' } }, fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)' } },
        { repeatCell: { range: { sheetId: dashId, startRowIndex: 3, endRowIndex: 4, startColumnIndex: 0, endColumnIndex: 10 }, cell: { userEnteredFormat: { backgroundColor: { red: 0.86, green: 0.93, blue: 0.97 }, textFormat: { bold: true }, horizontalAlignment: 'CENTER' } }, fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)' } },
        { repeatCell: { range: { sheetId: dashId, startRowIndex: 4, startColumnIndex: 1, endColumnIndex: 10 }, cell: { userEnteredFormat: { numberFormat: { type: 'NUMBER', pattern: '#,##0' } } }, fields: 'userEnteredFormat.numberFormat' } },
        { autoResizeDimensions: { dimensions: { sheetId: dashId, dimension: 'COLUMNS', startIndex: 0, endIndex: 10 } } },
      );
    }

    if (formattingRequests.length) {
      const fmtRes = await fetch(`${SHEETS_GW}/spreadsheets/${spreadsheetId}:batchUpdate`, {
        method: 'POST',
        headers: gwHeaders(LOVABLE_API_KEY, SHEETS_API_KEY),
        body: JSON.stringify({ requests: formattingRequests }),
      });
      if (!fmtRes.ok) console.error('Spreadsheet formatting failed:', await fmtRes.text());
    }

    const workshopFiles = await fetchAll('workshop_files', 'id,workshop_id,file_name,file_path,file_type,payment_id,income_id,created_at');
    const existingStoragePaths = new Set<string>();
    for (const file of workshopFiles) {
      const path = String(file.file_path || '');
      const slashIndex = path.lastIndexOf('/');
      if (slashIndex <= 0) continue;
      const folder = path.slice(0, slashIndex);
      const name = path.slice(slashIndex + 1);
      if (!folder || !name) continue;
      const { data: objects } = await admin.storage.from('workshop-files').list(folder, { search: name, limit: 100 });
      if (objects?.some((object: any) => object.name === name)) existingStoragePaths.add(path);
    }
    const folderCache = new Map<string, string>();
    let filesMirrored = 0;
    let filesSkipped = 0;
    const uploadOneFile = async (file: any) => {
      if (!existingStoragePaths.has(file.file_path)) throw new Error('Storage file is missing');
      const workshopName = safeDriveName(workshopMap.get(file.workshop_id) || 'Unknown Workshop');
      let workshopFolderId = folderCache.get(workshopName);
      if (!workshopFolderId) {
        workshopFolderId = await findOrCreateFolder(workshopName, folderId, LOVABLE_API_KEY, DRIVE_API_KEY);
        folderCache.set(workshopName, workshopFolderId);
      }
      const category = fileDriveCategory(file);
      const categoryCacheKey = `${workshopName}/${category}`;
      let categoryFolderId = folderCache.get(categoryCacheKey);
      if (!categoryFolderId) {
        categoryFolderId = await findOrCreateFolder(category, workshopFolderId, LOVABLE_API_KEY, DRIVE_API_KEY);
        folderCache.set(categoryCacheKey, categoryFolderId);
      }
      const { data: blob, error: dlErr } = await admin.storage.from('workshop-files').download(file.file_path);
      if (dlErr || !blob) throw new Error(dlErr?.message || 'Storage file not found');
      await replaceDriveFile(LOVABLE_API_KEY, DRIVE_API_KEY, categoryFolderId, driveFileName(file), blob, file.file_type || 'application/octet-stream');
    };

    for (let i = 0; i < workshopFiles.length; i += fileBatchSize) {
      const batch = workshopFiles.slice(i, i + fileBatchSize);
      const results = await Promise.allSettled(batch.map(uploadOneFile));
      results.forEach((result, index) => {
        const file = batch[index];
        if (result.status === 'fulfilled') {
          filesMirrored += 1;
        } else {
          filesSkipped += 1;
          console.warn('Drive mirror skipped:', file.file_path, result.reason instanceof Error ? result.reason.message : String(result.reason));
        }
      });
    }

    if (filesSkipped > 0) {
      return new Response(JSON.stringify({
        success: false,
        error: `Sync incomplete: ${filesSkipped} file record${filesSkipped === 1 ? '' : 's'} could not be uploaded because the stored file is missing or unavailable. Re-upload or delete those file records, then sync again.`,
        spreadsheetId,
        spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
        folderId,
        folderUrl: folderId ? `https://drive.google.com/drive/folders/${folderId}` : null,
        tablesExported,
        filesMirrored,
        filesSkipped,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({
      success: true,
      spreadsheetId,
      spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
      folderId,
      folderUrl: folderId ? `https://drive.google.com/drive/folders/${folderId}` : null,
      tablesExported,
      filesMirrored,
      filesSkipped,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('sync-google-sheets error:', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});

function buildDashboardValues(workshopNames: string[]) {
  const updatedAt = new Date().toLocaleString('fr-FR');
  const rows: any[][] = [
    ['Workshop Master Database', '', '', '', '', '', '', ''],
    ['Last Sync', updatedAt, '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', ''],
    ['Metric', 'Value', '', 'Quick Counts', 'Value', '', 'Top Paid To', 'Total'],
    ['Total Income', '=SUM(Income!C:C)', '', 'Workshops', '=COUNTA(Workshops!A2:A)', '', '=QUERY(Payments!C:D,"select C, sum(D) where C is not null group by C order by sum(D) desc label C \'Paid To\', sum(D) \'Total\'",1)', ''],
    ['Approved Payments', '=SUMIF(Payments!G:G,"approved",Payments!D:D)', '', 'Team Members', '=COUNTA(\'Team Members\'!A2:A)', '', '', ''],
    ['Pending Payments', '=SUMIF(Payments!G:G,"pending",Payments!D:D)', '', 'Workers', '=COUNTA(Workers!A2:A)', '', '', ''],
    ['Rejected Payments', '=SUMIF(Payments!G:G,"rejected",Payments!D:D)', '', 'Contractors', '=COUNTA(Contractors!A2:A)', '', '', ''],
    ['Current Balance', '=B5-B6', '', 'Uploaded Files', '=COUNTA(\'Workshop Files\'!C2:C)', '', '', ''],
    ['Contractor Payments', '=SUM(\'Contractor Payments\'!E:E)', '', 'Open Debts', '=COUNTIF(Debts!G:G,"No")', '', '', ''],
    ['Personal Payments', '=SUM(\'Personal Payments\'!D:D)', '', '', '', '', '', ''],
    ['Debt Total', '=SUM(Debts!C:C)', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', ''],
    ['Workshop Summary', '', '', '', '', '', '', ''],
    ['Workshop', 'Income', 'Approved Payments', 'Balance', 'Files', '', '', ''],
  ];

  workshopNames.forEach((name, idx) => {
    const rowNumber = 16 + idx;
    rows.push([
      name,
      `=SUMIF(Income!B:B,A${rowNumber},Income!C:C)`,
      `=SUMIFS(Payments!D:D,Payments!B:B,A${rowNumber},Payments!G:G,"approved")`,
      `=B${rowNumber}-C${rowNumber}`,
      `=COUNTIF('Workshop Files'!B:B,A${rowNumber})`,
      '', '', '',
    ]);
  });

  return rows;
}
