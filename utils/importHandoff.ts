import { useSyncExternalStore } from 'react';
import type { ImportResult } from './budgetWorkbook/import';

/**
 * Carries a parsed workbook from the Budgets screen to the Import screen. The
 * result is too big for a route param, and the Import screen is its own route
 * (it slides in like the other sub-screens), so Budgets puts it here and the
 * screen reads it. Each entry has an id so the screen can clear only the entry
 * it showed: opening it again before the slide-out ends must not lose the new one.
 */

export interface ImportEntry {
  id: number;
  result: ImportResult;
  /** The name to start from, already made different from the budgets that exist. */
  defaultName: string;
}

let current: ImportEntry | null = null;
let nextId = 1;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());

export const importHandoff = {
  put(result: ImportResult, defaultName: string): void {
    current = { id: nextId++, result, defaultName };
    emit();
  },
  /** Clear the entry with this id, if it is still the current one. */
  clear(id: number | null): void {
    if (current && current.id === id) {
      current = null;
      emit();
    }
  },
  get(): ImportEntry | null {
    return current;
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export const useImportEntry = (): ImportEntry | null =>
  useSyncExternalStore(importHandoff.subscribe, importHandoff.get, importHandoff.get);
