import { describe, expect, it, vi } from 'vitest';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { createMemoryStorage } from '../helpers/memoryStorage';
import { makeBudget, makeExpense } from '../helpers/fixtures';
import type { Budget, Person } from '../../types/budget';
import { calculateHouseholdExpenses, calculatePersonIncome, calculateTotalExpenses, calculateTotalIncome } from '../../utils/calculations';

// The importer shares category rules with the storage module, which needs a device store.
const device = createMemoryStorage();
vi.mock('@react-native-async-storage/async-storage', () => ({ default: device }));

const { buildBudgetWorkbook, buildTemplateWorkbook, TEMPLATE_FILE_NAME, workbookFileName } = await import('../../utils/budgetWorkbook/export');
const { parseBudgetWorkbook } = await import('../../utils/budgetWorkbook/import');
const { readXlsx } = await import('../../utils/xlsx/read');
const { serialToYmd, ymdToSerial } = await import('../../utils/budgetWorkbook/layout');

const NOW = new Date('2026-10-01T12:00:00Z');
const ctx = { currencyCode: 'GBP', currencySymbol: '£', fractionDigits: 2, now: NOW };

const person = (id: string, name: string, income: Person['income'] = [], extra: Partial<Person> = {}): Person => ({
  id,
  name,
  income,
  ...extra,
});

const family = (): Budget =>
  makeBudget({
    name: 'Family & Friends <2026>',
    householdSettings: { distributionMethod: 'income-based' },
    people: [
      person('p1', 'Paul', [
        { id: 'i1', amount: 4200, label: 'Salary', frequency: 'monthly', personId: 'p1' },
        { id: 'i2', amount: 150, label: 'Side "gig"', frequency: 'weekly', personId: 'p1' },
      ]),
      person('p2', 'Sam', [{ id: 'i3', amount: 36000, label: 'Salary', frequency: 'yearly', personId: 'p2' }]),
      person('p3', 'Alex', [], { excludeFromHouseholdShare: true }),
    ],
    expenses: [
      makeExpense({ description: 'Mortgage', amount: 1500, categoryTag: 'Mortgage', debtRepayment: 'mortgage', date: '2025-01-01T00:00:00.000Z' }),
      makeExpense({ description: 'Groceries', amount: 85.5, frequency: 'weekly', categoryTag: 'Groceries', date: '2025-01-01T00:00:00.000Z' }),
      makeExpense({
        description: '=SUM(1,2) streaming',
        amount: 12.99,
        category: 'personal',
        personId: 'p1',
        categoryTag: 'Entertainment',
        notes: 'Line one\nLine two & <more>',
        date: '2025-03-04T00:00:00.000Z',
      }),
      makeExpense({ description: 'Old car loan', amount: 600, categoryTag: 'Loan', debtRepayment: 'loan', bucket: 'wants', endDate: '2026-01-31', date: '2022-01-01T00:00:00.000Z' }),
      makeExpense({ description: 'Holiday', amount: 2400, frequency: 'one-time', categoryTag: 'Entertainment', date: '2026-06-01T00:00:00.000Z' }),
      makeExpense({ description: 'Dog food 🐕', amount: 40, category: 'personal', personId: 'p2', categoryTag: 'Pets', date: '2026-02-01T00:00:00.000Z' }),
      makeExpense({ description: 'Coffee', amount: 3, frequency: 'daily', category: 'personal', personId: 'p3', categoryTag: 'Eating Out', endDate: '2026-12-31', date: '2026-02-01T00:00:00.000Z' }),
    ],
  });

const sheet = (bytes: Uint8Array, name: string) => readXlsx(bytes).sheets.find((s) => s.name === name)!;

