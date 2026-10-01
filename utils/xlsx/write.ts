import { strToU8, zipSync } from 'fflate';

/**
 * A small .xlsx writer: the parts of SpreadsheetML that Budget Flow's workbook
 * needs (styled cells, formulas with cached values, frozen headers, filters,
 * drop-down lists, conditional formatting) and nothing else. It's plain
 * JavaScript over `fflate`, so it runs the same on web, iOS and Android.
 *
 * Element order inside each part follows the schema; Excel rejects a file
 * whose worksheet children are out of order, so keep it when adding features.
 */

export interface FontSpec {
  bold?: boolean;
  italic?: boolean;
  size?: number;
  /** RRGGBB */
  color?: string;
}

export interface BorderSide {
  style: 'thin' | 'medium' | 'hair';
  /** RRGGBB */
  color: string;
}

export interface StyleSpec {
  font?: FontSpec;
  /** RRGGBB background */
  fill?: string;
  border?: { top?: BorderSide; bottom?: BorderSide; left?: BorderSide; right?: BorderSide };
  /** An Excel number format code, e.g. `"£"#,##0.00` or `d mmm yyyy`. */
  numFmt?: string;
  align?: { h?: 'left' | 'center' | 'right'; v?: 'top' | 'center' | 'bottom'; wrap?: boolean; indent?: number };
}

export interface Cell {
  /** The value, or for a formula its cached result. */
  v?: string | number | boolean | null;
  /** A formula without the leading `=`. */
  f?: string;
  /** A style name from `WorkbookSpec.styles`. */
  s?: string;
}
export type CellInput = Cell | string | number | boolean | null | undefined;

export interface Validation {
  /** e.g. `B2:B200` */
  range: string;
  kind: 'list' | 'decimal';
  /** For `list`: a range like `Lists!$A$2:$A$6`. For `decimal`: the minimum. */
  source: string | number;
  /** `warning` lets people type something not on the list after a prompt. */
  errorStyle?: 'stop' | 'warning';
  errorTitle?: string;
  error?: string;
}

export interface ConditionalRule {
  range: string;
  /** Formula (no `=`), written for the top-left cell of `range`. */
  formula: string;
  /** RRGGBB font colour applied when the formula is true. */
  fontColor: string;
}

export interface SheetSpec {
  name: string;
  /** Column widths in characters, one per column from A. */
  columns: number[];
  rows: CellInput[][];
  /** Row heights in points, by 0-based row index. */
  rowHeights?: Record<number, number>;
  freeze?: { rows?: number; cols?: number };
  /** e.g. `A1:J101` */
  autoFilter?: string;
  validations?: Validation[];
  conditional?: ConditionalRule[];
  /** RRGGBB */
  tabColor?: string;
  showGridLines?: boolean;
  landscape?: boolean;
}

export interface WorkbookSpec {
  title: string;
  creator: string;
  created: Date;
  styles: Record<string, StyleSpec>;
  sheets: SheetSpec[];
}

const MAX_CELL_CHARS = 32767;

// Characters XML 1.0 can't carry; Excel refuses a file that has them.
// eslint-disable-next-line no-control-regex
const INVALID_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;

