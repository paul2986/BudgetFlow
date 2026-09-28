import React, { useState } from 'react';
import { View, Text, Pressable, Platform, ViewStyle, StyleSheet } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { useCurrency } from '../hooks/useCurrency';
import Icon from './Icon';
import { Chip, AmountText } from './ui';
import { normalizeCategoryName } from '../utils/storage';
import { calculateMonthlyAmount } from '../utils/calculations';
import { Person, Expense } from '../types/budget';
import { type, radius, space } from '../styles/tokens';

/**
 * Expense row (DESIGN.md §2.7 Expenses). Renders inside a ListGroup: the group
 * supplies the surface, the row draws only an inset hairline separator.
 * - No text below 12px (fixes the old 10–11px metadata).
 * - Household/personal and debt carry icon + label chips, never color alone.
 * - Delete stays out of the scan path: mouse/trackpad devices get a muted
 *   trash that turns red on hover (still keyboard-reachable); touch devices
 *   (native and touch web) use long-press or the VoiceOver/TalkBack "Delete"
 *   action. The edit screen also offers delete.
 */

interface ExpenseCardProps {
    expense: Expense;
    person: Person | null | undefined;
    isDeleting?: boolean;
    onPress: () => void;
    onDelete: (id: string, description: string) => void;
    style?: ViewStyle;
    /** Hairline under the row; pass false for the last row in a group. */
    showSeparator?: boolean;
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
    showSeparator = true,
}: ExpenseCardProps) {
    const { tokens } = useTheme();
    const { formatCurrency } = useCurrency();
    const [hovered, setHovered] = useState(false);
    const [trashHovered, setTrashHovered] = useState(false);
    // Inline trash only where hover exists (mouse/trackpad). Touch devices,
    // including the PWA on a phone, use long-press like native.
    const showTrash =
        Platform.OS === 'web' &&
        typeof window !== 'undefined' &&
        !!window.matchMedia?.('(hover: hover) and (pointer: fine)').matches;
    const requestDelete = () => onDelete(expense.id, expense.description);

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
        expense.frequency.charAt(0).toUpperCase() + expense.frequency.slice(1),
        isHousehold ? (person ? person.name : 'Shared') : person?.name,
    ]
        .filter(Boolean)
        .join(' · ');

    const a11ySummary = `${expense.description}, ${formatCurrency(expense.amount)} ${expense.frequency}, ${
        isHousehold ? 'household' : 'personal'
    }${debtMeta ? `, ${debtMeta.label}` : ''}${expirationInfo ? `, ${expirationInfo.text}` : ''}`;

    // The row and the delete button are siblings inside a hover wrapper, so
    // web never nests one <button> inside another.
    return (
        <Pressable
            accessible={false}
            focusable={false}
            onHoverIn={() => setHovered(true)}
            onHoverOut={() => setHovered(false)}
            style={[
                {
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: hovered ? tokens.colors.surfaceSunken : 'transparent',
                    opacity: isDeleting ? 0.5 : 1,
                    // @ts-ignore web transition
                    transitionDuration: '150ms',
                },
                style,
            ]}
        >
            <Pressable
                onPress={onPress}
                onLongPress={showTrash ? undefined : requestDelete}
                disabled={isDeleting}
                accessibilityRole="button"
                accessibilityLabel={a11ySummary}
                accessibilityHint="Opens this expense for editing"
                accessibilityActions={[{ name: 'delete', label: 'Delete' }]}
                onAccessibilityAction={(e) => {
                    if (e.nativeEvent.actionName === 'delete') requestDelete();
                }}
                style={({ pressed }) => ({
                    flex: 1,
                    flexDirection: 'row',
                    alignItems: 'flex-start',
                    paddingLeft: space.s4,
                    paddingRight: showTrash ? space.s2 : space.s4,
                    paddingVertical: space.s3,
                    backgroundColor: pressed ? tokens.colors.surfaceSunken : 'transparent',
                })}
            >
                {/* Info */}
                <View style={{ flex: 1, marginRight: space.s3 }}>
                    <Text style={[type.bodyMed, { color: tokens.colors.text, marginBottom: space.s1 }]} numberOfLines={1}>
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
                            backgroundColor={isHousehold ? tokens.colors.householdSubtle : tokens.colors.personalSubtle}
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

                {/* Amount */}
                <View style={{ alignItems: 'flex-end' }}>
                    <AmountText value={expense.amount} role="bodyMed" />
                    {shouldShowMonthlyValue && (
                        <AmountText value={monthlyAmount} role="caption" tone="muted" suffix="/mo" />
                    )}
                </View>
            </Pressable>

            {showTrash ? (
                <Pressable
                    onPress={requestDelete}
                    disabled={isDeleting}
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
                        marginRight: space.s2,
                        opacity: hovered || trashHovered || pressed ? 1 : 0.4,
                        backgroundColor: pressed || trashHovered ? tokens.colors.dangerSubtle : 'transparent',
                    })}
                >
                    <Icon
                        name="trash-outline"
                        size={18}
                        color={trashHovered ? tokens.colors.danger : tokens.colors.textFaint}
                    />
                </Pressable>
            ) : null}

            {showSeparator ? (
                <View
                    style={{
                        position: 'absolute',
                        left: space.s4,
                        right: 0,
                        bottom: 0,
                        height: StyleSheet.hairlineWidth,
                        backgroundColor: tokens.colors.borderStrong,
                    }}
                />
            ) : null}
        </Pressable>
    );
}
