import type { Ionicons } from '@expo/vector-icons';
import { BUCKET_ORDER, type BucketId, type BucketStatus } from '../../utils/budgetReview';

/**
 * How the budget review presents each 50/30/20 bucket: name, icon, colour and
 * the plain-language copy. The colours are identity hues (which bucket), kept
 * apart from the status colours (how it is doing); they pass the dataviz
 * validator on light, and dark misses only its lightness band because the dark
 * tokens are pastels.
 */

export type BucketTone = 'household' | 'personal' | 'mortgage';

export interface BucketMeta {
  name: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** Solid fill and its tint come from tokens.colors[tone] / [`${tone}Subtle`]. */
  tone: BucketTone;
  /** What the rule means by it, in the explainer. */
  blurb: string;
  /** Shown in the bucket card when nothing in the budget lands here. */
  emptyHint: string;
  /** The words for a bucket above or below its target. */
  offLabel: string;
  closeLabel: string;
}

export const BUCKET_META: Record<BucketId, BucketMeta> = {
  needs: {
    name: 'Needs',
    icon: 'home-outline',
    tone: 'household',
    blurb: 'What you have to pay to live and work: housing, bills, groceries, transport, insurance and minimum debt payments.',
    emptyHint: 'Nothing is counted as a need yet. Rent, Mortgage, Utilities, Groceries, Transport, Healthcare, Loan and Credit Card start here.',
    offLabel: 'Over target',
    closeLabel: 'Slightly over',
  },
  wants: {
    name: 'Wants',
    icon: 'sparkles-outline',
    tone: 'personal',
    blurb: 'What you choose to spend on: eating out, entertainment, clothes, subscriptions and treats.',
    emptyHint: 'Nothing is counted as a want yet. Entertainment, Clothing, Takeaways, Eating Out, Misc and custom categories start here.',
    offLabel: 'Over target',
    closeLabel: 'Slightly over',
  },
  savings: {
    name: 'Savings',
    icon: 'wallet-outline',
    tone: 'mortgage',
    blurb: 'What you put away: savings, investments and any debt payments beyond the minimum.',
    emptyHint: 'Nothing is counted as savings yet. Expenses tagged Savings or Investments start here.',
    offLabel: 'Under target',
    closeLabel: 'Slightly under',
  },
};

/** The three buckets as options for a SegmentedControl. */
export const BUCKET_OPTIONS = BUCKET_ORDER.map((id) => ({ value: id, label: BUCKET_META[id].name }));

export const STATUS_ICON: Record<BucketStatus, keyof typeof Ionicons.glyphMap> = {
  onTrack: 'checkmark-circle',
  close: 'warning',
  off: 'close-circle',
};

export const statusLabel = (id: BucketId, status: BucketStatus): string =>
  status === 'onTrack' ? 'On track' : status === 'close' ? BUCKET_META[id].closeLabel : BUCKET_META[id].offLabel;
