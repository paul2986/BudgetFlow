import React, { useState, useMemo } from 'react';
import { View, Text } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { useCurrency } from '../hooks/useCurrency';
import { useBreakpoint } from '../hooks/useBreakpoint';
import { calculateMonthlyAmount } from '../utils/calculations';
import { StatCard, SegmentedControl, AmountText } from './ui';
import { Person, Expense, HouseholdSettings } from '../types/budget';
import { type, radius, space } from '../styles/tokens';

/**
 * Overview hero + stat grid (DESIGN.md §2.7 Overview).
 * Hero: "Left to spend" — the single most important number.
 * Stats: Income / Expenses / Household / Personal, 2×2 on compact, 4-across
 * on medium+. Same props as the legacy component so both dashboard call
 * sites upgrade without structural changes.
 */

interface OverviewSectionProps {
  calculations: {
    totalIncome: number;
    totalExpenses: number;
    householdExpenses: number;
    personalExpenses: number;
    remaining: number;
  };
  people: Person[];
  expenses: Expense[];
  householdSettings?: HouseholdSettings;
  onViewModeChange?: (mode: 'daily' | 'monthly' | 'yearly') => void;
}

type ViewMode = 'daily' | 'monthly' | 'yearly';

const VIEW_LABEL: Record<ViewMode, string> = {
  daily: 'per day',
  monthly: 'this month',
  yearly: 'this year',
};

export default function OverviewSection({
  calculations,
  onViewModeChange,
}: OverviewSectionProps) {
  const { tokens } = useTheme();
  const { formatCurrency } = useCurrency();
  const bp = useBreakpoint();

  const [viewMode, setViewMode] = useState<ViewMode>('monthly');

  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    onViewModeChange?.(mode);
  };

  // `calculations` holds yearly totals; convert per view mode (legacy math preserved).
  const displayValues = useMemo(() => {
    if (viewMode === 'daily') {
      return {
        totalIncome: calculateMonthlyAmount(calculations.totalIncome, 'yearly') / 30.44,
        totalExpenses: calculateMonthlyAmount(calculations.totalExpenses, 'yearly') / 30.44,
        householdExpenses: calculateMonthlyAmount(calculations.householdExpenses, 'yearly') / 30.44,
        personalExpenses: calculateMonthlyAmount(calculations.personalExpenses, 'yearly') / 30.44,
        remaining: calculateMonthlyAmount(calculations.remaining, 'yearly') / 30.44,
      };
    }
    if (viewMode === 'monthly') {
      return {
        totalIncome: calculateMonthlyAmount(calculations.totalIncome, 'yearly'),
        totalExpenses: calculateMonthlyAmount(calculations.totalExpenses, 'yearly'),
        householdExpenses: calculateMonthlyAmount(calculations.householdExpenses, 'yearly'),
        personalExpenses: calculateMonthlyAmount(calculations.personalExpenses, 'yearly'),
        remaining: calculateMonthlyAmount(calculations.remaining, 'yearly'),
      };
    }
    return calculations;
  }, [calculations, viewMode]);

  const negative = displayValues.remaining < 0;
  const heroAccent = negative ? tokens.colors.expense : tokens.colors.income;

  // compact & medium: 2×2 grid; expanded: 4-across.
  const statMinWidth = bp.isExpanded ? 200 : '46%';

  return (
    <View>
      {/* Hero: left to spend */}
      <View
        accessibilityLabel={`Left to spend ${VIEW_LABEL[viewMode]}: ${formatCurrency(displayValues.remaining)}`}
        style={{
          backgroundColor: tokens.colors.surface,
          borderRadius: radius.xl,
          borderWidth: 1,
          borderColor: tokens.colors.border,
          overflow: 'hidden',
          marginBottom: space.s4,
        }}
      >
        <View style={{ height: 3, backgroundColor: heroAccent }} />
        <View style={{ padding: bp.isCompact ? space.s5 : space.s6 }}>
          <View
            style={{
              flexDirection: bp.isCompact ? 'column' : 'row',
              justifyContent: 'space-between',
              alignItems: bp.isCompact ? 'stretch' : 'flex-start',
              gap: space.s4,
            }}
          >
            <View style={{ flex: bp.isCompact ? undefined : 1 }}>
              <Text style={[type.overline, { color: tokens.colors.textMuted, marginBottom: space.s2 }]}>
                Left to spend · {VIEW_LABEL[viewMode]}
              </Text>
              <AmountText
                value={displayValues.remaining}
                role="display"
                tone={negative ? 'expense' : 'default'}
              />
              <Text style={[type.caption, { color: tokens.colors.textMuted, marginTop: space.s2 }]}>
                Income {formatCurrency(displayValues.totalIncome)} · Expenses{' '}
                {formatCurrency(displayValues.totalExpenses)}
              </Text>
              {negative && (
                <Text style={[type.caption, { color: tokens.colors.expense, marginTop: space.s1 }]}>
                  Spending exceeds income for this period.
                </Text>
              )}
            </View>

            <SegmentedControl
              label="Summary period"
              options={[
                { value: 'daily', label: 'Daily' },
                { value: 'monthly', label: 'Monthly' },
                { value: 'yearly', label: 'Yearly' },
              ]}
              value={viewMode}
              onChange={handleViewModeChange}
              style={{ width: bp.isCompact ? '100%' : 280, alignSelf: bp.isCompact ? 'stretch' : 'flex-start' }}
            />
          </View>
        </View>
      </View>

      {/* Stat grid */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s3 }}>
        <StatCard
          label="Income"
          value={displayValues.totalIncome}
          icon="trending-up"
          tone="income"
          style={{ flexGrow: 1, flexBasis: statMinWidth as any, marginBottom: 0 }}
        />
        <StatCard
          label="Expenses"
          value={displayValues.totalExpenses}
          icon="trending-down"
          tone="expense"
          style={{ flexGrow: 1, flexBasis: statMinWidth as any, marginBottom: 0 }}
        />
        <StatCard
          label="Household"
          value={displayValues.householdExpenses}
          icon="home-outline"
          style={{ flexGrow: 1, flexBasis: statMinWidth as any, marginBottom: 0 }}
        />
        <StatCard
          label="Personal"
          value={displayValues.personalExpenses}
          icon="person-outline"
          style={{ flexGrow: 1, flexBasis: statMinWidth as any, marginBottom: 0 }}
        />
      </View>
    </View>
  );
}
