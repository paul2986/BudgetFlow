
import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import Icon from './Icon';
import Button from './Button';
import { HEADER_HEIGHT } from './StandardHeader';
import { Sheet } from './ui';
import { type, space, radius, tabularNums } from '../styles/tokens';
import { haptics } from '../utils/haptics';
import { DEFAULT_CATEGORIES, type BucketId, type Expense } from '../types/budget';
import { normalizeCategoryName } from '../utils/storage';
import { BUCKET_META } from './tools/bucketMeta';
import { BUCKET_ORDER } from '../utils/budgetReview';

interface ExpenseFilterModalProps {
  visible: boolean;
  onClose: () => void;
  // Filter state
  filter: 'all' | 'household' | 'personal';
  setFilter: (filter: 'all' | 'household' | 'personal') => void;
  personFilter: string | null;
  setPersonFilter: (personId: string | null) => void;
  categoryFilter: string | null;
  setCategoryFilter: (category: string | null) => void;
  categoryFilters: string[];
  setCategoryFilters: (categories: string[]) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  hasEndDateFilter: boolean;
  setHasEndDateFilter: (hasEndDate: boolean) => void;
  debtFilter: 'all' | 'any' | 'loan' | 'mortgage' | 'credit_card';
  setDebtFilter: (debtFilter: 'all' | 'any' | 'loan' | 'mortgage' | 'credit_card') => void;
  bucketFilter: 'all' | BucketId;
  setBucketFilter: (bucket: 'all' | BucketId) => void;
  // Data
  /** Where an expense counts in the budget review (its own choice, else its category's). */
  bucketOf: (expense: Expense) => BucketId;
  people: any[];
  expenses: any[];
  customCategories: string[];
  // Callbacks
  onClearFilters: () => void;
  announceFilter: (msg: string) => void;
}

