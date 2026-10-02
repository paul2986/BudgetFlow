import React from 'react';
import { View, Text, ViewStyle } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import Icon from '../Icon';
import Card from './Card';
import AmountText from './AmountText';
import { formatCount } from '../../utils/adminFormat';
import { type, radius, space, tabularNums } from '../../styles/tokens';

/**
 * StatCard per DESIGN.md §2.8: overline label + icon chip, large tabular
 * amount, optional caption. Semantic color applies to the amount only, never
 * the card background.
 */

interface StatCardProps {
  label: string;
  value: number;
  /** 'count' shows a plain number (users, budgets) instead of a currency amount. */
  format?: 'currency' | 'count';
  icon: string;
  /** Colors the icon chip; the amount is only tinted for income/expense. */
  tone?: 'default' | 'income' | 'expense' | 'household' | 'personal';
  caption?: string;
  style?: ViewStyle | ViewStyle[];
  /** Count the amount up/down when `value` changes. */
  animate?: boolean;
}

export default function StatCard({ label, value, format = 'currency', icon, tone = 'default', caption, style, animate }: StatCardProps) {
  const { tokens } = useTheme();
  const bp = useBreakpoint();

  // Brand is reserved for interactive elements, so an untoned card stays neutral.
  const { colors } = tokens;
  const [iconColor, iconBg] =
    tone === 'income' ? [colors.income, colors.incomeSubtle]
    : tone === 'expense' ? [colors.expense, colors.expenseSubtle]
    : tone === 'household' ? [colors.household, colors.householdSubtle]
    : tone === 'personal' ? [colors.personal, colors.personalSubtle]
    : [colors.textMuted, colors.surfaceSunken];

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
      {format === 'count' ? (
        <Text style={[bp.isCompact ? type.h2 : type.h1, tabularNums, { color: tokens.colors.text }]} numberOfLines={1}>
          {formatCount(value)}
        </Text>
      ) : (
        <AmountText
          value={value}
          role={bp.isCompact ? 'h2' : 'h1'}
          tone={tone === 'income' || tone === 'expense' ? tone : 'default'}
          numberOfLines={1}
          animate={animate}
        />
      )}
      {caption ? (
        <Text style={[type.caption, { color: tokens.colors.textMuted, marginTop: space.s1 }]} numberOfLines={1}>
          {caption}
        </Text>
      ) : null}
    </Card>
  );
}
