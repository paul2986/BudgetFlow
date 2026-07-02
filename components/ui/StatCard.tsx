import React from 'react';
import { View, Text, ViewStyle } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import Icon from '../Icon';
import Card from './Card';
import AmountText from './AmountText';
import { type, radius, space } from '../../styles/tokens';

/**
 * StatCard per DESIGN.md §2.8: overline label + icon chip, large tabular
 * amount, optional caption. Semantic color applies to the amount only, never
 * the card background.
 */

interface StatCardProps {
  label: string;
  value: number;
  icon: string;
  tone?: 'default' | 'income' | 'expense';
  caption?: string;
  style?: ViewStyle | ViewStyle[];
}

export default function StatCard({ label, value, icon, tone = 'default', caption, style }: StatCardProps) {
  const { tokens } = useTheme();
  const bp = useBreakpoint();

  const iconColor =
    tone === 'income' ? tokens.colors.income
    : tone === 'expense' ? tokens.colors.expense
    : tokens.colors.brand;
  const iconBg =
    tone === 'income' ? tokens.colors.incomeSubtle
    : tone === 'expense' ? tokens.colors.expenseSubtle
    : tokens.colors.brandSubtle;

  return (
    <Card style={style as ViewStyle}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: space.s3 }}>
        <View
          style={{
            width: 28,
            height: 28,
            borderRadius: radius.sm,
            backgroundColor: iconBg,
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: space.s2,
          }}
        >
          <Icon name={icon as any} size={16} color={iconColor} />
        </View>
        <Text
          style={[type.overline, { color: tokens.colors.textMuted, flexShrink: 1 }]}
          numberOfLines={1}
        >
          {label}
        </Text>
      </View>
      {/* Half-width cards on compact can't fit h1 without mid-number wrapping. */}
      <AmountText
        value={value}
        role={bp.isCompact ? 'h2' : 'h1'}
        tone={tone === 'default' ? 'default' : tone}
        numberOfLines={1}
      />
      {caption ? (
        <Text style={[type.caption, { color: tokens.colors.textMuted, marginTop: space.s1 }]} numberOfLines={1}>
          {caption}
        </Text>
      ) : null}
    </Card>
  );
}
