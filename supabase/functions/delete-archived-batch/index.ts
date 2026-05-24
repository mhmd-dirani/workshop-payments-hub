import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const ps = 1000;

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

    const from = batch.from_date as string;
    const to = batch.to_date as string;
    const deleted: Record<string, number> = {};
    let storageDeleted = 0;

    // 1. workshop_files (storage + db) by created_at range
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

    // Helper: safe delete with optional extra filter
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

    // Order: child tables first
    await safeDel('contractor_budget_purchases', 'purchase_date');
    await safeDel('contractor_payments', 'payment_date');
    await safeDel('debt_payments', 'payment_date');
    // Only delete settled debts in range
    await safeDel('debts', 'debt_date', (q) => q.eq('is_settled', true));
    await safeDel('worker_adjustments', 'work_date', (q) => q.eq('is_paid', true));
    // attendance: only is_paid=true AND no pending payment links
    await safeDel('attendance', 'work_date', (q) => q.eq('is_paid', true));
    await safeDel('user_transfers', 'transfer_date');
    await safeDel('team_transfers', 'transfer_date');
    await safeDel('personal_payments', 'payment_date');
    // payments: skip pending
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