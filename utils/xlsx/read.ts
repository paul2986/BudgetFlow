import { strFromU8, unzipSync } from 'fflate';

/**
 * Reads the cell values out of an .xlsx file: enough to import a budget that
 * was exported from here and then edited in Excel, Numbers or Google Sheets.
 * It returns values only (no styles or formulas; a formula gives its last
 * calculated result) and treats the file as untrusted: entries are size-capped
 * before they're inflated, and cells far outside any real budget are refused.
 */

export type CellValue = string | number | boolean | null;

export interface SheetData {
  name: string;
  /** Dense rows from the top; `rows[0][0]` is A1. Missing cells are `null`. */
  rows: CellValue[][];
}

export interface WorkbookData {
  sheets: SheetData[];
  /** Old Mac Excel files count dates from 1904 rather than 1900. */
  date1904: boolean;
}

export class XlsxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'XlsxError';
  }
}

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_PART_BYTES = 24 * 1024 * 1024;
const MAX_ROWS = 5000;
const MAX_COLS = 60;

const decodeEntities = (s: string): string =>
  s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => safeChar(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeChar(parseInt(d, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    // Excel escapes characters XML can't hold as _xHHHH_ (and a literal one as _x005F_xHHHH_).
    .replace(/_x([0-9a-fA-F]{4})_/g, (_, h) => safeChar(parseInt(h, 16)));

const safeChar = (code: number): string => {
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return '';
  try {
    return String.fromCodePoint(code);
  } catch {
    return '';
  }
};

const parseAttrs = (tag: string): Record<string, string> => {
  const attrs: Record<string, string> = {};
  const re = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tag))) attrs[m[1]] = decodeEntities(m[2] ?? m[3] ?? '');
  return attrs;
};

/** All the text of the `<t>` elements in a fragment, skipping phonetic (furigana) runs. */
const textOf = (xml: string): string => {
  const cleaned = xml.replace(/<(?:\w+:)?rPh\b[\s\S]*?<\/(?:\w+:)?rPh>/g, '');
  let out = '';
  const re = /<(?:\w+:)?t\b[^>]*?(?:\/>|>([\s\S]*?)<\/(?:\w+:)?t>)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(cleaned))) out += decodeEntities(m[1] ?? '');
  return out;
};

const parseSharedStrings = (xml: string): string[] => {
  const strings: string[] = [];
  const re = /<(?:\w+:)?si\b[^>]*?(?:\/>|>([\s\S]*?)<\/(?:\w+:)?si>)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) strings.push(textOf(m[1] ?? ''));
  return strings;
};

/** `B12` → { row: 11, col: 1 } */
const parseRef = (ref: string): { row: number; col: number } | null => {
  const m = /^([A-Za-z]+)(\d+)$/.exec(ref);
  if (!m) return null;
  let col = 0;
  for (const ch of m[1].toUpperCase()) col = col * 26 + (ch.charCodeAt(0) - 64);
  return { row: Number(m[2]) - 1, col: col - 1 };
};

const resolveTarget = (target: string): string => {
  if (target.startsWith('/')) return target.slice(1);
  const parts = `xl/${target}`.split('/');
  const stack: string[] = [];
  for (const p of parts) {
    if (p === '..') stack.pop();
    else if (p && p !== '.') stack.push(p);
  }
  return stack.join('/');
};

