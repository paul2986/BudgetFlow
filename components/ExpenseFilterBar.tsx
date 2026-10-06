import { View, Text, Pressable } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { Chip } from './ui';
import { Person } from '../types/budget';
import type { DebtFilter, ExpenseFilters } from '../utils/expenseFilters';
import { type, space } from '../styles/tokens';
import { BUCKET_META } from './tools/bucketMeta';

/**
 * Expenses filter bar: quick toggles (Household, each person, Debt) plus a
 * removable chip for every other active filter, so applied state is always
 * visible without opening the sheet (UI_AUDIT §6). Chips wrap onto new lines
 * so nothing applied is ever hidden off screen. Selected chips carry a
 * checkmark, never color alone.
 */

const DEBT_LABELS: Record<Exclude<DebtFilter, 'all'>, string> = {
  any: 'Debt',
  loan: 'Loan',
  mortgage: 'Mortgage',
  credit_card: 'Credit card',
};

interface ExpenseFilterBarProps {
  people: Person[];
  filters: ExpenseFilters;
  onChange: (changes: Partial<ExpenseFilters>) => void;
  hasActiveFilters: boolean;
  onClearAll: () => void;
}

export default function ExpenseFilterBar({ people, filters, onChange, hasActiveFilters, onClearAll }: ExpenseFilterBarProps) {
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
        filters.type === 'household',
        () => onChange(filters.type === 'household' ? { type: 'all' } : { type: 'household', personId: null }),
        'home-outline'
      )}

      {people.map((person) =>
        toggleChip(
          person.name,
          filters.personId === person.id,
          () => onChange(filters.personId === person.id ? { personId: null } : { personId: person.id, type: 'all' }),
          'person-outline'
        )
      )}

      {toggleChip(
        filters.debt === 'all' ? 'Debt' : DEBT_LABELS[filters.debt],
        filters.debt !== 'all',
        () => onChange({ debt: filters.debt === 'all' ? 'any' : 'all' }),
        'trending-down-outline'
      )}

      {/* Sheet-only filters appear here as removable chips once applied. */}
      {filters.type === 'personal' ? (
        <Chip label="Personal" icon="person-outline" selected onDismiss={() => onChange({ type: 'all' })} />
      ) : null}
      {filters.bucket !== 'all' ? (
        <Chip
          label={`Counts as ${BUCKET_META[filters.bucket].name}`}
          icon={BUCKET_META[filters.bucket].icon}
          selected
          onDismiss={() => onChange({ bucket: 'all' })}
        />
      ) : null}
      {filters.categories.map((category) => (
        <Chip
          key={`cat-${category}`}
          label={category}
          icon="pricetag-outline"
          selected
          onDismiss={() => onChange({ categories: filters.categories.filter((c) => c !== category) })}
        />
      ))}
      {filters.hasEndDate ? (
        <Chip label="Has end date" icon="timer-outline" selected onDismiss={() => onChange({ hasEndDate: false })} />
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