const escapeText = (s: string): string =>
  s.replace(INVALID_XML, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttr = (s: string): string => escapeText(s).replace(/"/g, '&quot;');

export const columnName = (index: number): string => {
  let n = index + 1;
  let name = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    name = String.fromCharCode(65 + rem) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
};

const argb = (rgb: string): string => `FF${rgb.toUpperCase()}`;

// ---------------------------------------------------------------------------
// styles.xml
// ---------------------------------------------------------------------------

class StyleBook {
  private fonts: string[] = ['<font><sz val="11"/><name val="Calibri"/><family val="2"/></font>'];
  private fills: string[] = [
    '<fill><patternFill patternType="none"/></fill>',
    '<fill><patternFill patternType="gray125"/></fill>',
  ];
  private borders: string[] = ['<border><left/><right/><top/><bottom/><diagonal/></border>'];
  private numFmts: string[] = [];
  private numFmtIds = new Map<string, number>();
  private xfs: string[] = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'];
  private xfByName = new Map<string, number>();
  private dxfs: string[] = [];
  private dxfByColor = new Map<string, number>();

  constructor(styles: Record<string, StyleSpec>) {
    for (const [name, spec] of Object.entries(styles)) this.xfByName.set(name, this.addXf(spec));
  }

  private intern(list: string[], xml: string): number {
    const at = list.indexOf(xml);
    if (at >= 0) return at;
    list.push(xml);
    return list.length - 1;
  }

  private addXf(spec: StyleSpec): number {
    let fontId = 0;
    if (spec.font) {
      const f = spec.font;
      fontId = this.intern(
        this.fonts,
        `<font>${f.bold ? '<b/>' : ''}${f.italic ? '<i/>' : ''}<sz val="${f.size ?? 11}"/>` +
          `${f.color ? `<color rgb="${argb(f.color)}"/>` : ''}<name val="Calibri"/><family val="2"/></font>`
      );
    }
    let fillId = 0;
    if (spec.fill) {
      fillId = this.intern(
        this.fills,
        `<fill><patternFill patternType="solid"><fgColor rgb="${argb(spec.fill)}"/><bgColor indexed="64"/></patternFill></fill>`
      );
    }
    let borderId = 0;
    if (spec.border) {
      const side = (tag: string, b?: BorderSide) =>
        b ? `<${tag} style="${b.style}"><color rgb="${argb(b.color)}"/></${tag}>` : `<${tag}/>`;
      const b = spec.border;
      borderId = this.intern(
        this.borders,
        `<border>${side('left', b.left)}${side('right', b.right)}${side('top', b.top)}${side('bottom', b.bottom)}<diagonal/></border>`
      );
    }
    let numFmtId = 0;
    if (spec.numFmt) {
      let id = this.numFmtIds.get(spec.numFmt);
      if (id === undefined) {
        id = 164 + this.numFmts.length;
        this.numFmtIds.set(spec.numFmt, id);
        this.numFmts.push(`<numFmt numFmtId="${id}" formatCode="${escapeAttr(spec.numFmt)}"/>`);
      }
      numFmtId = id;
    }
    const a = spec.align;
    const alignment = a
      ? `<alignment${a.h ? ` horizontal="${a.h}"` : ''}${a.v ? ` vertical="${a.v}"` : ''}${a.wrap ? ' wrapText="1"' : ''}${
          a.indent ? ` indent="${a.indent}"` : ''
        }/>`
      : '';
    const attrs =
      `numFmtId="${numFmtId}" fontId="${fontId}" fillId="${fillId}" borderId="${borderId}" xfId="0"` +
      `${numFmtId ? ' applyNumberFormat="1"' : ''}${fontId ? ' applyFont="1"' : ''}${fillId ? ' applyFill="1"' : ''}` +
      `${borderId ? ' applyBorder="1"' : ''}${alignment ? ' applyAlignment="1"' : ''}`;
    return this.intern(this.xfs, alignment ? `<xf ${attrs}>${alignment}</xf>` : `<xf ${attrs}/>`);
  }

  styleIndex(name: string | undefined): number {
    if (!name) return 0;
    const idx = this.xfByName.get(name);
    if (idx === undefined) throw new Error(`xlsx: unknown style "${name}"`);
    return idx;
  }

  /** A differential style (for conditional formatting) that only colours the font. */
  dxfForFontColor(rgb: string): number {
    const existing = this.dxfByColor.get(rgb);
    if (existing !== undefined) return existing;
    this.dxfs.push(`<dxf><font><color rgb="${argb(rgb)}"/></font></dxf>`);
    const id = this.dxfs.length - 1;
    this.dxfByColor.set(rgb, id);
    return id;
  }

  toXml(): string {
    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      (this.numFmts.length ? `<numFmts count="${this.numFmts.length}">${this.numFmts.join('')}</numFmts>` : '') +
      `<fonts count="${this.fonts.length}">${this.fonts.join('')}</fonts>` +
      `<fills count="${this.fills.length}">${this.fills.join('')}</fills>` +
      `<borders count="${this.borders.length}">${this.borders.join('')}</borders>` +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      `<cellXfs count="${this.xfs.length}">${this.xfs.join('')}</cellXfs>` +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
      `<dxfs count="${this.dxfs.length}">${this.dxfs.join('')}</dxfs>` +
      '</styleSheet>'
    );
  }
}

// ---------------------------------------------------------------------------
// sheets
// ---------------------------------------------------------------------------

class SharedStrings {
  private index = new Map<string, number>();
  private list: string[] = [];
  private refs = 0;

  add(text: string): number {
    this.refs += 1;
    const known = this.index.get(text);
    if (known !== undefined) return known;
    this.list.push(text);
    this.index.set(text, this.list.length - 1);
    return this.list.length - 1;
  }

  toXml(): string {
    const items = this.list.map((t) => `<si><t xml:space="preserve">${escapeText(t)}</t></si>`).join('');
    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${this.refs}" uniqueCount="${this.list.length}">${items}</sst>`
    );
  }
}

