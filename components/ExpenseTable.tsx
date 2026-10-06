import { useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, Platform, StyleSheet } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import Icon from './Icon';
import { Chip, AmountText, Checkbox } from './ui';
import { calculateMonthlyAmount } from '../utils/calculations';
import { normalizeCategoryName } from '../utils/storage';
import { debtMeta } from '../utils/debtMeta';
import { Expense, Person } from '../types/budget';
import { type, radius, space, elevation, tabularNums, avatarHue } from '../styles/tokens';

/**
 * Expenses table for medium/expanded layouts. One surface, hairline row
 * separators, sortable column headers (tap again to reverse). Semantic
 * columns use icon + label chips; delete is muted until the row is hovered.
 * A leading checkbox column selects rows for bulk edit (shift-click for a
 * range); the header checkbox selects every row shown.
 */

export type SortOption =
  | 'date'
  | 'alphabetical'
  | 'cost'
  | 'type'
  | 'assignedTo'
  | 'frequency'
  | 'categoryTag'
  | 'endDate'
  | 'debtRepayment';
export type SortOrder = 'asc' | 'desc';

interface Column {
  label: string;
  sort?: SortOption;
  flex: number;
  alignRight?: boolean;
}

const COLUMNS: Column[] = [
  { label: 'Description', sort: 'alphabetical', flex: 2 },
  { label: 'Category', sort: 'categoryTag', flex: 1.2 },
  { label: 'Owner', sort: 'type', flex: 1.4 },
  { label: 'Debt', sort: 'debtRepayment', flex: 1.2 },
  { label: 'Frequency', sort: 'frequency', flex: 1 },
  { label: 'Added', sort: 'date', flex: 1 },
  { label: 'Ends', sort: 'endDate', flex: 1 },
  { label: 'Amount', sort: 'cost', flex: 1.2, alignRight: true },
];

/** Fixed trailing column for the delete button (outside the row's button). */
const ACTION_WIDTH = 44;
/** Fixed leading column for the selection checkbox. */
const SELECT_WIDTH = 44;

const shiftHeld = (e: any): boolean => !!(e?.shiftKey ?? e?.nativeEvent?.shiftKey);

const formatDate = (iso?: string) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: sameYear ? undefined : '2-digit' });
};

function HeaderCell({
  column,
  sortBy,
  sortOrder,
  onSort,
}: {
  column: Column;
  sortBy: SortOption;
  sortOrder: SortOrder;
  onSort: (s: SortOption) => void;
}) {
  const { tokens } = useTheme();
  const active = column.sort === sortBy;
  const label = (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: column.alignRight ? 'flex-end' : 'flex-start' }}>
      <Text style={[type.caption, { color: active ? tokens.colors.text : tokens.colors.textMuted }]} numberOfLines={1}>
        {column.label}
      </Text>
      {active ? (
        <Icon
          name={sortOrder === 'asc' ? 'chevron-up' : 'chevron-down'}
          size={12}
          color={tokens.colors.text}
          style={{ marginLeft: space.s1 }}
        />
      ) : null}
    </View>
  );

  const cellStyle = { flex: column.flex, paddingHorizontal: space.s2, paddingVertical: space.s3 };
  if (!column.sort) return <View style={cellStyle}>{label}</View>;

  return (
    <Pressable
      onPress={() => onSort(column.sort!)}
      accessibilityRole="button"
      accessibilityLabel={`Sort by ${column.label}`}
      accessibilityState={{ selected: active }}
      style={({ pressed }) => [cellStyle, { opacity: pressed ? 0.6 : 1 }]}
    >
      {label}
    </Pressable>
  );
}

