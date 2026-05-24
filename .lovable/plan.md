# Plan: Safe Archive Snapshots + Finished Workshop Backup

This is a large, financially-sensitive change. I will deliver it in two phases so we can verify totals between them. **No row will be deleted until summaries are persisted and verified against live data.**

---

## Phase 1 — Snapshot Archive System (monthly ranges)

### 1. New database tables (additive only, no destructive migrations)

- `archive_batches` — one row per archive run
  - `id`, `from_date`, `to_date`, `label` (e.g. `jan_mar_2026`), `created_by`, `created_at`
  - `drive_folder_url`, `spreadsheet_url`
  - `status` (`pending` | `verified` | `deleted`)
  - `rows_archived` (jsonb of per-table counts), `rows_deleted` (jsonb)
  - `totals_verified_at`, `deleted_at`
  - UNIQUE(`from_date`,`to_date`) to prevent duplicates
- `workshop_archive_summaries` (per batch × workshop)
  - totals: income, approved_payments, worker_salaries, worker_hours, contractor_advances, contractor_materials, debts, debt_payments, transfers, total_expenses, net
- `worker_archive_summaries` (per batch × worker)
  - total_hours, total_salary, total_extra, total_discounts, total_adjustments
- `contractor_archive_summaries` (per batch × contractor)
  - total_advances, total_materials, total_purchases, total_budget
- `finished_workshop_archives` (Phase 2, created in same migration)

All tables: RLS = admin-only manage, authenticated read.

### 2. Edge function: `create-archive-snapshot` (replaces auto-delete behavior)

Steps per call (admin-only, transactional where possible):
1. Validate `fromDate`/`toDate`; reject if an overlapping `archive_batches` row already exists.
2. Run the existing `sync-google-sheets` flow → get `spreadsheet_url`, `drive_folder_url`.
3. Compute aggregates per workshop / worker / contractor from raw rows in range.
4. Insert `archive_batches` row + summary rows.
5. **Verify** by re-querying live totals in range and comparing to inserted summaries; on mismatch, rollback inserts and return error.
6. Mark batch `status='verified'`. **Do not delete anything.**

### 3. Edge function: `delete-archived-batch`

- Input: `batch_id`.
- Only allowed when `status='verified'`.
- Skips rows that are unsafe to delete:
  - `attendance` with `is_paid=false` OR linked to pending `payments`
  - `payments` with `status='pending'`
  - `debts` where `is_settled=false` (open debts) — only settled debts deletable
  - `worker_adjustments` with `is_paid=false`
  - any `contractor_payments` whose contractor still has open balance in active months
- Deletes in FK-safe order: child tables first (`debt_payments`, `worker_adjustments`, `contractor_budget_purchases`, `workshop_files` storage+rows) then parents.
- Records `rows_deleted` jsonb and sets `status='deleted'`, `deleted_at=now()`.

The existing `archive-synced-data` function will be deprecated/removed.

### 4. Calculation layer update — "snapshots + live"

Create `src/lib/archive-totals.ts` with cached fetchers:
- `getArchivedWorkshopTotals(workshopId)` → sums all `workshop_archive_summaries` for that workshop
- `getArchivedWorkerTotals(workerId)`
- `getArchivedContractorTotals(contractorId)`
- `getArchivedGlobalTotals()`

Update these consumers to add archived summary values to their live computation:
- `src/lib/balance-utils.ts` — leave user balances alone (transfers/payments/personal_payments for a user are not archived unless their dated rows fall in range; if they are, we add archived contributions back via a `user_archive_summaries` jsonb breakdown attached to `archive_batches.rows_archived` aggregated by `created_by`/`user_id`). To keep this safe I'll add a small `user_balance_archive_summaries` table mirroring the same formula components per user per batch.
- `src/lib/worker-payment-utils.ts` — add archived hours/salary/adjustments
- `src/lib/payment-display-utils.ts` — totals only, not row lists
- Dashboard, Workers, Contractors, Debts pages — totals widgets read live + archived

Detail/history views remain live-only (rows are gone; users see Google Drive link for detail).

### 5. UI changes in `GoogleDriveSyncCard.tsx`

