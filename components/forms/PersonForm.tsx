
import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Modal as RNModal, StyleSheet } from 'react-native';
import { useBudgetData } from '../../hooks/useBudgetData';
import { useTheme } from '../../hooks/useTheme';
import { useThemedStyles } from '../../hooks/useThemedStyles';
import { useCurrency } from '../../hooks/useCurrency';
import { Alert } from '../../utils/alert';
import Icon from '../Icon';
import Button from '../Button';
import CurrencyInput from '../CurrencyInput';
import { Person, Income, Frequency } from '../../types/budget';
import {
    calculatePersonIncome,
    calculateMonthlyAmount,
    calculatePersonalExpenses,
    calculateHouseholdShare,
    calculateHouseholdExpenses
} from '../../utils/calculations';

interface PersonFormProps {
    personId?: string;
    onClose: () => void;
    onSuccess?: () => void;
}

export default function PersonForm({ personId, onClose, onSuccess }: PersonFormProps) {
    const { data, updatePerson, removePerson, addIncome, removeIncome, saving, loading, refreshData } = useBudgetData();
    const { currentColors } = useTheme();
    const { themedStyles } = useThemedStyles();
    const { formatCurrency } = useCurrency();

    const [person, setPerson] = useState<Person | null>(null);
    const [showAddIncome, setShowAddIncome] = useState(false);
    const [editingIncome, setEditingIncome] = useState<Income | null>(null);
    const [newIncome, setNewIncome] = useState({
        amount: '',
        label: '',
        frequency: 'monthly' as Frequency,
    });

    const [isDeletingPerson, setIsDeletingPerson] = useState(false);
    const [deletingIncomeId, setDeletingIncomeId] = useState<string | null>(null);

    useEffect(() => {
        if (personId) {
            const found = data.people.find(p => p.id === personId);
            if (found) setPerson(found);
        }
    }, [personId, data.people]);

    const handleSavePerson = async () => {
        if (!person) return;
        const result = await updatePerson(person);
        if (result.success) onSuccess?.() || onClose();
        else Alert.alert('Error', 'Failed to update person');
    };

    const handleDeletePerson = () => {
        if (!person) return;
        Alert.alert('Delete Person', `Are you sure you want to delete ${person.name}?`, [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Delete', style: 'destructive', onPress: async () => {
                    setIsDeletingPerson(true);
                    const result = await removePerson(person.id);
                    setIsDeletingPerson(false);
                    if (result.success) onSuccess?.() || onClose();
                }
            }
        ]);
    };

    const handleAddOrUpdateIncome = async () => {
        if (!person || !newIncome.amount || !newIncome.label.trim()) return;

        const incomeData: Income = {
            id: editingIncome?.id || `income_${Date.now()}`,
            amount: parseFloat(newIncome.amount),
            label: newIncome.label.trim(),
            frequency: newIncome.frequency,
            personId: person.id,
        };

        if (editingIncome) {
            // Logic for updating income (remove then add for simplicity in this version, 
            // or we could add updateIncome to useBudgetData if it exists)
            await removeIncome(person.id, editingIncome.id);
        }

        const result = await addIncome(person.id, incomeData);
        if (result.success) {
            setNewIncome({ amount: '', label: '', frequency: 'monthly' });
            setShowAddIncome(false);
            setEditingIncome(null);
        }
    };

    if (!person && personId) return <ActivityIndicator style={{ padding: 40 }} />;

    const totalIncome = person ? calculatePersonIncome(person) : 0;
    const monthlyIncome = calculateMonthlyAmount(totalIncome, 'yearly');

    return (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 24, paddingBottom: 100 }}>
            {person && (
                <View style={{ gap: 24 }}>
                    {/* Name */}
                    <View style={themedStyles.section}>
                        <Text style={[themedStyles.text, { fontWeight: '600', marginBottom: 8 }]}>Name</Text>
                        <TextInput
                            style={themedStyles.input}
                            value={person.name}
                            onChangeText={(text) => setPerson({ ...person, name: text })}
                            placeholder="Person's name"
                            placeholderTextColor={currentColors.textSecondary}
                        />
                    </View>

                    {/* Income Summary */}
                    <View style={[themedStyles.card, { backgroundColor: currentColors.backgroundAlt }]}>
                        <Text style={[themedStyles.subtitle, { marginBottom: 12 }]}>Income Summary</Text>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                            <Text style={themedStyles.text}>Monthly Income:</Text>
                            <Text style={[themedStyles.text, { color: currentColors.income, fontWeight: '700' }]}>
                                {formatCurrency(monthlyIncome)}
                            </Text>
                        </View>
                    </View>

                    {/* Income Sources */}
                    <View>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                            <Text style={themedStyles.subtitle}>Income Sources</Text>
                            <TouchableOpacity
                                onPress={() => {
                                    setEditingIncome(null);
                                    setNewIncome({ amount: '', label: '', frequency: 'monthly' });
                                    setShowAddIncome(true);
                                }}
                                style={{ backgroundColor: currentColors.income + '20', padding: 8, borderRadius: 12 }}
                            >
                                <Icon name="add" size={20} style={{ color: currentColors.income }} />
                            </TouchableOpacity>
                        </View>

                        <View style={{ gap: 12 }}>
                            {person.income.map((income) => (
                                <View key={income.id} style={themedStyles.card}>
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <View>
                                            <Text style={[themedStyles.text, { fontWeight: '600' }]}>{income.label}</Text>
                                            <Text style={themedStyles.textSecondary}>{formatCurrency(income.amount)} • {income.frequency}</Text>
                                        </View>
                                        <View style={{ flexDirection: 'row', gap: 12 }}>
                                            <TouchableOpacity onPress={() => {
                                                setEditingIncome(income);
                                                setNewIncome({ amount: income.amount.toString(), label: income.label, frequency: income.frequency });
                                                setShowAddIncome(true);
                                            }}>
                                                <Icon name="pencil" size={18} style={{ color: currentColors.primary }} />
                                            </TouchableOpacity>
                                            <TouchableOpacity onPress={() => removeIncome(person.id, income.id)}>
                                                <Icon name="trash-outline" size={18} style={{ color: currentColors.error }} />
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                </View>
                            ))}
                            {person.income.length === 0 && (
                                <Text style={[themedStyles.textSecondary, { textAlign: 'center', padding: 20 }]}>No income sources yet</Text>
                            )}
                        </View>
                    </View>

                    {/* Danger Zone */}
                    <View style={{ marginTop: 20, padding: 20, borderRadius: 16, borderWidth: 1, borderColor: currentColors.error + '40', backgroundColor: currentColors.error + '05' }}>
                        <Text style={[themedStyles.text, { color: currentColors.error, fontWeight: '700', marginBottom: 8 }]}>Danger Zone</Text>
                        <Button text="Delete Person" variant="danger" onPress={handleDeletePerson} loading={isDeletingPerson} />
                    </View>

                    {/* Save Button */}
                    <Button text="Save Changes" variant="primary" onPress={handleSavePerson} loading={saving} />
                </View>
            )}

            {/* Add/Edit Income Modal */}
            <RNModal visible={showAddIncome} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={[styles.miniModal, { backgroundColor: currentColors.background }]}>
                        <Text style={[themedStyles.subtitle, { marginBottom: 16 }]}>{editingIncome ? 'Edit Income' : 'Add Income'}</Text>
                        <View style={{ gap: 16 }}>
                            <View>
                                <Text style={[themedStyles.text, { fontWeight: '600', marginBottom: 8 }]}>Label</Text>
                                <TextInput
                                    style={themedStyles.input}
                                    value={newIncome.label}
                                    onChangeText={(t) => setNewIncome({ ...newIncome, label: t })}
                                    placeholder="e.g. Salary"
                                />
                            </View>
                            <CurrencyInput
                                label="Amount"
                                value={newIncome.amount}
                                onChangeText={(t) => setNewIncome({ ...newIncome, amount: t })}
                            />
                            <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
                                <Button text="Cancel" variant="outline" onPress={() => setShowAddIncome(false)} style={{ flex: 1 }} />
                                <Button text={editingIncome ? 'Update' : 'Add'} onPress={handleAddOrUpdateIncome} style={{ flex: 1 }} />
                            </View>
                        </View>
                    </View>
                </View>
            </RNModal>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    miniModal: {
        width: '100%',
        maxWidth: 400,
        padding: 24,
        borderRadius: 24,
    }
});
