import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const ps = 1000;

async function countRows(admin: any, table: string, dateCol: string, from: string, to: string, extra?: (q: any) => any): Promise<number> {
  let q = admin.from(table).select('*', { count: 'exact', head: true }).gte(dateCol, from).lte(dateCol, to);
  if (extra) q = extra(q);
  const { count, error } = await q;
  if (error) { console.warn(`count ${table}:`, error.message); return 0; }
  return count || 0;
}

async function buildPreview(admin: any, batch: any) {
  const from = batch.from_date as string;
  const to = batch.to_date as string;

  const [
    attDelete, attKeep,
    adjDelete, adjKeep,
    payDelete, payKeep,
    debtsDelete, debtsKeep,
    debtPay,
    incomeRows, holidaysRows,
    cpRows, cbpRows,
    utRows, ttRows, ppRows,
    wfRows,
  ] = await Promise.all([
    countRows(admin, 'attendance', 'work_date', from, to, (q) => q.eq('is_paid', true)),
    countRows(admin, 'attendance', 'work_date', from, to, (q) => q.eq('is_paid', false)),
    countRows(admin, 'worker_adjustments', 'work_date', from, to, (q) => q.eq('is_paid', true)),
    countRows(admin, 'worker_adjustments', 'work_date', from, to, (q) => q.eq('is_paid', false)),
    countRows(admin, 'payments', 'payment_date', from, to, (q) => q.neq('status', 'pending')),
    countRows(admin, 'payments', 'payment_date', from, to, (q) => q.eq('status', 'pending')),
    countRows(admin, 'debts', 'debt_date', from, to, (q) => q.eq('is_settled', true)),
    countRows(admin, 'debts', 'debt_date', from, to, (q) => q.eq('is_settled', false)),
    countRows(admin, 'debt_payments', 'payment_date', from, to),
    countRows(admin, 'income', 'income_date', from, to),
    countRows(admin, 'holidays', 'holiday_date', from, to),
    countRows(admin, 'contractor_payments', 'payment_date', from, to),
    countRows(admin, 'contractor_budget_purchases', 'purchase_date', from, to),
    countRows(admin, 'user_transfers', 'transfer_date', from, to),
    countRows(admin, 'team_transfers', 'transfer_date', from, to),
    countRows(admin, 'personal_payments', 'payment_date', from, to),
    admin.from('workshop_files').select('*', { count: 'exact', head: true })
      .gte('created_at', `${from}T00:00:00`).lte('created_at', `${to}T23:59:59.999`).then((r: any) => r.count || 0),
  ]);

  const [{ data: ws }, { data: wk }, { data: cn }, { data: ub }] = await Promise.all([
    admin.from('workshop_archive_summaries').select('*').eq('batch_id', batch.id),
    admin.from('worker_archive_summaries').select('*').eq('batch_id', batch.id),
    admin.from('contractor_archive_summaries').select('*').eq('batch_id', batch.id),
    admin.from('user_balance_archive_summaries').select('*').eq('batch_id', batch.id),
  ]);
  const sum = (rows: any[], k: string) => (rows || []).reduce((a, r) => a + Number(r[k] || 0), 0);
  const preservedTotals = {
    workshop_income: sum(ws || [], 'total_income'),
    workshop_approved_payments: sum(ws || [], 'total_approved_payments'),
    worker_salaries: sum(ws || [], 'total_worker_salaries'),
    contractor_advances: sum(ws || [], 'total_contractor_advances'),
    contractor_materials: sum(ws || [], 'total_contractor_materials'),
    net_total: sum(ws || [], 'net_total'),
    workshop_summaries: ws?.length || 0,
    worker_summaries: wk?.length || 0,
    contractor_summaries: cn?.length || 0,
    user_balance_summaries: ub?.length || 0,
  };

  const hasSummaries = (ws?.length || 0) + (wk?.length || 0) + (cn?.length || 0) + (ub?.length || 0) > 0;
  const verificationPassed = batch.status === 'verified' && !!batch.totals_verified_at && hasSummaries;

  return {
    toDelete: {
      attendance: attDelete,
      worker_adjustments: adjDelete,
      payments: payDelete,
      debts: debtsDelete,
      debt_payments: debtPay,
      income: incomeRows,
      holidays: holidaysRows,
      contractor_payments: cpRows,
      contractor_budget_purchases: cbpRows,
      user_transfers: utRows,
      team_transfers: ttRows,
      personal_payments: ppRows,
      workshop_files: wfRows,
    },
    toKeep: {
      attendance_unpaid: attKeep,
      worker_adjustments_unpaid: adjKeep,
      payments_pending: payKeep,
      debts_open: debtsKeep,
    },
    masterDataPreserved: ['workers', 'contractors', 'profiles', 'user_roles', 'workshop_assignments', 'workshops', 'app_settings'],
    preservedTotals,
    driveLinks: {
      spreadsheetUrl: batch.spreadsheet_url,
      driveFolderUrl: batch.drive_folder_url,
    },
    verificationPassed,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
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

    const body = await req.json().catch(() => ({}));
    const batchId: string | undefined = body?.batchId;
    const dryRun: boolean = body?.dryRun === true;
    if (!batchId) {
      return new Response(JSON.stringify({ error: 'batchId required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: batch, error: bErr } = await admin.from('archive_batches').select('*').eq('id', batchId).maybeSingle();
    if (bErr || !batch) {
      return new Response(JSON.stringify({ error: 'Batch not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (batch.status !== 'verified') {
      return new Response(JSON.stringify({ error: `Batch must be verified before deletion (status=${batch.status})` }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (dryRun) {
      const preview = await buildPreview(admin, batch);
      return new Response(JSON.stringify({ success: true, preview }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const preview = await buildPreview(admin, batch);
    if (!preview.verificationPassed) {
      return new Response(JSON.stringify({ error: 'Verification failed: snapshot totals not persisted. Deletion blocked.', preview }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const from = batch.from_date as string;
    const to = batch.to_date as string;
    const deleted: Record<string, number> = {};
    let storageDeleted = 0;

    // workshop_files (storage + db)
    const filePaths: string[] = [];
    const fileIds: string[] = [];
    for (let off = 0; ; off += ps) {
      const { data, error } = await admin.from('workshop_files')
        .select('id,file_path')
        .gte('created_at', `${from}T00:00:00`)
        .lte('created_at', `${to}T23:59:59.999`)
        .range(off, off + ps - 1);
      if (error) throw new Error(`Read workshop_files: ${error.message}`);
      if (!data?.length) break;
      data.forEach((d: any) => { fileIds.push(d.id); if (d.file_path) filePaths.push(d.file_path); });
      if (data.length < ps) break;
    }
    for (let i = 0; i < filePaths.length; i += 100) {
      const chunk = filePaths.slice(i, i + 100);
      const { error } = await admin.storage.from('workshop-files').remove(chunk);
      if (!error) storageDeleted += chunk.length;
    }
    if (fileIds.length) {
      const { error } = await admin.from('workshop_files').delete().in('id', fileIds);
      if (error) throw new Error(`Delete workshop_files: ${error.message}`);
      deleted['workshop_files'] = fileIds.length;
    }

    const safeDel = async (table: string, dateCol: string, filter?: (q: any) => any) => {
      let q = admin.from(table).delete().gte(dateCol, from).lte(dateCol, to);
      if (filter) q = filter(q);
      const { data, error } = await q.select('id');
      if (error) {
        deleted[table] = -1;
        console.warn(`Delete ${table} failed:`, error.message);
        return;
      }
      deleted[table] = data?.length || 0;
    };

    await safeDel('contractor_budget_purchases', 'purchase_date');
    await safeDel('contractor_payments', 'payment_date');
    await safeDel('debt_payments', 'payment_date');
    await safeDel('debts', 'debt_date', (q) => q.eq('is_settled', true));
    await safeDel('worker_adjustments', 'work_date', (q) => q.eq('is_paid', true));
    await safeDel('attendance', 'work_date', (q) => q.eq('is_paid', true));
    await safeDel('user_transfers', 'transfer_date');
    await safeDel('team_transfers', 'transfer_date');
    await safeDel('personal_payments', 'payment_date');
    await safeDel('payments', 'payment_date', (q) => q.neq('status', 'pending'));
    await safeDel('income', 'income_date');
    await safeDel('holidays', 'holiday_date');

    await admin.from('archive_batches').update({
      status: 'deleted',
      deleted_at: new Date().toISOString(),
      rows_deleted: { ...deleted, storage_objects: storageDeleted },
    }).eq('id', batchId);

    return new Response(JSON.stringify({ success: true, deleted, storageDeleted }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('delete-archived-batch error:', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
