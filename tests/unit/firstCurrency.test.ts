import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryStorage } from '../helpers/memoryStorage';
import { makeBudget } from '../helpers/fixtures';

// What a device shows as its currency the first time the app runs, before the
// user has chosen one: its locale's currency, except that a device already in
// use keeps pounds, the default every earlier version showed.
const device = vi.hoisted(() => ({ locales: [] as string[], storage: null as any }));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: new Proxy({}, { get: (_t, key) => device.storage[key] }),
}));
vi.mock('../../utils/currencyLocale', async (original) => ({
  ...(await original<typeof import('../../utils/currencyLocale')>()),
  deviceLocales: () => device.locales,
}));

const saved = () => {
  const raw = device.storage.store.get('app_currency');
  return raw ? JSON.parse(raw).code : undefined;
};

const launch = async () => {
  vi.resetModules();
  const { initCurrency } = await import('../../hooks/useCurrency');
  initCurrency();
  await vi.waitFor(() => expect(saved()).toBeDefined());
};

const withBudgets = (budgets: number) =>
  device.storage.store.set(
    'app_data_v2',
    JSON.stringify({ version: 2, budgets: Array.from({ length: budgets }, () => makeBudget()), activeBudgetId: '' })
  );

beforeEach(() => {
  device.storage = createMemoryStorage();
  device.locales = [];
});

describe('first currency', () => {
  it('follows the locale on a fresh device', async () => {
    device.locales = ['en-US'];
    await launch();
    expect(saved()).toBe('USD');
  });

  it('falls back to pounds when the locale names no currency', async () => {
    device.locales = ['en'];
    await launch();
    expect(saved()).toBe('GBP');
  });

  it('still follows the locale for a new account, whose empty app data is already saved', async () => {
    device.locales = ['de-DE'];
    withBudgets(0);
    await launch();
    expect(saved()).toBe('EUR');
  });

  it('keeps pounds on a device that already holds budgets', async () => {
    device.locales = ['en-US'];
    withBudgets(1);
    await launch();
    expect(saved()).toBe('GBP');
  });

  it('never overrides a currency the user chose', async () => {
    device.locales = ['en-US'];
    device.storage.store.set('app_currency', JSON.stringify({ code: 'AUD', symbol: 'A$', name: 'Australian Dollar' }));
    vi.resetModules();
    const { initCurrency } = await import('../../hooks/useCurrency');
    initCurrency();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(saved()).toBe('AUD');
  });
});
