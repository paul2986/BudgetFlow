/**
 * Helpers for the numeric text fields on the Tools screens.
 */

/** The number in a text field, or null when it is empty or not a number. */
export const parseAmount = (text: string): number | null => {
  if (typeof text !== 'string') return null;
  const cleaned = text.replace(/[^0-9.]/g, '');
  if (cleaned.trim() === '') return null;
  const value = Number(cleaned);
  return Number.isNaN(value) ? null : value;
};

/** Digits and at most one decimal point, with at most `decimals` places after it. */
export const cleanDecimal = (text: string, decimals = 2): string => {
  const cleaned = text.replace(/[^0-9.]/g, '');
  const [whole, fraction] = cleaned.split('.');
  if (fraction === undefined || decimals <= 0) return whole;
  return `${whole}.${fraction.substring(0, decimals)}`;
};
