## Goal

Make the worker card the single source of truth for "to be paid". The amount the admin sees on the worker card before clicking **Pay full salary** must exactly equal the sum of payment rows created on the dashboard — across **all workshops**, with advances, bonuses, overtime, holiday pay and debt deduction applied consistently.

## Bugs found (worker salary, multi-site)

1. **Advances can silently re-apply forever.** In `createPayment`, when a worker has an unpaid advance on site A and earned nothing (or less than the advance) on every other site, no payment row gets created, so `fallbackPaymentId` stays `null` and the advance's adjustment row is never marked `is_paid`. Next pay it deducts again. Same problem if the cross-workshop credit exceeds total positive earnings — leftover credit is lost.
2. **Partial credit consumption is lost.** If a 50k advance is only partially consumed (e.g. 30k of earnings on other sites), the full 50k adjustment is marked paid; the remaining 20k disappears instead of carrying over.
3. **Dashboard amount > card "to be paid".** The card shows `totalOwed = attendance + bonus − discount`. The dashboard payment then adds **holiday pay** and subtracts **debt deduction** that are configured in the pay dialog — but the card preview never reflects those. So the admin commits a number different from what they were shown.
4. **Debt deduction is split before holiday pay is added** → tiny rounding mismatches when both are on.
5. **Discount total on the card mixes credit-discounts (advances) with real discounts**, so the "bonuses/discounts" line on the card double-counts the advance that's already shown separately.

## Fixes

### A. Reconciliation logic in `createPayment` (`src/components/WorkerDetails.tsx`)

- Track consumed credit **per source adjustment**, not as a single pool. When marking credit-adjustments paid, only mark the portion actually consumed; split the remainder into a new unpaid credit adjustment so it carries forward.
- If after the loop there are credit adjustments that were consumed against zero/negative earnings (no payment row created anywhere) → do **not** mark anything paid; throw a clear error: "Advances exceed earnings. Nothing to pay this round."
- Add `holidayPay` to `grandTotalBeforeDeduction` so the proportional debt split is correct.
- Move the "first workshop gets holiday pay" rule to a deterministic choice (the workshop with the largest positive total) so the user-visible breakdown matches the card.

### B. Worker card summary (`src/components/WorkerDetails.tsx`)

Refactor the top summary into a single `paymentPreview` memo that mirrors `createPayment` exactly and drives both the card numbers and the pay dialog:

```
attendance   +X
bonuses      +Y
discounts    −Z          (real discounts only, excludes advances)
─────────────────
sub-total     S
advances     −A          (cross-workshop credit applied)
holiday pay  +H          (if toggle on, live)
debt deduct  −D          (if selected, live)
─────────────────
to be paid    P
```

Card always shows P, broken down. If P=0 because advances exceed earnings, card shows "Advances exceed earnings — adjust before paying".

### C. UI/efficiency in worker card

- One compact summary card (the block above) instead of the current scattered totals.
- Per-workshop chips below it showing how P will be split across sites (matches dashboard rows).
- Collapse the long "unpaid by workshop" tables behind a "Show breakdown" toggle on mobile (current scroll is heavy on 384px viewport).
- Move the holiday-pay / debt-deduction toggles into the same card so they update P live before the pay dialog opens.

### D. Verification

After implementing:
1. Reproduce: worker with 50k advance on site A, 30k earnings on site B → expect blocked pay with clear message, advance stays.
2. Worker with 50k advance on site A, 80k earnings on site B → expect single 30k payment on site B, advance fully marked paid.
3. Worker with 50k advance on site A, 30k on site B, 40k on site C → expect 30k+0+40k consumed; 50k advance fully cleared by sum of cross-credits; payments on B and C total 20k.
4. Worker with holiday pay on + 10k debt deduction → card P == sum of dashboard payment rows, to the franc.

### Out of scope (this round)

- Bonus/overtime sync, payment dashboard ↔ worker card edit/delete sync, worker debts repayment paths. We'll do these as separate rounds so each gets verified.

### Files touched

- `src/components/WorkerDetails.tsx` (logic + card UI)
- `src/lib/worker-payment-utils.ts` (split-credit helper)
- `src/i18n/locales/{en,fr,ar}.json` (new strings: "advances exceed earnings", "to be paid", per-workshop breakdown labels, "show breakdown")
