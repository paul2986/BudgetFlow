import { useState, useMemo, useCallback } from 'react';
import { View, Text } from 'react-native';
import { router } from 'expo-router';
import { useBudgetData } from '../hooks/useBudgetData';
import { useTheme } from '../hooks/useTheme';
import { useToast } from '../hooks/useToast';
import { useEndReminders } from '../hooks/useEndReminders';
import { Expense } from '../types/budget';
import { calculateMonthlyAmount } from '../utils/calculations';
import { describeRemaining, endProgress, splitByEndDate } from '../utils/expenseEnd';
import { haptics } from '../utils/haptics';
import { AmountText, DateField, IconButton, ListRow, ProgressBar, SegmentedControl, Sheet } from './ui';
import { type, space } from '../styles/tokens';
import { toYMD } from '../utils/dates';

/**
 * Every recurring expense that has an end date: those still running, each with
 * a bar for how far it is from its start to its end and what is left, and those
 * that have ended. "Extend" opens a sheet with a DateField (works on web too:
 * the community date picker renders nothing there, so the old inline picker
 * silently failed). Tapping a row opens that expense. On a phone, a row at the foot offers a reminder before each one ends.
 */

interface ExpiringSectionProps {
  expenses: Expense[];
}

type TabKey = 'running' | 'ended';

/** Within this many days of ending, an expense is flagged as ending soon. */
const SOON_DAYS = 30;

const formatDay = (ymd?: string) => {
  if (!ymd) return '';
  const d = new Date(ymd + 'T00:00:00');
  if (isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

export default function ExpiringSection({ expenses }: ExpiringSectionProps) {
  const { tokens } = useTheme();
  const { showToast } = useToast();
  const { updateExpense } = useBudgetData();

  const reminders = useEndReminders();
  const [activeTab, setActiveTab] = useState<TabKey>('running');
  const [extending, setExtending] = useState<Expense | null>(null);
  const [newEndDate, setNewEndDate] = useState<Date | null>(null);
  const [saving, setSaving] = useState(false);

  const { running, ended } = useMemo(() => splitByEndDate(expenses), [expenses]);
  const current = activeTab === 'running' ? running : ended;

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

  const turnOnReminders = async () => {
    const result = await reminders.setEnabled(true);
    if (result === 'on') {
      haptics.success();
      showToast('Reminders on', 'success');
    } else {
      haptics.error();
      showToast('Notifications are off for Budget Flow. Turn them on in iOS Settings.', 'error');
    }
  };

  // Offered once there is something to be reminded about, until it's on or iOS has been told no.
  const offerReminders =
    reminders.supported && reminders.loaded && !reminders.enabled && reminders.permission !== 'denied' && running.length > 0;

  return (
    <View style={{ padding: space.s4 }}>
      <SegmentedControl<TabKey>
        label="Show"
        value={activeTab}
        onChange={setActiveTab}
        options={[
          { value: 'running', label: `Ending (${running.length})` },
          { value: 'ended', label: `Ended (${ended.length})` },
        ]}
        style={{ marginBottom: space.s3 }}
      />

      {current.length === 0 ? (
        <Text style={[type.caption, { color: tokens.colors.textMuted, textAlign: 'center', paddingVertical: space.s5 }]}>
          {activeTab === 'running' ? 'None of your expenses has an end date coming up.' : 'No expenses have ended.'}
        </Text>
      ) : (
        <View style={{ marginHorizontal: -space.s4 }}>
          {current.map((expense, i) => {
            const isEnded = activeTab === 'ended';
            const progress = endProgress(expense);
            const soon = !!progress && !isEnded && progress.daysLeft <= SOON_DAYS;
            const barColor = isEnded ? tokens.colors.textFaint : soon ? tokens.colors.caution : tokens.colors.brand;
            const left = progress ? describeRemaining(progress) : '';
            return (
              <ListRow
                key={expense.id}
                title={expense.description}
                caption={`${isEnded ? 'Ended' : 'Ends'} ${formatDay(expense.endDate)} · ${expense.category === 'household' ? 'Household' : 'Personal'}`}
                captionLines={2}
                icon={isEnded ? 'checkmark-circle-outline' : soon ? 'timer-outline' : 'time-outline'}
                iconColor={isEnded || !soon ? tokens.colors.textMuted : tokens.colors.caution}
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
                onPress={() => router.push({ pathname: '/add-expense', params: { id: expense.id } })}
                accessibilityLabel={`Edit ${expense.description}`}
                showSeparator={i < current.length - 1 || offerReminders}
                style={{ minHeight: 56 } as any}
                detail={
                  progress ? (
                    <View>
                      {progress.fraction !== null ? (
                        <ProgressBar
                          fraction={progress.fraction}
                          color={barColor}
                          accessibilityLabel={`${expense.description}: ${Math.round(progress.fraction * 100)}% of the way to its end date, ${describeRemaining(progress, true)}`}
                        />
                      ) : null}
                      <Text style={[type.caption, { color: tokens.colors.textMuted, marginTop: space.s1 }]}>{left}</Text>
                    </View>
                  ) : undefined
                }
              />
            );
          })}
          {offerReminders ? (
            <ListRow
              title="Get reminders"
              caption="A heads-up a period before each one ends, and on the day."
              captionLines={2}
              icon="notifications-outline"
              iconColor={tokens.colors.brand}
              chevron
              onPress={turnOnReminders}
              showSeparator={false}
            />
          ) : null}
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
