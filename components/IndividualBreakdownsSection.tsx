
import React from 'react';
import { View, Text } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { AmountText, Avatar, Card, EmptyState } from './ui';
import { type, space, radius, tabularNums } from '../styles/tokens';


import {
  calculatePersonIncome,
  calculatePersonalExpenses,
  calculateHouseholdShare,
  calculateMonthlyAmount,
  calculateAnnualAmount
} from '../utils/calculations';
import Icon from './Icon';
import { Person, Expense, HouseholdSettings } from '../types/budget';

interface IndividualBreakdownsSectionProps {
  people: Person[];
  expenses: Expense[];
  householdSettings?: HouseholdSettings;
  totalHouseholdExpenses: number;
  viewMode?: 'daily' | 'monthly' | 'yearly';
}

export default function IndividualBreakdownsSection({
  people,
  expenses,
  householdSettings,
  totalHouseholdExpenses,
  viewMode = 'monthly'
}: IndividualBreakdownsSectionProps) {
  const { tokens } = useTheme();

  // Helper function to convert amounts based on view mode
  const convertAmount = (amount: number): number => {
    if (viewMode === 'daily') {
      return calculateMonthlyAmount(amount, 'yearly') / 30.44; // Average days per month
    } else if (viewMode === 'monthly') {
      return calculateMonthlyAmount(amount, 'yearly');
    }
    return amount; // yearly
  };

  const period = viewMode === 'yearly' ? 'year' : viewMode === 'daily' ? 'day' : 'month';

  if (!people || people.length === 0) {
    return (
      <Card>
        <EmptyState icon="person-add-outline" title="No people yet" caption="Add people to see how each person's income is used." />
      </Card>
    );
  }

  const Line = ({ icon, iconColor, label, value }: { icon: string; iconColor: string; label: string; value: number }) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: space.s1 }}>
      <Icon name={icon as any} size={14} color={iconColor} style={{ marginRight: space.s2 }} />
      <Text style={[type.body, { color: tokens.colors.text, flex: 1 }]}>{label}</Text>
      <AmountText value={value} role="bodyMed" />
    </View>
  );

  const Legend = ({ color, label, strong }: { color: string; label: string; strong?: boolean }) => (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <View style={{ width: 8, height: 8, borderRadius: radius.full, backgroundColor: color, marginRight: space.s1 }} />
      <Text style={[type.caption, tabularNums, { color: strong ? color : tokens.colors.textMuted }]}>{label}</Text>
    </View>
  );

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s4 }}>
      {people.map((person) => {
        const personIncome = calculatePersonIncome(person);
        const personPersonalExpenses = calculatePersonalExpenses(expenses, person.id);
        const personHouseholdShare = calculateHouseholdShare(
          totalHouseholdExpenses,
          people,
          householdSettings?.distributionMethod || 'even',
          person.id
        );
        const personRemaining = personIncome - personPersonalExpenses - personHouseholdShare;

        const income = convertAmount(personIncome);
        const personal = convertAmount(personPersonalExpenses);
        const share = convertAmount(personHouseholdShare);
        const remaining = convertAmount(personRemaining);
        const over = remaining < 0;

        const pct = (v: number) => (income > 0 ? (v / income) * 100 : 0);
        const personalPct = Math.min(pct(personal), 100);
        const sharePct = Math.min(pct(share), 100 - personalPct);
        const leftPct = Math.max(0, 100 - personalPct - sharePct);
        const leftColor = over ? tokens.colors.danger : tokens.colors.income;

        return (
          <Card key={person.id} style={{ flexGrow: 1, flexBasis: 300 } as any}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: space.s4 }}>
              <Avatar name={person.name} seed={person.id} size={44} />
              <View style={{ flex: 1, marginLeft: space.s3 }}>
                <Text style={[type.h3, { color: tokens.colors.text }]} numberOfLines={1}>
                  {person.name}
                </Text>
                <Text style={[type.caption, { color: tokens.colors.textMuted }]}>Per {period}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <AmountText value={remaining} role="h3" tone={over ? 'expense' : 'income'} />
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  {over ? <Icon name="alert-circle" size={12} color={tokens.colors.danger} style={{ marginRight: 2 }} /> : null}
                  <Text style={[type.caption, { color: over ? tokens.colors.danger : tokens.colors.textMuted }]}>
                    {over ? 'over' : 'left'}
                  </Text>
                </View>
              </View>
            </View>

            <Line icon="trending-up" iconColor={tokens.colors.income} label="Income" value={income} />
            {person.income?.length > 1
              ? person.income.map((src) => (
                  <View key={src.id} style={{ flexDirection: 'row', paddingLeft: space.s5, paddingVertical: 2 }}>
                    <Text style={[type.caption, { color: tokens.colors.textMuted, flex: 1 }]} numberOfLines={1}>
                      {src.label}
                    </Text>
                    <AmountText
                      value={convertAmount(calculateAnnualAmount(src.amount, src.frequency))}
                      role="caption"
                      tone="muted"
                    />
                  </View>
                ))
              : null}
            <Line icon="person" iconColor={tokens.colors.personal} label="Personal spending" value={personal} />
            <Line icon="home" iconColor={tokens.colors.household} label="Household share" value={share} />

            <View
              accessibilityLabel={`${Math.round(pct(personal))}% personal, ${Math.round(pct(share))}% household, ${Math.round(Math.abs(pct(remaining)))}% ${over ? 'over' : 'left'}`}
              style={{
                height: 8,
                borderRadius: radius.full,
                overflow: 'hidden',
                flexDirection: 'row',
                // Surface-colored gaps keep adjacent segments from bleeding
                // together; the grey track only shows when there's no income.
                gap: space.s1,
                backgroundColor: income > 0 ? 'transparent' : tokens.colors.border,
                marginTop: space.s4,
                marginBottom: space.s3,
              }}
            >
              {income > 0 ? (
                <>
                  {personalPct > 0 ? <View style={{ flexGrow: personalPct, backgroundColor: tokens.colors.personal }} /> : null}
                  {sharePct > 0 ? <View style={{ flexGrow: sharePct, backgroundColor: tokens.colors.household }} /> : null}
                  {!over && leftPct > 0 ? <View style={{ flexGrow: leftPct, backgroundColor: tokens.colors.income }} /> : null}
                </>
              ) : null}
            </View>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: space.s4, rowGap: space.s1 }}>
              <Legend color={tokens.colors.personal} label={`${pct(personal).toFixed(0)}% personal`} />
              <Legend color={tokens.colors.household} label={`${pct(share).toFixed(0)}% household`} />
              <Legend color={leftColor} label={`${Math.abs(pct(remaining)).toFixed(0)}% ${over ? 'over' : 'left'}`} strong />
            </View>
          </Card>
        );
      })}
    </View>
  );
}
