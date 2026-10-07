import { useCallback, useEffect, useRef, useState } from 'react';
import { View, ScrollView, Text } from 'react-native';
import { router } from 'expo-router';
import { useBudgetData } from '../hooks/useBudgetData';
import { useCurrency } from '../hooks/useCurrency';
import { useTheme } from '../hooks/useTheme';
import { useThemedStyles } from '../hooks/useThemedStyles';
import { useToast } from '../hooks/useToast';
import { useFormSessionKey } from '../hooks/useFormSessionKey';
import { useScrollBottomPadding, BOUNCE_MIN_HEIGHT } from '../hooks/useBreakpoint';
import StandardHeader from '../components/StandardHeader';
import Button from '../components/Button';
import { EmptyState, FormScreen, Input, ListGroup, ListRow } from '../components/ui';
import { type, space, tabularNums } from '../styles/tokens';
import { buildTemplateWorkbook, fractionDigitsFor, TEMPLATE_FILE_NAME } from '../utils/budgetWorkbook/export';
import { describeIssue, parseBudgetWorkbook, type ImportFailure, type ImportResult } from '../utils/budgetWorkbook/import';
import { pickWorkbook, saveWorkbook } from '../utils/fileTransfer';
import { importHandoff, useImportEntry } from '../utils/importHandoff';

const MAX_SHOWN_ISSUES = 8;

/**
 * Import a workbook as a new budget. It opens on how importing works (it only
 * reads Budget Flow's own layout, not any spreadsheet) with the two ways in:
 * choose a file, or get the blank template. A chosen file is read and shown
 * here as a preview, what it holds and which rows were left out and why,
 * before anything is added; a file that doesn't fit says so and offers the
 * same two ways again. The parsed file travels through utils/importHandoff
 * so the screen can let go of it once it has slid away.
 */
