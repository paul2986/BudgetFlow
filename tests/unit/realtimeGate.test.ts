import { beforeEach, describe, expect, it } from 'vitest';
import { createChangeBatch, forgetRevisions, isKnownRevision, noteRevision } from '../../utils/realtimeGate';

const update = (id: string, revision: unknown) => ({ eventType: 'UPDATE', new: { id, revision } });

beforeEach(() => forgetRevisions());

describe('known revisions', () => {
  it('knows a revision at or below the newest it was told about', () => {
    noteRevision('a', 5);
    expect(isKnownRevision('a', 5)).toBe(true);
    expect(isKnownRevision('a', 4)).toBe(true);
    expect(isKnownRevision('a', 6)).toBe(false);
    expect(isKnownRevision('b', 1)).toBe(false);
  });

  it('never goes backwards', () => {
    noteRevision('a', 5);
    noteRevision('a', 3);
    expect(isKnownRevision('a', 5)).toBe(true);
  });

  it('reads a revision sent as text, and ignores junk', () => {
    noteRevision('a', '7');
    expect(isKnownRevision('a', 7)).toBe(true);
    noteRevision('b', 'soon');
    noteRevision('b', undefined);
    expect(isKnownRevision('b', 0)).toBe(false);
  });

  it('can be forgotten, for sign-out', () => {
    noteRevision('a', 5);
    forgetRevisions();
    expect(isKnownRevision('a', 5)).toBe(false);
  });
});

describe('a batch of live changes', () => {
  it('is not news when it only echoes revisions this device holds', () => {
    noteRevision('a', 6);
    const batch = createChangeBatch();
    batch.budgetChanged(update('a', 6));
    expect(batch.needsSync()).toBe(false);
  });

  it('is news when a revision is newer than what this device holds', () => {
    noteRevision('a', 6);
    const batch = createChangeBatch();
    batch.budgetChanged(update('a', 7));
    expect(batch.needsSync()).toBe(true);
  });

  it('judges when asked, so a write noted after its announcement arrived still counts as ours', () => {
    const batch = createChangeBatch();
    batch.budgetChanged(update('a', 6)); // the announcement beats the reply to the write
    noteRevision('a', 6); // the reply
    expect(batch.needsSync()).toBe(false);
  });

  it('is news if any one change in it is', () => {
    noteRevision('a', 6);
    noteRevision('b', 2);
    const batch = createChangeBatch();
    batch.budgetChanged(update('a', 6));
    batch.budgetChanged(update('b', 3));
    expect(batch.needsSync()).toBe(true);
  });

  it('keeps the newest revision announced for a budget', () => {
    noteRevision('a', 6);
    const batch = createChangeBatch();
    batch.budgetChanged(update('a', 7));
    batch.budgetChanged(update('a', 6));
    expect(batch.needsSync()).toBe(true);
  });

  it('treats a deletion, an unreadable change, or anything else as news', () => {
    noteRevision('a', 6);
    for (const act of [
      (b: ReturnType<typeof createChangeBatch>) => b.budgetChanged({ eventType: 'DELETE', new: { id: 'a', revision: 6 } }),
      (b: ReturnType<typeof createChangeBatch>) => b.budgetChanged({ eventType: 'UPDATE', new: {} }),
      (b: ReturnType<typeof createChangeBatch>) => b.budgetChanged({ eventType: 'UPDATE', new: null }),
      (b: ReturnType<typeof createChangeBatch>) => b.otherChanged(),
    ]) {
      const batch = createChangeBatch();
      act(batch);
      expect(batch.needsSync()).toBe(true);
    }
  });

  it('starts empty after each judgement', () => {
    const batch = createChangeBatch();
    batch.otherChanged();
    expect(batch.needsSync()).toBe(true);
    expect(batch.needsSync()).toBe(false);
  });
});
