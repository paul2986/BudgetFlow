
import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import Icon from './Icon';
import Button from './Button';
import { HEADER_HEIGHT } from './StandardHeader';
import { Sheet } from './ui';
import { type, space, radius, tabularNums } from '../styles/tokens';
import { haptics } from '../utils/haptics';
import { DEFAULT_CATEGORIES } from '../types/budget';
import { normalizeCategoryName } from '../utils/storage';

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
  // Data
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

  // FIXED: Initialize temp state when modal opens with current filter values
  useEffect(() => {
    if (visible) {
      console.log('ExpenseFilterModal: Initializing temp state with current filters:', {
        filter,
        personFilter,
        categoryFilter,
        searchQuery,
        hasEndDateFilter,
        debtFilter
      });
      setTempFilter(filter);
      setTempPersonFilter(personFilter);
      // Initialize with multiple categories if available, otherwise single category
      const initialCategories = categoryFilters.length > 0 ? categoryFilters : (categoryFilter ? [categoryFilter] : []);
      setTempCategoryFilters(initialCategories);
      setTempSearchQuery(searchQuery);
      setTempHasEndDateFilter(hasEndDateFilter);
      setTempDebtFilter(debtFilter || 'all');
    }
  }, [visible, filter, personFilter, categoryFilter, categoryFilters, searchQuery, hasEndDateFilter, debtFilter]);

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

  // NEW: Calculate expense counts for each filter option dynamically
  const expenseCounts = useMemo(() => {
    console.log('ExpenseFilterModal: Calculating expense counts...');

    // Helper function to apply filters and count results
    const countExpensesWithFilters = (testFilters: {
      filter?: 'all' | 'household' | 'personal';
      personFilter?: string | null;
      categoryFilter?: string | null;
      categoryFilters?: string[];
      searchQuery?: string;
      hasEndDateFilter?: boolean;
      debtFilter?: 'all' | 'any' | 'loan' | 'mortgage' | 'credit_card';
    }) => {
      let filtered = [...expenses];

      // Apply expense type filter
      if (testFilters.filter === 'household') {
        filtered = filtered.filter((e) => e.category === 'household');
      } else if (testFilters.filter === 'personal') {
        filtered = filtered.filter((e) => e.category === 'personal');
      }

      // Apply person filter
      if (testFilters.personFilter) {
        filtered = filtered.filter((e) => {
          if (e.category === 'household') {
            return e.personId === testFilters.personFilter;
          }
          return e.personId === testFilters.personFilter;
        });
      }

      // Apply category filter (support both single and multiple)
      const activeCategories = testFilters.categoryFilters && testFilters.categoryFilters.length > 0
        ? testFilters.categoryFilters
        : (testFilters.categoryFilter ? [testFilters.categoryFilter] : []);
      if (activeCategories.length > 0) {
        const selectedCategories = activeCategories.map(cat => normalizeCategoryName(cat));
        filtered = filtered.filter((e) => {
          const expenseCategory = normalizeCategoryName((e as any).categoryTag || 'Misc');
          return selectedCategories.includes(expenseCategory);
        });
      }

      // Apply search filter
      if (testFilters.searchQuery && testFilters.searchQuery.trim()) {
        const q = testFilters.searchQuery.toLowerCase();
        filtered = filtered.filter((e) => e.description.toLowerCase().includes(q));
      }

      // Apply end date filter
      if (testFilters.hasEndDateFilter) {
        filtered = filtered.filter((e) => {
          const hasEndDate = e.endDate && e.frequency !== 'one-time';
          return hasEndDate;
        });
      }

      // Apply debt repayment filter
      if (testFilters.debtFilter && testFilters.debtFilter !== 'all') {
        filtered = filtered.filter((e) => {
          if (testFilters.debtFilter === 'any') {
            return !!e.debtRepayment;
          }
          return e.debtRepayment === testFilters.debtFilter;
        });
      }

      return filtered.length;
    };

    // Calculate counts for expense types
    const allCount = countExpensesWithFilters({
      filter: 'all',
      personFilter: tempPersonFilter,
      categoryFilters: tempCategoryFilters,
      searchQuery: tempSearchQuery,
      hasEndDateFilter: tempHasEndDateFilter,
      debtFilter: tempDebtFilter
    });

    const householdCount = countExpensesWithFilters({
      filter: 'household',
      personFilter: tempPersonFilter,
      categoryFilters: tempCategoryFilters,
      searchQuery: tempSearchQuery,
      hasEndDateFilter: tempHasEndDateFilter,
      debtFilter: tempDebtFilter
    });

    const personalCount = countExpensesWithFilters({
      filter: 'personal',
      personFilter: tempPersonFilter,
      categoryFilters: tempCategoryFilters,
      searchQuery: tempSearchQuery,
      hasEndDateFilter: tempHasEndDateFilter,
      debtFilter: tempDebtFilter
    });

    // Calculate counts for people
    const peopleCounts: { [personId: string]: number } = {};
    people.forEach(person => {
      peopleCounts[person.id] = countExpensesWithFilters({
        filter: tempFilter,
        personFilter: person.id,
        categoryFilters: tempCategoryFilters,
        searchQuery: tempSearchQuery,
        hasEndDateFilter: tempHasEndDateFilter,
        debtFilter: tempDebtFilter
      });
    });

    // Count for "All People"
    const allPeopleCount = countExpensesWithFilters({
      filter: tempFilter,
      personFilter: null,
      categoryFilters: tempCategoryFilters,
      searchQuery: tempSearchQuery,
      hasEndDateFilter: tempHasEndDateFilter,
      debtFilter: tempDebtFilter
    });

    // Calculate counts for categories
    const categoryCounts: { [category: string]: number } = {};
    availableCategories.forEach(category => {
      categoryCounts[category] = countExpensesWithFilters({
        filter: tempFilter,
        personFilter: tempPersonFilter,
        categoryFilter: category,
        searchQuery: tempSearchQuery,
        hasEndDateFilter: tempHasEndDateFilter,
        debtFilter: tempDebtFilter
      });
    });

    // Count for "All Categories"
    const allCategoriesCount = countExpensesWithFilters({
      filter: tempFilter,
      personFilter: tempPersonFilter,
      categoryFilter: null,
      searchQuery: tempSearchQuery,
      hasEndDateFilter: tempHasEndDateFilter,
      debtFilter: tempDebtFilter
    });

    // Calculate count for end date filter
    const withEndDateCount = countExpensesWithFilters({
      filter: tempFilter,
      personFilter: tempPersonFilter,
      categoryFilters: tempCategoryFilters,
      searchQuery: tempSearchQuery,
      hasEndDateFilter: true,
      debtFilter: tempDebtFilter
    });

    const withoutEndDateCount = countExpensesWithFilters({
      filter: tempFilter,
      personFilter: tempPersonFilter,
      categoryFilters: tempCategoryFilters,
      searchQuery: tempSearchQuery,
      hasEndDateFilter: false,
      debtFilter: tempDebtFilter
    });

    // Calculate counts for debt repayment tags
    const debtCounts = {
      all: countExpensesWithFilters({
        filter: tempFilter,
        personFilter: tempPersonFilter,
        categoryFilters: tempCategoryFilters,
        searchQuery: tempSearchQuery,
        hasEndDateFilter: tempHasEndDateFilter,
        debtFilter: 'all'
      }),
      any: countExpensesWithFilters({
        filter: tempFilter,
        personFilter: tempPersonFilter,
        categoryFilters: tempCategoryFilters,
        searchQuery: tempSearchQuery,
        hasEndDateFilter: tempHasEndDateFilter,
        debtFilter: 'any'
      }),
      loan: countExpensesWithFilters({
        filter: tempFilter,
        personFilter: tempPersonFilter,
        categoryFilters: tempCategoryFilters,
        searchQuery: tempSearchQuery,
        hasEndDateFilter: tempHasEndDateFilter,
        debtFilter: 'loan'
      }),
      mortgage: countExpensesWithFilters({
        filter: tempFilter,
        personFilter: tempPersonFilter,
        categoryFilters: tempCategoryFilters,
        searchQuery: tempSearchQuery,
        hasEndDateFilter: tempHasEndDateFilter,
        debtFilter: 'mortgage'
      }),
      credit_card: countExpensesWithFilters({
        filter: tempFilter,
        personFilter: tempPersonFilter,
        categoryFilters: tempCategoryFilters,
        searchQuery: tempSearchQuery,
        hasEndDateFilter: tempHasEndDateFilter,
        debtFilter: 'credit_card'
      }),
    };

    console.log('ExpenseFilterModal: Calculated counts:', {
      expenseTypes: { all: allCount, household: householdCount, personal: personalCount },
      people: peopleCounts,
      allPeople: allPeopleCount,
      categories: categoryCounts,
      allCategories: allCategoriesCount,
      endDate: { with: withEndDateCount, without: withoutEndDateCount },
      debt: debtCounts
    });

    return {
      expenseTypes: { all: allCount, household: householdCount, personal: personalCount },
      people: peopleCounts,
      allPeople: allPeopleCount,
      categories: categoryCounts,
      allCategories: allCategoriesCount,
      endDate: { with: withEndDateCount, without: withoutEndDateCount },
      debt: debtCounts
    };
  }, [expenses, tempFilter, tempPersonFilter, tempCategoryFilters, tempSearchQuery, tempHasEndDateFilter, tempDebtFilter, people, availableCategories]);

  const hasActiveFilters = tempCategoryFilters.length > 0 || !!tempSearchQuery.trim() || (tempFilter !== 'all') || !!tempPersonFilter || tempHasEndDateFilter || (tempDebtFilter !== 'all');

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
    onClose();
  };

  const handleApplyFilters = () => {
    console.log('ExpenseFilterModal: Applying filters:', {
      tempFilter,
      tempPersonFilter,
      tempCategoryFilters,
      tempSearchQuery,
      tempHasEndDateFilter,
      tempDebtFilter
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

  // Result count with every pending choice applied (debt counts already
  // include the other temp filters), shown live on the primary button.
  const previewCount = expenseCounts.debt[tempDebtFilter];
  const sheetFiltersActive =
    tempCategoryFilters.length > 0 || tempFilter !== 'all' || !!tempPersonFilter || tempHasEndDateFilter || tempDebtFilter !== 'all';

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