export default function ImportBudgetScreen() {
  const { themedStyles } = useThemedStyles();
  const { appData, importBudget } = useBudgetData();
  const { currency } = useCurrency();
  const { showToast } = useToast();
  const scrollBottomPadding = useScrollBottomPadding();
  const entry = useImportEntry();

  const [name, setName] = useState('');
  const [importing, setImporting] = useState(false);
  const [picking, setPicking] = useState(false);
  const shownId = useRef<number | null>(null);
  // A ref, not the `importing` state: two taps landing in the same moment both see the
  // state as still false, and each import makes a new budget.
  const inFlight = useRef(false);
  const pickInFlight = useRef(false);

  // Start from the name the entry suggests whenever a new file is handed over.
  const entryId = entry?.id;
  const defaultName = entry?.defaultName;
  useEffect(() => {
    if (entryId === undefined) return;
    shownId.current = entryId;
    setName(defaultName ?? '');
  }, [entryId, defaultName]);

  // Once the screen has slid away for good, let go of the file; the entry id
  // keeps a quick reopen from losing the next file.
  const session = useFormSessionKey();
  const lastSession = useRef(session);
  useEffect(() => {
    // Not on first mount, which runs right after the effect above has taken the entry.
    if (lastSession.current === session) return;
    lastSession.current = session;
    inFlight.current = false;
    setImporting(false);
    importHandoff.clear(shownId.current);
  }, [session]);

  const goBack = useCallback(() => (router.canGoBack() ? router.back() : router.navigate('/budgets')), []);

  const draft = entry?.result.budget ?? null;
  const trimmed = name.trim();

  const handleImport = useCallback(async () => {
    if (!draft || !trimmed || inFlight.current) return;
    inFlight.current = true;
    setImporting(true);
    try {
      const result = await importBudget({ ...draft, name: trimmed });
      if (result.success) {
        showToast(`Imported “${trimmed}”`, 'success');
        goBack();
      } else {
        showToast(result.error?.message || 'Failed to import budget', 'error');
      }
    } catch (error) {
      console.error('Error importing budget:', error);
      showToast('Failed to import budget', 'error');
    } finally {
      inFlight.current = false;
      setImporting(false);
    }
  }, [draft, trimmed, importBudget, showToast, goBack]);

  // The picker (like the share sheet below) must be opened straight from the tap,
  // so nothing is awaited before it.
  const handleChooseFile = useCallback(async () => {
    if (pickInFlight.current) return;
    pickInFlight.current = true;
    setPicking(true);
    try {
      const picked = await pickWorkbook();
      if (!picked) return;
      const result = parseBudgetWorkbook(picked.bytes, { fileName: picked.fileName, currencyCode: currency.code });
      // The workbook may be one exported from a budget that's still here; don't give two the same name.
      let defaultName = result.budget?.name ?? '';
      const existing = appData.budgets || [];
      if (defaultName && existing.some((b) => b.name.trim().toLowerCase() === defaultName.toLowerCase())) {
        defaultName = `${defaultName.slice(0, 39)} (imported)`;
      }
      importHandoff.put(result, defaultName);
    } catch (error) {
      console.error('Error reading workbook:', error);
      showToast('Couldn’t open that file. Please try again.', 'error');
    } finally {
      pickInFlight.current = false;
      setPicking(false);
    }
  }, [appData.budgets, currency.code, showToast]);

  const handleGetTemplate = useCallback(async () => {
    try {
      const bytes = buildTemplateWorkbook({
        currencyCode: currency.code,
        currencySymbol: currency.symbol,
        fractionDigits: fractionDigitsFor(currency.code),
        now: new Date(),
      });
      const outcome = await saveWorkbook(TEMPLATE_FILE_NAME, bytes);
      if (outcome === 'downloaded') showToast('Saved the blank template', 'success');
    } catch (error) {
      console.error('Error saving template:', error);
      showToast('Couldn’t save the template. Please try again.', 'error');
    }
  }, [currency, showToast]);

  return (
    <View style={themedStyles.formContainer}>
      <FormScreen>
        <StandardHeader
          title="Import a workbook"
          onLeftPress={goBack}
          confirm={
            draft
              ? {
                  onPress: handleImport,
                  disabled: !trimmed,
                  loading: importing,
                  accessibilityLabel: 'Import budget',
                }
              : undefined
          }
        />
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: space.s5, paddingBottom: scrollBottomPadding, minHeight: BOUNCE_MIN_HEIGHT }}
          keyboardShouldPersistTaps="handled"
        >
          {entry ? (
            <ImportPreview result={entry.result} name={name} onNameChange={setName} busy={importing} onSubmit={handleImport} />
          ) : (
            <ImportIntro />
          )}
          {draft ? null : (
            <View style={{ marginBottom: space.s5 }}>
              <Button
                text={entry ? 'Choose a different file' : 'Choose Excel file'}
                onPress={handleChooseFile}
                loading={picking}
                size="lg"
              />
              <Button text="Get blank template" variant="outline" onPress={handleGetTemplate} size="lg" style={{ marginTop: space.s3 }} />
            </View>
          )}
        </ScrollView>
      </FormScreen>
    </View>
  );
}

/** What to do next, by why the file couldn't be imported. */
const FAILURE_ADVICE: Record<ImportFailure, string> = {
  unreadable: 'Choose an Excel (.xlsx) file. Numbers and Google Sheets can export one.',
  'not-a-budget':
    'Budget Flow can only read workbooks laid out like its own. Start from the blank template, copy your figures into it, then choose it again.',
  empty: 'Add rows under the headings on the People, Income and Expenses sheets, keeping the headings as they are, then choose the file again.',
};

const STEPS = [
  {
    title: 'Get a workbook',
    caption: 'Use the blank template, or export one of your budgets from its ⋯ menu on the Budgets screen.',
  },
  {
    title: 'Fill it in',
    caption: 'Add people, income and expenses in Excel. Already have a spreadsheet? Copy its figures in and keep the headings as they are.',
  },
  {
    title: 'Bring it back here',
    caption: 'Choose the file below. You’ll see a preview before anything is added.',
  },
];