export default function ExpenseFilterModal({
  visible,
  onClose,
  filter,
  setFilter,
  personFilter,
  setPersonFilter,
  categoryFilter,
  setCategoryFilter,
  categoryFilters,
  setCategoryFilters,
  searchQuery,
  setSearchQuery,
  hasEndDateFilter,
  setHasEndDateFilter,
  debtFilter,
  setDebtFilter,
  bucketFilter,
  setBucketFilter,
  bucketOf,
  people,
  expenses,
  customCategories,
  onClearFilters,
  announceFilter,
}: ExpenseFilterModalProps) {
  const { tokens } = useTheme();

  // FIXED: Local state for temporary filter values (applied when "Apply Filters" is pressed)
  const [tempFilter, setTempFilter] = useState<'all' | 'household' | 'personal'>('all');
  const [tempPersonFilter, setTempPersonFilter] = useState<string | null>(null);
  const [tempCategoryFilters, setTempCategoryFilters] = useState<string[]>([]);
  const [tempSearchQuery, setTempSearchQuery] = useState<string>('');
  const [tempHasEndDateFilter, setTempHasEndDateFilter] = useState<boolean>(false);
  const [tempDebtFilter, setTempDebtFilter] = useState<'all' | 'any' | 'loan' | 'mortgage' | 'credit_card'>('all');
  const [tempBucketFilter, setTempBucketFilter] = useState<'all' | BucketId>('all');

  // FIXED: Initialize temp state when modal opens with current filter values
  useEffect(() => {
    if (visible) {
      console.log('ExpenseFilterModal: Initializing temp state with current filters:', {
        filter,
        personFilter,
        categoryFilter,
        searchQuery,
        hasEndDateFilter,
        debtFilter,
        bucketFilter
      });
      setTempFilter(filter);
      setTempPersonFilter(personFilter);
      // Initialize with multiple categories if available, otherwise single category
      const initialCategories = categoryFilters.length > 0 ? categoryFilters : (categoryFilter ? [categoryFilter] : []);
      setTempCategoryFilters(initialCategories);
      setTempSearchQuery(searchQuery);
      setTempHasEndDateFilter(hasEndDateFilter);
      setTempDebtFilter(debtFilter || 'all');
      setTempBucketFilter(bucketFilter || 'all');
    }
  }, [visible, filter, personFilter, categoryFilter, categoryFilters, searchQuery, hasEndDateFilter, debtFilter, bucketFilter]);

  const availableCategories = (() => {
    // Union of defaults + custom + any tag appearing in expenses (normalized)
    const fromExpenses = new Set<string>();
    expenses.forEach((e) => {
      const tag = normalizeCategoryName((e as any).categoryTag || 'Misc');
      if (tag) fromExpenses.add(tag);
    });
    const combined = new Set<string>([...DEFAULT_CATEGORIES, ...customCategories, ...Array.from(fromExpenses)]);
    return Array.from(combined);
  })().sort((a, b) => a.localeCompare(b));

  // Live count for every option: how many expenses would show if that option were
  // picked, with every other pending choice still applied.
  const expenseCounts = useMemo(() => {
    type Pending = {
      filter: 'all' | 'household' | 'personal';
      personFilter: string | null;
      categoryFilters: string[];
      searchQuery: string;
      hasEndDateFilter: boolean;
      debtFilter: 'all' | 'any' | 'loan' | 'mortgage' | 'credit_card';
      bucketFilter: 'all' | BucketId;
    };

    const pending: Pending = {
      filter: tempFilter,
      personFilter: tempPersonFilter,
      categoryFilters: tempCategoryFilters,
      searchQuery: tempSearchQuery,
      hasEndDateFilter: tempHasEndDateFilter,
      debtFilter: tempDebtFilter,
      bucketFilter: tempBucketFilter,
    };

    // Apply the pending choices, with `change` swapped in, and count what is left.
    const countWith = (change: Partial<Pending>): number => {
      const f: Pending = { ...pending, ...change };
      let filtered = [...expenses];

      if (f.filter === 'household') filtered = filtered.filter((e) => e.category === 'household');
      else if (f.filter === 'personal') filtered = filtered.filter((e) => e.category === 'personal');

      if (f.personFilter) filtered = filtered.filter((e) => e.personId === f.personFilter);

      if (f.categoryFilters.length > 0) {
        const selectedCategories = f.categoryFilters.map((cat) => normalizeCategoryName(cat));
        filtered = filtered.filter((e) => selectedCategories.includes(normalizeCategoryName((e as any).categoryTag || 'Misc')));
      }

      if (f.searchQuery && f.searchQuery.trim()) {
        const q = f.searchQuery.toLowerCase();
        filtered = filtered.filter((e) => e.description.toLowerCase().includes(q));
      }

      if (f.hasEndDateFilter) filtered = filtered.filter((e) => e.endDate && e.frequency !== 'one-time');

      if (f.debtFilter !== 'all') {
        filtered = filtered.filter((e) => (f.debtFilter === 'any' ? !!e.debtRepayment : e.debtRepayment === f.debtFilter));
      }

      if (f.bucketFilter !== 'all') filtered = filtered.filter((e) => bucketOf(e) === f.bucketFilter);

      return filtered.length;
    };

    const peopleCounts: { [personId: string]: number } = {};
    people.forEach((person) => {
      peopleCounts[person.id] = countWith({ personFilter: person.id });
    });

    const categoryCounts: { [category: string]: number } = {};
    availableCategories.forEach((category) => {
      categoryCounts[category] = countWith({ categoryFilters: [category] });
    });

    return {
      total: countWith({}),
      expenseTypes: {
        all: countWith({ filter: 'all' }),
        household: countWith({ filter: 'household' }),
        personal: countWith({ filter: 'personal' }),
      },
      people: peopleCounts,
      allPeople: countWith({ personFilter: null }),
      categories: categoryCounts,
      allCategories: countWith({ categoryFilters: [] }),
      endDate: { with: countWith({ hasEndDateFilter: true }), without: countWith({ hasEndDateFilter: false }) },
      debt: {
        all: countWith({ debtFilter: 'all' }),
        any: countWith({ debtFilter: 'any' }),
        loan: countWith({ debtFilter: 'loan' }),
        mortgage: countWith({ debtFilter: 'mortgage' }),
        credit_card: countWith({ debtFilter: 'credit_card' }),
      },
      bucket: {
        all: countWith({ bucketFilter: 'all' }),
        needs: countWith({ bucketFilter: 'needs' }),
        wants: countWith({ bucketFilter: 'wants' }),
        savings: countWith({ bucketFilter: 'savings' }),
      },
    };
  }, [expenses, bucketOf, tempFilter, tempPersonFilter, tempCategoryFilters, tempSearchQuery, tempHasEndDateFilter, tempDebtFilter, tempBucketFilter, people, availableCategories]);

  const hasActiveFilters = tempCategoryFilters.length > 0 || !!tempSearchQuery.trim() || (tempFilter !== 'all') || !!tempPersonFilter || tempHasEndDateFilter || (tempDebtFilter !== 'all') || (tempBucketFilter !== 'all');

  const handleCancel = () => {
    console.log('ExpenseFilterModal: Cancel pressed, resetting temp state');
    // Reset temp state to original values and close without applying
    setTempFilter(filter);
    setTempPersonFilter(personFilter);
    // Reset with current categories
    const currentCategories = categoryFilters.length > 0 ? categoryFilters : (categoryFilter ? [categoryFilter] : []);
    setTempCategoryFilters(currentCategories);
    setTempSearchQuery(searchQuery);
    setTempHasEndDateFilter(hasEndDateFilter);
    setTempDebtFilter(debtFilter || 'all');
    setTempBucketFilter(bucketFilter || 'all');
    onClose();
  };

  const handleApplyFilters = () => {
    console.log('ExpenseFilterModal: Applying filters:', {
      tempFilter,
      tempPersonFilter,
      tempCategoryFilters,
      tempSearchQuery,
      tempHasEndDateFilter,
      tempDebtFilter,
      tempBucketFilter
    });

    // FIXED: Apply the temporary filter values to the actual state
    setFilter(tempFilter);
    setPersonFilter(tempPersonFilter);

    // Apply multiple categories
    setCategoryFilters(tempCategoryFilters);
    // For storage compatibility, also set single category filter to first selected
    setCategoryFilter(tempCategoryFilters.length > 0 ? tempCategoryFilters[0] : null);
    setSearchQuery(tempSearchQuery);
    setHasEndDateFilter(tempHasEndDateFilter);
    setDebtFilter(tempDebtFilter);
    setBucketFilter(tempBucketFilter);

    // FIXED: Build proper announcement message
    let message = 'Filters applied';
    if (hasActiveFilters) {
      const activeFilters = [];
      if (tempSearchQuery.trim()) activeFilters.push(`search: "${tempSearchQuery.trim()}"`);
      if (tempCategoryFilters.length > 0) {
        if (tempCategoryFilters.length === 1) {
          activeFilters.push(`category: ${tempCategoryFilters[0]}`);
        } else {
          activeFilters.push(`categories: ${tempCategoryFilters.join(', ')}`);
        }
      }
      if (tempFilter !== 'all') activeFilters.push(`type: ${tempFilter}`);
      if (tempPersonFilter) {
        const personName = people.find(p => p.id === tempPersonFilter)?.name || 'Unknown';
        activeFilters.push(`person: ${personName}`);
      }
      if (tempHasEndDateFilter) activeFilters.push('has end date');
      if (tempDebtFilter !== 'all') {
        const debtLabel = tempDebtFilter === 'any' ? 'Any Debt' : tempDebtFilter;
        activeFilters.push(`debt: ${debtLabel}`);
      }
      if (tempBucketFilter !== 'all') activeFilters.push(`counts as ${BUCKET_META[tempBucketFilter].name}`);
      message = `Filters applied: ${activeFilters.join(', ')}`;
    } else {
      message = 'No filters applied - showing all expenses';
    }
    announceFilter(message);
    onClose();
  };

  const handleClearFilters = () => {
    console.log('ExpenseFilterModal: Clearing all temp filters');
    setTempFilter('all');
    setTempPersonFilter(null);
    setTempCategoryFilters([]);
    // Search lives on the Expenses screen now; resetting the sheet keeps it.
    setTempSearchQuery(searchQuery);
    setTempHasEndDateFilter(false);
    setTempDebtFilter('all');
    setTempBucketFilter('all');
  };

  const handleCategoryToggle = (category: string) => {
    setTempCategoryFilters(prev => {
      if (prev.includes(category)) {
        return prev.filter(c => c !== category);
      } else {
        return [...prev, category];
      }
    });
  };

  // Result count with every pending choice applied, shown live on the primary button.
  const previewCount = expenseCounts.total;
  const sheetFiltersActive =
    tempCategoryFilters.length > 0 || tempFilter !== 'all' || !!tempPersonFilter || tempHasEndDateFilter || tempDebtFilter !== 'all' || tempBucketFilter !== 'all';

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
            selected={tempFilter === t}
            onPress={() => {
              setTempFilter(t);
              if (t !== 'personal') setTempPersonFilter(null);
            }}
          />
        ))}
      </Section>

      {people.length > 0 ? (
        <Section title="Person">
          <OptionChip
            label="Everyone"
            count={expenseCounts.allPeople}
            selected={tempPersonFilter === null}
            onPress={() => setTempPersonFilter(null)}
          />
          {people.map((person) => (
            <OptionChip
              key={person.id}
              label={person.name}
              count={expenseCounts.people[person.id] || 0}
              selected={tempPersonFilter === person.id}
              onPress={() => setTempPersonFilter(person.id)}
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
            selected={tempDebtFilter === value}
            onPress={() => setTempDebtFilter(value)}
          />
        ))}
      </Section>

      <Section title="Counts as" note="In the budget review">
        <OptionChip
          label="All"
          count={expenseCounts.bucket.all}
          selected={tempBucketFilter === 'all'}
          onPress={() => setTempBucketFilter('all')}
        />
        {BUCKET_ORDER.map((id) => (
          <OptionChip
            key={id}
            label={BUCKET_META[id].name}
            icon={BUCKET_META[id].icon}
            count={expenseCounts.bucket[id]}
            selected={tempBucketFilter === id}
            onPress={() => setTempBucketFilter(id)}
          />
        ))}
      </Section>

      <Section title="End date">
        <OptionChip
          label="Only with an end date"
          icon="timer-outline"
          count={expenseCounts.endDate.with}
          selected={tempHasEndDateFilter}
          onPress={() => setTempHasEndDateFilter(!tempHasEndDateFilter)}
        />
      </Section>

      <Section
        title="Categories"
        note={tempCategoryFilters.length > 0 ? `${tempCategoryFilters.length} selected` : 'Pick one or more'}
      >
        <OptionChip
          label="All categories"
          count={expenseCounts.allCategories}
          selected={tempCategoryFilters.length === 0}
          onPress={() => setTempCategoryFilters([])}
        />
        {availableCategories.map((cat) => (
          <OptionChip
            key={cat}
            label={cat}
            count={expenseCounts.categories[cat] || 0}
            selected={tempCategoryFilters.includes(cat)}
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
          text={previewCount === 1 ? 'Show 1 expense' : `Show ${previewCount} expenses`}
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