function Row({
  expense,
  person,
  isDeleting,
  disabled,
  selected,
  onToggle,
  onEdit,
  onDelete,
}: {
  expense: Expense;
  person: Person | null | undefined;
  isDeleting: boolean;
  disabled: boolean;
  selected: boolean;
  onToggle: (shift: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { tokens } = useTheme();
  const [hovered, setHovered] = useState(false);
  const [trashHovered, setTrashHovered] = useState(false);
  const isHousehold = expense.category === 'household';
  const debt = expense.debtRepayment ? debtMeta(expense.debtRepayment, tokens.colors) : null;
  // A personal expense is tagged in its owner's avatar colour (People page).
  const ownerHue = !isHousehold && person ? avatarHue(person.id, tokens.isDark) : null;
  const cell = { paddingHorizontal: space.s2 };

  // Row button and delete button are siblings inside a hover wrapper, so
  // web never nests one <button> inside another.
  return (
    <Pressable
      accessible={false}
      focusable={false}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: space.s2,
        backgroundColor: selected ? tokens.colors.brandSubtle : hovered ? tokens.colors.surfaceHover : 'transparent',
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: tokens.colors.border,
        opacity: isDeleting ? 0.5 : 1,
        // @ts-ignore web transition
        transitionDuration: '150ms',
        // Shift-click selects a range of rows, not the text between them.
        // @ts-ignore web only
        ...(Platform.OS === 'web' ? { userSelect: 'none' } : null),
      }}
    >
      <View style={{ width: SELECT_WIDTH, alignItems: 'center' }}>
        <Checkbox
          checked={selected}
          onPress={(e) => onToggle(shiftHeld(e))}
          accessibilityLabel={`Select ${expense.description}`}
        />
      </View>
      <Pressable
        onPress={onEdit}
        accessibilityRole="button"
        accessibilityLabel={`${expense.description}, edit`}
        style={({ pressed }) => ({
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          minHeight: 52,
          backgroundColor: pressed ? tokens.colors.surfaceHover : 'transparent',
        })}
      >
        <View style={[cell, { flex: 2 }]}>
          <Text style={[type.bodyMed, { color: tokens.colors.text }]} numberOfLines={1}>
            {expense.description}
          </Text>
        </View>
        <View style={[cell, { flex: 1.2 }]}>
          <Text style={[type.caption, { color: tokens.colors.textMuted }]} numberOfLines={1}>
            {normalizeCategoryName(expense.categoryTag || 'Misc')}
          </Text>
        </View>
        <View style={[cell, { flex: 1.4 }]}>
          <Chip
            label={person?.name || (isHousehold ? 'Household' : 'Personal')}
            icon={isHousehold ? 'home-outline' : 'person-outline'}
            color={isHousehold ? tokens.colors.household : ownerHue?.fg ?? tokens.colors.personal}
            backgroundColor={isHousehold ? tokens.colors.householdSubtle : ownerHue?.bg ?? tokens.colors.personalSubtle}
          />
        </View>
        <View style={[cell, { flex: 1.2 }]}>
          {debt ? (
            <Chip label={debt.label} icon={debt.icon} color={debt.color} backgroundColor={debt.subtle} />
          ) : (
            <Text style={[type.caption, { color: tokens.colors.textFaint }]}>—</Text>
          )}
        </View>
        <View style={[cell, { flex: 1 }]}>
          <Text style={[type.caption, { color: tokens.colors.textMuted, textTransform: 'capitalize' }]} numberOfLines={1}>
            {expense.frequency}
          </Text>
        </View>
        <View style={[cell, { flex: 1 }]}>
          <Text style={[type.caption, tabularNums, { color: tokens.colors.textMuted }]} numberOfLines={1}>
            {formatDate(expense.date)}
          </Text>
        </View>
        <View style={[cell, { flex: 1 }]}>
          <Text style={[type.caption, tabularNums, { color: tokens.colors.textMuted }]} numberOfLines={1}>
            {expense.frequency === 'one-time' ? '—' : formatDate(expense.endDate)}
          </Text>
        </View>
        <View style={[cell, { flex: 1.2, alignItems: 'flex-end' }]}>
          <AmountText value={expense.amount} role="bodyMed" />
          {expense.frequency !== 'monthly' ? (
            <AmountText
              value={calculateMonthlyAmount(expense.amount, expense.frequency)}
              role="caption"
              tone="muted"
              suffix="/mo"
            />
          ) : null}
        </View>
      </Pressable>
      <View style={{ width: ACTION_WIDTH, alignItems: 'center' }}>
        <Pressable
          onPress={onDelete}
          disabled={disabled || isDeleting}
          onHoverIn={() => setTrashHovered(true)}
          onHoverOut={() => setTrashHovered(false)}
          accessibilityRole="button"
          accessibilityLabel={`Delete ${expense.description}`}
          style={({ pressed }) => ({
            width: 36,
            height: 36,
            borderRadius: radius.md,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: hovered || trashHovered || pressed ? 1 : 0.4,
            backgroundColor: pressed || trashHovered ? tokens.colors.dangerSubtle : 'transparent',
          })}
        >
          {isDeleting ? (
            <ActivityIndicator size="small" color={tokens.colors.danger} />
          ) : (
            <Icon
              name="trash-outline"
              size={18}
              color={trashHovered ? tokens.colors.danger : tokens.colors.textFaint}
            />
          )}
        </Pressable>
      </View>
    </Pressable>
  );
}

