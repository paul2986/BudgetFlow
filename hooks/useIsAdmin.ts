import { useEffect, useState } from 'react';
import { fetchIsAdmin } from '../utils/admin';

// Remembered for the session, so the Settings row doesn't pop in each time the
// tab is opened. Only a courtesy: the server decides what an admin may see.
let known: { userId: string; isAdmin: boolean } | null = null;

/**
 * Whether the signed-in account is an admin. `checked` turns true once the
 * server has answered (or failed to), so a screen can tell "still asking"
 * from "not an admin". A failed check, such as being offline or the admin
 * functions not being deployed yet, never promotes anyone: it keeps what was
 * last known, which starts as "not an admin".
 */
const rememberedFor = (userId: string | undefined) =>
  userId && known?.userId === userId ? known.isAdmin : undefined;

export const useIsAdmin = (userId: string | undefined) => {
  const [isAdmin, setIsAdmin] = useState(rememberedFor(userId) ?? false);
  const [checked, setChecked] = useState(rememberedFor(userId) !== undefined);

  useEffect(() => {
    // Start from what's known about this account, never the previous one's.
    const remembered = rememberedFor(userId);
    setIsAdmin(remembered ?? false);
    setChecked(remembered !== undefined);
    if (!userId) return;
    let cancelled = false;
    fetchIsAdmin()
      .then((value) => {
        known = { userId, isAdmin: value };
        if (cancelled) return;
        setIsAdmin(value);
        setChecked(true);
      })
      .catch(() => {
        if (!cancelled) setChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return { isAdmin, checked };
};