const numberToXml = (n: number): string => (Object.is(n, -0) ? '0' : String(n));

const normalise = (input: CellInput): Cell => {
  if (input === null || input === undefined) return {};
  if (typeof input === 'object') return input;
  return { v: input };
};

const cellXml = (ref: string, cell: Cell, styles: StyleBook, strings: SharedStrings): string => {
  const s = styles.styleIndex(cell.s);
  const sAttr = s ? ` s="${s}"` : '';
  const v = cell.v;

  if (cell.f !== undefined) {
    const f = `<f>${escapeText(cell.f)}</f>`;
    if (typeof v === 'string') return `<c r="${ref}"${sAttr} t="str">${f}<v>${escapeText(v)}</v></c>`;
    if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"${sAttr}>${f}<v>${numberToXml(v)}</v></c>`;
    if (typeof v === 'boolean') return `<c r="${ref}"${sAttr} t="b">${f}<v>${v ? 1 : 0}</v></c>`;
    return `<c r="${ref}"${sAttr}>${f}</c>`;
  }
  if (typeof v === 'string' && v !== '') {
    const text = v.length > MAX_CELL_CHARS ? v.slice(0, MAX_CELL_CHARS) : v;
    return `<c r="${ref}"${sAttr} t="s"><v>${strings.add(text)}</v></c>`;
  }
  if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"${sAttr}><v>${numberToXml(v)}</v></c>`;
  if (typeof v === 'boolean') return `<c r="${ref}"${sAttr} t="b"><v>${v ? 1 : 0}</v></c>`;
  // Empty: only worth writing if it carries a style (fill, border).
  return s ? `<c r="${ref}"${sAttr}/>` : '';
};

const sheetXml = (sheet: SheetSpec, styles: StyleBook, strings: SharedStrings, selected: boolean): string => {
  const widthCount = sheet.columns.length;
  let maxCol = widthCount;
  const rowsXml: string[] = [];

  sheet.rows.forEach((row, r) => {
    const cells: string[] = [];
    row.forEach((input, c) => {
      const xml = cellXml(`${columnName(c)}${r + 1}`, normalise(input), styles, strings);
      if (xml) {
        cells.push(xml);
        if (c + 1 > maxCol) maxCol = c + 1;
      }
    });
    const ht = sheet.rowHeights?.[r];
    if (!cells.length && ht === undefined) return;
    rowsXml.push(`<row r="${r + 1}"${ht !== undefined ? ` ht="${ht}" customHeight="1"` : ''}>${cells.join('')}</row>`);
  });

  const lastRow = Math.max(sheet.rows.length, 1);
  const dimension = `A1:${columnName(Math.max(maxCol, 1) - 1)}${lastRow}`;

  let sheetPr = '';
  if (sheet.tabColor || sheet.landscape) {
    sheetPr =
      `<sheetPr>${sheet.tabColor ? `<tabColor rgb="${argb(sheet.tabColor)}"/>` : ''}` +
      `${sheet.landscape ? '<pageSetUpPr fitToPage="1"/>' : ''}</sheetPr>`;
  }

  let pane = '';
  const fr = sheet.freeze?.rows ?? 0;
  const fc = sheet.freeze?.cols ?? 0;
  if (fr || fc) {
    const topLeft = `${columnName(fc)}${fr + 1}`;
    const active = fr && fc ? 'bottomRight' : fr ? 'bottomLeft' : 'topRight';
    pane =
      `<pane${fc ? ` xSplit="${fc}"` : ''}${fr ? ` ySplit="${fr}"` : ''} topLeftCell="${topLeft}" activePane="${active}" state="frozen"/>` +
      `<selection pane="${active}" activeCell="${topLeft}" sqref="${topLeft}"/>`;
  }
  const sheetViews =
    `<sheetViews><sheetView${sheet.showGridLines === false ? ' showGridLines="0"' : ''}${selected ? ' tabSelected="1"' : ''} workbookViewId="0">` +
    `${pane}</sheetView></sheetViews>`;

  const cols = sheet.columns.length
    ? `<cols>${sheet.columns
        .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
        .join('')}</cols>`
    : '';

  const autoFilter = sheet.autoFilter ? `<autoFilter ref="${sheet.autoFilter}"/>` : '';

  const conditional = (sheet.conditional || [])
    .map(
      (rule, i) =>
        `<conditionalFormatting sqref="${rule.range}"><cfRule type="expression" dxfId="${styles.dxfForFontColor(
          rule.fontColor
        )}" priority="${i + 1}"><formula>${escapeText(rule.formula)}</formula></cfRule></conditionalFormatting>`
    )
    .join('');

  const validations = sheet.validations?.length
    ? `<dataValidations count="${sheet.validations.length}">${sheet.validations
        .map((v) => {
          const common =
            `${v.errorStyle === 'warning' ? ' errorStyle="warning"' : ''} allowBlank="1" showErrorMessage="1"` +
            `${v.errorTitle ? ` errorTitle="${escapeAttr(v.errorTitle)}"` : ''}${v.error ? ` error="${escapeAttr(v.error)}"` : ''}`;
          if (v.kind === 'list') {
            return `<dataValidation type="list"${common} sqref="${v.range}"><formula1>${escapeText(String(v.source))}</formula1></dataValidation>`;
          }
          return `<dataValidation type="decimal" operator="greaterThanOrEqual"${common} sqref="${v.range}"><formula1>${v.source}</formula1></dataValidation>`;
        })
        .join('')}</dataValidations>`
    : '';

  const pageSetup = sheet.landscape ? '<pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/>' : '';

  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    sheetPr +
    `<dimension ref="${dimension}"/>` +
    sheetViews +
    '<sheetFormatPr defaultRowHeight="15"/>' +
    cols +
    `<sheetData>${rowsXml.join('')}</sheetData>` +
    autoFilter +
    conditional +
    validations +
    '<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>' +
    pageSetup +
    '</worksheet>'
  );
};

