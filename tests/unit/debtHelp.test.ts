import { describe, expect, it } from 'vitest';
import {
  CHECKED_ON,
  DEBT_HELP_SERVICES,
  FCA_REGISTER_URL,
  NATIONS,
  checkedOnLabel,
  coverageLabel,
  isUkCurrency,
  servicesFor,
  telHref,
  type Nation,
} from '../../utils/debtHelp';

describe('DEBT_HELP_SERVICES', () => {
  it('has unique ids', () => {
    const ids = DEBT_HELP_SERVICES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('links only to https pages', () => {
    for (const s of DEBT_HELP_SERVICES) expect(s.url, s.id).toMatch(/^https:\/\/[^\s]+$/);
    expect(FCA_REGISTER_URL).toMatch(/^https:\/\//);
  });

  it('shows each number the way it is dialled', () => {
    for (const s of DEBT_HELP_SERVICES) {
      // Free numbers only: 0800 and 0808. A paid 03 or 084 line has no place here.
      expect(s.phone.dial, s.id).toMatch(/^080[08]\d{7}$/);
      expect(s.phone.display.replace(/ /g, ''), s.id).toBe(s.phone.dial);
      expect(telHref(s.phone.dial)).toBe(`tel:${s.phone.dial}`);
    }
  });

  it('names who runs each one with a known label', () => {
    for (const s of DEBT_HELP_SERVICES) expect(['Charity', 'Government-backed'], s.id).toContain(s.kind);
  });

  it('does not state opening hours, which go stale', () => {
    for (const s of DEBT_HELP_SERVICES) expect(s.summary, s.id).not.toMatch(/\b\d{1,2}\s?(am|pm)\b|monday|mon-fri|24\/7/i);
  });
});

describe('servicesFor', () => {
  const ids = (n: Nation) => servicesFor(n).map((s) => s.id);

  it('gives every nation at least two ways in, led by a charity', () => {
    for (const { value } of NATIONS) {
      const list = servicesFor(value);
      expect(list.length, value).toBeGreaterThanOrEqual(2);
      expect(list[0].kind, value).toBe('Charity');
    }
  });

  it('lists one Citizens Advice entry per nation it covers, with that nation’s number', () => {
    expect(ids('england')).toContain('citizens-advice-england');
    expect(ids('england')).not.toContain('citizens-advice-wales');
    expect(ids('wales')).toContain('citizens-advice-wales');
    expect(ids('scotland')).toContain('citizens-advice-scotland');
    expect(ids('northernIreland').some((id) => id.startsWith('citizens-advice'))).toBe(false);
  });

  it('keeps National Debtline out of Northern Ireland, where it does not operate', () => {
    expect(ids('northernIreland')).not.toContain('national-debtline');
    expect(ids('northernIreland')).toContain('advice-ni');
    for (const n of ['england', 'wales', 'scotland'] as const) expect(ids(n)).toContain('national-debtline');
  });

  it('offers StepChange and MoneyHelper everywhere', () => {
    for (const { value } of NATIONS) {
      expect(ids(value)).toContain('stepchange');
      expect(ids(value)).toContain('moneyhelper');
    }
  });
});

describe('coverageLabel', () => {
  it('says "Whole UK" for a service in every nation', () => {
    expect(coverageLabel(DEBT_HELP_SERVICES.find((s) => s.id === 'stepchange')!)).toBe('Whole UK');
  });
  it('lists several nations with "and"', () => {
    expect(coverageLabel({ nations: ['england', 'wales', 'scotland'] })).toBe('England, Wales and Scotland');
    expect(coverageLabel({ nations: ['england', 'wales'] })).toBe('England and Wales');
  });
  it('names a single nation', () => {
    expect(coverageLabel({ nations: ['northernIreland'] })).toBe('Northern Ireland');
  });
});

describe('isUkCurrency', () => {
  it('is true for pounds only', () => {
    expect(isUkCurrency('GBP')).toBe(true);
    expect(isUkCurrency('USD')).toBe(false);
    expect(isUkCurrency('EUR')).toBe(false);
    expect(isUkCurrency(undefined)).toBe(false);
  });
});

describe('checkedOnLabel', () => {
  it('formats the check date as a UK long date', () => {
    expect(CHECKED_ON).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(checkedOnLabel()).toBe('4 October 2026');
  });
});
