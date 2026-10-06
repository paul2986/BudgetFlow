/**
 * The words of the privacy page (components/PrivacyContent), kept apart from the
 * screen so a unit test can check them against the code and database.
 *
 * Every statement describes what the app and database do today (see
 * supabase/migrations, supabase/functions/delete-account and the web-only
 * Analytics in app/_layout.tsx). When one of those changes, change this and
 * the date; tests/unit/privacyText.test.ts fails for the claims it can check.
 */

export const PRIVACY_UPDATED = '6 October 2026';

export interface Section {
  title: string;
  /** Paragraphs and bullets, in order. A string starting "• " is a bullet. */
  lines: string[];
}

export const PRIVACY_SECTIONS: Section[] = [
  {
    title: 'What we store',
    lines: [
      '• Your account: your email address and a password, which is stored scrambled so that no one can read it back.',
      '• Your budgets: their names, the people and incomes in them, and your expenses.',
      '• Feedback you send from Settings, with the app version and the kind of device (iPhone, Android or web).',
    ],
  },
  {
    title: 'What stays on your device',
    lines: [
      'A copy of your budgets is kept on the device so the app opens quickly, along with settings such as your currency, theme and expense filters. Signing out removes the copy of your budgets.',
      'Budget lock uses your device’s Face ID, Touch ID or passcode. Budget Flow never sees them.',
    ],
  },
  {
    title: 'Who can see your budgets',
    lines: [
      'You, and anyone you invite. People you share a budget with can see and change everything in it, and can see each other’s email addresses.',
      'An invite link works once and expires after 7 days. Anyone holding an unused link can join, so send it only to the person it is for.',
      'Budgets are stored in the database without end-to-end encryption, so the person who runs Budget Flow can technically reach them. The admin screen in the app shows only totals, such as how many people have signed up, never budget contents. They can read feedback you send, but see your email address only if you tick “share my email”.',
    ],
  },
  {
    title: 'Who else is involved',
    lines: [
      '• Supabase stores accounts and budgets and handles signing in.',
      '• Vercel hosts the web app and counts page views on the web version. It does not use cookies or follow you from site to site. The iPhone and Android apps send no analytics.',
      'There are no ads, your data is not sold, and Budget Flow does not connect to your bank.',
    ],
  },
  {
    title: 'Your choices',
    lines: [
      '• Take a copy: export any budget to Excel from Settings → Budgets.',
      '• Erase your budgets: Settings → Erase all data. Your account stays.',
      '• Delete everything: Settings → Delete account removes your account, your feedback and any budgets nobody else shares. A budget you share stays with the people you shared it with.',
      'Questions or requests: send feedback from Settings.',
    ],
  },
];

