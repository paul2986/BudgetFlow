import {
  DEFAULT_CATEGORIES,
  debtRepaymentForCategory,
  type Expense,
  type Frequency,
  type HouseholdSettings,
  type Income,
  type Person,
} from '../../types/budget';
import { normalizeCategoryName } from '../storage';
import { readXlsx, XlsxError, type CellValue, type SheetData, type WorkbookData } from '../xlsx/read';
import { FREQUENCIES, SHEETS, SUMMARY_LABELS, serialToYmd, todayYmd, ymdToSerial } from './layout';

/**
 * Reads a budget workbook (as exported by `buildBudgetWorkbook`, then edited
 * or built by hand) into a budget ready to be saved as a new one. Columns are
 * found by their header text, so reordering them or adding your own is fine.
 * Problems are reported per row and never thrown: a bad row is skipped and
 * the rest still import.
 */

export interface ImportIssue {
  severity: 'error' | 'warning';
  message: string;
  sheet?: string;
  /** The row number as Excel shows it. */
  row?: number;
}

export interface ImportedBudget {
  name: string;
  householdSettings: HouseholdSettings;
  people: Person[];
  expenses: Expense[];
  /** Categories used that aren't built in, to be added to the new budget's list. */
  customCategories: string[];
}

export interface ImportResult {
  /** Null when nothing could be imported. */
  budget: ImportedBudget | null;
  issues: ImportIssue[];
  counts: { people: number; income: number; expenses: number; skipped: number };
}

export interface ImportOptions {
  fileName?: string;
  /** The currency the app is set to, to warn when the workbook was exported in another. */
  currencyCode?: string;
  now?: Date;
}

const MAX_PEOPLE = 100;
const MAX_INCOME = 1000;
const MAX_EXPENSES = 3000;
const MAX_NAME = 50;

export const describeIssue = (issue: ImportIssue): string =>
  issue.sheet && issue.row ? `${issue.sheet}, row ${issue.row}: ${issue.message}` : issue.sheet ? `${issue.sheet}: ${issue.message}` : issue.message;

// Cells ---------------------------------------------------------------------

const textOf = (v: CellValue | undefined): string => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  return String(v);
};

const norm = (v: CellValue | undefined): string => textOf(v).toLowerCase().replace(/\s+/g, ' ');

const parseAmount = (v: CellValue | undefined): number | 'invalid' | null => {
  if (v === null || v === undefined || v === '') return null;
  let n: number;
  if (typeof v === 'number') n = v;
  else if (typeof v === 'string') {
    // Allow a typed symbol and thousands commas ("£1,200.50"); anything else is ambiguous.
    const cleaned = v.replace(/[^\d.,-]/g, '');
    if (!/^-?(\d{1,3}(,\d{3})+|\d+)(\.\d+)?$/.test(cleaned)) return 'invalid';
    n = Number(cleaned.replace(/,/g, ''));
  } else return 'invalid';
  if (!Number.isFinite(n) || Math.abs(n) > 1e12) return 'invalid';
  return Math.round(n * 100) / 100;
};

const FREQUENCY_WORDS: Record<string, Frequency> = {
  daily: 'daily',
  day: 'daily',
  weekly: 'weekly',
  week: 'weekly',
  monthly: 'monthly',
  month: 'monthly',
  yearly: 'yearly',
  year: 'yearly',
  annual: 'yearly',
  annually: 'yearly',
  'one-time': 'one-time',
  'one time': 'one-time',
  onetime: 'one-time',
  once: 'one-time',
};

const parseFrequency = (v: CellValue | undefined): Frequency | 'invalid' | null => {
  const text = norm(v);
  if (!text) return null;
  return FREQUENCY_WORDS[text] ?? 'invalid';
};

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

const plausible = (ymd: string): boolean => {
  const year = Number(ymd.slice(0, 4));
  return year >= 1990 && year <= 2100;
};

