import React, { useState, useCallback, useRef } from 'react';
import { View, Text, ScrollView, TextInput, StyleSheet, Switch } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useBudgetData } from '../../hooks/useBudgetData';
import { useTheme } from '../../hooks/useTheme';
import { useScrollBottomPadding } from '../../hooks/useBreakpoint';
import { useDiscardGuard } from '../../hooks/useDiscardGuard';
import { Alert, confirmDiscard } from '../../utils/alert';
import StandardHeader from '../StandardHeader';
import CurrencyInput from '../CurrencyInput';
import { IconButton, Input, ListGroup, ListRow, SegmentedControl } from '../ui';
import { Income, Person } from '../../types/budget';
import { type, space } from '../../styles/tokens';

/**
 * Add a person, whether they share household costs, and any number of income
 * sources, in one save. Income is
 * optional: sources left completely blank are skipped, but a half-filled one
 * (source without amount, or the reverse) holds the save until it's finished
 * or removed.
 *
 * Income is entered inline rather than through /edit-income, which saves to
 * an existing person; this one doesn't exist until the ✓.
 */

type IncomeFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly';

type DraftIncome = { key: number; label: string; amount: string; frequency: IncomeFrequency };

const FREQUENCIES: { value: IncomeFrequency; label: string }[] = [
    { value: 'daily', label: 'Daily' },
    { value: 'weekly', label: 'Weekly' },
    { value: 'monthly', label: 'Monthly' },
    { value: 'yearly', label: 'Yearly' },
];

const isBlank = (d: DraftIncome) => !d.label.trim() && !d.amount;
const isComplete = (d: DraftIncome) => !!d.label.trim() && parseFloat(d.amount) > 0;

const newId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

interface NewPersonFormProps {
    onClose: () => void;
}

export default function NewPersonForm({ onClose }: NewPersonFormProps) {
    const { data, addPerson, saving } = useBudgetData();
    const { tokens } = useTheme();
    const scrollBottomPadding = useScrollBottomPadding();

    const [name, setName] = useState('');
    const [sharesHousehold, setSharesHousehold] = useState(true);
    const [drafts, setDrafts] = useState<DraftIncome[]>([]);
    const nextKey = useRef(0);

    const filled = drafts.filter((d) => !isBlank(d));
    const incomplete = filled.some((d) => !isComplete(d));
    const changed = !!name.trim() || filled.length > 0 || !sharesHousehold;
    // Someone has to cover shared costs, so with nobody else sharing them the
    // new person can't opt out.
    const canToggleShare = data.people.some((p) => !p.excludeFromHouseholdShare) || !sharesHousehold;
    const firstName = name.trim() || 'This person';
    const canSave = !!name.trim() && !incomplete && !saving;
    const leave = useDiscardGuard(changed);

    // Focus the name when the screen appears, not on mount; see ExpenseForm
    // for why (hidden mount, and scrolling would cancel the slide).
    const nameRef = useRef<TextInput>(null);
    useFocusEffect(
        useCallback(() => {
            (nameRef.current as unknown as { focus: (o?: FocusOptions) => void } | null)?.focus({ preventScroll: true });
        }, [])
    );

    const updateDraft = (key: number, patch: Partial<DraftIncome>) =>
        setDrafts((list) => list.map((d) => (d.key === key ? { ...d, ...patch } : d)));

    const addDraft = () =>
        setDrafts((list) => [...list, { key: nextKey.current++, label: '', amount: '', frequency: 'monthly' }]);

    const removeDraft = (key: number) => setDrafts((list) => list.filter((d) => d.key !== key));

    const handleSave = async () => {
        if (!canSave) return;
        const personId = newId('person');
        const income: Income[] = filled.map((d) => ({
            id: newId('income'),
            personId,
            label: d.label.trim(),
            amount: parseFloat(d.amount),
            frequency: d.frequency,
        }));
        const person: Person = {
            id: personId,
            name: name.trim(),
            income,
            ...(sharesHousehold ? null : { excludeFromHouseholdShare: true }),
        };
        const result = await addPerson(person);
        if (result.success) leave(onClose);
        else Alert.alert('Couldn’t add person', 'Please try again.');
    };

    return (
        <>
            <StandardHeader
                title="Add person"
                onLeftPress={() => confirmDiscard(changed, () => leave(onClose))}
                confirm={{
                    onPress: handleSave,
                    dirty: changed,
                    disabled: !canSave,
                    loading: saving,
                    accessibilityLabel: 'Add person',
                }}
            />
            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ padding: space.s5, paddingBottom: scrollBottomPadding }}
                keyboardShouldPersistTaps="handled"
            >
                <Input
                    ref={nameRef}
                    label="Name"
                    value={name}
                    onChangeText={setName}
                    placeholder="e.g. Sam"
                    maxLength={50}
                    editable={!saving}
                />

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
                                disabled={!canToggleShare || saving}
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
                    footer={
                        incomplete
                            ? 'Each income needs a source and an amount. Finish or remove it to add this person.'
                            : 'Optional. You can add or change income later.'
                    }
                >
                    {drafts.map((draft, i) => (
                        <View
                            key={draft.key}
                            style={{
                                padding: space.s4,
                                gap: space.s4,
                                borderBottomWidth: StyleSheet.hairlineWidth,
                                borderBottomColor: tokens.colors.borderStrong,
                            }}
                        >
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                <Text style={[type.bodyMed, { color: tokens.colors.text }]}>Income {i + 1}</Text>
                                <IconButton
                                    icon="trash-outline"
                                    color={tokens.colors.danger}
                                    accessibilityLabel={`Remove income ${i + 1}`}
                                    onPress={() => removeDraft(draft.key)}
                                    disabled={saving}
                                />
                            </View>
                            <Input
                                label="Source"
                                value={draft.label}
                                onChangeText={(label) => updateDraft(draft.key, { label })}
                                placeholder="e.g. Salary, freelance, benefits"
                                editable={!saving}
                                // Added by a tap on a screen already in place, so no slide to disturb.
                                autoFocus
                            />
                            <CurrencyInput
                                label="Amount"
                                value={draft.amount}
                                onChangeText={(amount) => updateDraft(draft.key, { amount })}
                                editable={!saving}
                            />
                            <View>
                                <Text style={[type.caption, { color: tokens.colors.textMuted, marginBottom: space.s2 }]}>How often</Text>
                                <SegmentedControl<IncomeFrequency>
                                    label="How often"
                                    value={draft.frequency}
                                    onChange={(frequency) => updateDraft(draft.key, { frequency })}
                                    options={FREQUENCIES}
                                />
                            </View>
                        </View>
                    ))}
                    <ListRow
                        title={drafts.length ? 'Add another income' : 'Add income'}
                        icon="add"
                        iconColor={tokens.colors.brand}
                        onPress={saving ? undefined : addDraft}
                        showSeparator={false}
                    />
                </ListGroup>
            </ScrollView>
        </>
    );
}
