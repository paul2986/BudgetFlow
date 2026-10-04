// Kept apart from utils/feedback.ts, which needs the Supabase client to load.

export type FeedbackStatus = 'new' | 'backlog' | 'planned' | 'done' | 'rejected';

/** In the order an admin moves things along. */
export const FEEDBACK_STATUSES: FeedbackStatus[] = ['new', 'backlog', 'planned', 'done', 'rejected'];

/** The database's limit on one message. */
export const FEEDBACK_MAX_LENGTH = 2000;

/** Which colour pair a status chip uses: a token name, plus `neutral` for the quiet ones. */
export type FeedbackTone = 'brand' | 'household' | 'income' | 'neutral';

interface StatusInfo {
  /** What the admin sees. */
  admin: string;
  /** What the sender sees: gentler where the admin's word would sting ("Rejected"). */
  sender: string;
  icon: string;
  tone: FeedbackTone;
}

// Every status has its own icon, so colour is never the only signal.
const STATUS_INFO: Record<FeedbackStatus, StatusInfo> = {
  new: { admin: 'New', sender: 'Received', icon: 'sparkles-outline', tone: 'brand' },
  backlog: { admin: 'Backlog', sender: 'Saved for later', icon: 'bookmark-outline', tone: 'neutral' },
  planned: { admin: 'Planned', sender: 'Planned', icon: 'calendar-outline', tone: 'household' },
  done: { admin: 'Done', sender: 'Done', icon: 'checkmark-circle-outline', tone: 'income' },
  rejected: { admin: 'Rejected', sender: 'Not planned', icon: 'close-circle-outline', tone: 'neutral' },
};

export const statusInfo = (status: FeedbackStatus): StatusInfo => STATUS_INFO[status];

export const statusLabel = (status: FeedbackStatus, audience: 'admin' | 'sender'): string => STATUS_INFO[status][audience];

/** Whether the text is worth sending: something besides whitespace, within the limit. */
export const canSendFeedback = (text: string): boolean => {
  const length = text.trim().length;
  return length >= 1 && length <= FEEDBACK_MAX_LENGTH;
};

/** One line of a message for a list row: whitespace collapsed, cut at a word where it can be. */
export const previewText = (body: string, max = 90): string => {
  const flat = body.replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
};

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "Just now", "5 min ago", "3 h ago", "2 d ago", then a short date. */
export const relativeTime = (iso: string, now: number = Date.now()): string => {
  const then = new Date(iso).getTime();
  const elapsed = now - then;
  if (!Number.isFinite(then) || elapsed < MINUTE) return 'Just now';
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)} min ago`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)} h ago`;
  if (elapsed < 7 * DAY) return `${Math.floor(elapsed / DAY)} d ago`;
  const date = new Date(then);
  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  return date.toLocaleDateString(undefined, sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' });
};