/** A workbook the way another app might write it: inline strings, no shared strings, prefixed tags. */
const handMade = (sheets: Record<string, (string | number | null)[][]>, extra: { date1904?: boolean } = {}): Uint8Array => {
  const names = Object.keys(sheets);
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const col = (i: number) => String.fromCharCode(65 + i);
  const parts: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'),
    'xl/workbook.xml': strToU8(
      `<x:workbook xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
        `<x:workbookPr${extra.date1904 ? ' date1904="1"' : ''}/><x:sheets>${names
          .map((n, i) => `<x:sheet name="${n}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
          .join('')}</x:sheets></x:workbook>`
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${names
        .map((_, i) => `<Relationship Id="rId${i + 1}" Type="x" Target="/xl/worksheets/s${i + 1}.xml"/>`)
        .join('')}</Relationships>`
    ),
  };
  names.forEach((n, i) => {
    const rows = sheets[n]
      .map(
        (row, r) =>
          `<x:row r="${r + 1}">${row
            .map((v, c) =>
              v === null
                ? ''
                : typeof v === 'number'
                  ? `<x:c r="${col(c)}${r + 1}"><x:v>${v}</x:v></x:c>`
                  : `<x:c r="${col(c)}${r + 1}" t="inlineStr"><x:is><x:t>${esc(v)}</x:t></x:is></x:c>`
            )
            .join('')}</x:row>`
      )
      .join('');
    parts[`xl/worksheets/s${i + 1}.xml`] = strToU8(
      `<x:worksheet xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><x:sheetData>${rows}</x:sheetData></x:worksheet>`
    );
  });
  return zipSync(parts);
};

describe('dates', () => {
  it('converts to and from Excel serial numbers', () => {
    expect(ymdToSerial('1970-01-01')).toBe(25569);
    expect(ymdToSerial('2026-10-01')).toBe(46296);
    expect(serialToYmd(46296)).toBe('2026-10-01');
    expect(serialToYmd(46296.75)).toBe('2026-10-01');
    expect(serialToYmd(46296 - 1462, true)).toBe('2026-10-01');
    expect(ymdToSerial('2026-02-30')).toBeNull();
    expect(ymdToSerial('nonsense')).toBeNull();
  });
});

describe('export', () => {
  it('writes every sheet, with the figures the app would show', () => {
    const budget = family();
    const bytes = buildBudgetWorkbook(budget, ctx);
    const wb = readXlsx(bytes);
    expect(wb.sheets.map((s) => s.name)).toEqual(['Summary', 'People', 'Income', 'Expenses', 'Lists']);

    const summary = sheet(bytes, 'Summary').rows;
    const row = (label: string) => summary.find((r) => r[0] === label)!;
    expect(summary[0][0]).toBe('Family & Friends <2026>');

    // Per-month figures match the app's own calculations (which work in annual cents, then divide).
    const income = calculateTotalIncome(budget.people) / 12;
    const expenses = calculateTotalExpenses(budget.expenses) / 12;
    expect(row('Income')[1]).toBeCloseTo(income, 2);
    expect(row('Expenses')[1]).toBeCloseTo(expenses, 2);
    expect(row('Left to spend')[1]).toBeCloseTo(income - expenses, 2);
    expect(row('Household costs')[1]).toBeCloseTo(calculateHouseholdExpenses(budget.expenses) / 12, 2);
    expect(row('Split method')[1]).toBe('Income-based');
    expect(row('Currency')[1]).toBe('GBP');
    expect(row('Paul')[1]).toBeCloseTo(calculatePersonIncome(budget.people[0]) / 12, 2);
    // Ended expenses (the old car loan) don't count; a person who's excluded pays no share.
    expect(row('Alex')[2]).toBe('No');
    expect(row('Alex')[3]).toBe(0);
  });

  it('keeps text that looks like a formula as text', () => {
    const bytes = buildBudgetWorkbook(family(), ctx);
    const rows = sheet(bytes, 'Expenses').rows;
    expect(rows.find((r) => r[0] === '=SUM(1,2) streaming')).toBeTruthy();
    const files = unzipSync(bytes);
    const xml = strFromU8(files['xl/worksheets/sheet4.xml']);
    const sst = strFromU8(files['xl/sharedStrings.xml']);
    const index = sst.split('<si>').slice(1).findIndex((s) => s.includes('=SUM(1,2) streaming'));
    expect(xml).toContain(`<c r="A4" s="`);
    expect(xml).toMatch(new RegExp(`<c r="A4" s="\\d+" t="s"><v>${index}</v></c>`));
  });

  it('writes Counts as only for an expense that chose a bucket of its own', () => {
    const rows = sheet(buildBudgetWorkbook(family(), ctx), 'Expenses').rows;
    const col = rows[0].indexOf('Counts as');
    expect(col).toBe(10);
    expect(rows.find((r) => r[0] === 'Old car loan')![col]).toBe('Wants');
    expect(rows.find((r) => r[0] === 'Mortgage')![col] ?? null).toBeNull();
    expect(sheet(buildBudgetWorkbook(family(), ctx), 'Lists').rows.flat()).toEqual(expect.arrayContaining(['Counts as', 'Needs', 'Wants', 'Savings']));
  });

  it('gives people with the same name distinct names', () => {
    const budget = makeBudget({ people: [person('a', 'Sam'), person('b', 'Sam'), person('c', ' ')] });
    const names = sheet(buildBudgetWorkbook(budget, ctx), 'People').rows.slice(1, 4).map((r) => r[0]);
    expect(names).toEqual(['Sam', 'Sam (2)', 'Person 3']);
  });

  it('copes with an empty budget', () => {
    const wb = readXlsx(buildBudgetWorkbook(makeBudget({ name: '' }), ctx));
    expect(wb.sheets).toHaveLength(5);
  });

  it('builds a blank template the importer recognises', () => {
    const bytes = buildTemplateWorkbook(ctx);
    const wb = readXlsx(bytes);
    expect(wb.sheets.map((s) => s.name)).toEqual(['Summary', 'People', 'Income', 'Expenses', 'Lists']);
    expect(TEMPLATE_FILE_NAME).toMatch(/\.xlsx$/);

    const summary = sheet(bytes, 'Summary').rows.map((r) => String(r[0] ?? ''));
    expect(summary.some((t) => t.startsWith('Blank template from Budget Flow'))).toBe(true);
    expect(summary.some((t) => t.startsWith('Exported from'))).toBe(false);
    expect(summary.some((t) => t.startsWith('Moving your own spreadsheet'))).toBe(true);

    // Headings are what the importer finds columns by: no data yet, but nothing unrecognised either.
    const result = parseBudgetWorkbook(bytes, { currencyCode: 'GBP', now: NOW });
    expect(result.budget).toBeNull();
    expect(result.failure).toBe('empty');
    expect(result.issues.map((i) => i.message)).toEqual(['There’s nothing to import: no people, income or expenses were found.']);
  });

  it('keeps an export’s wording out of the template, and the template’s out of an export', () => {
    const exported = sheet(buildBudgetWorkbook(family(), ctx), 'Summary').rows.map((r) => String(r[0] ?? ''));
    expect(exported.some((t) => t.startsWith('Exported from Budget Flow'))).toBe(true);
    expect(exported.some((t) => t.startsWith('Moving your own spreadsheet'))).toBe(false);
  });

  it('names the file after the budget and strips characters filesystems reject', () => {
    expect(workbookFileName('Family', NOW)).toBe('Family - 2026-10-01.xlsx');
    expect(workbookFileName('a/b:c*d?"e<f>g|h. ', NOW)).toBe('abcdefgh - 2026-10-01.xlsx');
    expect(workbookFileName('   ', NOW)).toBe('Budget - 2026-10-01.xlsx');
  });
});

