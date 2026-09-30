import React, { useState, useEffect, useCallback } from 'react';
import { View, ScrollView, Switch } from 'react-native';
import { router } from 'expo-router';
import { useBudgetData } from '../../hooks/useBudgetData';
import { useTheme } from '../../hooks/useTheme';
import { useScrollBottomPadding } from '../../hooks/useBreakpoint';
import { useDiscardGuard } from '../../hooks/useDiscardGuard';
import { useCurrency } from '../../hooks/useCurrency';
import { Alert, confirmDiscard } from '../../utils/alert';
import Button from '../Button';
import StandardHeader from '../StandardHeader';
import IncomeModal from '../IncomeModal';
import { AmountText, Input, ListGroup, ListRow, Skeleton } from '../ui';
import { Income } from '../../types/budget';
import { calculatePersonIncome, calculateMonthlyAmount } from '../../utils/calculations';
import { space } from '../../styles/tokens';

/**
 * Edit a person: name, whether they share household costs, income sources
 * (each opens /edit-income, which owns update + confirmed delete), add income
 * via the shared IncomeModal sheet, and a quiet destructive action at the end.
 *
 * The name and share setting are held separately from the live person so
 * adding income (which refreshes budget data) never discards an unsaved edit.
 */

interface PersonFormProps {
    personId?: string;
    onClose: () => void;
    onSuccess?: () => void;
}

export default function PersonForm({ personId, onClose, onSuccess }: PersonFormProps) {
    const { data, updatePerson, removePerson, addIncome, saving } = useBudgetData();
    const { tokens } = useTheme();
    const scrollBottomPadding = useScrollBottomPadding();
    const { formatCurrency } = useCurrency();

    const person = data.people.find(p => p.id === personId) || null;
    const [name, setName] = useState('');
    const [sharesHousehold, setSharesHousehold] = useState(true);
    const [nameLoaded, setNameLoaded] = useState(false);
    const [showAddIncome, setShowAddIncome] = useState(false);
    const [isDeletingPerson, setIsDeletingPerson] = useState(false);

    useEffect(() => {
        if (person && !nameLoaded) {
            setName(person.name);
            setSharesHousehold(!person.excludeFromHouseholdShare);
            setNameLoaded(true);
        }
    }, [person, nameLoaded]);

    // Hooks run before the loading return below, so derive dirty from the raw
    // person, and only once the name has loaded (it starts empty).
    const changed =
        nameLoaded &&
        !!person &&
        (name.trim() !== person.name || sharesHousehold === !!person.excludeFromHouseholdShare);
    const leave = useDiscardGuard(changed);

    const handleSavePerson = async () => {
        if (!person || !name.trim()) return;
        const result = await updatePerson({
            ...person,
            name: name.trim(),
            excludeFromHouseholdShare: sharesHousehold ? undefined : true,
        });
        if (result.success) leave(() => onSuccess?.() || onClose());
        else Alert.alert('Couldn’t save', 'Please try again.');
    };

    const handleDeletePerson = () => {
        if (!person) return;
        Alert.alert(
            `Delete ${person.name}?`,
            'This also removes their income and personal expenses. It can’t be undone.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        setIsDeletingPerson(true);
                        const result = await removePerson(person.id);
                        setIsDeletingPerson(false);
                        if (result.success) leave(() => onSuccess?.() || onClose());
                    },
                },
            ]
        );
    };

    const handleAddIncome = useCallback(
        async (forPersonId: string, incomeData: Omit<Income, 'id' | 'personId'>) => {
            const income: Income = {
                id: `income_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
                personId: forPersonId,
                ...incomeData,
            };
            return addIncome(forPersonId, income);
        },
        [addIncome]
    );

    if (!person) {
        return (
            <>
                <StandardHeader title="Edit person" onLeftPress={onClose} confirm={{ onPress: () => {}, disabled: true }} />
                <View style={{ padding: space.s5, gap: space.s3 }}>
                    <Skeleton height={48} />
                    <Skeleton height={160} />
                </View>
            </>
        );
    }

    const monthlyIncome = calculateMonthlyAmount(calculatePersonIncome(person), 'yearly');
    // Someone has to cover shared costs, so the last person sharing them can't opt out.
    const othersSharing = data.people.some((p) => p.id !== person.id && !p.excludeFromHouseholdShare);
    const canToggleShare = othersSharing || !sharesHousehold;
    const firstName = name.trim() || person.name;

    return (
        <>
            <StandardHeader
                title="Edit person"
                onLeftPress={() => confirmDiscard(changed, () => leave(onClose))}
                confirm={{
                    onPress: handleSavePerson,
                    dirty: changed,
                    disabled: !name.trim() || !changed,
                    loading: saving && !isDeletingPerson,
                    accessibilityLabel: 'Save changes',
                }}
            />
            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ padding: space.s5, paddingBottom: scrollBottomPadding }}
                keyboardShouldPersistTaps="handled"
            >
                <Input label="Name" value={name} onChangeText={setName} placeholder="Name" maxLength={50} />

                <ListGroup
                    header="Household costs"
                    footer={
                        !canToggleShare
                            ? 'Someone has to cover household costs. Add another person who shares them to turn this off.'
                            : sharesHousehold
                                ? `${firstName} pays a share of household expenses.`
                                : `${firstName} pays nothing toward household expenses. Everyone else splits them.`
                    }
                    style={{ marginTop: space.s6 }}
                >
                    <ListRow
                        title="Share household costs"
                        icon="home-outline"
                        iconColor={tokens.colors.household}
                        showSeparator={false}
                        trailing={
                            <Switch
                                value={sharesHousehold}
                                onValueChange={setSharesHousehold}
                                disabled={!canToggleShare}
                                accessibilityLabel="Share household costs"
                                trackColor={{ false: tokens.colors.borderStrong, true: tokens.colors.brand }}
                                thumbColor={tokens.colors.switchThumb}
                                // @ts-ignore web-only prop on react-native-web's Switch
                                activeThumbColor={tokens.colors.switchThumb}
                            />
                        }
                    />
                </ListGroup>

                <ListGroup
                    header="Income"
                    footer={`${formatCurrency(monthlyIncome)} a month in total. Income changes save straight away.`}
                >
                    {person.income.map((income) => (
                        <ListRow
                            key={income.id}
                            title={income.label}
                            caption={income.frequency.charAt(0).toUpperCase() + income.frequency.slice(1)}
                            icon="trending-up-outline"
                            iconColor={tokens.colors.income}
                            trailing={<AmountText value={income.amount} role="bodyMed" />}
                            chevron
                            onPress={() =>
                                // Drop the discard guard first; it re-arms on return if the name is still edited.
                                leave(() => router.push({ pathname: '/edit-income', params: { personId: person.id, incomeId: income.id } }))
                            }
                            accessibilityLabel={`${income.label}, ${formatCurrency(income.amount)} ${income.frequency}. Edit`}
                        />
                    ))}
                    <ListRow
                        title="Add income"
                        icon="add"
                        iconColor={tokens.colors.brand}
                        onPress={() => setShowAddIncome(true)}
                        showSeparator={false}
                    />
                </ListGroup>

                <Button
                    text="Delete person"
                    variant="ghost"
                    onPress={handleDeletePerson}
                    loading={isDeletingPerson}
                    textStyle={{ color: tokens.colors.danger }}
                    style={{ marginTop: 0 }}
                />
            </ScrollView>

            <IncomeModal
                visible={showAddIncome}
                onClose={() => setShowAddIncome(false)}
                onAddIncome={handleAddIncome}
                people={[person]}
                selectedPersonId={person.id}
                saving={saving}
            />
        </>
    );
}
