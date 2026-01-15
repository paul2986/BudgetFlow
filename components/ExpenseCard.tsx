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
                    padding: 20,
                    opacity: isDeleting ? 0.6 : 1,
                    borderLeftWidth: 4,
                    borderLeftColor: isHousehold ? currentColors.household : currentColors.personal,
                    marginBottom: 0, // Handled by parent container gap
                    transform: (Platform.OS === 'web' && hovered && !pressed) ? [{ translateY: -4 }] : [],
                    shadowOpacity: (Platform.OS === 'web' && hovered) ? 0.2 : 0.1,
                    shadowRadius: (Platform.OS === 'web' && hovered) ? 8 : 4,
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
                <View style={{ flex: 1, marginRight: 12 }}>
                    <Text style={[themedStyles.text, { fontWeight: '700', fontSize: 18, marginBottom: 8, lineHeight: 24 }]}>
                        {expense.description}
                    </Text>

                    {/* Tags Row */}
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                        <View style={{
                            backgroundColor: isHousehold ? currentColors.household + '15' : currentColors.personal + '15',
                            paddingHorizontal: 8,
                            paddingVertical: 4,
                            borderRadius: 6,
                        }}>
                            <Text style={{
                                color: isHousehold ? currentColors.household : currentColors.personal,
                                fontSize: 11,
                                fontWeight: '700',
                                textTransform: 'uppercase',
                            }}>
                                {expense.category}
                            </Text>
                        </View>

                        <View style={{
                            backgroundColor: currentColors.background,
                            paddingHorizontal: 8,
                            paddingVertical: 4,
                            borderRadius: 6,
                            borderWidth: 1,
                            borderColor: currentColors.border,
                        }}>
                            <Text style={[themedStyles.textSecondary, { fontSize: 11, fontWeight: '500' }]}>
                                {tag}
                            </Text>
                        </View>
                    </View>

                    {/* Person & Frequency */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: expirationInfo ? 8 : 0 }}>
                        <Icon name="repeat" size={12} style={{ color: currentColors.textSecondary, marginRight: 4 }} />
                        <Text style={[themedStyles.textSecondary, { fontSize: 12 }]}>
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
                            paddingHorizontal: 8,
                            paddingVertical: 4,
                            backgroundColor: expirationInfo.isExpired
                                ? currentColors.error + '15'
                                : expirationInfo.isExpiringSoon
                                    ? '#FF9500' + '15'
                                    : currentColors.textSecondary + '10',
                            borderRadius: 8,
                            alignSelf: 'flex-start',
                            marginTop: 4
                        }}>
                            <Icon
                                name={expirationInfo.isExpired ? "time" : "timer-outline"}
                                size={12}
                                style={{
                                    color: expirationInfo.isExpired
                                        ? currentColors.error
                                        : expirationInfo.isExpiringSoon
                                            ? '#FF9500'
                                            : currentColors.textSecondary,
                                    marginRight: 6
                                }}
                            />
                            <Text style={{
                                fontSize: 11,
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
                <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[
                        themedStyles.text,
                        {
                            fontWeight: '800',
                            fontSize: 20,
                            color: isHousehold ? currentColors.household : currentColors.personal,
                            marginBottom: 2,
                        },
                    ]}>
                        {formatCurrency(expense.amount)}
                    </Text>
                    {shouldShowMonthlyValue && (
                        <Text style={[themedStyles.textSecondary, { fontSize: 11, marginBottom: 16 }]}>
                            {formatCurrency(monthlyAmount)}/mo
                        </Text>
                    )}
                    {!shouldShowMonthlyValue && <View style={{ height: 16 }} />}

                    {/* Action Buttons Row */}
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                        <Pressable
                            onPress={(e) => {
                                e.stopPropagation();
                                onDelete(expense.id, expense.description);
                            }}
                            style={({ pressed }) => ({
                                padding: 8,
                                borderRadius: 8,
                                backgroundColor: pressed ? currentColors.error + '25' : currentColors.error + '10',
                                borderWidth: 1,
                                borderColor: currentColors.error + '30',
                            })}
                        >
                            <Icon name="trash-outline" size={16} style={{ color: currentColors.error }} />
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
