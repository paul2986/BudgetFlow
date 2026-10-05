import { describe, expect, it } from 'vitest';
import { currencyCodeForLocales, regionOfLocale } from '../../utils/currencyLocale';

const AVAILABLE = ['GBP', 'USD', 'EUR', 'CAD', 'AUD', 'JPY', 'CNY', 'BRL', 'INR'];

describe('regionOfLocale', () => {
  it('reads the region from a language tag', () => {
    expect(regionOfLocale('en-GB')).toBe('GB');
    expect(regionOfLocale('en-us')).toBe('US');
    expect(regionOfLocale('pt_BR')).toBe('BR');
  });

  it('skips a script subtag', () => {
    expect(regionOfLocale('zh-Hans-CN')).toBe('CN');
    expect(regionOfLocale('sr-Latn-RS')).toBe('RS');
  });

  it('is undefined for a bare language, and ignores extensions', () => {
    expect(regionOfLocale('en')).toBeUndefined();
    expect(regionOfLocale('en-u-ca-gregory')).toBeUndefined();
    expect(regionOfLocale('')).toBeUndefined();
  });
});

describe('currencyCodeForLocales', () => {
  it('maps a region to its currency', () => {
    expect(currencyCodeForLocales(['en-GB'], AVAILABLE)).toBe('GBP');
    expect(currencyCodeForLocales(['en-US'], AVAILABLE)).toBe('USD');
    expect(currencyCodeForLocales(['en-CA'], AVAILABLE)).toBe('CAD');
    expect(currencyCodeForLocales(['ja-JP'], AVAILABLE)).toBe('JPY');
  });

  it('gives the euro to euro-area regions, including the newest members', () => {
    for (const tag of ['de-DE', 'fr-FR', 'es-ES', 'nl-NL', 'en-IE', 'hr-HR', 'bg-BG']) {
      expect(currencyCodeForLocales([tag], AVAILABLE)).toBe('EUR');
    }
  });

  it('follows the most preferred locale that has a region', () => {
    expect(currencyCodeForLocales(['en', 'de-DE', 'en-US'], AVAILABLE)).toBe('EUR');
    expect(currencyCodeForLocales(['en-US', 'de-DE'], AVAILABLE)).toBe('USD');
  });

  it('is undefined when nothing names a currency the app offers', () => {
    expect(currencyCodeForLocales([], AVAILABLE)).toBeUndefined();
    expect(currencyCodeForLocales(['en'], AVAILABLE)).toBeUndefined();
    // Region known, but its currency isn't offered.
    expect(currencyCodeForLocales(['en-US'], ['GBP', 'EUR'])).toBeUndefined();
    expect(currencyCodeForLocales(['en-ZZ'], AVAILABLE)).toBeUndefined();
  });
});
