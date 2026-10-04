import { describe, expect, it } from 'vitest';
import {
  FEEDBACK_MAX_LENGTH,
  FEEDBACK_STATUSES,
  canSendFeedback,
  previewText,
  relativeTime,
  statusInfo,
  statusLabel,
} from '../../utils/feedbackFormat';

describe('statuses', () => {
  it('has a label for each audience and a distinct icon, so colour is never the only signal', () => {
    expect(FEEDBACK_STATUSES).toEqual(['new', 'backlog', 'planned', 'done', 'rejected']);
    const icons = FEEDBACK_STATUSES.map((status) => statusInfo(status).icon);
    expect(new Set(icons).size).toBe(FEEDBACK_STATUSES.length);
  });

  it('is gentler with the sender than with the admin', () => {
    expect(statusLabel('rejected', 'admin')).toBe('Rejected');
    expect(statusLabel('rejected', 'sender')).toBe('Not planned');
    expect(statusLabel('new', 'sender')).toBe('Received');
    expect(statusLabel('backlog', 'sender')).toBe('Saved for later');
    expect(statusLabel('done', 'admin')).toBe(statusLabel('done', 'sender'));
  });
});

describe('canSendFeedback', () => {
  it('needs something besides whitespace', () => {
    expect(canSendFeedback('')).toBe(false);
    expect(canSendFeedback('  \n\t ')).toBe(false);
    expect(canSendFeedback(' a ')).toBe(true);
  });

  it('stops at the limit, counted after trimming', () => {
    expect(canSendFeedback('x'.repeat(FEEDBACK_MAX_LENGTH))).toBe(true);
    expect(canSendFeedback(`  ${'x'.repeat(FEEDBACK_MAX_LENGTH)}  `)).toBe(true);
    expect(canSendFeedback('x'.repeat(FEEDBACK_MAX_LENGTH + 1))).toBe(false);
  });
});

describe('previewText', () => {
  it('leaves short text alone and flattens line breaks', () => {
    expect(previewText('Dark mode, please')).toBe('Dark mode, please');
    expect(previewText('Line one\n\n  line   two')).toBe('Line one line two');
  });

  it('cuts long text at a word with an ellipsis', () => {
    const text = 'Please add a way to export every budget at once so I can keep a backup somewhere safe';
    const preview = previewText(text, 40);
    expect(preview.endsWith('…')).toBe(true);
    expect(preview.length).toBeLessThanOrEqual(41);
    expect(text.startsWith(preview.slice(0, -1))).toBe(true);
    expect(preview).toBe('Please add a way to export every budget…');
  });

  it('cuts mid-word when there is no word break to use', () => {
    expect(previewText('x'.repeat(100), 10)).toBe(`${'x'.repeat(10)}…`);
  });
});

describe('relativeTime', () => {
  const now = Date.parse('2026-10-04T12:00:00Z');
  const ago = (ms: number) => new Date(now - ms).toISOString();

  it('says how long ago, in the biggest unit that fits', () => {
    expect(relativeTime(ago(10_000), now)).toBe('Just now');
    expect(relativeTime(ago(5 * 60_000), now)).toBe('5 min ago');
    expect(relativeTime(ago(3 * 3_600_000 + 5_000), now)).toBe('3 h ago');
    expect(relativeTime(ago(2 * 86_400_000), now)).toBe('2 d ago');
  });

  it('treats a time slightly in the future (clock skew) as just now', () => {
    expect(relativeTime(ago(-30_000), now)).toBe('Just now');
  });

  it('falls back to a date after a week', () => {
    expect(relativeTime(ago(30 * 86_400_000), now)).not.toMatch(/ago|Just now/);
  });
});
