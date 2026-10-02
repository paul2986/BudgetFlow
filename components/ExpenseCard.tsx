import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ViewStyle, StyleSheet } from 'react-native';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import { useTheme } from '../hooks/useTheme';
import { useCurrency } from '../hooks/useCurrency';
import Icon from './Icon';
import { Chip, AmountText, Checkbox } from './ui';
import { normalizeCategoryName } from '../utils/storage';
import { calculateMonthlyAmount } from '../utils/calculations';
import { debtMeta as getDebtMeta } from '../utils/debtMeta';
import { Person, Expense } from '../types/budget';
import { type, space, avatarHue } from '../styles/tokens';

/**
 * Expense row (DESIGN.md §2.7 Expenses). Renders inside a ListGroup: the group
 * supplies the surface, the row draws only an inset hairline separator.
 * - No text below 12px (fixes the old 10–11px metadata).
 * - Household/personal and debt carry icon + label chips, never color alone.
 * - No meta line: category (or the debt chip in its place) and frequency are
 *   neutral outlined chips (grey stroke, clear fill) beside the owner chip.
 * - Delete stays out of the scan path: swipe left to reveal a Delete action
 *   (Mail-style, one open row at a time), or use the VoiceOver/TalkBack
 *   "Delete" action; the edit screen also offers delete.
 * - Selection mode (bulk edit): a leading check circle, tapping toggles the
 *   row instead of opening it, and swipe-to-delete is off. Long-press starts it.
 */

const DELETE_ACTION_WIDTH = 88;

// The row whose Delete action is showing, so opening another closes it.
let openRow: SwipeableMethods | null = null;