describe('import', () => {
  it('reads back what was exported', () => {
    const budget = family();
    const result = parseBudgetWorkbook(buildBudgetWorkbook(budget, ctx), { fileName: 'x.xlsx', currencyCode: 'GBP', now: NOW });
    expect(result.issues).toEqual([]);
    const imported = result.budget!;
    expect(imported.name).toBe('Family & Friends <2026>');
    expect(imported.householdSettings.distributionMethod).toBe('income-based');
    expect(result.counts).toEqual({ people: 3, income: 3, expenses: 7, skipped: 0 });

    expect(imported.people.map((p) => [p.name, p.excludeFromHouseholdShare ?? false])).toEqual([
      ['Paul', false],
      ['Sam', false],
      ['Alex', true],
    ]);
    const paul = imported.people[0];
    expect(paul.income.map((i) => [i.label, i.amount, i.frequency, i.personId])).toEqual([
      ['Salary', 4200, 'monthly', paul.id],
      ['Side "gig"', 150, 'weekly', paul.id],
    ]);

    const byName = (d: string) => imported.expenses.find((e) => e.description === d)!;
    expect(byName('=SUM(1,2) streaming')).toMatchObject({
      amount: 12.99,
      category: 'personal',
      personId: paul.id,
      categoryTag: 'Entertainment',
      notes: 'Line one\nLine two & <more>',
      date: '2025-03-04T00:00:00.000Z',
    });
    expect(byName('Mortgage')).toMatchObject({ category: 'household', debtRepayment: 'mortgage', frequency: 'monthly' });
    expect(byName('Mortgage').personId).toBeUndefined();
    expect(byName('Old car loan')).toMatchObject({ endDate: '2026-01-31', debtRepayment: 'loan', bucket: 'wants' });
    expect(byName('Mortgage').bucket).toBeUndefined();
    expect(byName('Holiday')).toMatchObject({ frequency: 'one-time' });
    expect(byName('Holiday').endDate).toBeUndefined();
    expect(byName('Dog food 🐕').categoryTag).toBe('Pets');
    expect(imported.customCategories).toEqual(['Pets']);
  });

  it('gives everything fresh ids', () => {
    const budget = family();
    const imported = parseBudgetWorkbook(buildBudgetWorkbook(budget, ctx), { now: NOW }).budget!;
    const oldIds = new Set([...budget.people.map((p) => p.id), ...budget.expenses.map((e) => e.id), 'i1', 'i2', 'i3']);
    const ids = [...imported.people.map((p) => p.id), ...imported.people.flatMap((p) => p.income.map((i) => i.id)), ...imported.expenses.map((e) => e.id)];
    expect(ids.some((id) => oldIds.has(id))).toBe(false);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('skips bad rows, says why, and imports the rest', () => {
    const bytes = handMade({
      People: [['Name', 'Splits household costs'], ['Paul', 'Yes'], ['Sam', 'no']],
      Income: [
        ['Person', 'Source', 'Amount', 'Frequency'],
        ['Paul', 'Salary', 3000, 'Monthly'],
        ['Nobody', 'Salary', 100, 'Monthly'],
        ['Sam', 'Gig', 'lots', 'Monthly'],
      ],
      Expenses: [
        ['Description', 'Amount', 'Frequency', 'Type', 'Person', 'Category', 'Starts', 'Ends'],
        ['Rent', 1200, 'monthly', 'Household', null, 'Rent', 46296, null],
        ['No amount', null, 'monthly', 'Household', null, null, null, null],
        ['Odd frequency', 5, 'fortnightly', 'Household', null, null, null, null],
        ['Odd type', 5, 'monthly', 'Shared', null, null, null, null],
        ['Needs person', 5, 'monthly', 'Personal', null, null, null, null],
        ['Wrong person', 5, 'monthly', 'Personal', 'Zed', null, null, null],
        ['Free', 0, 'monthly', 'Household', null, null, null, null],
        ['Bad date', 5, 'monthly', 'Household', null, null, 'tomorrow-ish', null],
        ['Ends early', 5, 'monthly', 'Household', null, null, 46296, 46000],
        ['Coffee', '£3.50', 'Daily', null, 'Sam', 'eating out', '3 Oct 2026', null],
      ],
    });
    const result = parseBudgetWorkbook(bytes, { now: NOW });
    const messages = result.issues.map((i) => `${i.severity} ${i.sheet}:${i.row} ${i.message}`);
    expect(messages).toEqual([
      'error Income:3 “Nobody” isn’t on the People sheet.',
      'error Income:4 The amount isn’t a number.',
      'error Expenses:3 The amount is missing.',
      'error Expenses:4 “fortnightly” isn’t a frequency. Use daily, weekly, monthly, yearly, one-time.',
      'error Expenses:5 “Shared” isn’t a type. Use Household or Personal.',
      'error Expenses:6 A personal expense needs a person.',
      'error Expenses:7 “Zed” isn’t on the People sheet.',
      'error Expenses:8 The amount must be more than zero.',
      'error Expenses:9 The start date isn’t a date. Enter it as a date, like 1 Oct 2026.',
      'warning Expenses:10 The end date is before the start date, so it was ignored.',
    ]);
    expect(result.counts).toEqual({ people: 2, income: 1, expenses: 3, skipped: 9 });
    const budget = result.budget!;
    expect(budget.expenses.map((e) => e.description)).toEqual(['Rent', 'Ends early', 'Coffee']);
    const coffee = budget.expenses[2];
    expect(coffee).toMatchObject({ amount: 3.5, category: 'personal', categoryTag: 'Eating Out', date: '2026-10-03T00:00:00.000Z' });
    expect(budget.expenses[1].endDate).toBeUndefined();
    expect(budget.people[1].excludeFromHouseholdShare).toBe(true);
  });

  it('finds columns by header, in any order, with extras, and defaults the rest', () => {
    const bytes = handMade({
      Expenses: [
        ['My expense list'],
        ['Notes', 'Whatever', 'FREQUENCY', ' amount ', 'description'],
        ['hello', 'ignored', 'Weekly', 20, 'Bus pass'],
      ],
    });
    const result = parseBudgetWorkbook(bytes, { fileName: 'Holiday budget - 2026-10-01.xlsx', now: NOW });
    expect(result.issues).toEqual([]);
    expect(result.budget!.name).toBe('Holiday budget');
    expect(result.budget!.householdSettings.distributionMethod).toBe('even');
    expect(result.budget!.expenses[0]).toMatchObject({
      description: 'Bus pass',
      amount: 20,
      frequency: 'weekly',
      category: 'household',
      categoryTag: 'Misc',
      notes: 'hello',
      date: '2026-10-01T00:00:00.000Z',
    });
  });

  it('reads Counts as: blank follows the category, and a bucket the category already has is dropped', () => {
    const bytes = handMade({
      Expenses: [
        ['Description', 'Amount', 'Frequency', 'Category', 'Counts as'],
        ['Sofa loan', 80, 'Monthly', 'Loan', 'Wants'],
        ['Car loan', 150, 'Monthly', 'Loan', ''],
        ['Pinned', 60, 'Monthly', 'Loan', 'needs'],
        ['Extra payment', 100, 'Monthly', 'Loan', ' SAVINGS '],
        ['Treat', 20, 'Monthly', 'Eating Out', 'Needs'],
        ['Typo', 10, 'Monthly', 'Loan', 'Sideways'],
      ],
    });
    const result = parseBudgetWorkbook(bytes, { now: NOW });
    const bucketOf = (d: string) => result.budget!.expenses.find((e) => e.description === d)!.bucket;
    expect(bucketOf('Sofa loan')).toBe('wants');
    expect(bucketOf('Car loan')).toBeUndefined();
    expect(bucketOf('Pinned')).toBeUndefined();
    expect(bucketOf('Extra payment')).toBe('savings');
    expect(bucketOf('Treat')).toBe('needs');
    expect(bucketOf('Typo')).toBeUndefined();
    expect(result.issues.map((i) => `${i.severity} ${i.sheet}:${i.row} ${i.message}`)).toEqual([
      'warning Expenses:7 “Sideways” isn’t Needs, Wants or Savings, so the expense follows its category.',
    ]);
    expect(result.counts.expenses).toBe(6);
  });

  it('reads 1904-based dates', () => {
    const bytes = handMade(
      { Expenses: [['Description', 'Amount', 'Frequency', 'Starts'], ['Gym', 30, 'Monthly', 46296 - 1462]] },
      { date1904: true }
    );
    expect(parseBudgetWorkbook(bytes, { now: NOW }).budget!.expenses[0].date).toBe('2026-10-01T00:00:00.000Z');
  });

  it('warns when the workbook is in another currency', () => {
    const bytes = buildBudgetWorkbook(family(), { ...ctx, currencyCode: 'EUR', currencySymbol: '€' });
    const { issues } = parseBudgetWorkbook(bytes, { currencyCode: 'GBP', now: NOW });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ severity: 'warning', sheet: 'Summary' });
    expect(issues[0].message).toContain('EUR');
  });

  it('refuses files that are not budget workbooks', () => {
    const notZip = parseBudgetWorkbook(strToU8('just some text'), {});
    expect(notZip.budget).toBeNull();
    expect(notZip.issues[0].message).toContain('Excel');
    expect(notZip.failure).toBe('unreadable');

    const otherSheets = parseBudgetWorkbook(handMade({ Sheet1: [['a']] }), {});
    expect(otherSheets.budget).toBeNull();
    expect(otherSheets.issues[0].message).toContain('Budget Flow workbook');
    expect(otherSheets.failure).toBe('not-a-budget');

    const empty = parseBudgetWorkbook(handMade({ Expenses: [['Description', 'Amount', 'Frequency']] }), {});
    expect(empty.budget).toBeNull();
    expect(empty.issues[0].message).toContain('nothing to import');
    expect(empty.failure).toBe('empty');

    const noColumns = parseBudgetWorkbook(handMade({ Expenses: [['Foo', 'Bar']] }), {});
    expect(noColumns.budget).toBeNull();
    expect(noColumns.issues.map((i) => i.message)).toContain('Couldn’t find a “Description” column.');
  });

  it('refuses a file that claims to inflate to a huge size', () => {
    const bomb = zipSync({ 'xl/worksheets/sheet1.xml': new Uint8Array(30 * 1024 * 1024) });
    const result = parseBudgetWorkbook(bomb, {});
    expect(result.budget).toBeNull();
    expect(result.issues[0].message).toContain('too large');
  });
});
