import { View, Text, Pressable } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { Chip } from './ui';
import { BucketId, Person } from '../types/budget';
import { type, space } from '../styles/tokens';
import { BUCKET_META } from './tools/bucketMeta';

/**
 * Expenses filter bar: quick toggles (Household, each person, Debt) plus a
 * removable chip for every other active filter, so applied state is always
 * visible without opening the sheet (UI_AUDIT §6). Chips wrap onto new lines
 * so nothing applied is ever hidden off screen. Selected chips carry a
 * checkmark, never color alone.
 */

export type DebtFilter = 'all' | 'any' | 'loan' | 'mortgage' | 'credit_card';

const DEBT_LABELS: Record<Exclude<DebtFilter, 'all'>, string> = {
  any: 'Debt',
  loan: 'Loan',
  mortgage: 'Mortgage',
  credit_card: 'Credit card',
};

interface ExpenseFilterBarProps {
  people: Person[];
  filter: 'all' | 'household' | 'personal';
  setFilter: (f: 'all' | 'household' | 'personal') => void;
  personFilter: string | null;
  setPersonFilter: (id: string | null) => void;
  debtFilter: DebtFilter;
  setDebtFilter: (d: DebtFilter) => void;
  bucketFilter: 'all' | BucketId;
  setBucketFilter: (b: 'all' | BucketId) => void;
  categories: string[];
  onRemoveCategory: (category: string) => void;
  hasEndDateFilter: boolean;
  setHasEndDateFilter: (v: boolean) => void;
  hasActiveFilters: boolean;
  onClearAll: () => void;
}

export default function ExpenseFilterBar({
  people,
  filter,
  setFilter,
  personFilter,
  setPersonFilter,
  debtFilter,
  setDebtFilter,
  bucketFilter,
  setBucketFilter,
  categories,
  onRemoveCategory,
  hasEndDateFilter,
  setHasEndDateFilter,
  hasActiveFilters,
  onClearAll,
}: ExpenseFilterBarProps) {
  const { tokens } = useTheme();

  const toggleChip = (label: string, selected: boolean, onPress: () => void, icon?: string) => (
    <Chip
      key={label}
      label={label}
      icon={selected ? 'checkmark' : icon}
      selected={selected}
      backgroundColor={selected ? undefined : tokens.colors.surface}
      onPress={onPress}
    />
  );

  return (
    <View
      style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.s2, paddingVertical: space.s2 }}
      accessibilityLabel="Expense filters"
    >
      {toggleChip(
        'Household',
        filter === 'household',
        () => {
          if (filter === 'household') setFilter('all');
          else {
            setFilter('household');
            setPersonFilter(null);
          }
        },
        'home-outline'
      )}

      {people.map((person) =>
        toggleChip(
          person.name,
          personFilter === person.id,
          () => {
            if (personFilter === person.id) setPersonFilter(null);
            else {
              setPersonFilter(person.id);
              setFilter('all');
            }
          },
          'person-outline'
        )
      )}

      {toggleChip(
        debtFilter === 'all' ? 'Debt' : DEBT_LABELS[debtFilter],
        debtFilter !== 'all',
        () => setDebtFilter(debtFilter === 'all' ? 'any' : 'all'),
        'trending-down-outline'
      )}

      {/* Sheet-only filters appear here as removable chips once applied. */}
      {filter === 'personal' ? (
        <Chip label="Personal" icon="person-outline" selected onDismiss={() => setFilter('all')} />
      ) : null}
      {bucketFilter !== 'all' ? (
        <Chip
          label={`Counts as ${BUCKET_META[bucketFilter].name}`}
          icon={BUCKET_META[bucketFilter].icon}
          selected
          onDismiss={() => setBucketFilter('all')}
        />
      ) : null}
      {categories.map((category) => (
        <Chip
          key={`cat-${category}`}
          label={category}
          icon="pricetag-outline"
          selected
          onDismiss={() => onRemoveCategory(category)}
        />
      ))}
      {hasEndDateFilter ? (
        <Chip label="Has end date" icon="timer-outline" selected onDismiss={() => setHasEndDateFilter(false)} />
      ) : null}

      {hasActiveFilters ? (
        <Pressable
          onPress={onClearAll}
          accessibilityRole="button"
          accessibilityLabel="Clear all filters"
          hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
          style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, paddingHorizontal: space.s2 })}
        >
          <Text style={[type.caption, { color: tokens.colors.brand }]}>Clear all</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
