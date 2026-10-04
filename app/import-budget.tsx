import { useCallback, useEffect, useRef, useState } from 'react';
import { View, ScrollView, Text } from 'react-native';
import { router } from 'expo-router';
import { useBudgetData } from '../hooks/useBudgetData';
import { useTheme } from '../hooks/useTheme';
import { useThemedStyles } from '../hooks/useThemedStyles';
import { useToast } from '../hooks/useToast';
import { useFormSessionKey } from '../hooks/useFormSessionKey';
import { useScrollBottomPadding, BOUNCE_MIN_HEIGHT } from '../hooks/useBreakpoint';
import StandardHeader from '../components/StandardHeader';
import { EmptyState, FormScreen, Input, ListGroup, ListRow } from '../components/ui';
import { type, space, tabularNums } from '../styles/tokens';
import { describeIssue, type ImportResult } from '../utils/budgetWorkbook/import';
import { importHandoff, useImportEntry } from '../utils/importHandoff';

const MAX_SHOWN_ISSUES = 8;

/**
 * Preview of an Excel workbook before it's added as a new budget: what it
 * holds, and which rows were left out and why. Opened from Budgets, which
 * reads the file and hands the result over (utils/importHandoff).
 */
export default function ImportBudgetScreen() {
  const { themedStyles } = useThemedStyles();
  const { importBudget } = useBudgetData();
  const { showToast } = useToast();
  const scrollBottomPadding = useScrollBottomPadding();
  const entry = useImportEntry();

  const [name, setName] = useState('');
  const [importing, setImporting] = useState(false);
  const shownId = useRef<number | null>(null);
  // A ref, not the `importing` state: two taps landing in the same moment both see the
  // state as still false, and each import makes a new budget.
  const inFlight = useRef(false);

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

  return (
    <View style={themedStyles.container}>
      <FormScreen>
        <StandardHeader
          title="Import from Excel"
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
            <EmptyState
              icon="document-outline"
              title="Nothing to import"
              caption="Choose an Excel file from Budgets to preview it here."
              actionLabel="Back to budgets"
              onAction={goBack}
            />
          )}
        </ScrollView>
      </FormScreen>
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

  if (!budget) return issueRows('Couldn’t import this file');

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