// ---------------------------------------------------------------------------
// package
// ---------------------------------------------------------------------------

const W3CDTF = (d: Date): string => d.toISOString().replace(/\.\d{3}Z$/, 'Z');

const quoteSheet = (name: string): string => `'${name.replace(/'/g, "''")}'`;

/** Build the .xlsx file as bytes. */
export const buildXlsx = (spec: WorkbookSpec): Uint8Array => {
  const styles = new StyleBook(spec.styles);
  const strings = new SharedStrings();
  const n = spec.sheets.length;

  const sheetParts = spec.sheets.map((sheet, i) => sheetXml(sheet, styles, strings, i === 0));

  const definedNames = spec.sheets
    .map((sheet, i) => {
      if (!sheet.autoFilter) return '';
      const [from, to] = sheet.autoFilter.split(':');
      const abs = (ref: string) => ref.replace(/^([A-Z]+)(\d+)$/, '$$$1$$$2');
      return `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">${escapeText(
        `${quoteSheet(sheet.name)}!${abs(from)}:${abs(to)}`
      )}</definedName>`;
    })
    .join('');

  const workbook =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<workbookPr/>' +
    '<bookViews><workbookView xWindow="0" yWindow="0" windowWidth="28800" windowHeight="17600" activeTab="0"/></bookViews>' +
    `<sheets>${spec.sheets
      .map((s, i) => `<sheet name="${escapeAttr(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
      .join('')}</sheets>` +
    (definedNames ? `<definedNames>${definedNames}</definedNames>` : '') +
    '<calcPr calcId="191029" fullCalcOnLoad="1"/>' +
    '</workbook>';

  const workbookRels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    spec.sheets
      .map(
        (_, i) =>
          `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`
      )
      .join('') +
    `<Relationship Id="rId${n + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    `<Relationship Id="rId${n + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>` +
    '</Relationships>';

  const contentTypes =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    spec.sheets
      .map(
        (_, i) =>
          `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
      )
      .join('') +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>' +
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
    '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
    '</Types>';

  const rootRels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
    '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>' +
    '</Relationships>';

  const stamp = W3CDTF(spec.created);
  const core =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
    `<dc:title>${escapeText(spec.title)}</dc:title><dc:creator>${escapeText(spec.creator)}</dc:creator>` +
    `<dcterms:created xsi:type="dcterms:W3CDTF">${stamp}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${stamp}</dcterms:modified>` +
    '</cp:coreProperties>';

  const app =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">' +
    `<Application>${escapeText(spec.creator)}</Application></Properties>`;

  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(contentTypes),
    '_rels/.rels': strToU8(rootRels),
    'docProps/core.xml': strToU8(core),
    'docProps/app.xml': strToU8(app),
    'xl/workbook.xml': strToU8(workbook),
    'xl/_rels/workbook.xml.rels': strToU8(workbookRels),
    'xl/styles.xml': strToU8(styles.toXml()),
  };
  sheetParts.forEach((xml, i) => {
    files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(xml);
  });
  // Shared strings last: every sheet has to be built before the table is complete.
  files['xl/sharedStrings.xml'] = strToU8(strings.toXml());

  return zipSync(files, { level: 6, mtime: spec.created });
};
