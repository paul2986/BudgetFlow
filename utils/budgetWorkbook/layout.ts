import type { BucketId, Frequency } from '../../types/budget';
import { toYMD } from '../dates';

/**
 * What the budget workbook looks like, shared by the exporter and the importer
 * so the two can't drift apart. Change a header here and both follow.
 */

export const SHEETS = {
  summary: 'Summary',
  people: 'People',
  income: 'Income',
  expenses: 'Expenses',
  lists: 'Lists',
} as const;

export const FREQUENCIES: Frequency[] = ['daily', 'weekly', 'monthly', 'yearly', 'one-time'];

export const FREQUENCY_LABELS: Record<Frequency, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  yearly: 'Yearly',
  'one-time': 'One-time',
};

/** Times a year each frequency happens; a one-time amount counts once, as it does in the app. */
export { ANNUAL_MULTIPLIER } from '../calculations';

/** What the Counts as column says; blank means the expense follows its category. */
export const BUCKET_LABELS: Record<BucketId, string> = { needs: 'Needs', wants: 'Wants', savings: 'Savings' };

export const TYPE_LABELS = { household: 'Household', personal: 'Personal' } as const;
export const SPLIT_LABELS = { even: 'Even', 'income-based': 'Income-based' } as const;

/** Header text of each data sheet, in column order. */
export const HEADERS = {
  people: ['Name', 'Splits household costs'],
  income: ['Person', 'Source', 'Amount', 'Frequency', 'Per month'],
  expenses: [
    'Description',
    'Amount',
    'Frequency',
    'Per month',
    'Type',
    'Person',
    'Category',
    'Starts',
    'Ends',
    'Notes',
    'Counts as',
  ],
} as const;

/** Labels in column A of the Summary sheet that the importer reads the value of (column B). */
export const SUMMARY_LABELS = { split: 'Split method', currency: 'Currency' } as const;

// Dates -----------------------------------------------------------------------

const DAY_MS = 86_400_000;
const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30); // serial 0 in the 1900 date system
const SERIAL_1904_OFFSET = 1462;

/** `2026-10-01` → the Excel serial number for that day, or null if it isn't a date. */
export const ymdToSerial = (ymd: string): number | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const ms = Date.UTC(y, mo - 1, d);
  const back = new Date(ms);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return null;
  return Math.round((ms - EXCEL_EPOCH_UTC) / DAY_MS);
};

/** An Excel serial number → `YYYY-MM-DD` (any time of day is dropped). */
export const serialToYmd = (serial: number, date1904 = false): string | null => {
  if (!Number.isFinite(serial)) return null;
  const days = Math.floor(date1904 ? serial + SERIAL_1904_OFFSET : serial);
  if (days < 1 || days > 2_958_465) return null;
  return new Date(EXCEL_EPOCH_UTC + days * DAY_MS).toISOString().slice(0, 10);
};

export const todayYmd = (now: Date): string => toYMD(now);
