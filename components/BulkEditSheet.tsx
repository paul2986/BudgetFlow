import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import Button from './Button';
import { ChoicePills, DateField, Sheet } from './ui';
import { BucketId, Expense, Frequency, Person } from '../types/budget';
import { applyBulkEdit, countLabel, isBulkPatchEmpty, type BulkEditPatch } from '../utils/bulkEdit';
import { bucketOfExpense, type CategoryBucketLookup } from '../utils/budgetReview';
import { BUCKET_META, BUCKET_OPTIONS } from './tools/bucketMeta';
import { type, space } from '../styles/tokens';

/**
 * Edit several expenses at once. Every field starts on "No change"; only the
 * fields the person touches are applied, in one save. The button states how
 * many expenses would actually change, and the notes under the fields say
 * what a field can't do for some of them (one-time expenses have no end date).
 */

const KEEP = '__keep__';
type Keep = typeof KEEP;
type EndDateMode = Keep | 'set' | 'remove';

const FREQUENCY_LABELS: Record<Frequency, string> = {
  'one-time': 'Once',
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  yearly: 'Yearly',
};
const FREQUENCIES = Object.keys(FREQUENCY_LABELS) as Frequency[];

const toYMD = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const formatDay = (ymd: string) => {
  const d = new Date(ymd.slice(0, 10) + 'T00:00:00');
  return isNaN(d.getTime()) ? ymd : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

/** The one value every expense shares, or 'Mixed'. */
const shared = (values: string[]): string => (values.every((v) => v === values[0]) ? values[0] : 'Mixed');

interface BulkEditSheetProps {
  visible: boolean;
  onClose: () => void;
  /** The expenses being edited. */
  expenses: Expense[];
  people: Person[];
  /** Every category the form offers, custom ones included. */
  categories: string[];
  /** The budget's own choices of where categories count, to resolve Counts as. */
  bucketLookup?: CategoryBucketLookup;
  busy: boolean;
  onApply: (patch: BulkEditPatch) => void;
}

export default function BulkEditSheet({ visible, onClose, expenses, people, categories, bucketLookup, busy, onApply }: BulkEditSheetProps) {
  const { tokens } = useTheme();
  const [frequency, setFrequency] = useState<Frequency | Keep>(KEEP);
  const [who, setWho] = useState<string>(KEEP); // KEEP | 'household' | `person:<id>`
  const [categoryTag, setCategoryTag] = useState<string>(KEEP);
  const [countsAs, setCountsAs] = useState<string>(KEEP); // KEEP | 'category' (follow it) | BucketId
  const [endMode, setEndMode] = useState<EndDateMode>(KEEP);
  const [endDate, setEndDate] = useState<Date | null>(null);

  useEffect(() => {
    if (!visible) return;
    setFrequency(KEEP);
    setWho(KEEP);
    setCategoryTag(KEEP);
    setCountsAs(KEEP);
    setEndMode(KEEP);
    setEndDate(null);
  }, [visible]);

  const patch = useMemo<BulkEditPatch>(() => {
    const p: BulkEditPatch = {};
    if (frequency !== KEEP) p.frequency = frequency;
    if (who === 'household') p.who = { kind: 'household' };
    else if (who.startsWith('person:')) p.who = { kind: 'person', personId: who.slice('person:'.length) };
    if (categoryTag !== KEEP) p.categoryTag = categoryTag;
    if (countsAs === 'category') p.bucket = null;
    else if (countsAs !== KEEP) p.bucket = countsAs as BucketId;
    if (endMode === 'remove') p.endDate = { kind: 'remove' };
    else if (endMode === 'set' && endDate) p.endDate = { kind: 'set', date: toYMD(endDate) };
    return p;
  }, [frequency, who, categoryTag, countsAs, endMode, endDate]);

  const preview = useMemo(
    () => applyBulkEdit(expenses, expenses.map((e) => e.id), patch, Date.now(), bucketLookup),
    [expenses, patch, bucketLookup]
  );

  const nowFrequency = useMemo(
    () => shared(expenses.map((e) => FREQUENCY_LABELS[e.frequency] ?? e.frequency)),
    [expenses]
  );
  const nowWho = useMemo(
    () =>
      shared(
        expenses.map((e) =>
          e.category === 'household' ? 'Household' : people.find((p) => p.id === e.personId)?.name ?? 'Personal'
        )
      ),
    [expenses, people]
  );
  const nowCategory = useMemo(() => shared(expenses.map((e) => e.categoryTag || 'Misc')), [expenses]);
  const nowCountsAs = useMemo(
    () => shared(expenses.map((e) => BUCKET_META[bucketOfExpense(e, bucketLookup)].name)),
    [expenses, bucketLookup]
  );
  const nowEnd = useMemo(() => {
    const recurring = expenses.filter((e) => e.frequency !== 'one-time');
    if (recurring.length === 0) return 'None (all one-time)';
    const v = shared(recurring.map((e) => e.endDate?.slice(0, 10) || ''));
    return v === '' ? 'None' : v === 'Mixed' ? v : formatDay(v);
  }, [expenses]);

  const patchEmpty = isBulkPatchEmpty(patch);
  const changed = preview.changedIds.length;
  const incompleteDate = endMode === 'set' && !endDate;
  const canApply = !busy && !patchEmpty && changed > 0;
  const buttonText = incompleteDate
    ? 'Pick an end date'
    : patchEmpty
      ? 'Choose what to change'
      : changed === 0
        ? 'Nothing would change'
        : `Apply to ${countLabel(changed)}`;

  const notes: string[] = [];
  if (preview.skippedOneTime > 0) {
    const n = preview.skippedOneTime;
    notes.push(
      `${n} one-time ${n === 1 ? 'expense has' : 'expenses have'} no end date, so ${n === 1 ? 'it keeps' : 'they keep'} none.`
    );
  }
  if (preview.skippedBeforeStart > 0) {
    const n = preview.skippedBeforeStart;
    notes.push(`${n} ${n === 1 ? 'starts' : 'start'} after that end date and ${n === 1 ? 'is' : 'are'} left as ${n === 1 ? 'it is' : 'they are'}.`);
  }

  const field = (label: string, now: string, control: React.ReactNode) => (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: space.s2 }}>
        <Text style={[type.caption, { color: tokens.colors.textMuted }]}>{label}</Text>
        <Text style={[type.caption, { color: tokens.colors.textFaint }]} numberOfLines={1}>
          Currently: {now}
        </Text>
      </View>
      {control}
    </View>
  );

  const keepOption = { value: KEEP as string, label: 'No change' };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={`Edit ${countLabel(expenses.length)}`}
      leadingAction={{ label: 'Cancel', onPress: onClose }}
      width={480}
      footer={
        <Button
          text={buttonText}
          onPress={() => onApply(patch)}
          disabled={!canApply}
          loading={busy}
          size="lg"
          style={{ marginTop: 0 }}
        />
      }
    >
      <ScrollView
        style={{ flexShrink: 1 }}
        contentContainerStyle={{ padding: space.s5, paddingBottom: space.s4, gap: space.s5 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {field(
          'How often',
          nowFrequency,
          <ChoicePills<string>
            label="How often"
            showLabel={false}
            value={frequency}
            onChange={(v) => setFrequency(v as Frequency | Keep)}
            options={[keepOption, ...FREQUENCIES.map((f) => ({ value: f as string, label: FREQUENCY_LABELS[f] }))]}
          />
        )}

        {field(
          'Who pays',
          nowWho,
          <ChoicePills<string>
            label="Who pays"
            showLabel={false}
            value={who}
            onChange={setWho}
            options={[
              keepOption,
              { value: 'household', label: 'Household', icon: 'home-outline' },
              ...people.map((p) => ({ value: `person:${p.id}`, label: p.name, icon: 'person-outline' })),
            ]}
          />
        )}

        {field(
          'Category',
          nowCategory,
          <ChoicePills<string>
            label="Category"
            showLabel={false}
            value={categoryTag}
            onChange={setCategoryTag}
            options={[keepOption, ...categories.map((c) => ({ value: c, label: c }))]}
          />
        )}

        {field(
          'Counts as',
          nowCountsAs,
          <ChoicePills<string>
            label="Counts as"
            showLabel={false}
            value={countsAs}
            onChange={setCountsAs}
            options={[keepOption, { value: 'category', label: 'Same as category' }, ...BUCKET_OPTIONS.map((o) => ({ ...o, value: o.value as string }))]}
          />
        )}

        {field(
          'End date',
          nowEnd,
          <View style={{ gap: space.s3 }}>
            <ChoicePills<string>
              label="End date"
              showLabel={false}
              value={endMode}
              onChange={(v) => setEndMode(v as EndDateMode)}
              options={[
                keepOption,
                { value: 'set', label: 'Set date' },
                { value: 'remove', label: 'Remove end date' },
              ]}
            />
            {endMode === 'set' ? (
              <DateField label="Ends on" value={endDate} onChange={setEndDate} placeholder="Choose a date" />
            ) : null}
          </View>
        )}

        {notes.length > 0 ? (
          <View style={{ gap: space.s1 }}>
            {notes.map((n) => (
              <Text key={n} style={[type.caption, { color: tokens.colors.textMuted }]}>
                {n}
              </Text>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </Sheet>
  );
}
