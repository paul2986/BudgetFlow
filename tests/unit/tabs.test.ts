import { describe, expect, it, vi } from 'vitest';
import { createMemoryStorage } from '../helpers/memoryStorage';
import { makeBudget } from '../helpers/fixtures';

// Tabs of the web app share storage but keep their own in-memory cache.
const device = createMemoryStorage();
vi.mock('@react-native-async-storage/async-storage', () => ({ default: device }));
// A browser window, so storage.ts listens for other tabs' changes.
vi.stubGlobal('window', new EventTarget());

const storage = await import('../../utils/storage');

const write = (name: string) =>
  device.store.set('app_data_v2', JSON.stringify({ version: 2, budgets: [makeBudget({ name })], activeBudgetId: '' }));
const names = async () => (await storage.loadAppData()).budgets.map((b) => b.name);
const otherTabChanged = (key: string | null) => window.dispatchEvent(Object.assign(new Event('storage'), { key }));

describe('another tab changing storage', () => {
  it('makes this tab read storage afresh', async () => {
    write('Before');
    storage.resetAppDataCache();
    expect(await names()).toEqual(['Before']);

    write('Changed in another tab');
    expect(await names()).toEqual(['Before']); // still this tab's cache
    otherTabChanged('app_data_v2');
    expect(await names()).toEqual(['Changed in another tab']);
  });

  it('also on an owner change or a full clear, but not for unrelated keys', async () => {
    write('A');
    storage.resetAppDataCache();
    await names();
    write('B');
    otherTabChanged('expenses_filters_v1');
    expect(await names()).toEqual(['A']);
    otherTabChanged('device_owner_v1');
    expect(await names()).toEqual(['B']);
    write('C');
    otherTabChanged(null);
    expect(await names()).toEqual(['C']);
  });
});

describe('a session starting in this tab', () => {
  it('reads storage afresh, even when the owner is unchanged', async () => {
    device.store.set('device_owner_v1', 'bob');
    write('Alice’s, in memory');
    storage.resetAppDataCache();
    await names();
    // Another tab cleared storage and claimed it for bob; no event reached us.
    device.store.delete('app_data_v2');
    await storage.claimDeviceData('bob');
    expect(await names()).toEqual([]);
  });
});
