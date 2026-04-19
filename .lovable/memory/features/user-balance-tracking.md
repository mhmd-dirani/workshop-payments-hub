---
name: balance-single-source-of-truth
description: All user balance reads must go through src/lib/balance-utils.ts so admin Team page and team-member UserBalanceCard never drift apart
type: feature
---
A user's global balance is calculated in **one place**: `src/lib/balance-utils.ts`.

Formula:
```
balance = SUM(team_transfers.amount where user_id = U)
        - SUM(payments.amount where created_by = U AND status = 'approved')
        - SUM(personal_payments.amount where user_id = U)
```

Two exports:
- `fetchUserBalance(userId)` → used by `UserBalanceCard.tsx` (team-member view)
- `fetchAllUserBalances(userIds[])` → used by `Team.tsx` (admin view)

**Rule:** Never inline the balance formula anywhere else. If a new screen needs it, import the util.

Related sync invariants:
- Worker debts placed by a non-admin DO NOT deduct until an admin approves (Approvals.tsx inserts the personal_payment on approval, deletes it on rejection).
- Worker debts placed by an admin deduct immediately (auto-approved in WorkerDetails.tsx).
- Cash repayments credit the **original placer** (not the recorder) via `team_transfers` tagged `[DEBT_REPAYMENT]`.
- Salary repayments do not touch any user balance — they create a `worker_adjustments` discount on the worker's next salary.
- Each personal_payment for a worker debt is tagged `[WORKER_DEBT:<debt_id>]` so approval/rejection cleanup is idempotent.
