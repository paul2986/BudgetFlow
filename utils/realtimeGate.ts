/**
 * Telling live changes that are news from ones this device caused itself.
 *
 * Saving a budget writes it to the server, and the server announces every write to
 * everyone watching the budget, the writer included. Re-syncing on our own echo
 * downloads every budget just to find nothing new, so a sync notes the revision of
 * each budget it reads or writes, and an announcement for a revision we already hold
 * is skipped. Someone else's write has a revision we haven't seen, so it still syncs.
 */

// The newest revision of each budget this device has read from or written to the server.
const known = new Map<string, number>();

const toRevision = (value: unknown): number | null => {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};

export const noteRevision = (budgetId: string, revision: unknown): void => {
  const rev = toRevision(revision);
  if (rev !== null && rev > (known.get(budgetId) ?? -Infinity)) known.set(budgetId, rev);
};

export const isKnownRevision = (budgetId: string, revision: number): boolean => (known.get(budgetId) ?? -Infinity) >= revision;

/** For sign-out: another account must never inherit what this one knew. */
export const forgetRevisions = (): void => known.clear();

type BudgetChange = { eventType?: string; new?: Record<string, unknown> | null };

/**
 * Changes announced close together, judged when it is time to sync. Judging then, not
 * on arrival, matters: the announcement of our own write can beat the reply to the
 * write, so the revision isn't noted yet when it arrives.
 */
export const createChangeBatch = () => {
  const revisions = new Map<string, number>();
  let other = false;
  return {
    /** A change to a budget row. Deletions and anything unreadable count as news. */
    budgetChanged(change: BudgetChange) {
      const id = change.new?.id;
      const rev = toRevision(change.new?.revision);
      if (change.eventType === 'DELETE' || typeof id !== 'string' || rev === null) {
        other = true;
        return;
      }
      revisions.set(id, Math.max(rev, revisions.get(id) ?? -Infinity));
    },
    /** Anything else (members, locks, coming back to the app) is always news. */
    otherChanged() {
      other = true;
    },
    /** Whether something in the batch is news to this device. Empties the batch. */
    needsSync(): boolean {
      const news = other || [...revisions].some(([id, rev]) => !isKnownRevision(id, rev));
      revisions.clear();
      other = false;
      return news;
    },
  };
};
