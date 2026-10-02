import { useState } from 'react';
import { Alert } from '../utils/alert';
import { countLabel, type BulkEditPatch } from '../utils/bulkEdit';
import { useBudgetData } from './useBudgetData';
import { useToast } from './useToast';

/**
 * Applies a bulk edit or delete from the Expenses screen and reports the
 * outcome: an Undo toast after an edit, a plain one after a delete, an alert
 * when saving fails. Each call returns whether it saved, so the screen can
 * close its sheet and leave selection mode.
 */
export function useBulkExpenseActions() {
  const { bulkEditExpenses, undoBulkEdit, removeExpenses } = useBudgetData();
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);

  const applyEdit = async (ids: string[], patch: BulkEditPatch): Promise<boolean> => {
    if (busy) return false;
    setBusy(true);
    try {
      const res = await bulkEditExpenses(ids, patch);
      if (!res.success || !res.result) {
        Alert.alert('Error', 'Failed to update the expenses. Please try again.');
        return false;
      }
      const result = res.result;
      showToast(`Updated ${countLabel(result.changedIds.length)}`, 'success', 8000, {
        label: 'Undo',
        onPress: async () => {
          const undone = await undoBulkEdit(result);
          if (!undone.success) showToast('Could not undo that change.', 'error');
        },
      });
      return true;
    } catch (error) {
      console.error('useBulkExpenseActions: Error applying bulk edit:', error);
      Alert.alert('Error', 'Failed to update the expenses. Please try again.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const deleteAll = async (ids: string[]): Promise<boolean> => {
    if (busy) return false;
    setBusy(true);
    try {
      const res = await removeExpenses(ids);
      if (!res.success) {
        Alert.alert('Error', 'Failed to delete the expenses. Please try again.');
        return false;
      }
      showToast(`Deleted ${countLabel(res.removed)}`, 'success');
      return true;
    } catch (error) {
      console.error('useBulkExpenseActions: Error deleting expenses in bulk:', error);
      Alert.alert('Error', 'Failed to delete the expenses. Please try again.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  return { busy, applyEdit, deleteAll };
}
