import { DEFAULT_CATEGORIES, type Budget, type Frequency } from '../../types/budget';
import { buildXlsx, type CellInput, type SheetSpec, type StyleSpec, type WorkbookSpec } from '../xlsx/write';
import {
  ANNUAL_MULTIPLIER,
  FREQUENCIES,
  FREQUENCY_LABELS,
  HEADERS,
  SHEETS,
  SPLIT_LABELS,
  SUMMARY_LABELS,
  TYPE_LABELS,
  todayYmd,
  ymdToSerial,
} from './layout';

/**
 * Turns a budget into a styled, formula-driven Excel workbook:
 *
 *   Summary   what's left to spend, split by person and by category
 *   People    who shares the budget, and whether they split household costs
 *   Income    each person's income sources
 *   Expenses  every expense, with drop-downs, filters and greying for ended ones
 *   Lists     the values the drop-downs offer
 *
 * The Per month columns and the Summary are live formulas (each also carries
 * its calculated value, so previews that don't calculate still show numbers).
 * The importer reads the People, Income and Expenses sheets back, so a budget
 * can be edited in a spreadsheet and brought home again.
 */

export interface ExportContext {
  currencyCode: string;
  currencySymbol: string;
  /** Decimal places the currency uses (0 for yen, 2 for most). */
  fractionDigits: number;
  now: Date;
}

const COLOR = {
  brand: '4F46E5',
  brandSubtle: 'EEF2FF',
  text: '0F172A',
  muted: '475569',
  faint: '94A3B8',
  line: 'E2E8F0',
  sunken: 'F1F5F9',
  white: 'FFFFFF',
};

/** Blank rows left under Income and Expenses, ready for new entries, formulas already in place. */
const SPARE_ROWS = 100;
/** Extra rows the People and category lists offer in their drop-downs, for names added later. */
const SPARE_LIST_ROWS = 20;

const quoted = (s: string): string => `"${s.replace(/"/g, '""')}"`;

const buildStyles = (ctx: ExportContext): Record<string, StyleSpec> => {
  const decimals = ctx.fractionDigits > 0 ? `.${'0'.repeat(ctx.fractionDigits)}` : '';
  const positive = `${quoted(ctx.currencySymbol)}#,##0${decimals}`;
  const money = positive;
  const moneyNet = `${positive};[Red]-${positive}`;
  const line = { style: 'thin', color: COLOR.line } as const;
  const rule = { style: 'thin', color: COLOR.faint } as const;

  return {
    title: { font: { bold: true, size: 20, color: COLOR.text }, align: { v: 'center' } },
    subtitle: { font: { size: 11, color: COLOR.muted }, align: { v: 'center' } },
    section: { font: { bold: true, size: 12, color: COLOR.text }, align: { v: 'center' } },
    note: { font: { size: 10, color: COLOR.muted }, align: { v: 'center' } },

    head: {
      font: { bold: true, color: COLOR.white },
      fill: COLOR.brand,
      align: { h: 'left', v: 'center', indent: 1 },
    },
    headRight: {
      font: { bold: true, color: COLOR.white },
      fill: COLOR.brand,
      align: { h: 'right', v: 'center', indent: 1 },
    },
    headCenter: {
      font: { bold: true, color: COLOR.white },
      fill: COLOR.brand,
      align: { h: 'center', v: 'center' },
    },

    text: { border: { bottom: line }, align: { h: 'left', v: 'center', indent: 1 } },
    textMuted: {
      font: { color: COLOR.muted },
      border: { bottom: line },
      align: { h: 'left', v: 'center', indent: 1 },
    },
    center: { border: { bottom: line }, align: { h: 'center', v: 'center' } },
    money: { numFmt: money, border: { bottom: line }, align: { h: 'right', v: 'center', indent: 1 } },
    moneyNet: { numFmt: moneyNet, border: { bottom: line }, align: { h: 'right', v: 'center', indent: 1 } },
    percent: { numFmt: '0%', border: { bottom: line }, align: { h: 'right', v: 'center', indent: 1 } },
    date: { numFmt: 'd mmm yyyy', border: { bottom: line }, align: { h: 'left', v: 'center', indent: 1 } },
    calc: {
      numFmt: money,
      font: { color: COLOR.muted },
      fill: COLOR.sunken,
      border: { bottom: line },
      align: { h: 'right', v: 'center', indent: 1 },
    },

    totalLabel: {
      font: { bold: true },
      fill: COLOR.brandSubtle,
      border: { top: rule },
      align: { h: 'left', v: 'center', indent: 1 },
    },
    totalMoney: {
      numFmt: moneyNet,
      font: { bold: true },
      fill: COLOR.brandSubtle,
      border: { top: rule },
      align: { h: 'right', v: 'center', indent: 1 },
    },
    totalBlank: { fill: COLOR.brandSubtle, border: { top: rule } },

    input: {
      font: { bold: true, color: COLOR.brand },
      fill: COLOR.brandSubtle,
      border: { top: line, bottom: line, left: line, right: line },
      align: { h: 'left', v: 'center', indent: 1 },
    },
    listHead: { font: { bold: true }, fill: COLOR.sunken, align: { h: 'left', v: 'center', indent: 1 } },
    listCell: { border: { bottom: line }, align: { h: 'left', v: 'center', indent: 1 } },
  };
};

