import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// (table, date column) ordered to avoid blocking foreign references between sets.
const DATED_TABLES: Array<[string, string]> = [
  ['contractor_budget_purchases', 'purchase_date'],
  ['contractor_payments', 'payment_date'],
  ['debt_payments', 'payment_date'],
  ['user_transfers', 'transfer_date'],
  ['team_transfers', 'transfer_date'],
  ['worker_adjustments', 'work_date'],
  ['attendance', 'work_date'],
  ['personal_payments', 'payment_date'],
  ['payments', 'payment_date'],
  ['income', 'income_date'],
  ['debts', 'debt_date'],
  ['holidays', 'holiday_date'],
];

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
    const fromDate: string | undefined = body?.fromDate;
    const toDate: string | undefined = body?.toDate;
    if (!fromDate || !toDate || !/^\d{4}-\d{2}-\d{2}$/.test(fromDate) || !/^\d{4}-\d{2}-\d{2}$/.test(toDate)) {
      return new Response(JSON.stringify({ error: 'fromDate and toDate (YYYY-MM-DD) are required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const deletedCounts: Record<string, number> = {};
    let storageDeleted = 0;

    // Delete workshop_files (storage + db) in range
    const filePaths: string[] = [];
    const fileIds: string[] = [];
    const ps = 1000;
    for (let from = 0; ; from += ps) {
      const { data, error } = await admin
        .from('workshop_files')
        .select('id,file_path')
        .gte('created_at', `${fromDate}T00:00:00`)
        .lte('created_at', `${toDate}T23:59:59.999`)
        .range(from, from + ps - 1);
      if (error) throw new Error(`Read workshop_files failed: ${error.message}`);
      if (!data?.length) break;
      data.forEach((d: any) => { fileIds.push(d.id); if (d.file_path) filePaths.push(d.file_path); });
      if (data.length < ps) break;
    }
    if (filePaths.length) {
      // Remove storage in chunks of 100
      for (let i = 0; i < filePaths.length; i += 100) {
        const chunk = filePaths.slice(i, i + 100);
        const { error } = await admin.storage.from('workshop-files').remove(chunk);
        if (!error) storageDeleted += chunk.length;
      }
    }
    if (fileIds.length) {
      const { error } = await admin.from('workshop_files').delete().in('id', fileIds);
      if (error) throw new Error(`Delete workshop_files failed: ${error.message}`);
      deletedCounts['workshop_files'] = fileIds.length;
    }

    for (const [table, col] of DATED_TABLES) {
      const { data, error } = await admin
        .from(table as any)
        .delete()
        .gte(col, fromDate)
        .lte(col, toDate)
        .select('id');
      if (error) {
        console.warn(`Delete ${table} failed:`, error.message);
        deletedCounts[table] = -1;
        continue;
      }
      deletedCounts[table] = data?.length || 0;
    }

    return new Response(JSON.stringify({ success: true, deletedCounts, storageDeleted, fromDate, toDate }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('archive-synced-data error:', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});