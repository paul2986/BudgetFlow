import React, { useState } from 'react';
import { View, Text, Pressable, Platform, StyleSheet, ViewStyle } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { useThemedStyles } from '../hooks/useThemedStyles';
import { useCurrency } from '../hooks/useCurrency';
import Icon from './Icon';
import { normalizeCategoryName } from '../utils/storage';
import { calculateMonthlyAmount } from '../utils/calculations';
import { Person, Expense } from '../types/budget';

interface ExpenseCardProps {
    expense: Expense;
    person: Person | null | undefined;
    isDeleting?: boolean;
    onPress: () => void;
    onDelete: (id: string, description: string) => void;
    style?: ViewStyle;
}

export default function ExpenseCard({
    expense,
    person,
    isDeleting = false,
    onPress,
    onDelete,
    style
}: ExpenseCardProps) {
    const { currentColors } = useTheme();
    const { themedStyles } = useThemedStyles();
    const { formatCurrency } = useCurrency();
    const [hovered, setHovered] = useState(false);

    // Derived values
    const monthlyAmount = calculateMonthlyAmount(expense.amount, expense.frequency);
    const tag = normalizeCategoryName((expense as any).categoryTag || 'Misc');
    const isHousehold = expense.category === 'household';
    const shouldShowMonthlyValue = expense.frequency !== 'monthly';

    // Expiration logic
    const hasExpirationDate = expense.endDate && expense.frequency !== 'one-time';

    const getExpirationInfo = (endDate: string) => {
        const date = new Date(endDate);
        const now = new Date();
        const diffTime = date.getTime() - now.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        const options: Intl.DateTimeFormatOptions = {
            month: 'short',
            day: 'numeric',
            year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
        };
        const formattedDate = date.toLocaleDateString('en-US', options);

        if (diffDays < 0) {
            return { text: `Expired ${formattedDate}`, isExpired: true, isExpiringSoon: false };
        } else if (diffDays === 0) {
            return { text: `Expires today`, isExpired: false, isExpiringSoon: true };
        } else if (diffDays === 1) {
            return { text: `Expires tomorrow`, isExpired: false, isExpiringSoon: true };
        } else if (diffDays <= 7) {
            return { text: `Expires in ${diffDays} days`, isExpired: false, isExpiringSoon: true };
        } else if (diffDays <= 30) {
            return { text: `Expires ${formattedDate}`, isExpired: false, isExpiringSoon: false };
        } else {
            return { text: `Expires ${formattedDate}`, isExpired: false, isExpiringSoon: false };
        }
    };

    const expirationInfo = hasExpirationDate && expense.endDate ? getExpirationInfo(expense.endDate) : null;

    return (
        <Pressable
            onPress={onPress}
            disabled={isDeleting}
            // @ts-ignore - web props
            onHoverIn={() => setHovered(true)}
            onHoverOut={() => setHovered(false)}
            style={({ pressed }) => [
                themedStyles.card,
                {
                    padding: 12,
                    opacity: isDeleting ? 0.6 : 1,
                    borderLeftWidth: 4,
                    borderLeftColor: isHousehold ? currentColors.household : currentColors.personal,
                    marginBottom: 0, // Handled by parent container gap
                    transform: (Platform.OS === 'web' && hovered && !pressed) ? [{ translateY: -2 }] : [],
                    shadowOpacity: (Platform.OS === 'web' && hovered) ? 0.15 : 0.08,
                    shadowRadius: (Platform.OS === 'web' && hovered) ? 6 : 3,
                    transitionDuration: '0.2s',
                    // Border logic for expiration
                    borderWidth: 1,
                    borderColor: currentColors.border,
                    ...(expirationInfo?.isExpired && {
                        borderColor: currentColors.error + '40',
                        backgroundColor: currentColors.error + '05',
                    }),
                    ...(expirationInfo?.isExpiringSoon && !expirationInfo?.isExpired && {
                        borderColor: '#FF9500' + '40',
                        backgroundColor: '#FF9500' + '05',
                    }),
                },
                style
            ]}
        >
            {/* Main Content */}
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>

                {/* Left Side: Info */}
                <View style={{ flex: 1, marginRight: 10 }}>
                    <Text style={[themedStyles.text, { fontWeight: '700', fontSize: 15, marginBottom: 4, lineHeight: 20 }]} numberOfLines={1}>
                        {expense.description}
                    </Text>

                    {/* Tags Row */}
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 4 }}>
                        <View style={{
                            backgroundColor: isHousehold ? currentColors.household + '15' : currentColors.personal + '15',
                            paddingHorizontal: 6,
                            paddingVertical: 2,
                            borderRadius: 4,
                        }}>
                            <Text style={{
                                color: isHousehold ? currentColors.household : currentColors.personal,
                                fontSize: 10,
                                fontWeight: '700',
                                textTransform: 'uppercase',
                            }}>
                                {expense.category}
                            </Text>
                        </View>

                        <View style={{
                            backgroundColor: currentColors.background,
                            paddingHorizontal: 6,
                            paddingVertical: 2,
                            borderRadius: 4,
                            borderWidth: 1,
                            borderColor: currentColors.border,
                        }}>
                            <Text style={[themedStyles.textSecondary, { fontSize: 10, fontWeight: '500' }]}>
                                {tag}
                            </Text>
                        </View>

                        {expense.debtRepayment && (
                            <View style={{
                                backgroundColor: (expense.debtRepayment === 'mortgage' ? '#FF9500' : expense.debtRepayment === 'credit_card' ? '#5856D6' : '#34C759') + '15',
                                paddingHorizontal: 6,
                                paddingVertical: 2,
                                borderRadius: 4,
                                borderWidth: 1,
                                borderColor: (expense.debtRepayment === 'mortgage' ? '#FF9500' : expense.debtRepayment === 'credit_card' ? '#5856D6' : '#34C759') + '30',
                            }}>
                                <Text style={{
                                    color: expense.debtRepayment === 'mortgage' ? '#FF9500' : expense.debtRepayment === 'credit_card' ? '#5856D6' : '#34C759',
                                    fontSize: 10,
                                    fontWeight: '700',
                                    textTransform: 'uppercase',
                                }}>
                                    {expense.debtRepayment === 'mortgage' ? 'Mortgage' : expense.debtRepayment === 'credit_card' ? 'Credit Card' : 'Loan'}
                                </Text>
                            </View>
                        )}
                    </View>

                    {/* Person & Frequency */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: expirationInfo ? 4 : 0 }}>
                        <Icon name="repeat" size={10} style={{ color: currentColors.textSecondary, marginRight: 3 }} />
                        <Text style={[themedStyles.textSecondary, { fontSize: 11 }]}>
                            {expense.frequency}
                            {isHousehold && (
                                <> • {person ? person.name : 'Unassigned'}</>
                            )}
                        </Text>
                    </View>

                    {/* Expiration Badge */}
                    {hasExpirationDate && expirationInfo && (
                        <View style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            paddingHorizontal: 6,
                            paddingVertical: 2,
                            backgroundColor: expirationInfo.isExpired
                                ? currentColors.error + '15'
                                : expirationInfo.isExpiringSoon
                                    ? '#FF9500' + '15'
                                    : currentColors.textSecondary + '10',
                            borderRadius: 4,
                            alignSelf: 'flex-start',
                            marginTop: 2
                        }}>
                            <Icon
                                name={expirationInfo.isExpired ? "time" : "timer-outline"}
                                size={10}
                                style={{
                                    color: expirationInfo.isExpired
                                        ? currentColors.error
                                        : expirationInfo.isExpiringSoon
                                            ? '#FF9500'
                                            : currentColors.textSecondary,
                                    marginRight: 4
                                }}
                            />
                            <Text style={{
                                fontSize: 10,
                                fontWeight: '600',
                                color: expirationInfo.isExpired
                                    ? currentColors.error
                                    : expirationInfo.isExpiringSoon
                                        ? '#FF9500'
                                        : currentColors.textSecondary,
                            }}>
                                {expirationInfo.text}
                            </Text>
                        </View>
                    )}
                </View>

                {/* Right Side: Amount & Actions */}
                <View style={{ alignItems: 'flex-end', justifyContent: 'space-between', alignSelf: 'stretch' }}>
                    <View style={{ alignItems: 'flex-end' }}>
                        <Text style={[
                            themedStyles.text,
                            {
                                fontWeight: '700',
                                fontSize: 16,
                                color: isHousehold ? currentColors.household : currentColors.personal,
                                marginBottom: 1,
                            },
                        ]}>
                            {formatCurrency(expense.amount)}
                        </Text>
                        {shouldShowMonthlyValue && (
                            <Text style={[themedStyles.textSecondary, { fontSize: 10 }]}>
                                {formatCurrency(monthlyAmount)}/mo
                            </Text>
                        )}
                    </View>

                    {/* Action Buttons Row */}
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                        <Pressable
                            onPress={(e) => {
                                e.stopPropagation();
                                onDelete(expense.id, expense.description);
                            }}
                            style={({ pressed }) => ({
                                padding: 6,
                                borderRadius: 6,
                                backgroundColor: pressed ? currentColors.error + '25' : currentColors.error + '10',
                                borderWidth: 1,
                                borderColor: currentColors.error + '30',
                            })}
                        >
                            <Icon name="trash-outline" size={14} style={{ color: currentColors.error }} />
                        </Pressable>
                    </View>
                </View>
            </View>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    // Add any specific styles if needed
});
