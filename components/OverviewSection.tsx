import React, { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, useWindowDimensions, Platform } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { useCurrency } from '../hooks/useCurrency';
import { useThemedStyles } from '../hooks/useThemedStyles';
import { calculateMonthlyAmount } from '../utils/calculations';
import Icon from './Icon';
import { Person, Expense, HouseholdSettings } from '../types/budget';

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

export default function OverviewSection({
  calculations,
  people,
  expenses,
  householdSettings,
  onViewModeChange
}: OverviewSectionProps) {
  const { currentColors } = useTheme();
  const { formatCurrency } = useCurrency();
  const { themedStyles } = useThemedStyles();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;

  // Default to monthly as requested
  const [viewMode, setViewMode] = useState<ViewMode>('monthly');
  const [hoveredTab, setHoveredTab] = useState<ViewMode | null>(null);

  const handleViewModeChange = (mode: ViewMode) => {
    console.log('OverviewSection: View mode changed to:', mode);
    setViewMode(mode);
    if (onViewModeChange) {
      onViewModeChange(mode);
    }
  };

  const displayValues = useMemo(() => {
    if (viewMode === 'daily') {
      return {
        totalIncome: calculateMonthlyAmount(calculations.totalIncome, 'yearly') / 30.44, // Average days per month
        totalExpenses: calculateMonthlyAmount(calculations.totalExpenses, 'yearly') / 30.44,
        householdExpenses: calculateMonthlyAmount(calculations.householdExpenses, 'yearly') / 30.44,
        personalExpenses: calculateMonthlyAmount(calculations.personalExpenses, 'yearly') / 30.44,
        remaining: calculateMonthlyAmount(calculations.remaining, 'yearly') / 30.44,
      };
    } else if (viewMode === 'monthly') {
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

  const TabButton = ({ mode, label }: { mode: ViewMode; label: string }) => (
    <TouchableOpacity
      onPress={() => handleViewModeChange(mode)}
      // @ts-ignore - web only props
      onHoverIn={() => setHoveredTab(mode)}
      onHoverOut={() => setHoveredTab(null)}
      activeOpacity={0.7}
      style={[
        {
          flex: 1,
          paddingHorizontal: 12,
          paddingVertical: 6,
          borderRadius: 8,
          backgroundColor: viewMode === mode ? currentColors.border : (hoveredTab === mode ? currentColors.border + '40' : 'transparent'),
          alignItems: 'center',
          transitionDuration: '0.2s',
        } as any,
      ]}
    >
      <Text
        style={[
          themedStyles.text,
          {
            color: viewMode === mode ? currentColors.text : currentColors.textSecondary,
            fontWeight: viewMode === mode ? '600' : '500',
            fontSize: 14,
          },
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );

  return (
    <View style={isDesktop ? { marginBottom: 24 } : {}}>
      {/* Header Row for Desktop */}
      <View style={isDesktop ? { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 } : {}}>
        {isDesktop && (
          <Text style={[themedStyles.title, { fontSize: 24 }]}>Dashboard</Text>
        )}

        {/* Tabs - Full Width on mobile, compact on desktop */}
        <View style={{
          flexDirection: 'row',
          backgroundColor: currentColors.background,
          borderRadius: 10,
          padding: 4,
          marginBottom: isDesktop ? 0 : 20,
          width: isDesktop ? 300 : '100%'
        }}>
          <TabButton mode="daily" label="Daily" />
          <TabButton mode="monthly" label="Monthly" />
          <TabButton mode="yearly" label="Yearly" />
        </View>
      </View>

      {/* Stats Grid */}
      <View style={isDesktop ? { flexDirection: 'row', gap: 16 } : {}}>

        {/* Income Card */}
        <View style={[
          themedStyles.card,
          {
            backgroundColor: currentColors.success + '10',
            borderColor: currentColors.success + '30',
            borderWidth: 1,
            marginBottom: isDesktop ? 0 : 12,
            flex: isDesktop ? 1 : undefined,
          }
        ]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
            <Icon name="trending-up" size={16} style={{ color: currentColors.success, marginRight: 6 }} />
            <Text style={[themedStyles.textSecondary, { fontSize: 12, fontWeight: '600' }]}>
              INCOME
            </Text>
          </View>
          <Text style={[
            themedStyles.text,
            {
              fontSize: 24,
              fontWeight: '700',
              color: currentColors.success
            }
          ]}>
            {formatCurrency(displayValues.totalIncome)}
          </Text>
        </View>

        {/* Expenses Card */}
        <View style={[
          themedStyles.card,
          {
            backgroundColor: currentColors.error + '10',
            borderColor: currentColors.error + '30',
            borderWidth: 1,
            marginBottom: isDesktop ? 0 : 16,
            flex: isDesktop ? 1 : undefined,
          }
        ]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
            <Icon name="trending-down" size={16} style={{ color: currentColors.error, marginRight: 6 }} />
            <Text style={[themedStyles.textSecondary, { fontSize: 12, fontWeight: '600' }]}>
              EXPENSES
            </Text>
          </View>
          <Text style={[
            themedStyles.text,
            {
              fontSize: 24,
              fontWeight: '700',
              color: currentColors.error
            }
          ]}>
            {formatCurrency(displayValues.totalExpenses)}
          </Text>
        </View>

        {/* Remaining Card - Make it distinct */}
        <View style={[
          themedStyles.card,
          {
            backgroundColor: displayValues.remaining >= 0
              ? currentColors.success + '15'
              : currentColors.error + '15',
            borderColor: displayValues.remaining >= 0
              ? currentColors.success + '40'
              : currentColors.error + '40',
            borderWidth: 2,
            marginBottom: isDesktop ? 0 : 15,
            paddingBottom: isDesktop ? 20 : 12,
            flex: isDesktop ? 1.2 : undefined, // Slightly larger on desktop
            justifyContent: 'center'
          }
        ]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <Icon
              name={displayValues.remaining >= 0 ? "checkmark-circle" : "alert-circle"}
              size={20}
              style={{
                color: displayValues.remaining >= 0 ? currentColors.success : currentColors.error,
                marginRight: 8
              }}
            />
            <Text style={[themedStyles.textSecondary, { fontSize: 12, fontWeight: '600' }]}>
              REMAINING
            </Text>
          </View>
          <Text style={[
            themedStyles.text,
            {
              fontSize: 32,
              fontWeight: '800',
              color: displayValues.remaining >= 0 ? currentColors.success : currentColors.error,
              lineHeight: 36,
              marginBottom: displayValues.remaining < 0 ? 4 : 0,
            }
          ]}>
            {formatCurrency(displayValues.remaining)}
          </Text>
          {displayValues.remaining < 0 && (
            <Text style={[themedStyles.textSecondary, { fontSize: 12 }]}>
              Over budget by {formatCurrency(Math.abs(displayValues.remaining))}
            </Text>
          )}
        </View>
      </View>

      {/* Breakdown Row - Only show on mobile or if needed. 
          On desktop we can show this elsewhere or keep it here but smaller. 
          Let's keep it here for now but make it a row below the main stats on Desktop.
      */}
      <View style={{ flexDirection: 'row', gap: 12, marginTop: isDesktop ? 16 : 0 }}>
        <View style={[
          themedStyles.card,
          {
            flex: 1,
            backgroundColor: currentColors.household + '10',
            borderColor: currentColors.household + '30',
            borderWidth: 1,
            marginBottom: 0,
          }
        ]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
            <Icon name="home" size={14} style={{ color: currentColors.household, marginRight: 6 }} />
            <Text style={[themedStyles.textSecondary, { fontSize: 11, fontWeight: '600' }]}>
              HOUSEHOLD
            </Text>
          </View>
          <Text style={[
            themedStyles.text,
            {
              fontSize: 16,
              fontWeight: '700',
              color: currentColors.household
            }
          ]}>
            {formatCurrency(displayValues.householdExpenses)}
          </Text>
        </View>

        <View style={[
          themedStyles.card,
          {
            flex: 1,
            backgroundColor: currentColors.personal + '10',
            borderColor: currentColors.personal + '30',
            borderWidth: 1,
            marginBottom: 0,
          }
        ]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
            <Icon name="person" size={14} style={{ color: currentColors.personal, marginRight: 6 }} />
            <Text style={[themedStyles.textSecondary, { fontSize: 11, fontWeight: '600' }]}>
              PERSONAL
            </Text>
          </View>
          <Text style={[
            themedStyles.text,
            {
              fontSize: 16,
              fontWeight: '700',
              color: currentColors.personal
            }
          ]}>
            {formatCurrency(displayValues.personalExpenses)}
          </Text>
        </View>
      </View>
    </View>
  );
}