// Calculation, mirroring the formulas so every formula cell carries its value ----

const monthly = (amount: number, frequency: Frequency): number => (amount * ANNUAL_MULTIPLIER[frequency]) / 12;

/** Excel's own formula for "per month", for a row where the amount is in `amt` and the frequency in `freq`. */
const perMonthFormula = (amt: string, freq: string): string =>
  `IF(${amt}="","",${amt}*IF(${freq}="${FREQUENCY_LABELS.daily}",${ANNUAL_MULTIPLIER.daily},` +
  `IF(${freq}="${FREQUENCY_LABELS.weekly}",${ANNUAL_MULTIPLIER.weekly},` +
  `IF(${freq}="${FREQUENCY_LABELS.monthly}",${ANNUAL_MULTIPLIER.monthly},1)))/12)`;

/** Names are how rows refer to people in the workbook, so they have to be unique and non-empty. */
const uniqueNames = (budget: Budget): Map<string, string> => {
  const names = new Map<string, string>();
  const taken = new Set<string>();
  budget.people.forEach((p, i) => {
    const base = (p.name || '').trim() || `Person ${i + 1}`;
    let name = base;
    for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${base} (${n})`;
    taken.add(name.toLowerCase());
    names.set(p.id, name);
  });
  return names;
};

interface PersonFigures {
  id: string;
  name: string;
  income: number;
  pays: boolean;
  share: number;
  personal: number;
}

const snapshot = (budget: Budget, names: Map<string, string>, now: Date) => {
  const today = todayYmd(now);
  const isActive = (end?: string) => !end || end.slice(0, 10) >= today;

  const income = new Map<string, number>();
  budget.people.forEach((p) => {
    income.set(
      p.id,
      (p.income || []).reduce((sum, i) => sum + monthly(i.amount, i.frequency), 0)
    );
  });

  let household = 0;
  let totalExpenses = 0;
  const personal = new Map<string, number>();
  const byCategory = new Map<string, number>();
  for (const e of budget.expenses) {
    if (!isActive(e.endDate)) continue;
    const m = monthly(e.amount, e.frequency);
    totalExpenses += m;
    const tag = e.categoryTag || 'Misc';
    byCategory.set(tag, (byCategory.get(tag) || 0) + m);
    if (e.category === 'household') household += m;
    else if (e.personId) personal.set(e.personId, (personal.get(e.personId) || 0) + m);
  }

  const anyone = budget.people.some((p) => !p.excludeFromHouseholdShare);
  const payers = budget.people.filter((p) => !anyone || !p.excludeFromHouseholdShare);
  const payerIncome = payers.reduce((sum, p) => sum + (income.get(p.id) || 0), 0);
  const incomeBased = budget.householdSettings?.distributionMethod === 'income-based';

  const people: PersonFigures[] = budget.people.map((p) => {
    const pays = payers.includes(p);
    let share = 0;
    if (pays) {
      share =
        incomeBased && payerIncome !== 0
          ? ((income.get(p.id) || 0) / payerIncome) * household
          : household / payers.length;
    }
    return {
      id: p.id,
      name: names.get(p.id) || p.name,
      income: income.get(p.id) || 0,
      pays,
      share,
      personal: personal.get(p.id) || 0,
    };
  });

  const totalIncome = people.reduce((sum, p) => sum + p.income, 0);
  const categories = Array.from(byCategory.entries())
    .filter(([, amount]) => amount > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  return { people, household, totalIncome, totalExpenses, categories, incomeBased };
};

// Sheets ----------------------------------------------------------------------

const range = (col: string, from: number, to: number) => `${col}${from}:${col}${to}`;

const categoryList = (budget: Budget): string[] => {
  const custom = (budget.customCategories || []).map((c) => c.name);
  const used = budget.expenses.map((e) => e.categoryTag || 'Misc');
  const known = new Set(DEFAULT_CATEGORIES);
  const extras = Array.from(new Set([...custom, ...used])).filter((c) => !known.has(c)).sort((a, b) => a.localeCompare(b));
  return [...DEFAULT_CATEGORIES, ...extras];
};

export const buildBudgetWorkbook = (budget: Budget, ctx: ExportContext): Uint8Array => {
  const names = uniqueNames(budget);
  const snap = snapshot(budget, names, ctx.now);
  const categories = categoryList(budget);

  const nPeople = budget.people.length;
  const incomeRows = budget.people.flatMap((p) => (p.income || []).map((i) => ({ person: p, income: i })));
  const expenseRows = budget.expenses;

  const peopleLast = 1 + nPeople + SPARE_LIST_ROWS;
  const incomeLast = 1 + incomeRows.length + SPARE_ROWS;
  const expenseLast = 1 + expenseRows.length + SPARE_ROWS;

  // Lists ---------------------------------------------------------------------
  const listRows: CellInput[][] = [];
  const listHeight = Math.max(FREQUENCIES.length, categories.length + SPARE_LIST_ROWS);
  listRows.push([
    { v: 'Frequency', s: 'listHead' },
    null,
    { v: 'Type', s: 'listHead' },
    null,
    { v: 'Yes / No', s: 'listHead' },
    null,
    { v: 'Category', s: 'listHead' },
    null,
    { v: 'Split method', s: 'listHead' },
  ]);
  const types = [TYPE_LABELS.household, TYPE_LABELS.personal];
  const splits = [SPLIT_LABELS.even, SPLIT_LABELS['income-based']];
  for (let i = 0; i < listHeight; i++) {
    const cell = (v: string | undefined): CellInput => (v === undefined ? null : { v, s: 'listCell' });
    listRows.push([
      cell(FREQUENCIES[i] && FREQUENCY_LABELS[FREQUENCIES[i]]),
      null,
      cell(types[i]),
      null,
      cell(['Yes', 'No'][i]),
      null,
      i < categories.length + SPARE_LIST_ROWS ? (i < categories.length ? cell(categories[i]) : { s: 'listCell' }) : null,
      null,
      cell(splits[i]),
    ]);
  }
  listRows.push([]);
  listRows.push([{ v: 'These lists feed the drop-downs on the other sheets. Add your own categories at the end of the Category list.', s: 'note' }]);
  const lists: SheetSpec = {
    name: SHEETS.lists,
    columns: [16, 3, 14, 3, 12, 3, 24, 3, 18],
    rows: listRows,
    rowHeights: { 0: 24 },
    tabColor: COLOR.faint,
  };
  const freqRef = `${SHEETS.lists}!$A$2:$A$${1 + FREQUENCIES.length}`;
  const typeRef = `${SHEETS.lists}!$C$2:$C$${1 + types.length}`;
  const yesNoRef = `${SHEETS.lists}!$E$2:$E$3`;
  const categoryRef = `${SHEETS.lists}!$G$2:$G$${1 + categories.length + SPARE_LIST_ROWS}`;
  const splitRef = `${SHEETS.lists}!$I$2:$I$${1 + splits.length}`;
  const peopleRef = `${SHEETS.people}!$A$2:$A$${peopleLast}`;

  // People --------------------------------------------------------------------
  const peopleRows: CellInput[][] = [
    [
      { v: HEADERS.people[0], s: 'head' },
      { v: HEADERS.people[1], s: 'headCenter' },
    ],
  ];
  budget.people.forEach((p) => {
    peopleRows.push([
      { v: names.get(p.id), s: 'text' },
      { v: p.excludeFromHouseholdShare ? 'No' : 'Yes', s: 'center' },
    ]);
  });
  for (let r = peopleRows.length; r < peopleLast; r++) peopleRows.push([{ s: 'text' }, { s: 'center' }]);
  const people: SheetSpec = {
    name: SHEETS.people,
    columns: [32, 26],
    rows: peopleRows,
    rowHeights: { 0: 26 },
    freeze: { rows: 1 },
    validations: [
      { range: range('B', 2, peopleLast), kind: 'list', source: yesNoRef, errorTitle: 'Splits household costs', error: 'Choose Yes or No.' },
    ],
    tabColor: COLOR.brand,
  };

  // Income --------------------------------------------------------------------
  const incomeSheetRows: CellInput[][] = [
    [
      { v: HEADERS.income[0], s: 'head' },
      { v: HEADERS.income[1], s: 'head' },
      { v: HEADERS.income[2], s: 'headRight' },
      { v: HEADERS.income[3], s: 'head' },
      { v: HEADERS.income[4], s: 'headRight' },
    ],
  ];
  incomeRows.forEach(({ person, income }, i) => {
    const R = i + 2;
    incomeSheetRows.push([
      { v: names.get(person.id), s: 'text' },
      { v: income.label, s: 'text' },
      { v: income.amount, s: 'money' },
      { v: FREQUENCY_LABELS[income.frequency] || FREQUENCY_LABELS.monthly, s: 'text' },
      { f: perMonthFormula(`C${R}`, `D${R}`), v: monthly(income.amount, income.frequency), s: 'calc' },
    ]);
  });
  for (let R = incomeSheetRows.length + 1; R <= incomeLast; R++) {
    incomeSheetRows.push([
      { s: 'text' },
      { s: 'text' },
      { s: 'money' },
      { s: 'text' },
      { f: perMonthFormula(`C${R}`, `D${R}`), v: '', s: 'calc' },
    ]);
  }
  const incomeSheet: SheetSpec = {
    name: SHEETS.income,
    columns: [24, 30, 16, 16, 16],
    rows: incomeSheetRows,
    rowHeights: { 0: 26 },
    freeze: { rows: 1 },
    autoFilter: `A1:E${incomeLast}`,
    validations: [
      { range: range('A', 2, incomeLast), kind: 'list', source: peopleRef, errorTitle: 'Person', error: 'Pick someone from the People sheet.' },
      { range: range('C', 2, incomeLast), kind: 'decimal', source: 0, errorTitle: 'Amount', error: 'Enter a number, 0 or more.' },
      { range: range('D', 2, incomeLast), kind: 'list', source: freqRef, errorTitle: 'Frequency', error: 'Pick a frequency from the list.' },
    ],
    tabColor: '047857',
  };

  // Expenses ------------------------------------------------------------------
  const H = HEADERS.expenses;
  const expenseSheetRows: CellInput[][] = [
    [
      { v: H[0], s: 'head' },
      { v: H[1], s: 'headRight' },
      { v: H[2], s: 'head' },
      { v: H[3], s: 'headRight' },
      { v: H[4], s: 'head' },
      { v: H[5], s: 'head' },
      { v: H[6], s: 'head' },
      { v: H[7], s: 'head' },
      { v: H[8], s: 'head' },
      { v: H[9], s: 'head' },
    ],
  ];
  expenseRows.forEach((e, i) => {
    const R = i + 2;
    const start = ymdToSerial((e.date || '').slice(0, 10));
    const end = e.endDate ? ymdToSerial(e.endDate.slice(0, 10)) : null;
    const isPersonal = e.category === 'personal';
    expenseSheetRows.push([
      { v: e.description, s: 'text' },
      { v: e.amount, s: 'money' },
      { v: FREQUENCY_LABELS[e.frequency] || FREQUENCY_LABELS.monthly, s: 'text' },
      { f: perMonthFormula(`B${R}`, `C${R}`), v: monthly(e.amount, e.frequency), s: 'calc' },
      { v: isPersonal ? TYPE_LABELS.personal : TYPE_LABELS.household, s: 'text' },
      { v: isPersonal && e.personId ? names.get(e.personId) : null, s: 'text' },
      { v: e.categoryTag || 'Misc', s: 'text' },
      { v: start, s: 'date' },
      { v: end, s: 'date' },
      { v: e.notes || null, s: 'text' },
    ]);
  });
  for (let R = expenseSheetRows.length + 1; R <= expenseLast; R++) {
    expenseSheetRows.push([
      { s: 'text' },
      { s: 'money' },
      { s: 'text' },
      { f: perMonthFormula(`B${R}`, `C${R}`), v: '', s: 'calc' },
      { s: 'text' },
      { s: 'text' },
      { s: 'text' },
      { s: 'date' },
      { s: 'date' },
      { s: 'text' },
    ]);
  }
  const expensesSheet: SheetSpec = {
    name: SHEETS.expenses,
    columns: [34, 16, 16, 16, 14, 22, 20, 15, 15, 44],
    rows: expenseSheetRows,
    rowHeights: { 0: 26 },
    freeze: { rows: 1 },
    autoFilter: `A1:J${expenseLast}`,
    validations: [
      { range: range('B', 2, expenseLast), kind: 'decimal', source: 0, errorTitle: 'Amount', error: 'Enter a number, 0 or more.' },
      { range: range('C', 2, expenseLast), kind: 'list', source: freqRef, errorTitle: 'Frequency', error: 'Pick a frequency from the list.' },
      { range: range('E', 2, expenseLast), kind: 'list', source: typeRef, errorTitle: 'Type', error: 'Choose Household or Personal.' },
      { range: range('F', 2, expenseLast), kind: 'list', source: peopleRef, errorTitle: 'Person', error: 'Pick someone from the People sheet. Personal expenses need a person.' },
      {
        range: range('G', 2, expenseLast),
        kind: 'list',
        source: categoryRef,
        errorStyle: 'warning',
        errorTitle: 'New category',
        error: 'That category isn’t on the list. It will be added as a new category when you import. Continue?',
      },
    ],
    // Past their end date: greyed out, as the app shows them, and left out of the Summary.
    conditional: [{ range: `A2:J${expenseLast}`, formula: 'AND($I2<>"",$I2<TODAY())', fontColor: COLOR.faint }],
    tabColor: '0369A1',
    landscape: true,
  };

  // Summary -------------------------------------------------------------------
  const sRows: CellInput[][] = [];
  const heights: Record<number, number> = {};
  const add = (cells: CellInput[], height?: number): number => {
    sRows.push(cells);
    if (height) heights[sRows.length - 1] = height;
    return sRows.length; // the Excel row number just written
  };

  const E = SHEETS.expenses;
  const activeSum = (criteria: string) =>
    `SUMIFS(${E}!$D:$D,${criteria}${E}!$I:$I,"")+SUMIFS(${E}!$D:$D,${criteria}${E}!$I:$I,">="&TODAY())`;

  add([{ v: budget.name || 'Budget', s: 'title' }], 36);
  const exported = ctx.now.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  add([{ v: `Exported from Budget Flow on ${exported}`, s: 'subtitle' }], 20);
  add([]);

  add(
    [
      { v: 'At a glance', s: 'head' },
      { v: 'Per month', s: 'headRight' },
      { v: 'Per year', s: 'headRight' },
    ],
    26
  );
  const incomeRow = sRows.length + 1;
  const expenseRow = incomeRow + 1;
  const leftRow = incomeRow + 2;
  add([
    { v: 'Income', s: 'text' },
    { f: `SUM(${SHEETS.income}!$E:$E)`, v: snap.totalIncome, s: 'money' },
    { f: `B${incomeRow}*12`, v: snap.totalIncome * 12, s: 'money' },
  ]);
  add([
    { v: 'Expenses', s: 'text' },
    { f: activeSum(''), v: snap.totalExpenses, s: 'money' },
    { f: `B${expenseRow}*12`, v: snap.totalExpenses * 12, s: 'money' },
  ]);
  add([
    { v: 'Left to spend', s: 'totalLabel' },
    { f: `B${incomeRow}-B${expenseRow}`, v: snap.totalIncome - snap.totalExpenses, s: 'totalMoney' },
    { f: `C${incomeRow}-C${expenseRow}`, v: (snap.totalIncome - snap.totalExpenses) * 12, s: 'totalMoney' },
  ], 24);
  add([]);

  add(
    [
      { v: 'Household', s: 'head' },
      { v: 'Per month', s: 'headRight' },
      { v: 'Per year', s: 'headRight' },
    ],
    26
  );
  const hhRow = sRows.length + 1;
  const splitRow = hhRow + 1;
  add([
    { v: 'Household costs', s: 'text' },
    { f: activeSum(`${E}!$E:$E,"${TYPE_LABELS.household}",`), v: snap.household, s: 'money' },
    { f: `B${hhRow}*12`, v: snap.household * 12, s: 'money' },
  ]);
  add([
    { v: SUMMARY_LABELS.split, s: 'text' },
    { v: snap.incomeBased ? SPLIT_LABELS['income-based'] : SPLIT_LABELS.even, s: 'input' },
    { v: 'Choose how household costs are shared.', s: 'note' },
  ]);
  add([
    { v: SUMMARY_LABELS.currency, s: 'text' },
    { v: ctx.currencyCode, s: 'textMuted' },
  ]);
  add([]);

  if (nPeople > 0) {
    add(
      [
        { v: 'By person', s: 'head' },
        { v: 'Income', s: 'headRight' },
        { v: 'Splits household costs', s: 'headCenter' },
        { v: 'Household share', s: 'headRight' },
        { v: 'Personal expenses', s: 'headRight' },
        { v: 'Left to spend', s: 'headRight' },
      ],
      26
    );
    const first = sRows.length + 1;
    const last = first + nPeople - 1;
    const payersYes = `COUNTIF($C$${first}:$C$${last},"Yes")`;
    const payerIncome = `SUMIFS($B$${first}:$B$${last},$C$${first}:$C$${last},"Yes")`;
    snap.people.forEach((p, i) => {
      const R = first + i;
      const sharedEven = `$B$${hhRow}/${payersYes}`;
      add([
        { v: p.name, s: 'text' },
        { f: `SUMIFS(${SHEETS.income}!$E:$E,${SHEETS.income}!$A:$A,$A${R})`, v: p.income, s: 'money' },
        {
          f: `IF(COUNTIF(${SHEETS.people}!$B:$B,"Yes")=0,"Yes",IFERROR(INDEX(${SHEETS.people}!$B:$B,MATCH($A${R},${SHEETS.people}!$A:$A,0)),"Yes"))`,
          v: p.pays ? 'Yes' : 'No',
          s: 'center',
        },
        {
          f:
            `IF($C${R}<>"Yes",0,IF($B$${splitRow}="${SPLIT_LABELS['income-based']}",` +
            `IF(${payerIncome}=0,${sharedEven},$B${R}/${payerIncome}*$B$${hhRow}),${sharedEven}))`,
          v: p.share,
          s: 'money',
        },
        {
          f: activeSum(`${E}!$E:$E,"${TYPE_LABELS.personal}",${E}!$F:$F,$A${R},`),
          v: p.personal,
          s: 'money',
        },
        { f: `B${R}-D${R}-E${R}`, v: p.income - p.share - p.personal, s: 'moneyNet' },
      ]);
    });
    const sum = (col: string, key: 'income' | 'share' | 'personal' | 'left') => ({
      f: `SUM(${col}${first}:${col}${last})`,
      v: snap.people.reduce((t, p) => t + (key === 'left' ? p.income - p.share - p.personal : p[key]), 0),
      s: 'totalMoney',
    });
    add([
      { v: 'Total', s: 'totalLabel' },
      sum('B', 'income'),
      { s: 'totalBlank' },
      sum('D', 'share'),
      sum('E', 'personal'),
      sum('F', 'left'),
    ], 24);
    add([]);
  }

  if (snap.categories.length > 0) {
    add(
      [
        { v: 'Where it goes', s: 'head' },
        { v: 'Per month', s: 'headRight' },
        { v: 'Share', s: 'headRight' },
      ],
      26
    );
    const first = sRows.length + 1;
    snap.categories.forEach(([category, amount], i) => {
      const R = first + i;
      add([
        { v: category, s: 'text' },
        { f: activeSum(`${E}!$G:$G,$A${R},`), v: amount, s: 'money' },
        { f: `IF($B$${expenseRow}=0,0,B${R}/$B$${expenseRow})`, v: snap.totalExpenses ? amount / snap.totalExpenses : 0, s: 'percent' },
      ]);
    });
    const last = first + snap.categories.length - 1;
    const named = snap.categories.reduce((t, [, a]) => t + a, 0);
    const R = last + 1;
    add([
      { v: 'Everything else', s: 'textMuted' },
      { f: `B${expenseRow}-SUM(B${first}:B${last})`, v: snap.totalExpenses - named, s: 'money' },
      { f: `IF($B$${expenseRow}=0,0,B${R}/$B$${expenseRow})`, v: snap.totalExpenses ? (snap.totalExpenses - named) / snap.totalExpenses : 0, s: 'percent' },
    ]);
    add([]);
  }

  add([{ v: 'Using this workbook', s: 'section' }], 24);
  [
    'Edit the People, Income and Expenses sheets. The Per month columns and this summary recalculate as you type.',
    'Use the drop-downs where you see them. Add anyone new on the People sheet first, then pick them elsewhere.',
    'Expenses past their end date turn grey and aren’t counted.',
    'To bring changes back into Budget Flow, use Budgets → Import from Excel. It adds a new budget and never overwrites one.',
  ].forEach((line) => add([{ v: line, s: 'note' }], 18));

  const summary: SheetSpec = {
    name: SHEETS.summary,
    columns: [34, 18, 22, 20, 20, 18],
    rows: sRows,
    rowHeights: heights,
    showGridLines: false,
    validations: [{ range: `B${splitRow}`, kind: 'list', source: splitRef, errorTitle: 'Split method', error: 'Choose Even or Income-based.' }],
    tabColor: COLOR.brand,
    landscape: true,
  };

  const spec: WorkbookSpec = {
    title: `${budget.name || 'Budget'} (Budget Flow)`,
    creator: 'Budget Flow',
    created: ctx.now,
    styles: buildStyles(ctx),
    sheets: [summary, people, incomeSheet, expensesSheet, lists],
  };
  return buildXlsx(spec);
};

/** Decimal places a currency uses (0 for yen, 2 for most), for the workbook's number format. */
export const fractionDigitsFor = (currencyCode: string): number => {
  try {
    const digits = new Intl.NumberFormat('en-US', { style: 'currency', currency: currencyCode }).resolvedOptions().maximumFractionDigits;
    return Math.max(0, digits ?? 2);
  } catch {
    return 2;
  }
};

/** `Family - 2026-10-01.xlsx`, safe to save on any system. */
export const workbookFileName = (budgetName: string, now: Date): string => {
  // eslint-disable-next-line no-control-regex
  const safe = (budgetName || '').replace(/[\\/:*?"<>|\u0000-\u001F]/g, '').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '').slice(0, 60);
  return `${safe || 'Budget'} - ${todayYmd(now)}.xlsx`;
};