const parseSheet = (xml: string, shared: string[]): CellValue[][] => {
  const rows: CellValue[][] = [];
  const rowRe = /<(?:\w+:)?row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?row>)/g;
  let rowMatch: RegExpExecArray | null;
  let nextRow = 0;
  while ((rowMatch = rowRe.exec(xml))) {
    const rowAttrs = parseAttrs(rowMatch[1]);
    const rowIndex = rowAttrs.r ? Number(rowAttrs.r) - 1 : nextRow;
    nextRow = rowIndex + 1;
    const body = rowMatch[2];
    if (!body) continue;

    const cellRe = /<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g;
    let cellMatch: RegExpExecArray | null;
    let nextCol = 0;
    while ((cellMatch = cellRe.exec(body))) {
      const attrs = parseAttrs(cellMatch[1]);
      const at = attrs.r ? parseRef(attrs.r) : null;
      const col = at ? at.col : nextCol;
      nextCol = col + 1;

      const inner = cellMatch[2] ?? '';
      const type = attrs.t ?? 'n';
      const vMatch = /<(?:\w+:)?v\b[^>]*?>([\s\S]*?)<\/(?:\w+:)?v>/.exec(inner);
      const raw = vMatch ? decodeEntities(vMatch[1]) : '';

      let value: CellValue = null;
      if (type === 's') {
        value = raw === '' ? null : (shared[Number(raw)] ?? null);
      } else if (type === 'str' || type === 'd') {
        value = raw === '' ? null : raw;
      } else if (type === 'inlineStr') {
        const is = /<(?:\w+:)?is\b[^>]*?>([\s\S]*?)<\/(?:\w+:)?is>/.exec(inner);
        value = is ? textOf(is[1]) : null;
      } else if (type === 'b') {
        value = raw === '' ? null : raw === '1' || raw.toLowerCase() === 'true';
      } else if (type === 'e') {
        value = null;
      } else if (raw !== '') {
        const n = Number(raw);
        value = Number.isFinite(n) ? n : null;
      }
      if (value === null || value === '') continue;

      if (rowIndex >= MAX_ROWS || col >= MAX_COLS) {
        throw new XlsxError(`This workbook has data beyond row ${MAX_ROWS} or column ${MAX_COLS}, which is more than a budget needs.`);
      }
      (rows[rowIndex] ||= [])[col] = value;
    }
  }
  // Fill holes so every row is dense and callers can index freely.
  for (let r = 0; r < rows.length; r++) {
    const row = (rows[r] ||= []);
    for (let c = 0; c < row.length; c++) if (row[c] === undefined) row[c] = null;
  }
  return rows;
};

export const readXlsx = (bytes: Uint8Array): WorkbookData => {
  if (bytes.byteLength > MAX_FILE_BYTES) throw new XlsxError('That file is too large to be a budget workbook.');

  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      filter: (f) => {
        const wanted =
          f.name === 'xl/workbook.xml' ||
          f.name === 'xl/_rels/workbook.xml.rels' ||
          f.name === 'xl/sharedStrings.xml' ||
          /^xl\/worksheets\/[^/]+\.xml$/.test(f.name);
        if (!wanted) return false;
        // The declared size is checked before anything is inflated, so a crafted file can't balloon.
        if (f.originalSize > MAX_PART_BYTES) throw new XlsxError('That file is too large to be a budget workbook.');
        return true;
      },
    });
  } catch (e) {
    if (e instanceof XlsxError) throw e;
    throw new XlsxError('That doesn’t look like an Excel (.xlsx) file.');
  }

  const text = (name: string): string | null => (files[name] ? strFromU8(files[name]) : null);
  const workbookXml = text('xl/workbook.xml');
  const relsXml = text('xl/_rels/workbook.xml.rels');
  if (!workbookXml || !relsXml) throw new XlsxError('That doesn’t look like an Excel (.xlsx) file.');

  const targets = new Map<string, string>();
  const relRe = /<(?:\w+:)?Relationship\b[^>]*?\/?>/g;
  let m: RegExpExecArray | null;
  while ((m = relRe.exec(relsXml))) {
    const a = parseAttrs(m[0]);
    if (a.Id && a.Target) targets.set(a.Id, resolveTarget(a.Target));
  }

  const sharedXml = text('xl/sharedStrings.xml');
  const shared = sharedXml ? parseSharedStrings(sharedXml) : [];

  const date1904 = /<(?:\w+:)?workbookPr\b[^>]*\bdate1904\s*=\s*["'](?:1|true)["']/i.test(workbookXml);

  const sheets: SheetData[] = [];
  const sheetRe = /<(?:\w+:)?sheet\b[^>]*?\/?>/g;
  while ((m = sheetRe.exec(workbookXml))) {
    const a = parseAttrs(m[0]);
    const relId = Object.entries(a).find(([k]) => k === 'r:id' || k.endsWith(':id'))?.[1];
    const part = relId ? targets.get(relId) : undefined;
    const xml = part ? text(part) : null;
    if (a.name && xml) sheets.push({ name: a.name, rows: parseSheet(xml, shared) });
  }
  if (!sheets.length) throw new XlsxError('That workbook has no sheets to read.');
  return { sheets, date1904 };
};
