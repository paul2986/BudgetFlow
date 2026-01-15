
import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, Alert } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useThemedStyles } from '../hooks/useThemedStyles';
import { useTheme } from '../hooks/useTheme';
import { useCurrency } from '../hooks/useCurrency';
import Icon from './Icon';
import { Expense } from '../types/budget';
import { calculateMonthlyAmount, getEndingSoon } from '../utils/calculations';
import { useBudgetData } from '../hooks/useBudgetData';
import { useToast } from '../hooks/useToast';

type TabKey = 'ending' | 'ended';

export default function RecurringWidget() {
  const { themedStyles } = useThemedStyles();
  const { currentColors } = useTheme();
  const { formatCurrency } = useCurrency();
  const { data, updateExpense, removeExpense } = useBudgetData();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<TabKey>('ending');
  const [extendTarget, setExtendTarget] = useState<{ id: string; current?: string } | null>(null);

  // Helpers
  const toYMD = useCallback((d: Date): string => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }, []);

  const recurringWithEnd = useMemo(() => {
    // Add comprehensive null checks for data and expenses array
    if (!data || !data.expenses || !Array.isArray(data.expenses)) {
      console.log('RecurringWidget: data.expenses is not available or not an array:', data);
      return [];
    }
    
    return data.expenses.filter((e) => e && e.frequency !== 'one-time' && (e as any).endDate);
  }, [data]);

  const { endingSoonList, endedList } = useMemo(() => {
    if (!recurringWithEnd || !Array.isArray(recurringWithEnd) || recurringWithEnd.length === 0) {
      return { endingSoonList: [], endedList: [] };
    }

    const ending = getEndingSoon(recurringWithEnd, 30).filter((e) => {
      const end = (e as any).endDate as string;
      const ymd = end ? end.slice(0, 10) : '';
      const today = new Date();
      const todayY = toYMD(today);
      return ymd >= todayY; // only future within 30 days
    });
    const ended = getEndingSoon(recurringWithEnd, 36500).filter((e) => {
      const end = (e as any).endDate as string;
      const ymd = end ? end.slice(0, 10) : '';
      const today = new Date();
      const todayY = toYMD(today);
      return !!ymd && ymd < todayY;
    });
    return { endingSoonList: ending, endedList: ended };
  }, [recurringWithEnd, toYMD]);

  const handleExtend = useCallback((expense: Expense) => {
    const currentEnd = (expense as any).endDate ? String((expense as any).endDate).slice(0, 10) : undefined;
    setExtendTarget({ id: expense.id, current: currentEnd });
  }, []);

  const handleDelete = useCallback((expense: Expense) => {
    Alert.alert(
      'Delete Expense',
      `Are you sure you want to delete "${expense.description}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const res = await removeExpense(expense.id);
            if (res.success) {
              showToast('Deleted expense', 'success');
            } else {
              showToast(res.error?.message || 'Failed to delete expense', 'error');
            }
          },
        },
      ]
    );
  }, [removeExpense, showToast]);

  const onDatePicked = useCallback(
    async (event: any, date?: Date) => {
      const target = extendTarget;
      setExtendTarget(null);
      if (!target || !date) return;

      const picked = toYMD(date);
      const today = toYMD(new Date());
      if (picked < today) {
        showToast('End date must be today or later', 'error');
        return;
      }

      // Find the expense and update its endDate
      if (!data || !data.expenses || !Array.isArray(data.expenses)) {
        showToast('Data not available', 'error');
        return;
      }

      const expense = data.expenses.find((e) => e && e.id === target.id);
      if (!expense) {
        showToast('Expense not found', 'error');
        return;
      }

      const updated: Expense = { ...expense, endDate: picked } as Expense;
      const res = await updateExpense(updated);
      if (res.success) {
        showToast(`Extended to ${picked}`, 'success');
      } else {
        showToast(res.error?.message || 'Failed to extend', 'error');
      }
    },
    [extendTarget, data, toYMD, updateExpense, showToast]
  );

  const ItemRow = useCallback(
    ({ expense }: { expense: Expense }) => {
      const monthly = calculateMonthlyAmount(expense.amount, expense.frequency);
      const end = (expense as any).endDate ? String((expense as any).endDate).slice(0, 10) : '';
      
      // Add comprehensive null checks for data.people
      const people = data && data.people && Array.isArray(data.people) ? data.people : [];
      const person = expense.personId ? people.find((p) => p && p.id === expense.personId) : null;

      return (
        <View
          style={[
            themedStyles.card,
            {
              padding: 12,
              marginBottom: 10,
            },
          ]}
        >
          <View style={[themedStyles.row, { marginBottom: 8 }]}>
            <View style={themedStyles.flex1}>
              <Text style={[themedStyles.text, { fontWeight: '700' }]}>{expense.description}</Text>
              <Text style={[themedStyles.textSecondary, { marginTop: 2 }]}>
                {expense.category === 'personal' && person ? `${person.name} • ` : ''}
                {expense.frequency} • Ends {end || '—'}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text
                style={[
                  themedStyles.text,
                  {
                    fontWeight: '800',
                    color: expense.category === 'household' ? currentColors.household : currentColors.personal,
                  },
                ]}
              >
                {formatCurrency(expense.amount)}
              </Text>
              <Text style={themedStyles.textSecondary}>{formatCurrency(monthly)}/mo</Text>
            </View>
          </View>

          <View style={[themedStyles.rowStart]}>
            <TouchableOpacity
              onPress={() => handleExtend(expense)}
              style={[
                themedStyles.badge,
                {
                  backgroundColor: currentColors.primary,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 18,
                  marginRight: 8,
                },
              ]}
            >
              <Text style={[themedStyles.badgeText, { color: '#FFFFFF', fontWeight: '700' }]}>Extend</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => handleDelete(expense)}
              style={[
                themedStyles.badge,
                {
                  backgroundColor: currentColors.error + '20',
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 18,
                },
              ]}
            >
              <Text style={[themedStyles.badgeText, { color: currentColors.error, fontWeight: '700' }]}>Delete</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    },
    [currentColors, themedStyles, data, formatCurrency, handleExtend, handleDelete]
  );

  const TabButton = useCallback(
    ({ tab, label }: { tab: TabKey; label: string }) => (
      <TouchableOpacity
        onPress={() => setActiveTab(tab)}
        style={[
          themedStyles.badge,
          {
            backgroundColor: activeTab === tab ? currentColors.secondary : currentColors.border,
            paddingHorizontal: 14,
            paddingVertical: 8,
            borderRadius: 18,
            marginRight: 8,
          },
        ]}
      >
        <Text
          style={[
            themedStyles.badgeText,
            { color: activeTab === tab ? '#FFFFFF' : currentColors.text, fontWeight: '700' },
          ]}
        >
          {label}
        </Text>
      </TouchableOpacity>
    ),
    [activeTab, themedStyles, currentColors]
  );

  const list = activeTab === 'ending' ? endingSoonList : endedList;

  return (
    <View style={{ marginTop: 8 }}>
      <Text style={[themedStyles.subtitle, { marginBottom: 12 }]}>Expiring/Ended Recurring</Text>

      <View
        style={[
          themedStyles.card,
          {
            padding: 12,
            backgroundColor: currentColors.backgroundAlt,
            borderColor: currentColors.border,
          },
        ]}
      >
        <View style={[themedStyles.row, { marginBottom: 12 }]}>
          <View style={themedStyles.rowStart}>
            <Icon name="time-outline" size={20} style={{ color: currentColors.textSecondary, marginRight: 8 }} />
            <Text style={[themedStyles.text, { fontWeight: '700' }]}>Status</Text>
          </View>
          <View style={themedStyles.rowStart}>
            <TabButton tab="ending" label="Ending Soon" />
            <TabButton tab="ended" label="Ended" />
          </View>
        </View>

        {!list || !Array.isArray(list) || list.length === 0 ? (
          <View style={themedStyles.centerContent}>
            <Text style={[themedStyles.textSecondary, { textAlign: 'center', marginVertical: 12 }]}>
              No {activeTab === 'ending' ? 'ending soon' : 'ended'} recurring expenses
            </Text>
          </View>
        ) : (
          list.map((e) => e && e.id ? <ItemRow key={e.id} expense={e} /> : null)
        )}
      </View>

      {extendTarget && (
        <DateTimePicker
          value={extendTarget.current ? new Date(extendTarget.current + 'T00:00:00') : new Date()}
          mode="date"
          display="default"
          onChange={onDatePicked}
        />
      )}
    </View>
  );
}
