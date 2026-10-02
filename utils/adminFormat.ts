import type { AdminOverview, ExpenseFrequencyKey } from './admin';

// Kept apart from utils/admin.ts, which needs the Supabase client to load.

const count = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });

/** 1234 → "1,234"; averages keep one decimal. */
export const formatCount = (value: number): string => count.format(value);

/** 0 → "0 B", 2048 → "2 KB", 1_500_000 → "1.4 MB". */
export const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${count.format(kb)} KB`;
  return `${count.format(kb / 1024)} MB`;
};

const FREQUENCY_LABELS: [ExpenseFrequencyKey, string][] = [
  ['monthly', 'Monthly'],
  ['weekly', 'Weekly'],
  ['yearly', 'Yearly'],
  ['daily', 'Daily'],
  ['one-time', 'One-time'],
  ['other', 'Other'],
];

/** "Monthly 12 · Weekly 3 · One-time 4", skipping frequencies nobody uses. */
export const describeFrequencies = (byFrequency: AdminOverview['content']['expenses_by_frequency']): string =>
  FREQUENCY_LABELS.filter(([key]) => (byFrequency[key] ?? 0) > 0)
    .map(([key, label]) => `${label} ${formatCount(byFrequency[key] ?? 0)}`)
    .join(' · ');