interface ExpenseTableProps {
  expenses: Expense[];
  people: Person[];
  sortBy: SortOption;
  sortOrder: SortOrder;
  onSort: (s: SortOption) => void;
  onEdit: (expense: Expense) => void;
  onDelete: (id: string, description: string) => void;
  deletingExpenseId: string | null;
  disabled: boolean;
  totalMonthly: number;
  selectedIds: ReadonlySet<string>;
  /** `shift` is true when the click held Shift (select a range). */
  onToggle: (id: string, shift: boolean) => void;
  onToggleAll: () => void;
}

export default function ExpenseTable({
  expenses,
  people,
  sortBy,
  sortOrder,
  onSort,
  onEdit,
  onDelete,
  deletingExpenseId,
  disabled,
  totalMonthly,
  selectedIds,
  onToggle,
  onToggleAll,
}: ExpenseTableProps) {
  const { tokens } = useTheme();
  const selectedCount = expenses.reduce((n, e) => n + (selectedIds.has(e.id) ? 1 : 0), 0);
  const allChecked: boolean | 'mixed' = selectedCount === 0 ? false : selectedCount === expenses.length ? true : 'mixed';

  return (
    <View
      style={{
        backgroundColor: tokens.colors.surface,
        borderRadius: radius.lg,
        overflow: 'hidden',
        ...(tokens.isDark ? null : elevation.e1),
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: space.s2,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: tokens.colors.borderStrong,
        }}
      >
        <View style={{ width: SELECT_WIDTH, alignItems: 'center' }}>
          <Checkbox
            checked={allChecked}
            onPress={onToggleAll}
            accessibilityLabel={allChecked === true ? 'Deselect all expenses' : 'Select all expenses'}
          />
        </View>
        {COLUMNS.map((column, i) => (
          <HeaderCell key={i} column={column} sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} />
        ))}
        <View style={{ width: ACTION_WIDTH }} />
      </View>

      {expenses.map((expense) => (
        <Row
          key={expense.id}
          expense={expense}
          person={expense.personId ? people.find((p) => p.id === expense.personId) : null}
          isDeleting={deletingExpenseId === expense.id}
          disabled={disabled}
          selected={selectedIds.has(expense.id)}
          onToggle={(shift) => onToggle(expense.id, shift)}
          onEdit={() => onEdit(expense)}
          onDelete={() => onDelete(expense.id, expense.description)}
        />
      ))}

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'flex-end',
          paddingHorizontal: space.s4,
          paddingVertical: space.s4,
          gap: space.s3,
        }}
      >
        <Text style={[type.caption, { color: tokens.colors.textMuted }]}>Monthly total</Text>
        <AmountText value={totalMonthly} role="h3" />
      </View>
    </View>
  );
}
