
import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import Icon from './Icon';
import Button from './Button';
import { HEADER_HEIGHT } from './StandardHeader';
import { Sheet } from './ui';
import { type, space, radius, tabularNums } from '../styles/tokens';
import { haptics } from '../utils/haptics';
import { DEFAULT_CATEGORIES, type BucketId, type Expense, type Person } from '../types/budget';
import { normalizeCategoryName } from '../utils/categories';
import { NO_FILTERS, filterExpenses, hasActiveFilters, type ExpenseFilters } from '../utils/expenseFilters';
import { BUCKET_META } from './tools/bucketMeta';
import { BUCKET_ORDER } from '../utils/budgetReview';

interface ExpenseFilterModalProps {
  visible: boolean;
  onClose: () => void;
  /** What is applied now; the sheet edits a draft of it until "Show" is pressed. */
  filters: ExpenseFilters;
  onApply: (filters: ExpenseFilters) => void;
  /** Where an expense counts in the budget review (its own choice, else its category's). */
  bucketOf: (expense: Expense) => BucketId;
  people: Person[];
  expenses: Expense[];
  customCategories: string[];
  announceFilter: (msg: string) => void;
}

export default function ExpenseFilterModal({
  visible,
  onClose,
  filters,
  onApply,
  bucketOf,
  people,
  expenses,
  customCategories,
  announceFilter,
}: ExpenseFilterModalProps) {
  // The pending choices, applied only when "Show" is pressed.
  const [draft, setDraft] = useState<ExpenseFilters>(filters);
  const change = (changes: Partial<ExpenseFilters>) => setDraft((d) => ({ ...d, ...changes }));

  // Start from what is applied each time the sheet opens.
  useEffect(() => {
    if (visible) setDraft(filters);
  }, [visible, filters]);

  const availableCategories = (() => {
    // Union of defaults + custom + any tag appearing in expenses (normalized)
    const fromExpenses = new Set<string>();
    expenses.forEach((e) => {
      const tag = normalizeCategoryName(e.categoryTag || 'Misc');
      if (tag) fromExpenses.add(tag);
    });
    const combined = new Set<string>([...DEFAULT_CATEGORIES, ...customCategories, ...Array.from(fromExpenses)]);
    return Array.from(combined);
  })().sort((a, b) => a.localeCompare(b));

  // Live count for every option: how many expenses would show if that option were
  // picked, with every other pending choice still applied.
  const expenseCounts = useMemo(() => {
    const countWith = (changes: Partial<ExpenseFilters>): number =>
      filterExpenses(expenses, { ...draft, ...changes }, bucketOf).length;

    const peopleCounts: { [personId: string]: number } = {};
    people.forEach((person) => {
      peopleCounts[person.id] = countWith({ personId: person.id });
    });

    const categoryCounts: { [category: string]: number } = {};
    availableCategories.forEach((category) => {
      categoryCounts[category] = countWith({ categories: [category] });
    });

    return {
      total: countWith({}),
      expenseTypes: {
        all: countWith({ type: 'all' }),
        household: countWith({ type: 'household' }),
        personal: countWith({ type: 'personal' }),
      },
      people: peopleCounts,
      allPeople: countWith({ personId: null }),
      categories: categoryCounts,
      allCategories: countWith({ categories: [] }),
      endDate: { with: countWith({ hasEndDate: true }), without: countWith({ hasEndDate: false }) },
      debt: {
        all: countWith({ debt: 'all' }),
        any: countWith({ debt: 'any' }),
        loan: countWith({ debt: 'loan' }),
        mortgage: countWith({ debt: 'mortgage' }),
        credit_card: countWith({ debt: 'credit_card' }),
      },
      bucket: {
        all: countWith({ bucket: 'all' }),
        needs: countWith({ bucket: 'needs' }),
        wants: countWith({ bucket: 'wants' }),
        savings: countWith({ bucket: 'savings' }),
      },
    };
  }, [expenses, bucketOf, draft, people, availableCategories]);

  const handleCancel = () => {
    // Drop the pending choices and close without applying.
    setDraft(filters);
    onClose();
  };

  const handleApplyFilters = () => {
    onApply(draft);

    let message = 'No filters applied - showing all expenses';
    if (hasActiveFilters(draft)) {
      const activeFilters = [];
      if (draft.search.trim()) activeFilters.push(`search: "${draft.search.trim()}"`);
      if (draft.categories.length === 1) activeFilters.push(`category: ${draft.categories[0]}`);
      else if (draft.categories.length > 1) activeFilters.push(`categories: ${draft.categories.join(', ')}`);
      if (draft.type !== 'all') activeFilters.push(`type: ${draft.type}`);
      if (draft.personId) {
        const personName = people.find((p) => p.id === draft.personId)?.name || 'Unknown';
        activeFilters.push(`person: ${personName}`);
      }
      if (draft.hasEndDate) activeFilters.push('has end date');
      if (draft.debt !== 'all') activeFilters.push(`debt: ${draft.debt === 'any' ? 'Any Debt' : draft.debt}`);
      if (draft.bucket !== 'all') activeFilters.push(`counts as ${BUCKET_META[draft.bucket].name}`);
      message = `Filters applied: ${activeFilters.join(', ')}`;
    }
    announceFilter(message);
    onClose();
  };

  // Search lives on the Expenses screen now; resetting the sheet keeps it.
  const handleClearFilters = () => setDraft({ ...NO_FILTERS, search: filters.search });

  const handleCategoryToggle = (category: string) =>
    change({
      categories: draft.categories.includes(category)
        ? draft.categories.filter((c) => c !== category)
        : [...draft.categories, category],
    });

  // The primary button shows the live count with every pending choice applied.
  const sheetFiltersActive = hasActiveFilters({ ...draft, search: '' });

  const content = (
    <ScrollView
      style={{ flexShrink: 1 }}
      contentContainerStyle={{ padding: space.s5, paddingBottom: space.s3 }}
      showsVerticalScrollIndicator={false}
    >
      <Section title="Type">
        {(['all', 'household', 'personal'] as const).map((t) => (
          <OptionChip
            key={t}
            label={t === 'all' ? 'All' : t === 'household' ? 'Household' : 'Personal'}
            icon={t === 'household' ? 'home-outline' : t === 'personal' ? 'person-outline' : undefined}
            count={expenseCounts.expenseTypes[t]}
            selected={draft.type === t}
            onPress={() => change(t === 'personal' ? { type: t } : { type: t, personId: null })}
          />
        ))}
      </Section>

      {people.length > 0 ? (
        <Section title="Person">
          <OptionChip
            label="Everyone"
            count={expenseCounts.allPeople}
            selected={draft.personId === null}
            onPress={() => change({ personId: null })}
          />
          {people.map((person) => (
            <OptionChip
              key={person.id}
              label={person.name}
              count={expenseCounts.people[person.id] || 0}
              selected={draft.personId === person.id}
              onPress={() => change({ personId: person.id })}
            />
          ))}
        </Section>
      ) : null}

      <Section title="Debt repayments">
        {(
          [
            ['all', 'All'],
            ['any', 'Any debt'],
            ['loan', 'Loans'],
            ['mortgage', 'Mortgages'],
            ['credit_card', 'Credit cards'],
          ] as const
        ).map(([value, label]) => (
          <OptionChip
            key={value}
            label={label}
            count={expenseCounts.debt[value]}
            selected={draft.debt === value}
            onPress={() => change({ debt: value })}
          />
        ))}
      </Section>

      <Section title="Counts as" note="In the budget review">
        <OptionChip
          label="All"
          count={expenseCounts.bucket.all}
          selected={draft.bucket === 'all'}
          onPress={() => change({ bucket: 'all' })}
        />
        {BUCKET_ORDER.map((id) => (
          <OptionChip
            key={id}
            label={BUCKET_META[id].name}
            icon={BUCKET_META[id].icon}
            count={expenseCounts.bucket[id]}
            selected={draft.bucket === id}
            onPress={() => change({ bucket: id })}
          />
        ))}
      </Section>

      <Section title="End date">
        <OptionChip
          label="Only with an end date"
          icon="timer-outline"
          count={expenseCounts.endDate.with}
          selected={draft.hasEndDate}
          onPress={() => change({ hasEndDate: !draft.hasEndDate })}
        />
      </Section>

      <Section
        title="Categories"
        note={draft.categories.length > 0 ? `${draft.categories.length} selected` : 'Pick one or more'}
      >
        <OptionChip
          label="All categories"
          count={expenseCounts.allCategories}
          selected={draft.categories.length === 0}
          onPress={() => change({ categories: [] })}
        />
        {availableCategories.map((cat) => (
          <OptionChip
            key={cat}
            label={cat}
            count={expenseCounts.categories[cat] || 0}
            selected={draft.categories.includes(cat)}
            onPress={() => handleCategoryToggle(cat)}
          />
        ))}
      </Section>
    </ScrollView>
  );

  return (
    <Sheet
      visible={visible}
      onClose={handleCancel}
      title="Filters"
      leadingAction={{ label: 'Cancel', onPress: handleCancel }}
      trailingAction={{ label: 'Reset', onPress: handleClearFilters, disabled: !sheetFiltersActive }}
      anchor="headerTrailing"
      anchorTop={HEADER_HEIGHT + space.s3}
      width={420}
      footer={
        <Button
          text={expenseCounts.total === 1 ? 'Show 1 expense' : `Show ${expenseCounts.total} expenses`}
          onPress={handleApplyFilters}
          size="lg"
          style={{ marginTop: 0 }}
        />
      }
    >
      {content}
    </Sheet>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  const { tokens } = useTheme();
  return (
    <View style={{ marginBottom: space.s6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', marginBottom: space.s3 }}>
        <Text accessibilityRole="header" style={[type.bodyMed, { color: tokens.colors.text, flex: 1 }]}>
          {title}
        </Text>
        {note ? <Text style={[type.caption, { color: tokens.colors.textMuted }]}>{note}</Text> : null}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s2 }}>{children}</View>
    </View>
  );
}

/** Selectable pill with a live count; selection shown by fill + checkmark. */
function OptionChip({
  label,
  count,
  selected,
  onPress,
  icon,
}: {
  label: string;
  count: number;
  selected: boolean;
  onPress: () => void;
  icon?: string;
}) {
  const { tokens } = useTheme();
  const fg = selected ? tokens.colors.onBrand : tokens.colors.text;
  return (
    <Pressable
      onPress={() => {
        haptics.selection();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${count} ${count === 1 ? 'expense' : 'expenses'}`}
      accessibilityState={{ selected }}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: 36,
        paddingHorizontal: space.s3,
        borderRadius: radius.full,
        backgroundColor: selected ? tokens.colors.brand : pressed ? tokens.colors.border : tokens.colors.surfaceSunken,
        opacity: count === 0 && !selected ? 0.55 : 1,
      })}
    >
      {selected ? (
        <Icon name="checkmark" size={14} color={fg} style={{ marginRight: space.s1 }} />
      ) : icon ? (
        <Icon name={icon as any} size={14} color={tokens.colors.textMuted} style={{ marginRight: space.s1 }} />
      ) : null}
      <Text style={[type.caption, { color: fg }]} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[type.caption, tabularNums, { color: selected ? fg : tokens.colors.textMuted, marginLeft: space.s2 }]}>
        {count}
      </Text>
    </Pressable>
  );
}
