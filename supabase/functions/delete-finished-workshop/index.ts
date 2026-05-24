import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const ps = 1000;

async function buildPreview(admin: any, workshopId: string) {
  const c = async (table: string, filter?: (q: any) => any) => {
    let q = admin.from(table).select('*', { count: 'exact', head: true }).eq('workshop_id', workshopId);
    if (filter) q = filter(q);
    const { count } = await q;
    return count || 0;
  };
  const [att, attUnpaid, adj, adjUnpaid, pay, payPending, inc, cp, ut, wf, contracts] = await Promise.all([
    c('attendance', (q) => q.eq('is_paid', true)),
    c('attendance', (q) => q.eq('is_paid', false)),
    c('worker_adjustments', (q) => q.eq('is_paid', true)),
    c('worker_adjustments', (q) => q.eq('is_paid', false)),
    c('payments', (q) => q.neq('status', 'pending')),
    c('payments', (q) => q.eq('status', 'pending')),
    c('income'),
    c('contractor_payments'),
    c('user_transfers'),
    c('workshop_files'),
    c('contracts'),
  ]);
  const { data: cpRows } = await admin.from('contractor_payments').select('id').eq('workshop_id', workshopId);
  const cpIds = (cpRows || []).map((r: any) => r.id);
  let cbp = 0;
  if (cpIds.length) {
    const { count } = await admin.from('contractor_budget_purchases').select('*', { count: 'exact', head: true }).in('contractor_payment_id', cpIds);
    cbp = count || 0;
  }
  return {
    toDelete: { attendance: att, worker_adjustments: adj, payments: pay, income: inc, contractor_payments: cp, contractor_budget_purchases: cbp, user_transfers: ut, workshop_files: wf, contracts },
    toKeep: { attendance_unpaid: attUnpaid, worker_adjustments_unpaid: adjUnpaid, payments_pending: payPending },
    masterDataPreserved: ['workers', 'contractors', 'profiles', 'user_roles', 'workshop_assignments', 'workshops (archived)', 'app_settings'],
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
    const archiveId: string | undefined = body?.archiveId;
    const dryRun: boolean = body?.dryRun === true;
    if (!archiveId) return new Response(JSON.stringify({ error: 'archiveId required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const { data: arch } = await admin.from('finished_workshop_archives').select('*').eq('id', archiveId).maybeSingle();
    if (!arch) return new Response(JSON.stringify({ error: 'Archive not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    if (!arch.backup_verified) return new Response(JSON.stringify({ error: 'Backup not verified; deletion blocked' }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    if (arch.deleted_from_database) return new Response(JSON.stringify({ error: 'Already deleted' }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const workshopId = arch.workshop_id;
    const preview = await buildPreview(admin, workshopId);
    if (dryRun) return new Response(JSON.stringify({ success: true, preview, workshop: { id: workshopId, name: arch.workshop_name }, driveLinks: arch.spreadsheet_urls, finalTotals: arch.final_totals, verificationPassed: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const deleted: Record<string, number> = {};
    let storageDeleted = 0;

    // workshop_files storage + db
    const { data: files } = await admin.from('workshop_files').select('id,file_path').eq('workshop_id', workshopId);
    const filePaths = (files || []).map((f: any) => f.file_path).filter(Boolean);
    const fileIds = (files || []).map((f: any) => f.id);
    for (let i = 0; i < filePaths.length; i += 100) {
      const chunk = filePaths.slice(i, i + 100);
      const { error } = await admin.storage.from('workshop-files').remove(chunk);
      if (!error) storageDeleted += chunk.length;
    }
    if (fileIds.length) {
      await admin.from('workshop_files').delete().in('id', fileIds);
      deleted['workshop_files'] = fileIds.length;
    }

    const del = async (table: string, filter?: (q: any) => any) => {
      let q = admin.from(table).delete().eq('workshop_id', workshopId);
      if (filter) q = filter(q);
      const { data, error } = await q.select('id');
      if (error) { deleted[table] = -1; console.warn(`del ${table}:`, error.message); return; }
      deleted[table] = data?.length || 0;
    };

    // contractor_budget_purchases via parent contractor_payments
    const { data: cpRows } = await admin.from('contractor_payments').select('id').eq('workshop_id', workshopId);
    const cpIds = (cpRows || []).map((r: any) => r.id);
    if (cpIds.length) {
      const { data, error } = await admin.from('contractor_budget_purchases').delete().in('contractor_payment_id', cpIds).select('id');
      if (!error) deleted['contractor_budget_purchases'] = data?.length || 0;
    }
    await del('contractor_payments');
    await del('worker_adjustments', (q) => q.eq('is_paid', true));
    await del('attendance', (q) => q.eq('is_paid', true));
    await del('user_transfers');
    await del('payments', (q) => q.neq('status', 'pending'));
    await del('income');
    await del('contracts');

    // Mark archive deleted and workshop archived
    await admin.from('finished_workshop_archives').update({ deleted_from_database: true, deleted_at: new Date().toISOString() }).eq('id', archiveId);
    await admin.from('workshops').update({ status: 'archived' }).eq('id', workshopId);

    return new Response(JSON.stringify({ success: true, deleted, storageDeleted }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('delete-finished-workshop error:', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
