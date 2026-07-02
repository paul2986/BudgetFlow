import React, { useState } from 'react';
import { View, Text, Pressable, Platform, ViewStyle } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { useCurrency } from '../hooks/useCurrency';
import Icon from './Icon';
import { Chip, AmountText } from './ui';
import { normalizeCategoryName } from '../utils/storage';
import { calculateMonthlyAmount } from '../utils/calculations';
import { Person, Expense } from '../types/budget';
import { type, radius, space, elevation } from '../styles/tokens';

/**
 * Expense row card (DESIGN.md §2.7 Expenses).
 * - No text below 12px (fixes the old 10–11px metadata).
 * - Household/personal and debt carry icon + label chips, never color alone.
 * - Delete is a 44pt labeled target, visually separated from the row press.
 */

interface ExpenseCardProps {
    expense: Expense;
    person: Person | null | undefined;
    isDeleting?: boolean;
    onPress: () => void;
    onDelete: (id: string, description: string) => void;
    style?: ViewStyle;
}

const getExpirationInfo = (endDate: string) => {
    const date = new Date(endDate);
    const now = new Date();
    const diffDays = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    const options: Intl.DateTimeFormatOptions = {
        month: 'short',
        day: 'numeric',
        year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    };
    const formattedDate = date.toLocaleDateString('en-US', options);

    if (diffDays < 0) return { text: `Expired ${formattedDate}`, isExpired: true, isExpiringSoon: false };
    if (diffDays === 0) return { text: 'Expires today', isExpired: false, isExpiringSoon: true };
    if (diffDays === 1) return { text: 'Expires tomorrow', isExpired: false, isExpiringSoon: true };
    if (diffDays <= 7) return { text: `Expires in ${diffDays} days`, isExpired: false, isExpiringSoon: true };
    return { text: `Expires ${formattedDate}`, isExpired: false, isExpiringSoon: false };
};

export default function ExpenseCard({
    expense,
    person,
    isDeleting = false,
    onPress,
    onDelete,
    style,
}: ExpenseCardProps) {
    const { tokens } = useTheme();
    const { formatCurrency } = useCurrency();
    const [hovered, setHovered] = useState(false);

    const monthlyAmount = calculateMonthlyAmount(expense.amount, expense.frequency);
    const tag = normalizeCategoryName((expense as any).categoryTag || 'Misc');
    const isHousehold = expense.category === 'household';
    const shouldShowMonthlyValue = expense.frequency !== 'monthly';

    const hasExpirationDate = expense.endDate && expense.frequency !== 'one-time';
    const expirationInfo = hasExpirationDate && expense.endDate ? getExpirationInfo(expense.endDate) : null;

    const debtMeta = expense.debtRepayment
        ? expense.debtRepayment === 'mortgage'
            ? { label: 'Mortgage', icon: 'business-outline' }
            : expense.debtRepayment === 'credit_card'
                ? { label: 'Credit card', icon: 'card-outline' }
                : { label: 'Loan', icon: 'cash-outline' }
        : null;

    const metaLine = [
        expense.frequency,
        isHousehold ? (person ? person.name : 'Shared') : person?.name,
    ]
        .filter(Boolean)
        .join(' · ');

    const a11ySummary = `${expense.description}, ${formatCurrency(expense.amount)} ${expense.frequency}, ${
        isHousehold ? 'household' : 'personal'
    }${debtMeta ? `, ${debtMeta.label}` : ''}${expirationInfo ? `, ${expirationInfo.text}` : ''}`;

    return (
        <Pressable
            onPress={onPress}
            disabled={isDeleting}
            onHoverIn={() => setHovered(true)}
            onHoverOut={() => setHovered(false)}
            accessibilityRole="button"
            accessibilityLabel={a11ySummary}
            accessibilityHint="Opens this expense for editing"
            style={({ pressed }) => [
                {
                    backgroundColor: pressed || hovered ? tokens.colors.surfaceSunken : tokens.colors.surface,
                    borderRadius: radius.lg,
                    borderWidth: 1,
                    borderColor: tokens.colors.border,
                    padding: space.s4,
                    opacity: isDeleting ? 0.5 : 1,
                    // @ts-ignore web transition
                    transitionDuration: '150ms',
                    ...elevation.e1,
                },
                expirationInfo?.isExpired
                    ? { borderLeftWidth: 3, borderLeftColor: tokens.colors.danger }
                    : expirationInfo?.isExpiringSoon
                        ? { borderLeftWidth: 3, borderLeftColor: tokens.colors.warning }
                        : null,
                style,
            ]}
        >
            <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                {/* Info */}
                <View style={{ flex: 1, marginRight: space.s3 }}>
                    <Text style={[type.h3, { color: tokens.colors.text, marginBottom: space.s1 }]} numberOfLines={1}>
                        {expense.description}
                    </Text>

                    <Text style={[type.caption, { color: tokens.colors.textMuted, marginBottom: space.s2 }]} numberOfLines={1}>
                        {metaLine} · {tag}
                    </Text>

                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s1 }}>
                        <Chip
                            label={isHousehold ? 'Household' : 'Personal'}
                            icon={isHousehold ? 'home-outline' : 'person-outline'}
                            color={isHousehold ? tokens.colors.household : tokens.colors.personal}
                            backgroundColor={tokens.colors.surfaceSunken}
                        />
                        {debtMeta ? (
                            <Chip
                                label={debtMeta.label}
                                icon={debtMeta.icon}
                                color={tokens.colors.textMuted}
                                backgroundColor={tokens.colors.surfaceSunken}
                            />
                        ) : null}
                        {expirationInfo ? (
                            <Chip
                                label={expirationInfo.text}
                                icon={expirationInfo.isExpired ? 'time-outline' : 'timer-outline'}
                                color={
                                    expirationInfo.isExpired
                                        ? tokens.colors.danger
                                        : expirationInfo.isExpiringSoon
                                            ? tokens.colors.warning
                                            : tokens.colors.textMuted
                                }
                                backgroundColor={
                                    expirationInfo.isExpired
                                        ? tokens.colors.dangerSubtle
                                        : expirationInfo.isExpiringSoon
                                            ? tokens.colors.warningSubtle
                                            : tokens.colors.surfaceSunken
                                }
                            />
                        ) : null}
                    </View>
                </View>

                {/* Amount + delete */}
                <View style={{ alignItems: 'flex-end', justifyContent: 'space-between', alignSelf: 'stretch' }}>
                    <View style={{ alignItems: 'flex-end' }}>
                        <AmountText value={expense.amount} role="bodyMed" />
                        {shouldShowMonthlyValue && (
                            <Text style={[type.caption, { color: tokens.colors.textMuted }]}>
                                {formatCurrency(monthlyAmount)}/mo
                            </Text>
                        )}
                    </View>

                    <Pressable
                        onPress={(e) => {
                            e.stopPropagation();
                            onDelete(expense.id, expense.description);
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={`Delete ${expense.description}`}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        style={({ pressed }) => ({
                            width: 36,
                            height: 36,
                            borderRadius: radius.md,
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginTop: space.s2,
                            backgroundColor: pressed ? tokens.colors.dangerSubtle : 'transparent',
                        })}
                    >
                        <Icon name="trash-outline" size={18} color={tokens.colors.danger} />
                    </Pressable>
                </View>
            </View>
        </Pressable>
    );
}
