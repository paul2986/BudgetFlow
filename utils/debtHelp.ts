/**
 * UK debt-advice signposting for Tools → Debt help.
 *
 * A short, hand-checked list of free services, nothing more: the app doesn't
 * advise, refer for a fee or send anything from a budget to them. Every entry
 * was checked against the organisation's own site and GOV.UK's "Get free debt
 * advice" page on CHECKED_ON; re-check before editing and bump the date.
 *
 * Opening hours are left to each organisation's site on purpose. They change,
 * and a wrong time on this page is worse than none for someone about to call.
 * A phone number is stored twice, as shown (`display`) and as dialled (`dial`).
 */

export const CHECKED_ON = '2026-10-04';

export type Nation = 'england' | 'wales' | 'scotland' | 'northernIreland';

export const NATIONS: { value: Nation; label: string }[] = [
  { value: 'england', label: 'England' },
  { value: 'wales', label: 'Wales' },
  { value: 'scotland', label: 'Scotland' },
  { value: 'northernIreland', label: 'Northern Ireland' },
];

export interface DebtHelpService {
  id: string;
  name: string;
  /** Who runs it, shown as a plain label so a company is never passed off as a charity. */
  kind: 'Charity' | 'Government-backed';
  summary: string;
  /** Where the service covers; the screen lists only the ones for the chosen nation. */
  nations: Nation[];
  url: string;
  /** A free phone line. */
  phone: { display: string; dial: string };
}

const ALL: Nation[] = ['england', 'wales', 'scotland', 'northernIreland'];

const NATION_NAME: Record<Nation, string> = {
  england: 'England',
  wales: 'Wales',
  scotland: 'Scotland',
  northernIreland: 'Northern Ireland',
};

/** In display order: the UK-wide charities first, then local advice, then the government-backed finder. */
export const DEBT_HELP_SERVICES: DebtHelpService[] = [
  {
    id: 'stepchange',
    name: 'StepChange',
    kind: 'Charity',
    summary: 'Expert, tailored debt advice from a charity covering the whole UK. Start with their online tool, or phone for a plan.',
    nations: ALL,
    url: 'https://www.stepchange.org/',
    phone: { display: '0800 138 1111', dial: '08001381111' },
  },
  {
    id: 'national-debtline',
    name: 'National Debtline',
    kind: 'Charity',
    summary: 'Free, confidential and judgement-free advice by phone or web chat, and an online tool that builds a plan for you.',
    nations: ['england', 'wales', 'scotland'],
    url: 'https://nationaldebtline.org/',
    phone: { display: '0808 808 4000', dial: '08088084000' },
  },
  {
    id: 'citizens-advice-england',
    name: 'Citizens Advice',
    kind: 'Charity',
    summary: 'Help to sort out your debts and priority bills, by phone, online or at a local office.',
    nations: ['england'],
    url: 'https://www.citizensadvice.org.uk/debt-and-money/help-with-debt/',
    phone: { display: '0800 144 8848', dial: '08001448848' },
  },
  {
    id: 'citizens-advice-wales',
    name: 'Citizens Advice',
    kind: 'Charity',
    summary: 'Free advice from Advicelink Cymru on debts, priority bills and benefits, by phone, online or at a local office.',
    nations: ['wales'],
    url: 'https://www.citizensadvice.org.uk/wales/about-us/information/advicelink-cymru/',
    phone: { display: '0800 702 2020', dial: '08007022020' },
  },
  {
    id: 'citizens-advice-scotland',
    name: 'Citizens Advice',
    kind: 'Charity',
    summary: 'Free advice on debt in Scotland, where the rules differ. The line connects you to a local Citizens Advice.',
    nations: ['scotland'],
    url: 'https://www.citizensadvice.org.uk/scotland/',
    phone: { display: '0800 028 1456', dial: '08000281456' },
  },
  {
    id: 'advice-ni',
    name: 'Advice NI',
    kind: 'Charity',
    summary: 'Free, independent advice on personal debt in Northern Ireland, with advice agencies across the country.',
    nations: ['northernIreland'],
    url: 'https://www.adviceni.net/',
    phone: { display: '0800 915 4604', dial: '08009154604' },
  },
  {
    id: 'moneyhelper',
    name: 'MoneyHelper',
    kind: 'Government-backed',
    summary: 'A government-backed service. Its debt advice locator finds free advisers near you, online, by phone or face to face.',
    nations: ALL,
    url: 'https://www.moneyhelper.org.uk/en/money-troubles/dealing-with-debt/debt-advice-locator',
    phone: { display: '0800 138 7777', dial: '08001387777' },
  },
];

/** Where to check that a firm offering to help with debt is authorised. */
export const FCA_REGISTER_URL = 'https://register.fca.org.uk/';

export const servicesFor = (nation: Nation): DebtHelpService[] => DEBT_HELP_SERVICES.filter((s) => s.nations.includes(nation));

/** Where a service helps, in words: "Whole UK", "England, Wales and Scotland" or one nation. */
export const coverageLabel = (service: Pick<DebtHelpService, 'nations'>): string => {
  if (service.nations.length === ALL.length) return 'Whole UK';
  const names = service.nations.map((n) => NATION_NAME[n]);
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0];
};

export const telHref = (dial: string): string => `tel:${dial}`;

/** "4 October 2026" for the "checked on" note. Parsed at noon so no time zone moves the day. */
export const checkedOnLabel = (): string =>
  new Date(`${CHECKED_ON}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

/**
 * The services are for people in the UK, and the app has no country setting, so
 * the currency stands in: the debt-help card in Tools and the nudges (later) show
 * only when it is pounds. Anyone can still reach the screen by its route.
 */
export const isUkCurrency = (code: string | undefined): boolean => code === 'GBP';
