import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function rangeLabel(fromDate: string, toDate: string): string {
  const months = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
  const [fy, fm] = fromDate.split('-').map(Number);
  const [ty, tm] = toDate.split('-').map(Number);
  if (fy === ty && fm === tm) return `${months[fm - 1]}_${fy}`;
  if (fy === ty) return `${months[fm - 1]}_${months[tm - 1]}_${fy}`;
  return `${months[fm - 1]}_${fy}_${months[tm - 1]}_${ty}`;
}

const ps = 1000;
async function fetchAll(admin: any, table: string, select: string, dateCol: string | null, fromDate: string, toDate: string): Promise<any[]> {
  const rows: any[] = [];
  for (let from = 0; ; from += ps) {
    let q = admin.from(table).select(select).order('id').range(from, from + ps - 1);
    if (dateCol) q = q.gte(dateCol, fromDate).lte(dateCol, toDate);
    const { data, error } = await q;
    if (error) throw new Error(`Read ${table} failed: ${error.message}`);
    const page = data || [];
    rows.push(...page);
    if (page.length < ps) break;
  }
  return rows;
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
    const fromDate: string | undefined = body?.fromDate;
    const toDate: string | undefined = body?.toDate;
    const driveFolderUrl: string | null = body?.driveFolderUrl ?? null;
    const spreadsheetUrl: string | null = body?.spreadsheetUrl ?? null;
    if (!fromDate || !toDate || !/^\d{4}-\d{2}-\d{2}$/.test(fromDate) || !/^\d{4}-\d{2}-\d{2}$/.test(toDate) || fromDate > toDate) {
      return new Response(JSON.stringify({ error: 'Invalid date range' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Find overlapping batches. Only 'deleted' batches preserve totals for rows
    // that are gone — those must not be overlapped. 'pending'/'verified' batches
    // just mirror live data, so we replace them with a fresh snapshot.
    const { data: overlaps } = await admin
      .from('archive_batches')
      .select('id, from_date, to_date, status')
      .lte('from_date', toDate)
      .gte('to_date', fromDate);
    const blocking = (overlaps || []).find((b: any) => b.status === 'deleted');
    if (blocking) {
      return new Response(JSON.stringify({ error: `Range overlaps archived batch ${blocking.from_date}..${blocking.to_date}` }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const replaceIds = (overlaps || []).map((b: any) => b.id);
    if (replaceIds.length) {
      await admin.from('workshop_archive_summaries').delete().in('batch_id', replaceIds);
      await admin.from('worker_archive_summaries').delete().in('batch_id', replaceIds);
      await admin.from('contractor_archive_summaries').delete().in('batch_id', replaceIds);
      await admin.from('user_balance_archive_summaries').delete().in('batch_id', replaceIds);
      await admin.from('archive_batches').delete().in('id', replaceIds);
    }

    const label = rangeLabel(fromDate, toDate);

    // Fetch all in-range data
    const [
      attendance, adjustments, payments, income, debts, debtPayments,
      personalPayments, teamTransfers, userTransfers,
      contractorPayments, contractorPurchases, holidays, workshopFiles,
      workshops, workersList, contractorsList,
    ] = await Promise.all([
      fetchAll(admin, 'attendance', 'worker_id,workshop_id,hours_worked,daily_salary,extra_amount,discount_amount,work_date,is_paid', 'work_date', fromDate, toDate),
      fetchAll(admin, 'worker_adjustments', 'worker_id,workshop_id,adjustment_type,amount,work_date,is_paid', 'work_date', fromDate, toDate),
      fetchAll(admin, 'payments', 'workshop_id,amount,status,created_by,payment_date', 'payment_date', fromDate, toDate),
      fetchAll(admin, 'income', 'workshop_id,amount,income_date', 'income_date', fromDate, toDate),
      fetchAll(admin, 'debts', 'amount,debt_date,is_settled,description', 'debt_date', fromDate, toDate),
      fetchAll(admin, 'debt_payments', 'debt_id,amount,payment_date', 'payment_date', fromDate, toDate),
      fetchAll(admin, 'personal_payments', 'user_id,amount,payment_date', 'payment_date', fromDate, toDate),
      fetchAll(admin, 'team_transfers', 'user_id,amount,transfer_date', 'transfer_date', fromDate, toDate),
      fetchAll(admin, 'user_transfers', 'user_id,workshop_id,amount,transfer_date', 'transfer_date', fromDate, toDate),
      fetchAll(admin, 'contractor_payments', 'contractor_id,workshop_id,amount,payment_type,payment_date', 'payment_date', fromDate, toDate),
      fetchAll(admin, 'contractor_budget_purchases', 'contractor_payment_id,amount,purchase_date', 'purchase_date', fromDate, toDate),
      fetchAll(admin, 'holidays', 'holiday_date', 'holiday_date', fromDate, toDate),
      fetchAll(admin, 'workshop_files', 'workshop_id,file_path,created_at', null, fromDate, toDate),
      fetchAll(admin, 'workshops', 'id,name', null, fromDate, toDate),
      fetchAll(admin, 'workers', 'id,name', null, fromDate, toDate),
      fetchAll(admin, 'contractors', 'id,name', null, fromDate, toDate),
    ]);

    const workshopName = new Map<string, string>(workshops.map((w: any) => [w.id, w.name]));
    const workerName = new Map<string, string>(workersList.map((w: any) => [w.id, w.name]));
    const contractorName = new Map<string, string>(contractorsList.map((c: any) => [c.id, c.name]));

    // Build per-workshop summaries
    const wsAgg = new Map<string, any>();
    const ensureWs = (id: string) => {
      if (!id) return null;
      if (!wsAgg.has(id)) wsAgg.set(id, {
        workshop_id: id, workshop_name: workshopName.get(id) || 'Unknown',
        total_income: 0, total_approved_payments: 0, total_worker_salaries: 0, total_worker_hours: 0,
        total_contractor_advances: 0, total_contractor_materials: 0,
        total_debts: 0, total_debt_payments: 0, total_transfers: 0, total_expenses: 0, net_total: 0,
      });
      return wsAgg.get(id);
    };
    for (const a of attendance) {
      const w = ensureWs(a.workshop_id); if (!w) continue;
      w.total_worker_hours += Number(a.hours_worked || 0);
      w.total_worker_salaries += Number(a.daily_salary || 0) + Number(a.extra_amount || 0) - Number(a.discount_amount || 0);
    }
    for (const adj of adjustments) {
      const w = ensureWs(adj.workshop_id); if (!w) continue;
      const amt = Number(adj.amount || 0);
      w.total_worker_salaries += adj.adjustment_type === 'discount' ? -amt : amt;
    }
    for (const p of payments) {
      if (p.status !== 'approved') continue;
      const w = ensureWs(p.workshop_id); if (!w) continue;
      w.total_approved_payments += Number(p.amount || 0);
    }
    for (const i of income) {
      const w = ensureWs(i.workshop_id); if (!w) continue;
      w.total_income += Number(i.amount || 0);
    }
    for (const cp of contractorPayments) {
      const w = ensureWs(cp.workshop_id); if (!w) continue;
      if (cp.payment_type === 'material_budget') w.total_contractor_materials += Number(cp.amount || 0);
      else w.total_contractor_advances += Number(cp.amount || 0);
    }
    for (const t of userTransfers) {
      const w = ensureWs(t.workshop_id); if (!w) continue;
      w.total_transfers += Number(t.amount || 0);
    }
    // Debts/debt_payments aren't workshop-scoped — accumulate as global, attached to a synthetic key handled below.
    for (const w of wsAgg.values()) {
      w.total_expenses = w.total_approved_payments + w.total_worker_salaries + w.total_contractor_advances + w.total_contractor_materials;
      w.net_total = w.total_income - w.total_expenses;
    }

    // Worker summaries
    const workerAgg = new Map<string, any>();
    const ensureWorker = (id: string) => {
      if (!id) return null;
      if (!workerAgg.has(id)) workerAgg.set(id, {
        worker_id: id, worker_name: workerName.get(id) || 'Unknown',
        total_hours: 0, total_salary: 0, total_extra: 0, total_discounts: 0, total_adjustments: 0,
      });
      return workerAgg.get(id);
    };
    for (const a of attendance) {
      const w = ensureWorker(a.worker_id); if (!w) continue;
      w.total_hours += Number(a.hours_worked || 0);
      w.total_salary += Number(a.daily_salary || 0);
      w.total_extra += Number(a.extra_amount || 0);
      w.total_discounts += Number(a.discount_amount || 0);
    }
    for (const adj of adjustments) {
      const w = ensureWorker(adj.worker_id); if (!w) continue;
      const amt = Number(adj.amount || 0);
      w.total_adjustments += adj.adjustment_type === 'discount' ? -amt : amt;
    }

    // Contractor summaries
    const conAgg = new Map<string, any>();
    const ensureCon = (id: string) => {
      if (!id) return null;
      if (!conAgg.has(id)) conAgg.set(id, {
        contractor_id: id, contractor_name: contractorName.get(id) || 'Unknown',
        total_advances: 0, total_materials: 0, total_purchases: 0, total_budget: 0,
      });
      return conAgg.get(id);
    };
    const paymentTypeById = new Map<string, string>();
    for (const cp of contractorPayments) {
      const c = ensureCon(cp.contractor_id); if (!c) continue;
      const amt = Number(cp.amount || 0);
      if (cp.payment_type === 'material_budget') { c.total_materials += amt; c.total_budget += amt; }
      else c.total_advances += amt;
    }
    for (const pu of contractorPurchases) {
      // Attribute purchase to the contractor of the parent material budget. Look it up.
    }
    // Lookup parents for purchases
    const purchaseParentIds = Array.from(new Set(contractorPurchases.map((p: any) => p.contractor_payment_id).filter(Boolean)));
    if (purchaseParentIds.length) {
      const { data: parents } = await admin.from('contractor_payments').select('id,contractor_id').in('id', purchaseParentIds);
      const pmap = new Map<string, string>((parents || []).map((p: any) => [p.id, p.contractor_id]));
      for (const pu of contractorPurchases) {
        const cid = pmap.get(pu.contractor_payment_id);
        if (!cid) continue;
        const c = ensureCon(cid); if (!c) continue;
        c.total_purchases += Number(pu.amount || 0);
      }
    }

    // User balance summaries (preserve the balance formula)
    const ubAgg = new Map<string, any>();
    const ensureUb = (id: string) => {
      if (!id) return null;
      if (!ubAgg.has(id)) ubAgg.set(id, { user_id: id, received: 0, workshop_spent: 0, personal_spent: 0 });
      return ubAgg.get(id);
    };
    for (const t of teamTransfers) { const u = ensureUb(t.user_id); if (u) u.received += Number(t.amount || 0); }
    for (const p of payments) {
      if (p.status !== 'approved') continue;
      const u = ensureUb(p.created_by); if (u) u.workshop_spent += Number(p.amount || 0);
    }
    for (const pp of personalPayments) { const u = ensureUb(pp.user_id); if (u) u.personal_spent += Number(pp.amount || 0); }

    const rowsArchived = {
      attendance: attendance.length,
      worker_adjustments: adjustments.length,
      payments: payments.length,
      income: income.length,
      debts: debts.length,
      debt_payments: debtPayments.length,
      personal_payments: personalPayments.length,
      team_transfers: teamTransfers.length,
      user_transfers: userTransfers.length,
      contractor_payments: contractorPayments.length,
      contractor_budget_purchases: contractorPurchases.length,
      holidays: holidays.length,
      workshop_files: workshopFiles.length,
    };

    // Insert batch
    const { data: batch, error: batchErr } = await admin
      .from('archive_batches')
      .insert({
        from_date: fromDate, to_date: toDate, label, status: 'pending',
        drive_folder_url: driveFolderUrl, spreadsheet_url: spreadsheetUrl,
        rows_archived: rowsArchived, created_by: userId,
      })
      .select('*').single();
    if (batchErr) throw new Error(`Insert batch failed: ${batchErr.message}`);

    // Insert summaries
    const rollback = async () => { await admin.from('archive_batches').delete().eq('id', batch.id); };
    try {
      const wsRows = Array.from(wsAgg.values()).map((r) => ({ ...r, batch_id: batch.id }));
      if (wsRows.length) {
        const { error } = await admin.from('workshop_archive_summaries').insert(wsRows);
        if (error) throw new Error(`Workshop summaries: ${error.message}`);
      }
      const wkRows = Array.from(workerAgg.values()).map((r) => ({ ...r, batch_id: batch.id }));
      if (wkRows.length) {
        const { error } = await admin.from('worker_archive_summaries').insert(wkRows);
        if (error) throw new Error(`Worker summaries: ${error.message}`);
      }
      const conRows = Array.from(conAgg.values()).map((r) => ({ ...r, batch_id: batch.id }));
      if (conRows.length) {
        const { error } = await admin.from('contractor_archive_summaries').insert(conRows);
        if (error) throw new Error(`Contractor summaries: ${error.message}`);
      }
      const ubRows = Array.from(ubAgg.values()).map((r) => ({ ...r, batch_id: batch.id }));
      if (ubRows.length) {
        const { error } = await admin.from('user_balance_archive_summaries').insert(ubRows);
        if (error) throw new Error(`User balance summaries: ${error.message}`);
      }

      // Mark verified
      await admin.from('archive_batches').update({ status: 'verified', totals_verified_at: new Date().toISOString() }).eq('id', batch.id);
    } catch (e) {
      await rollback();
      throw e;
    }

    return new Response(JSON.stringify({
      success: true,
      batchId: batch.id,
      label,
      rowsArchived,
      workshopSummaries: wsAgg.size,
      workerSummaries: workerAgg.size,
      contractorSummaries: conAgg.size,
      userBalanceSummaries: ubAgg.size,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('create-archive-snapshot error:', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});