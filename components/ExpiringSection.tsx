import { useState, useMemo, useCallback } from 'react';
import { View, Text } from 'react-native';
import { useBudgetData } from '../hooks/useBudgetData';
import { useTheme } from '../hooks/useTheme';
import { useToast } from '../hooks/useToast';
import { Expense } from '../types/budget';
import { calculateMonthlyAmount, getEndingSoon } from '../utils/calculations';
import { AmountText, DateField, IconButton, ListRow, SegmentedControl, Sheet } from './ui';
import { type, space } from '../styles/tokens';
import { toYMD } from '../utils/dates';

/**
 * Recurring expenses whose end date is coming up or has passed. "Extend"
 * opens a sheet with a DateField (works on web too — the community date
 * picker renders nothing there, so the old inline picker silently failed).
 */

interface ExpiringSectionProps {
  expenses: Expense[];
}

type TabKey = 'expiring' | 'ended';

const formatDay = (ymd?: string) => {
  if (!ymd) return '';
  const d = new Date(ymd + 'T00:00:00');
  if (isNaN(d.getTime())) return ymd;
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: sameYear ? undefined : 'numeric' });
};

export default function ExpiringSection({ expenses }: ExpiringSectionProps) {
  const { tokens } = useTheme();
  const { showToast } = useToast();
  const { updateExpense } = useBudgetData();

  const [activeTab, setActiveTab] = useState<TabKey>('expiring');
  const [extending, setExtending] = useState<Expense | null>(null);
  const [newEndDate, setNewEndDate] = useState<Date | null>(null);
  const [saving, setSaving] = useState(false);

  const { expiringSoon, ended } = useMemo(() => getEndingSoon(expenses), [expenses]);
  const current = activeTab === 'expiring' ? expiringSoon : ended;

  const openExtend = useCallback((expense: Expense) => {
    setExtending(expense);
    setNewEndDate(expense.endDate ? new Date(expense.endDate + 'T00:00:00') : null);
  }, []);

  const closeExtend = () => {
    setExtending(null);
    setNewEndDate(null);
  };

  const saveExtend = async () => {
    if (!extending) return;
    setSaving(true);
    try {
      // Clearing the date makes the expense open-ended.
      await updateExpense({ ...extending, endDate: newEndDate ? toYMD(newEndDate) : undefined });
      showToast(newEndDate ? `Now ends ${formatDay(toYMD(newEndDate))}` : 'End date removed', 'success');
      closeExtend();
    } catch (error) {
      console.error('Error updating expense:', error);
      showToast('Couldn’t update the end date', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ padding: space.s4 }}>
      <SegmentedControl<TabKey>
        label="Show"
        value={activeTab}
        onChange={setActiveTab}
        options={[
          { value: 'expiring', label: `Ending soon (${expiringSoon.length})` },
          { value: 'ended', label: `Ended (${ended.length})` },
        ]}
        style={{ marginBottom: space.s3 }}
      />

      {current.length === 0 ? (
        <Text style={[type.caption, { color: tokens.colors.textMuted, textAlign: 'center', paddingVertical: space.s5 }]}>
          {activeTab === 'expiring' ? 'Nothing ends in the next few weeks.' : 'No expenses have ended.'}
        </Text>
      ) : (
        <View style={{ marginHorizontal: -space.s4 }}>
          {current.map((expense, i) => {
            const isEnded = activeTab === 'ended';
            return (
              <ListRow
                key={expense.id}
                title={expense.description}
                caption={`${isEnded ? 'Ended' : 'Ends'} ${formatDay(expense.endDate)} · ${expense.category === 'household' ? 'Household' : 'Personal'}`}
                icon={isEnded ? 'checkmark-circle-outline' : 'timer-outline'}
                iconColor={isEnded ? tokens.colors.textMuted : tokens.colors.warning}
                trailing={
                  <AmountText
                    value={calculateMonthlyAmount(expense.amount, expense.frequency)}
                    role="bodyMed"
                    tone={isEnded ? 'muted' : 'default'}
                    suffix="/mo"
                  />
                }
                accessory={
                  isEnded ? undefined : (
                    <IconButton
                      icon="calendar-outline"
                      accessibilityLabel={`Change end date for ${expense.description}`}
                      onPress={() => openExtend(expense)}
                      color={tokens.colors.brand}
                    />
                  )
                }
                showSeparator={i < current.length - 1}
                style={{ minHeight: 56 } as any}
              />
            );
          })}
        </View>
      )}

      <Sheet
        visible={!!extending}
        onClose={closeExtend}
        title="Change end date"
        leadingAction={{ label: 'Cancel', onPress: closeExtend, disabled: saving }}
        trailingAction={{ label: 'Save', onPress: saveExtend, disabled: saving }}
        width={420}
      >
        <View style={{ padding: space.s5 }}>
          <DateField
            label={extending?.description || 'End date'}
            value={newEndDate}
            onChange={setNewEndDate}
            placeholder="No end date"
            helperText="Clear the date to keep this expense running with no end."
          />
        </View>
      </Sheet>
    </View>
  );
}