Replace the current post-sync "delete?" AlertDialog with:
- Success state shows: spreadsheet link, drive folder link, **per-table archived counts**, and three buttons:
  - **Delete Archived Data** (calls `delete-archived-batch`, confirm dialog lists what will/won't be deleted)
  - **View Archive Summaries** (opens new `ArchiveSummariesDialog`)
  - **Done**
- Block selecting an already-archived range.

### 6. New component: `ArchiveSummariesDialog.tsx`

Lists all `archive_batches` with: range, created, links, rows archived/deleted, status badge, totals-verified ✓, expandable per-workshop/worker/contractor totals.

### 7. i18n — add keys for archive flow, verification, deletion safety messages in `en`, `fr`, `ar`.

---

## Phase 2 — Finished Workshop Backup & Removal

### 1. Schema additions (same migration as Phase 1)

- `workshops.status` text default `'active'` check in (`active`,`paused`,`finished`,`archived`)
- `finished_workshop_archives` table:
  - `workshop_id`, `workshop_name` (denormalized snapshot), `archived_at`, `archived_by`
  - `drive_folder_url`, jsonb `spreadsheet_urls`, jsonb `final_totals`, jsonb `final_balances`
  - `deleted_from_database` bool, `deleted_at`
  - `backup_verified` bool

### 2. Edge function: `backup-finished-workshop`

- Requires `workshops.status='finished'`.
- Exports **all** workshop-scoped rows (attendance, worker_adjustments, payments, contractor_payments, contractor_budget_purchases, income, workshop_files, related debts/debt_payments/personal_payments/transfers identified via `payment_id` link, holidays in date range).
- Creates dedicated Drive folder tree: `Workshop_Backups/<name>/{Attendance,Payments,Workers,Contractors,Debts,Files,Reports,Financial_Summaries}`.
- Generates CSV per table, a JSON snapshot, and a final summary report.
- Computes & stores `final_totals` and `final_balances` (per worker, per contractor, overall).
- Verifies row counts vs Drive uploads → sets `backup_verified=true`.

### 3. Edge function: `delete-finished-workshop`

- Allowed only when matching `finished_workshop_archives.backup_verified=true`.
- Deletes only this workshop's transactional rows in FK-safe order.
- Workers/contractors with rows in other workshops are kept (only the workshop-scoped rows are removed). Master profiles preserved.
- Sets `workshops.status='archived'`, `finished_workshop_archives.deleted_from_database=true`.

### 4. UI

- `WorkshopSelector` / a new workshop management area: status badge + actions:
  - **Mark as Finished** (admin, confirm)
  - **Backup Finished Workshop** (calls function, progress UI)
  - **View Workshop Backup Summary** (modal of `final_totals`, links, downloads)
  - **Delete Finished Workshop Data** (only after `backup_verified`, double-confirm)
- New page/section `Archived Workshops` listing `finished_workshop_archives` with restore-ready metadata (restore not implemented; schema preserves enough to reimport later).
- Hide `status in ('archived')` workshops from active dashboards/selectors; keep visible in Archived list.

### 5. Dashboard/global totals

Include `finished_workshop_archives.final_totals` in global aggregates so global numbers don't drop when an archived workshop's rows are removed.

### 6. i18n — add keys for finished/backup/restore/archived statuses in `en`,`fr`,`ar`.

---

## Safety guarantees (enforced in code + DB)

- No deletion path runs without a verified summary row.
- UNIQUE constraints on `archive_batches(from_date,to_date)` and `finished_workshop_archives(workshop_id) WHERE deleted_from_database=false` prevent duplicates.
- Pre-delete filter functions exclude unpaid/pending/open rows.
- All totals helpers always read `live + archived`, never just live.
- Mobile-first layout for new dialogs (stacked cards, no horizontal scroll).
- All new strings localized en/fr/ar with RTL.

## Technical notes (for me)

- Migrations: one combined migration for all new tables/columns/RLS.
- Edge functions to add: `create-archive-snapshot`, `delete-archived-batch`, `backup-finished-workshop`, `delete-finished-workshop`. Remove `archive-synced-data`.
- `sync-google-sheets` will be called internally by `create-archive-snapshot` (kept as-is).
- New util `src/lib/archive-totals.ts` is the only place that reads summary tables; consumers import from it.
- Toast duration 1000ms, AlertDialog for every destructive action (per project memory).

## Deliverable order

1. Migration (all new tables + workshop.status).
2. `create-archive-snapshot` + `delete-archived-batch` edge functions.
3. `archive-totals.ts` + integrate into balance/worker/payment utils + Dashboard.
4. `GoogleDriveSyncCard` rewrite + `ArchiveSummariesDialog`.
5. `backup-finished-workshop` + `delete-finished-workshop`.
6. Workshop status UI + Archived Workshops page.
7. i18n keys (en/fr/ar) for everything.
8. Manual verification: run snapshot on a small range, confirm totals unchanged after delete.

Please approve and I'll start with the migration.