const parseDate = (v: CellValue | undefined, date1904: boolean): string | 'invalid' | null => {
  if (v === null || v === undefined || v === '') return null;
  let ymd: string | null = null;
  if (typeof v === 'number') ymd = serialToYmd(v, date1904);
  else if (typeof v === 'string') {
    const text = v.trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(text)) ymd = ymdToSerial(text) === null ? null : text.slice(0, 10);
    else {
      const m = /^(\d{1,2})[\s-]+([A-Za-z]{3,9})\.?,?[\s-]+(\d{4})$/.exec(text);
      const month = m ? MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()) : -1;
      if (m && month >= 0) {
        const candidate = `${m[3]}-${String(month + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
        ymd = ymdToSerial(candidate) === null ? null : candidate;
      }
    }
  }
  return ymd && plausible(ymd) ? ymd : 'invalid';
};

// Headers -------------------------------------------------------------------

type ColumnSpec<K extends string> = Record<K, { aliases: string[]; required?: boolean }>;

/**
 * Finds the header row (one of the first few) and the column of each field in it.
 * Returns what was missing when no row has every required column.
 */
const findColumns = <K extends string>(
  rows: CellValue[][],
  spec: ColumnSpec<K>
): { headerRow: number; cols: Partial<Record<K, number>> } | { missing: string[] } => {
  const keys = Object.keys(spec) as K[];
  let bestMissing: string[] | null = null;
  for (let r = 0; r < Math.min(rows.length, 15); r++) {
    const cells = (rows[r] || []).map(norm);
    const cols: Partial<Record<K, number>> = {};
    const used = new Set<number>();
    for (const key of keys) {
      const at = cells.findIndex((c, i) => !used.has(i) && spec[key].aliases.includes(c));
      if (at >= 0) {
        cols[key] = at;
        used.add(at);
      }
    }
    const missing = keys.filter((k) => spec[k].required && cols[k] === undefined).map((k) => spec[k].aliases[0]);
    if (!missing.length) return { headerRow: r, cols };
    if (used.size > 0 && (!bestMissing || missing.length < bestMissing.length)) bestMissing = missing;
  }
  return { missing: bestMissing ?? keys.filter((k) => spec[k].required).map((k) => spec[k].aliases[0]) };
};

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// Parse ---------------------------------------------------------------------

export const parseBudgetWorkbook = (bytes: Uint8Array, options: ImportOptions = {}): ImportResult => {
  const now = options.now ?? new Date();
  const stamp = now.getTime();
  const issues: ImportIssue[] = [];
  const counts = { people: 0, income: 0, expenses: 0, skipped: 0 };
  const fail = (message: string): ImportResult => ({ budget: null, issues: [{ severity: 'error', message }], counts });

  let wb: WorkbookData;
  try {
    wb = readXlsx(bytes);
  } catch (e) {
    return fail(e instanceof XlsxError ? e.message : 'That file couldn’t be read as an Excel workbook.');
  }

  const sheetNamed = (name: string): SheetData | undefined =>
    wb.sheets.find((s) => s.name.trim().toLowerCase() === name.toLowerCase());
  const summarySheet = sheetNamed(SHEETS.summary);
  const peopleSheet = sheetNamed(SHEETS.people);
  const incomeSheet = sheetNamed(SHEETS.income);
  const expensesSheet = sheetNamed(SHEETS.expenses);
  if (!peopleSheet && !incomeSheet && !expensesSheet) {
    return fail('That doesn’t look like a Budget Flow workbook. It needs a People, Income or Expenses sheet.');
  }

  let seq = 0;
  const makeId = (prefix: string) => `${prefix}_${stamp}_${seq++}_${Math.random().toString(36).slice(2, 8)}`;
  const error = (sheet: string, row: number, message: string) => {
    issues.push({ severity: 'error', sheet, row, message });
    counts.skipped += 1;
  };
  const warn = (sheet: string, row: number | undefined, message: string) =>
    issues.push({ severity: 'warning', sheet, row, message });

  // Summary: the budget's name and how it splits household costs ---------------
  const labelled = (label: string): CellValue | undefined => {
    const row = summarySheet?.rows.slice(0, 80).find((r) => norm(r?.[0]) === label.toLowerCase());
    return row?.[1];
  };
  const fromFile = (options.fileName || '').replace(/\.xlsx?$/i, '').replace(/\s+-\s+\d{4}-\d{2}-\d{2}$/, '').trim();
  const name = (textOf(summarySheet?.rows[0]?.[0]) || fromFile || 'Imported budget').slice(0, MAX_NAME);
  const householdSettings: HouseholdSettings = {
    distributionMethod: norm(labelled(SUMMARY_LABELS.split)).startsWith('income') ? 'income-based' : 'even',
  };
  const fileCurrency = textOf(labelled(SUMMARY_LABELS.currency)).toUpperCase();
  if (fileCurrency && options.currencyCode && fileCurrency !== options.currencyCode.toUpperCase()) {
    warn(SHEETS.summary, undefined, `This workbook is in ${fileCurrency}, but the app is set to ${options.currencyCode}. Amounts are imported as typed, with no conversion.`);
  }

  // People --------------------------------------------------------------------
  const people: Person[] = [];
  const personByName = new Map<string, Person>();
  if (peopleSheet) {
    const found = findColumns(peopleSheet.rows, {
      name: { aliases: ['name', 'person'], required: true },
      splits: { aliases: ['splits household costs', 'splits household', 'pays household costs', 'pays household share'] },
    });
    if ('missing' in found) {
      issues.push({ severity: 'error', sheet: SHEETS.people, message: `Couldn’t find a “${titleCase(found.missing[0])}” column.` });
    } else {
      peopleSheet.rows.slice(found.headerRow + 1).forEach((row, i) => {
        const rowNumber = found.headerRow + i + 2;
        const personName = textOf(row?.[found.cols.name!]);
        const splits = found.cols.splits === undefined ? '' : textOf(row?.[found.cols.splits]);
        if (!personName && !splits) return;
        if (!personName) return error(SHEETS.people, rowNumber, 'The name is missing.');
        if (personByName.has(personName.toLowerCase())) {
          warn(SHEETS.people, rowNumber, `“${personName}” is listed twice. Only the first is kept.`);
          return;
        }
        if (people.length >= MAX_PEOPLE) return error(SHEETS.people, rowNumber, `Only ${MAX_PEOPLE} people can be imported.`);
        const person: Person = { id: makeId('person'), name: personName.slice(0, 60), income: [], updatedAt: stamp };
        if (/^(no|n|false|0)$/i.test(splits)) person.excludeFromHouseholdShare = true;
        people.push(person);
        personByName.set(personName.toLowerCase(), person);
      });
    }
  }
  counts.people = people.length;

  const lookupPerson = (raw: string): Person | undefined => personByName.get(raw.toLowerCase());

  // Income --------------------------------------------------------------------
  if (incomeSheet) {
    const found = findColumns(incomeSheet.rows, {
      person: { aliases: ['person', 'name'], required: true },
      source: { aliases: ['source', 'label', 'description'] },
      amount: { aliases: ['amount'], required: true },
      frequency: { aliases: ['frequency', 'how often'], required: true },
    });
    if ('missing' in found) {
      issues.push({ severity: 'error', sheet: SHEETS.income, message: `Couldn’t find a “${titleCase(found.missing[0])}” column.` });
    } else {
      const c = found.cols;
      incomeSheet.rows.slice(found.headerRow + 1).forEach((row, i) => {
        const rowNumber = found.headerRow + i + 2;
        const personName = textOf(row?.[c.person!]);
        const source = c.source === undefined ? '' : textOf(row?.[c.source]);
        const amountRaw = row?.[c.amount!];
        const freqRaw = row?.[c.frequency!];
        if (!personName && !source && textOf(amountRaw) === '' && textOf(freqRaw) === '') return;

        const person = personName ? lookupPerson(personName) : undefined;
        if (!personName) return error(SHEETS.income, rowNumber, 'The person is missing.');
        if (!person) return error(SHEETS.income, rowNumber, `“${personName}” isn’t on the People sheet.`);
        const amount = parseAmount(amountRaw);
        if (amount === null) return error(SHEETS.income, rowNumber, 'The amount is missing.');
        if (amount === 'invalid') return error(SHEETS.income, rowNumber, 'The amount isn’t a number.');
        if (amount <= 0) return error(SHEETS.income, rowNumber, 'The amount must be more than zero.');
        const frequency = parseFrequency(freqRaw);
        if (frequency === null) return error(SHEETS.income, rowNumber, 'The frequency is missing.');
        if (frequency === 'invalid') return error(SHEETS.income, rowNumber, `“${textOf(freqRaw)}” isn’t a frequency. Use ${FREQUENCIES.join(', ')}.`);
        if (counts.income >= MAX_INCOME) return error(SHEETS.income, rowNumber, `Only ${MAX_INCOME} income sources can be imported.`);

        const income: Income = { id: makeId('income'), amount, label: (source || 'Income').slice(0, 100), frequency, personId: person.id };
        person.income.push(income);
        counts.income += 1;
      });
    }
  }

  // Expenses ------------------------------------------------------------------
  const expenses: Expense[] = [];
  const customCategories = new Set<string>();
  if (expensesSheet) {
    const found = findColumns(expensesSheet.rows, {
      description: { aliases: ['description', 'expense', 'name'], required: true },
      amount: { aliases: ['amount'], required: true },
      frequency: { aliases: ['frequency', 'how often'], required: true },
      type: { aliases: ['type'] },
      person: { aliases: ['person'] },
      category: { aliases: ['category'] },
      starts: { aliases: ['starts', 'start', 'start date', 'date'] },
      ends: { aliases: ['ends', 'end', 'end date'] },
      notes: { aliases: ['notes', 'note'] },
    });
    if ('missing' in found) {
      issues.push({ severity: 'error', sheet: SHEETS.expenses, message: `Couldn’t find a “${titleCase(found.missing[0])}” column.` });
    } else {
      const c = found.cols;
      const cell = (row: CellValue[] | undefined, col: number | undefined) => (col === undefined ? undefined : row?.[col]);
      const today = todayYmd(now);
      expensesSheet.rows.slice(found.headerRow + 1).forEach((row, i) => {
        const rowNumber = found.headerRow + i + 2;
        const description = textOf(row?.[c.description!]);
        const amountRaw = row?.[c.amount!];
        const freqRaw = row?.[c.frequency!];
        const typeText = norm(cell(row, c.type));
        const personName = textOf(cell(row, c.person));
        const categoryText = textOf(cell(row, c.category));
        const startRaw = cell(row, c.starts);
        const endRaw = cell(row, c.ends);
        const notes = textOf(cell(row, c.notes));
        if (!description && textOf(amountRaw) === '' && textOf(freqRaw) === '' && !typeText && !personName && !categoryText && !notes && textOf(startRaw) === '') return;

        if (!description) return error(SHEETS.expenses, rowNumber, 'The description is missing.');
        const amount = parseAmount(amountRaw);
        if (amount === null) return error(SHEETS.expenses, rowNumber, 'The amount is missing.');
        if (amount === 'invalid') return error(SHEETS.expenses, rowNumber, 'The amount isn’t a number.');
        if (amount <= 0) return error(SHEETS.expenses, rowNumber, 'The amount must be more than zero.');
        const frequency = parseFrequency(freqRaw);
        if (frequency === null) return error(SHEETS.expenses, rowNumber, 'The frequency is missing.');
        if (frequency === 'invalid') return error(SHEETS.expenses, rowNumber, `“${textOf(freqRaw)}” isn’t a frequency. Use ${FREQUENCIES.join(', ')}.`);

        let kind: 'household' | 'personal';
        if (typeText === 'household' || typeText === 'personal') kind = typeText;
        else if (!typeText) kind = personName ? 'personal' : 'household';
        else return error(SHEETS.expenses, rowNumber, `“${textOf(cell(row, c.type))}” isn’t a type. Use Household or Personal.`);

        let personId: string | undefined;
        if (kind === 'personal') {
          if (!personName) return error(SHEETS.expenses, rowNumber, 'A personal expense needs a person.');
          const person = lookupPerson(personName);
          if (!person) return error(SHEETS.expenses, rowNumber, `“${personName}” isn’t on the People sheet.`);
          personId = person.id;
        }

        const start = parseDate(startRaw, wb.date1904);
        if (start === 'invalid') return error(SHEETS.expenses, rowNumber, 'The start date isn’t a date. Enter it as a date, like 1 Oct 2026.');
        const startYmd = start ?? today;
        let endYmd: string | undefined;
        if (frequency !== 'one-time') {
          const end = parseDate(endRaw, wb.date1904);
          if (end === 'invalid') return error(SHEETS.expenses, rowNumber, 'The end date isn’t a date. Enter it as a date, like 1 Oct 2026.');
          if (end && end < startYmd) warn(SHEETS.expenses, rowNumber, 'The end date is before the start date, so it was ignored.');
          else if (end) endYmd = end;
        }

        if (counts.expenses >= MAX_EXPENSES) return error(SHEETS.expenses, rowNumber, `Only ${MAX_EXPENSES} expenses can be imported.`);

        const categoryTag = normalizeCategoryName(categoryText);
        if (!DEFAULT_CATEGORIES.includes(categoryTag)) customCategories.add(categoryTag);
        const expense: Expense = {
          id: makeId('expense'),
          amount,
          description: description.slice(0, 200),
          category: kind,
          frequency,
          date: new Date(`${startYmd}T00:00:00Z`).toISOString(),
          categoryTag,
          updatedAt: stamp,
        };
        if (personId) expense.personId = personId;
        if (notes) expense.notes = notes.slice(0, 1000);
        if (endYmd) expense.endDate = endYmd;
        const debt = debtRepaymentForCategory(categoryTag);
        if (debt) expense.debtRepayment = debt;
        expenses.push(expense);
        counts.expenses += 1;
      });
    }
  }

  if (counts.people + counts.income + counts.expenses === 0) {
    issues.unshift({ severity: 'error', message: 'There’s nothing to import: no people, income or expenses were found.' });
    return { budget: null, issues, counts };
  }

  return {
    budget: { name, householdSettings, people, expenses, customCategories: Array.from(customCategories).sort() },
    issues,
    counts,
  };
};
