/**
 * Picks a first currency from the device's language settings, so a new user
 * sees dollars, euros or pounds they recognise before they've chosen anything.
 * Only a default: the choice in Settings → Currency always wins.
 *
 * Pure (no storage, no globals) so it can be unit tested; `deviceLocales` is
 * the one function that reads the environment.
 */

/** ISO 3166 region → ISO 4217 currency, for the currencies the app offers. */
const REGION_CURRENCY: Record<string, string> = {
  GB: 'GBP', GG: 'GBP', JE: 'GBP', IM: 'GBP',
  US: 'USD', PR: 'USD', GU: 'USD', VI: 'USD', AS: 'USD', EC: 'USD', SV: 'USD', PA: 'USD',
  CA: 'CAD', AU: 'AUD', NZ: 'NZD',
  // Euro area, including Croatia (2023) and Bulgaria (2026).
  AT: 'EUR', BE: 'EUR', BG: 'EUR', CY: 'EUR', DE: 'EUR', EE: 'EUR', ES: 'EUR', FI: 'EUR', FR: 'EUR',
  GR: 'EUR', HR: 'EUR', IE: 'EUR', IT: 'EUR', LT: 'EUR', LU: 'EUR', LV: 'EUR', MT: 'EUR', NL: 'EUR',
  PT: 'EUR', SI: 'EUR', SK: 'EUR', AD: 'EUR', MC: 'EUR', SM: 'EUR', VA: 'EUR', ME: 'EUR', XK: 'EUR',
  JP: 'JPY', CH: 'CHF', LI: 'CHF', CN: 'CNY', IN: 'INR', BR: 'BRL', KR: 'KRW', MX: 'MXN',
  SG: 'SGD', HK: 'HKD', NO: 'NOK', SE: 'SEK', DK: 'DKK', PL: 'PLN', CZ: 'CZK', HU: 'HUF',
  RU: 'RUB', TR: 'TRY', ZA: 'ZAR', TH: 'THB', MY: 'MYR', ID: 'IDR', PH: 'PHP', VN: 'VND',
  AE: 'AED', SA: 'SAR', QA: 'QAR', KW: 'KWD', BH: 'BHD', OM: 'OMR', JO: 'JOD', EG: 'EGP',
  IL: 'ILS', RO: 'RON', RS: 'RSD', UA: 'UAH', BY: 'BYN', KZ: 'KZT', GE: 'GEL', AM: 'AMD',
  AZ: 'AZN', MD: 'MDL', AL: 'ALL', MK: 'MKD', BA: 'BAM', IS: 'ISK',
  CL: 'CLP', AR: 'ARS', UY: 'UYU', PY: 'PYG', BO: 'BOB', PE: 'PEN', CO: 'COP',
  NG: 'NGN', GH: 'GHS', KE: 'KES', UG: 'UGX', TZ: 'TZS', ET: 'ETB',
};

/**
 * The region of a BCP 47 locale tag ("en-GB" → "GB", "zh-Hans-CN" → "CN",
 * "pt_BR" → "BR"), or undefined when it names only a language ("en").
 */
export const regionOfLocale = (locale: string): string | undefined => {
  const parts = locale.split(/[-_]/);
  for (const part of parts.slice(1)) {
    // A single character starts an extension ("-u-ca-gregory"); its subtags aren't regions.
    if (part.length === 1) return undefined;
    if (/^[A-Za-z]{2}$/.test(part)) return part.toUpperCase();
  }
  return undefined;
};

/**
 * The currency code for the first locale whose region maps to a currency the
 * app offers, or undefined when none does (a bare "en", an unlisted region).
 */
export const currencyCodeForLocales = (
  locales: readonly string[],
  available: readonly string[]
): string | undefined => {
  for (const locale of locales) {
    const region = regionOfLocale(locale);
    const code = region ? REGION_CURRENCY[region] : undefined;
    if (code && available.includes(code)) return code;
  }
  return undefined;
};

/** The device's preferred locales, most preferred first. Empty when it can't tell. */
export const deviceLocales = (): string[] => {
  const found: string[] = [];
  try {
    if (typeof navigator !== 'undefined' && Array.isArray(navigator.languages)) found.push(...navigator.languages);
    if (typeof navigator !== 'undefined' && navigator.language) found.push(navigator.language);
  } catch {
    // No navigator (some native runtimes): fall through to Intl.
  }
  try {
    // On native (Hermes) this is the device's region setting.
    found.push(new Intl.NumberFormat().resolvedOptions().locale);
  } catch {
    // No Intl.
  }
  return [...new Set(found.filter(Boolean))];
};