interface ExpenseCardProps {
    expense: Expense;
    person: Person | null | undefined;
    isDeleting?: boolean;
    onPress: () => void;
    onDelete: (id: string, description: string) => void;
    style?: ViewStyle;
    /** Hairline under the row; pass false for the last row in a group. */
    showSeparator?: boolean;
    /** Selection mode: the row toggles `selected` instead of opening. */
    selectMode?: boolean;
    selected?: boolean;
    onToggleSelect?: () => void;
    /** Long-press outside selection mode (starts it). */
    onLongPress?: () => void;
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
    selectMode = false,
    selected = false,
    onToggleSelect,
    onLongPress,
}: ExpenseCardProps) {
    const { tokens } = useTheme();
    const { formatCurrency } = useCurrency();
    const [hovered, setHovered] = useState(false);
    const swipeRef = useRef<SwipeableMethods>(null);
    const isOpen = useRef(false);
    const closedAt = useRef(0);
    const requestDelete = () => onDelete(expense.id, expense.description);

    // An open Delete action would sit under the selection checkboxes.
    useEffect(() => {
        if (selectMode) swipeRef.current?.close();
    }, [selectMode]);

    const monthlyAmount = calculateMonthlyAmount(expense.amount, expense.frequency);
    const tag = normalizeCategoryName((expense as any).categoryTag || 'Misc');
    const isHousehold = expense.category === 'household';
    const shouldShowMonthlyValue = expense.frequency !== 'monthly';

    const hasExpirationDate = expense.endDate && expense.frequency !== 'one-time';
    const expirationInfo = hasExpirationDate && expense.endDate ? getExpirationInfo(expense.endDate) : null;

    // A personal expense is tagged in its owner's avatar colour (People page).
    const ownerHue = !isHousehold && person ? avatarHue(person.id, tokens.isDark) : null;
    const debtMeta = expense.debtRepayment ? getDebtMeta(expense.debtRepayment, tokens.colors) : null;

    const frequencyLabel = expense.frequency.charAt(0).toUpperCase() + expense.frequency.slice(1);

    const a11ySummary = `${expense.description}, ${formatCurrency(expense.amount)} ${expense.frequency}, ${
        isHousehold ? 'household' : person ? `personal, ${person.name}` : 'personal'
    }, ${debtMeta ? debtMeta.label : tag}${expirationInfo ? `, ${expirationInfo.text}` : ''}`;

    return (
        <View style={[{ opacity: isDeleting ? 0.5 : 1 }, style]}>
            <ReanimatedSwipeable
                ref={swipeRef}
                enabled={!isDeleting && !selectMode}
                friction={1.5}
                rightThreshold={DELETE_ACTION_WIDTH / 2}
                overshootRight={false}
                onSwipeableWillOpen={() => {
                    isOpen.current = true;
                    // One open row at a time, like Mail.
                    if (openRow && openRow !== swipeRef.current) openRow.close();
                    openRow = swipeRef.current;
                }}
                onSwipeableWillClose={() => {
                    isOpen.current = false;
                    closedAt.current = Date.now();
                    if (openRow === swipeRef.current) openRow = null;
                }}
                renderRightActions={selectMode ? undefined : (_progress, _translation, methods) => (
                    <Pressable
                        onPress={() => {
                            methods.close();
                            requestDelete();
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={`Delete ${expense.description}`}
                        style={({ pressed }) => ({
                            width: DELETE_ACTION_WIDTH,
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: space.s1,
                            backgroundColor: tokens.colors.danger,
                            opacity: pressed ? 0.8 : 1,
                        })}
                    >
                        <Icon name="trash-outline" size={20} color={tokens.colors.onDanger} />
                        <Text style={[type.caption, { color: tokens.colors.onDanger }]}>Delete</Text>
                    </Pressable>
                )}
            >
                <Pressable
                    onPress={() => {
                        if (selectMode) {
                            onToggleSelect?.();
                            return;
                        }
                        // A tap on an open row only closes it. The swipeable
                        // closes on touch-down (before onPress on web), so
                        // swallow a press that lands just after a close.
                        if (isOpen.current || Date.now() - closedAt.current < 500) {
                            swipeRef.current?.close();
                            return;
                        }
                        onPress();
                    }}
                    onLongPress={selectMode ? undefined : onLongPress}
                    onHoverIn={() => setHovered(true)}
                    onHoverOut={() => setHovered(false)}
                    disabled={isDeleting}
                    accessibilityRole={selectMode ? 'checkbox' : 'button'}
                    accessibilityLabel={a11ySummary}
                    accessibilityHint={selectMode ? 'Selects this expense' : 'Opens this expense for editing'}
                    accessibilityState={selectMode ? { checked: selected } : undefined}
                    accessibilityActions={selectMode ? undefined : [{ name: 'delete', label: 'Delete' }]}
                    onAccessibilityAction={(e) => {
                        if (e.nativeEvent.actionName === 'delete') requestDelete();
                    }}
                    style={({ pressed }) => ({
                        paddingHorizontal: space.s4,
                        paddingVertical: space.s3,
                        // Opaque so the delete action stays hidden until swiped.
                        backgroundColor:
                            selectMode && selected
                                ? tokens.colors.brandSubtle
                                : pressed || hovered
                                    ? tokens.colors.surfaceHover
                                    : tokens.colors.surface,
                        // @ts-ignore web transition
                        transitionDuration: '150ms',
                    })}
                >
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        {selectMode ? (
                            <Checkbox checked={selected} shape="circle" style={{ marginRight: space.s3 }} />
                        ) : null}
                        <View style={{ flex: 1 }}>
                            {/* Name and amount */}
                            <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                                <Text style={[type.bodyMed, { flex: 1, color: tokens.colors.text, marginRight: space.s3 }]} numberOfLines={1}>
                                    {expense.description}
                                </Text>
                                <AmountText value={expense.amount} role="bodyMed" />
                            </View>

                            {/* Chips span the full row so owner, category and frequency fit
                                on one line; the monthly equivalent sits at the right. */}
                            <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginTop: space.s2 }}>
                                <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: space.s1 }}>
                                    <Chip
                                        label={isHousehold ? 'Household' : person?.name || 'Personal'}
                                        icon={isHousehold ? 'home-outline' : 'person-outline'}
                                        color={isHousehold ? tokens.colors.household : ownerHue?.fg ?? tokens.colors.personal}
                                        backgroundColor={isHousehold ? tokens.colors.householdSubtle : ownerHue?.bg ?? tokens.colors.personalSubtle}
                                    />
                                    {debtMeta ? (
                                        <Chip
                                            label={debtMeta.label}
                                            icon={debtMeta.icon}
                                            color={debtMeta.color}
                                            backgroundColor={debtMeta.subtle}
                                        />
                                    ) : (
                                        // A debt chip already names what this is, so the
                                        // category only shows when there isn't one.
                                        <Chip label={tag} outlined />
                                    )}
                                    <Chip label={frequencyLabel} outlined />
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
                                                    : tokens.colors.warningSubtle
                                            }
                                            outlined={!expirationInfo.isExpired && !expirationInfo.isExpiringSoon}
                                        />
                                    ) : null}
                                </View>
                                {shouldShowMonthlyValue && (
                                    <AmountText
                                        value={monthlyAmount}
                                        role="caption"
                                        tone="muted"
                                        suffix="/mo"
                                        style={{ marginLeft: space.s3 }}
                                    />
                                )}
                            </View>
                        </View>
                    </View>

                    {showSeparator ? (
                        <View
                            style={{
                                position: 'absolute',
                                left: 0,
                                right: 0,
                                bottom: 0,
                                height: StyleSheet.hairlineWidth,
                                backgroundColor: tokens.colors.border,
                            }}
                        />
                    ) : null}
                </Pressable>
            </ReanimatedSwipeable>
        </View>
    );
}