/** What importing needs, so nobody picks a spreadsheet laid out some other way and hits a dead end. */
function ImportIntro() {
  return (
    <View>
      <EmptyState
        icon="document-outline"
        title="Import a Budget Flow workbook"
        caption="This isn’t for any spreadsheet. It reads workbooks laid out like the ones Budget Flow exports."
        style={{ paddingTop: space.s2, paddingBottom: space.s6 }}
      />
      <ListGroup header="How it works">
        {STEPS.map((step, i) => (
          <ListRow
            key={step.title}
            glyphText={String(i + 1)}
            title={step.title}
            caption={step.caption}
            captionLines={4}
            accessibilityLabel={`Step ${i + 1}: ${step.title}. ${step.caption}`}
            showSeparator={i < STEPS.length - 1}
          />
        ))}
      </ListGroup>
    </View>
  );
}

/** What an Excel file holds, and what's wrong with it, before anything is added. */
function ImportPreview({
  result,
  name,
  onNameChange,
  busy,
  onSubmit,
}: {
  result: ImportResult;
  name: string;
  onNameChange: (name: string) => void;
  busy: boolean;
  onSubmit: () => void;
}) {
  const { tokens } = useTheme();
  const { budget, issues, counts } = result;
  const shown = issues.slice(0, MAX_SHOWN_ISSUES);
  const hidden = issues.length - shown.length;

  const count = (n: number) => <Text style={[type.body, tabularNums, { color: tokens.colors.textMuted }]}>{n}</Text>;

  const issueRows = (header: string, footer?: string) => (
    <ListGroup header={header} footer={footer}>
      {shown.map((issue, i) => (
        <ListRow
          key={i}
          title={issue.sheet && issue.row ? `${issue.sheet} · row ${issue.row}` : issue.sheet || 'Workbook'}
          caption={issue.message}
          captionLines={3}
          icon={issue.severity === 'error' ? 'alert-circle-outline' : 'information-circle-outline'}
          iconColor={issue.severity === 'error' ? tokens.colors.danger : tokens.colors.warning}
          accessibilityLabel={`${issue.severity === 'error' ? 'Problem' : 'Note'}: ${describeIssue(issue)}`}
          showSeparator={i < shown.length - 1 || hidden > 0}
        />
      ))}
      {hidden > 0 ? <ListRow title={`…and ${hidden} more`} showSeparator={false} /> : null}
    </ListGroup>
  );

  if (!budget) {
    return issueRows('Couldn’t import this file', FAILURE_ADVICE[result.failure ?? 'not-a-budget']);
  }

  const skipped = counts.skipped;
  return (
    <View>
      <Input
        label="Budget name"
        value={name}
        onChangeText={onNameChange}
        editable={!busy}
        maxLength={50}
        returnKeyType="done"
        onSubmitEditing={onSubmit}
        containerStyle={{ marginBottom: space.s5 }}
      />

      <ListGroup header="What will be added">
        <ListRow title="People" trailing={count(counts.people)} accessibilityLabel={`${counts.people} people`} />
        <ListRow title="Income sources" trailing={count(counts.income)} accessibilityLabel={`${counts.income} income sources`} />
        <ListRow title="Expenses" trailing={count(counts.expenses)} accessibilityLabel={`${counts.expenses} expenses`} />
        <ListRow
          title="Household costs"
          trailing={
            <Text style={[type.body, { color: tokens.colors.textMuted }]}>
              {budget.householdSettings.distributionMethod === 'income-based' ? 'Split by income' : 'Split evenly'}
            </Text>
          }
          showSeparator={budget.customCategories.length > 0}
        />
        {budget.customCategories.length > 0 ? (
          <ListRow title="New categories" caption={budget.customCategories.join(', ')} captionLines={3} showSeparator={false} />
        ) : null}
      </ListGroup>

      {issues.length > 0
        ? issueRows(
            skipped > 0 ? `${skipped} ${skipped === 1 ? 'row' : 'rows'} left out` : 'Worth a look',
            skipped > 0
              ? 'Rows with a problem are left out. Fix them in the workbook and import again, or add them in the app afterwards.'
              : undefined
          )
        : null}
    </View>
  );
}
