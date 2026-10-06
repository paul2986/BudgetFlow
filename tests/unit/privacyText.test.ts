import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { PRIVACY_SECTIONS } from '../../utils/privacyText';

// The privacy page makes claims about what the app does. These check the ones a
// machine can: when one fails, the code changed and the page (utils/privacyText.ts)
// needs to say so, with a new date.
const text = PRIVACY_SECTIONS.flatMap((s) => s.lines).join('\n');
const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

describe('privacy text', () => {
  it('states the invite expiry the database actually uses', () => {
    const sql = read('supabase/migrations/20261001120000_shared_budgets.sql');
    const days = sql.match(/expires_at timestamptz not null default now\(\) \+ interval '(\d+) days'/)?.[1];
    expect(days).toBeDefined();
    expect(text).toContain(`expires after ${days} days`);
  });

  it('only claims no analytics while the one analytics SDK is Vercel’s (web only)', () => {
    const pkg = JSON.parse(read('package.json'));
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    const trackers = deps.filter((d) =>
      /sentry|analytics|amplitude|mixpanel|posthog|firebase|bugsnag|crashlytics|segment|datadog|appsflyer|adjust/i.test(d)
    );
    expect(trackers).toEqual(['@vercel/analytics']);
    expect(read('app/_layout.tsx')).toMatch(/Platform\.OS === 'web' && <Analytics \/>/);
  });

  it('describes account deletion the way the function behaves', () => {
    const fn = read('supabase/functions/delete-account/index.ts');
    expect(fn).toContain('auth.admin.deleteUser');
    expect(text).toMatch(/Delete account removes your account/);
  });

  it('covers what is stored, kept on the device, who sees it, who else is involved and the user’s choices', () => {
    expect(PRIVACY_SECTIONS.map((s) => s.title)).toEqual([
      'What we store',
      'What stays on your device',
      'Who can see your budgets',
      'Who else is involved',
      'Your choices',
    ]);
  });
});
