# Tests

Two suites, both run with [Vitest](https://vitest.dev).

| Command | What it covers | Needs |
| --- | --- | --- |
| `npm test` | `tests/unit`: the budget merge rules, device storage (categories, deletes, lock, older data formats, importing a budget) and the Excel export/import (workbook round trip, bad rows, files re-saved by other apps) | Nothing |
| `npm run test:db` | `tests/db`: who can do what with shared budgets, budgets syncing between devices and people, and the admin overview (who may ask, that it carries no budget content, that it adds up) | A local Supabase |

## Database tests

Start a local Supabase once (Docker must be running). It applies everything in `supabase/migrations`:

```bash
npm run db:start
npm run test:db
```

Each test creates its own throwaway users with random emails, so runs don't interfere and the database never needs resetting. The helpers refuse to run against anything but `localhost`, since they create and delete users. Stop the stack with `supabase stop`.

Admins can only be added with SQL (`private.admins` isn't reachable through the API), so `makeAdmin` in the helpers connects to the database directly, on `127.0.0.1:54322` unless `SUPABASE_DB_URL` says otherwise, and refuses anything but `localhost` like the rest.

A simulated device (`tests/helpers/device.ts`) is a user's signed-in client plus its own in-memory storage and its own copy of `utils/storage.ts` and `utils/budgetSync.ts`, so two devices, or two people, can be driven side by side in one test.

## When to add a test

- **A change to merging or what's stored on the device:** add to `tests/unit`.
- **A change to a migration, access rules or how budgets sync:** add to `tests/db`. Before relying on a new test, check it fails when you break the rule it covers.
