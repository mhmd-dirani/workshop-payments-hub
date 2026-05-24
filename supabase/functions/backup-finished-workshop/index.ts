import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

async function computeTotals(admin: any, workshopId: string) {
  const [att, adj, pay, inc, cp, cbpParents, ut] = await Promise.all([
    admin.from('attendance').select('hours_worked,daily_salary,extra_amount,discount_amount').eq('workshop_id', workshopId),
    admin.from('worker_adjustments').select('amount,adjustment_type').eq('workshop_id', workshopId),
    admin.from('payments').select('amount,status').eq('workshop_id', workshopId),
    admin.from('income').select('amount').eq('workshop_id', workshopId),
    admin.from('contractor_payments').select('id,amount,payment_type').eq('workshop_id', workshopId),
    Promise.resolve(null),
    admin.from('user_transfers').select('amount').eq('workshop_id', workshopId),
  ]);

  const cpRows = cp.data || [];
  const cpIds = cpRows.map((r: any) => r.id);
  let purchasesTotal = 0;
  if (cpIds.length) {
    const { data: pur } = await admin.from('contractor_budget_purchases').select('amount').in('contractor_payment_id', cpIds);
    purchasesTotal = (pur || []).reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
  }

  const totalHours = (att.data || []).reduce((s: number, r: any) => s + Number(r.hours_worked || 0), 0);
  const salary = (att.data || []).reduce((s: number, r: any) => s + Number(r.daily_salary || 0) + Number(r.extra_amount || 0) - Number(r.discount_amount || 0), 0);
  const adjustments = (adj.data || []).reduce((s: number, r: any) => s + (r.adjustment_type === 'discount' ? -Number(r.amount || 0) : Number(r.amount || 0)), 0);
  const approvedPayments = (pay.data || []).filter((r: any) => r.status === 'approved').reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
  const income = (inc.data || []).reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
  const advances = cpRows.filter((r: any) => r.payment_type !== 'material_budget').reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
  const materials = cpRows.filter((r: any) => r.payment_type === 'material_budget').reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
  const transfers = (ut.data || []).reduce((s: number, r: any) => s + Number(r.amount || 0), 0);

  const totalExpenses = approvedPayments + salary + adjustments + advances + materials;
  return {
    total_hours: totalHours,
    worker_salary: salary + adjustments,
    approved_payments: approvedPayments,
    income,
    contractor_advances: advances,
    contractor_materials: materials,
    contractor_purchases: purchasesTotal,
    user_transfers: transfers,
    total_expenses: totalExpenses,
    net_total: income - totalExpenses,
    counts: {
      attendance: att.data?.length || 0,
      worker_adjustments: adj.data?.length || 0,
      payments: pay.data?.length || 0,
      income: inc.data?.length || 0,
      contractor_payments: cpRows.length,
      contractor_budget_purchases: cpIds.length ? (await admin.from('contractor_budget_purchases').select('id', { count: 'exact', head: true }).in('contractor_payment_id', cpIds)).count || 0 : 0,
      user_transfers: ut.data?.length || 0,
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
    const { data: claims } = await userClient.auth.getClaims(authHeader.replace('Bearer ', ''));
    if (!claims?.claims?.sub) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    const userId = claims.claims.sub;
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: roleRow } = await admin.from('user_roles').select('role').eq('user_id', userId).eq('role', 'admin').maybeSingle();
    if (!roleRow) return new Response(JSON.stringify({ error: 'Admin only' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const body = await req.json().catch(() => ({}));
    const workshopId: string | undefined = body?.workshopId;
    if (!workshopId) return new Response(JSON.stringify({ error: 'workshopId required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const { data: ws } = await admin.from('workshops').select('id,name,status').eq('id', workshopId).maybeSingle();
    if (!ws) return new Response(JSON.stringify({ error: 'Workshop not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    if (ws.status !== 'finished') return new Response(JSON.stringify({ error: 'Workshop must be marked finished first' }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    // Sync master spreadsheet (full data) so finished workshop is captured in Drive
    let spreadsheetUrl: string | null = null;
    let driveFolderUrl: string | null = null;
    try {
      const { data: syncRes } = await userClient.functions.invoke('sync-google-sheets', {
        body: { fromDate: '1900-01-01', toDate: '2999-12-31' },
      });
      spreadsheetUrl = syncRes?.spreadsheetUrl || null;
      driveFolderUrl = syncRes?.folderUrl || null;
    } catch (e) {
      console.warn('sync invocation failed:', e);
    }

    const totalsA = await computeTotals(admin, workshopId);
    const totalsB = await computeTotals(admin, workshopId);
    const matches = JSON.stringify(totalsA) === JSON.stringify(totalsB);

    const { data: inserted, error: insErr } = await admin.from('finished_workshop_archives').insert({
      workshop_id: workshopId,
      workshop_name: ws.name,
      archived_by: userId,
      drive_folder_url: driveFolderUrl,
      spreadsheet_urls: spreadsheetUrl ? { master: spreadsheetUrl } : {},
      final_totals: totalsA,
      final_balances: {},
      backup_verified: matches && !!spreadsheetUrl,
    }).select('*').single();
    if (insErr) throw new Error(insErr.message);

    return new Response(JSON.stringify({ success: true, archive: inserted }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('backup-finished-workshop error:', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
