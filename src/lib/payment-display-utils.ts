/**
 * Utility to translate stored payment data at display time.
 * Payment reasons and paid_to are always stored in English for language-neutrality.
 * This utility translates known English patterns to the user's current language.
 */

type TFunction = (key: string, options?: any) => string;

/**
 * Translate the paid_to field for display
 */
export function translatePaidTo(paidTo: string, t: TFunction): string {
  if (paidTo === 'Travailleur') return t('workers.categories.travailleur');
  if (paidTo === 'Travailleur Overtime') return `${t('workers.categories.travailleur')} ${t('attendance.overtime')}`;
  return paidTo;
}

/**
 * Translate the reason field for display.
 * Replaces known English patterns with translated equivalents.
 */
export function translateReason(reason: string, t: TFunction): string {
  if (!reason) return reason;
  
  let result = reason;

  // Capitalize the first letter of a (potentially diacritic) word
  const cap = (s: string) => (s ? s.charAt(0).toLocaleUpperCase() + s.slice(1) : s);

  // ─────────────────────────────────────────────────────────────
  // Contractor reasons — rewrite the whole line for elegance.
  //   "[Contractor] mahmoud - Advance (Budget remaining)"
  //   →  "Mahmoud  ·  Contractor advance  ·  from budget remaining"
  //
  //   "[Contractor] mahmoud - Product/Material: cement"
  //   →  "Mahmoud  ·  Contractor materials  ·  cement"
  // ─────────────────────────────────────────────────────────────
  result = result.replace(
    /\[Contractor\]\s*([^\n\-]+?)\s*-\s*([^\n:]+?)(?:\s*\(([^)]+)\))?(?::\s*(.+?))?(?=\n|$)/g,
    (_full, name: string, type: string, paren: string | undefined, detail: string | undefined) => {
      const cleanName = cap(name.trim());
      const t2 = type.trim();
      let typeLabel: string;
      if (/^Advance$/i.test(t2)) typeLabel = t('contractors.contractor') + ' ' + t('contractors.paymentTypes.advance').toLowerCase();
      else if (/^Product\/?Material$/i.test(t2)) typeLabel = t('contractors.contractor') + ' ' + t('contractors.paymentTypes.product').toLowerCase();
      else if (/^Material Budget$/i.test(t2)) typeLabel = t('contractors.contractor') + ' ' + t('contractors.paymentTypes.material_budget').toLowerCase();
      else typeLabel = t('contractors.contractor') + ' · ' + t2;

      const parts = [cleanName, typeLabel];
      if (paren) {
        // "Budget remaining" → translated as a soft note
        const lower = paren.trim();
        if (/^budget remaining$/i.test(lower)) {
          parts.push(t('contractors.budgetRemaining').toLowerCase());
        } else {
          parts.push(lower);
        }
      }
      if (detail) parts.push(detail.trim());
      return parts.join('  ·  ');
    },
  );

  // ─────────────────────────────────────────────────────────────
  // Worker direct payments (partial / advance / bonus / taxi / overtime)
  //   "Aanz - Partial salary payment (3 000 CFA)"
  //   →  "Aanz  ·  Partial salary  ·  3 000 CFA"
  // ─────────────────────────────────────────────────────────────
  const workerKindMap: Array<[RegExp, string]> = [
    [/Partial salary payment/i, t('workers.partialPaymentReason')],
    [/Advance payment/i, t('workers.advancePaymentReason')],
    [/Overtime payment/i, t('workers.overtimePaymentReason')],
    [/Bonus\/(Discount|Taxi) payment/i, t('workers.bonusPaymentReason')],
    [/Taxi payment/i, t('workers.taxiPaymentReason', { defaultValue: 'Taxi payment' })],
    [/Bonus payment/i, t('workers.bonusOnlyPaymentReason', { defaultValue: 'Bonus payment' })],
  ];
  result = result.replace(
    /^([^\n\-\[\]]+?)\s*-\s*([^\n(]+?)(?:\s*\(([^)]+)\))?(?=\n|$)/gm,
    (full, name: string, kind: string, paren: string | undefined) => {
      // Skip if this line was already produced by the contractor pass (contains "  ·  ")
      if (full.includes('  ·  ')) return full;
      const k = kind.trim();
      const match = workerKindMap.find(([rx]) => rx.test(k));
      if (!match) return full; // not one of the known worker kinds — leave untouched
      const cleanName = cap(name.trim());
      const parts = [cleanName, match[1]];
      if (paren) parts.push(paren.trim());
      return parts.join('  ·  ');
    },
  );

  // Catch any leftover contractor tag (legacy fallthroughs)
  result = result.replace(/\[Contractor\]\s*/g, `${t('contractors.contractor')} · `);
  
  // Worker debt tags - strip internal markers
  result = result.replace(/\s*\[WORKER_DEBT\]/g, '');
  result = result.replace(/\[ADVANCE_DEBT\]/g, '');
  result = result.replace(/Advance debt for worker/g, t('workers.advanceDebtReason', { defaultValue: 'Advance debt for worker' }));
  result = result.replace(/Worker debt/g, t('workers.workerDebtLabel', { defaultValue: 'Worker debt' }));
  result = result.replace(/Debt repayment deducted from salary/g, t('workers.debtRepaymentFromSalary', { defaultValue: 'Debt repayment deducted from salary' }));
  
  // Credit reasons (shown in worker adjustments)
  result = result.replace(/Partial Pay credit:/g, `${t('workers.payPartial')} ${t('workers.creditLabel', { defaultValue: 'credit' })}:`);
  result = result.replace(/Advance Payment credit:/g, `${t('workers.payAdvance')} ${t('workers.creditLabel', { defaultValue: 'credit' })}:`);
  result = result.replace(/CFA applied to balance\./g, `CFA ${t('workers.appliedToBalance', { defaultValue: 'applied to balance' })}.`);
  
  // Debt repayment - strip the internal tag with UUID
  result = result.replace(/\s*\[DEBT_REPAYMENT:[^\]]+\]/g, '');
  result = result.replace(/- Debt repayment/g, `- ${t('workers.debtRepaymentReason', { defaultValue: 'Debt repayment' })}`);
  // Debt repayment in brackets (from full salary deduction)
  result = result.replace(/\[-(\d[\d\s,.]*)\s*Debt repayment\]/g, (_, amount) => `[-${amount} ${t('workers.debtRepaymentReason', { defaultValue: 'Debt repayment' })}]`);
  
  // Translate day abbreviations inside parentheses: (mon tue) → (translated)
  const dayMap: Record<string, string> = {
    'sun': t('days.sun', { defaultValue: 'sun' }),
    'mon': t('days.mon', { defaultValue: 'mon' }),
    'tue': t('days.tue', { defaultValue: 'tue' }),
    'wed': t('days.wed', { defaultValue: 'wed' }),
    'thu': t('days.thu', { defaultValue: 'thu' }),
    'fri': t('days.fri', { defaultValue: 'fri' }),
    'sat': t('days.sat', { defaultValue: 'sat' }),
  };
  // Translate day tokens anywhere in the string (whole-word match, case-insensitive)
  result = result.replace(/(½)?\b(sun|mon|tue|wed|thu|fri|sat)\b/gi, (_full, half, day) => {
    const translatedDay = dayMap[(day as string).toLowerCase()] || day;
    return `${half || ''}${translatedDay}`;
  });
  
  return result.trim();
}
