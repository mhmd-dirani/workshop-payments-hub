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
  
  // Contractor label
  result = result.replace(/\[Contractor\]/g, `[${t('contractors.contractor')}]`);
  
  // Worker payment reasons (match longer patterns first)
  result = result.replace(/- Partial salary payment/g, `- ${t('workers.partialPaymentReason')}`);
  result = result.replace(/- Advance payment/g, `- ${t('workers.advancePaymentReason')}`);
  result = result.replace(/- Bonus\/Discount payment/g, `- ${t('workers.bonusPaymentReason')}`);
  result = result.replace(/- Overtime payment/g, `- ${t('workers.overtimePaymentReason')}`);
  
  // Contractor payment types (after worker patterns to avoid conflicts)
  result = result.replace(/- Product\/Material/g, `- ${t('contractors.paymentTypes.product')}`);
  result = result.replace(/\(Budget remaining\)/g, `(${t('contractors.budgetRemaining')})`);
  // Contractor advance - only match "- Advance" NOT followed by " payment" (already handled above)
  result = result.replace(/- Advance(?! payment)/g, `- ${t('contractors.paymentTypes.advance')}`);
  
  // Worker advance debt reason
  result = result.replace(/\[ADVANCE_DEBT\]/g, '');
  result = result.replace(/Advance debt for worker/g, t('workers.advanceDebtReason', { defaultValue: 'Advance debt for worker' }));
  
  // Credit reasons (shown in worker adjustments)
  result = result.replace(/Partial Pay credit:/g, `${t('workers.payPartial')} ${t('workers.creditLabel', { defaultValue: 'credit' })}:`);
  result = result.replace(/Advance Payment credit:/g, `${t('workers.payAdvance')} ${t('workers.creditLabel', { defaultValue: 'credit' })}:`);
  result = result.replace(/CFA applied to balance\./g, `CFA ${t('workers.appliedToBalance', { defaultValue: 'applied to balance' })}.`);
  
  return result.trim();
}
