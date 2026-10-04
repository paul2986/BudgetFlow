import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { fetchAdminFeedbackCounts, fetchMyFeedbackUnread } from '../utils/feedback';

/**
 * The little numbers Settings shows beside the feedback rows: replies a sender
 * hasn't read, and, for an admin, items waiting on them. Tabs stay mounted, so
 * they refresh each time Settings comes into view. A failed call (offline, or
 * the feedback functions not deployed yet) just leaves the number as it was:
 * a badge never needs an error.
 */
export const useFeedbackBadges = (userId: string | undefined, isAdmin: boolean) => {
  const [unreadReplies, setUnreadReplies] = useState(0);
  const [needsYou, setNeedsYou] = useState(0);

  useFocusEffect(
    useCallback(() => {
      if (!userId) {
        setUnreadReplies(0);
        setNeedsYou(0);
        return;
      }
      let cancelled = false;
      fetchMyFeedbackUnread()
        .then((count) => !cancelled && setUnreadReplies(count))
        .catch(() => {});
      if (isAdmin) {
        fetchAdminFeedbackCounts()
          .then((counts) => !cancelled && setNeedsYou(counts.needs_you))
          .catch(() => {});
      } else {
        setNeedsYou(0);
      }
      return () => {
        cancelled = true;
      };
    }, [userId, isAdmin])
  );

  return { unreadReplies, needsYou };
};
