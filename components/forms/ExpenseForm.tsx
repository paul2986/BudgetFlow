
import { useState, useEffect, useCallback, useRef } from 'react';
import { useBudgetData } from '../../hooks/useBudgetData';
import { View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Modal as RNModal, Platform, StyleSheet } from 'react-native';
import { Alert } from '../../utils/alert';
import { useTheme } from '../../hooks/useTheme';
import { useThemedStyles } from '../../hooks/useThemedStyles';
import { useCurrency } from '../../hooks/useCurrency';
import Button from '../Button';
import CurrencyInput from '../CurrencyInput';
import Icon from '../Icon';
import { Expense, ExpenseCategory, DEFAULT_CATEGORIES, Person } from '../../types/budget';
import { getCustomExpenseCategories, saveCustomExpenseCategories, normalizeCategoryName } from '../../utils/storage';
import DateTimePicker from '@react-native-community/datetimepicker';

const EXPENSE_CATEGORIES: ExpenseCategory[] = DEFAULT_CATEGORIES;

type TempPerson = {
    id: string;
    name: string;
    isTemp: true;
};

type TempCategory = {
    name: string;
    isTemp: true;
};

const safeAsync = async <T,>(
    operation: () => Promise<T>,
    fallback: T,
    operationName: string
): Promise<T> => {
    try {
        const result = await operation();
        return result;
    } catch (error) {
        console.error(`ExpenseForm: Error in ${operationName}:`, error);
        return fallback;
    }
};

interface ExpenseFormProps {
    id?: string;
    onClose: () => void;
    onSuccess?: () => void;
}

export default function ExpenseForm({ id, onClose, onSuccess }: ExpenseFormProps) {
    const { data, addExpense, updateExpense, removeExpense, addPerson, saving, refreshTrigger } = useBudgetData();
    const { currentColors, isDarkMode } = useTheme();
    const { themedStyles, isPad } = useThemedStyles();
    const { formatCurrency } = useCurrency();

    const [description, setDescription] = useState('');
    const [amount, setAmount] = useState('');
    const [category, setCategory] = useState<'household' | 'personal'>('household');
    const [frequency, setFrequency] = useState<'daily' | 'weekly' | 'monthly' | 'yearly' | 'one-time'>('monthly');
    const [personId, setPersonId] = useState<string>('');
    const [categoryTag, setCategoryTag] = useState<ExpenseCategory>('Misc');
    const [deleting, setDeleting] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const [tempPeople, setTempPeople] = useState<TempPerson[]>([]);
    const [tempCategories, setTempCategories] = useState<TempCategory[]>([]);

    const toYMD = (d: Date): string => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    };

    const [startDateYMD, setStartDateYMD] = useState<string>(toYMD(new Date()));
    const [endDate, setEndDate] = useState<Date | null>(null);
    const [showEndPicker, setShowEndPicker] = useState(false);
    const [showStartPicker, setShowStartPicker] = useState(false);

    const [customCategories, setCustomCategories] = useState<string[]>([]);
    const [showCustomModal, setShowCustomModal] = useState(false);
    const [newCustomName, setNewCustomName] = useState('');
    const [customError, setCustomError] = useState<string | null>(null);

    const [showAddPersonModal, setShowAddPersonModal] = useState(false);
    const [newPersonName, setNewPersonName] = useState('');
    const [addingPerson, setAddingPerson] = useState(false);

    const scrollViewRef = useRef<ScrollView>(null);
    const isEditMode = !!id;
    const expenseToEdit = isEditMode ? data.expenses.find(e => e.id === id) : null;

    const getAllPeople = useCallback(() => [...data.people, ...tempPeople], [data.people, tempPeople]);
    const getAllCategories = useCallback(() => {
        const tempCategoryNames = tempCategories.map(tc => tc.name);
        return [...EXPENSE_CATEGORIES, ...customCategories, ...tempCategoryNames];
    }, [customCategories, tempCategories]);

    useEffect(() => {
        const loadCustomCategories = async () => {
            const list = await safeAsync(() => getCustomExpenseCategories(), [], 'getCustomExpenseCategories');
            setCustomCategories(list);
        };
        loadCustomCategories();
    }, []);

    useEffect(() => {
        if (isEditMode && expenseToEdit) {
            setDescription(expenseToEdit.description || '');
            setAmount(expenseToEdit.amount?.toString() || '');
            setCategory(expenseToEdit.category || 'household');
            setFrequency((expenseToEdit.frequency as any) || 'monthly');
            setPersonId(expenseToEdit.personId || '');
            setCategoryTag(normalizeCategoryName((expenseToEdit.categoryTag as any) || 'Misc') as any);

            try {
                const d = new Date(expenseToEdit.date);
                if (!isNaN(d.getTime())) setStartDateYMD(toYMD(d));
            } catch (e) { }

            const endDateValue = (expenseToEdit as any).endDate;
            if (endDateValue) {
                try {
                    const endDateObj = new Date(endDateValue + 'T00:00:00');
                    if (!isNaN(endDateObj.getTime())) setEndDate(endDateObj);
                } catch (e) { }
            } else {
                setEndDate(null);
            }
        }
    }, [isEditMode, expenseToEdit]);

    const handleSaveExpense = async () => {
        if (!description.trim() || !amount || parseFloat(amount) <= 0) {
            Alert.alert('Error', 'Please fill in all required fields');
            return;
        }

        try {
            setIsSaving(true);
            let actualPersonId = personId;

            // Handle temp person creation
            for (const tempPerson of tempPeople) {
                if (tempPerson.id === personId) {
                    const newPerson: Person = {
                        id: `person_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                        name: tempPerson.name,
                        income: [],
                    };
                    await addPerson(newPerson);
                    actualPersonId = newPerson.id;
                }
            }

            const expenseData: Expense = {
                id: isEditMode ? id! : `expense_${Date.now()}`,
                description: description.trim(),
                amount: parseFloat(amount),
                category,
                frequency,
                personId: actualPersonId || undefined,
                date: new Date(startDateYMD + 'T00:00:00Z').toISOString(),
                notes: '',
                categoryTag: categoryTag || 'Misc',
                endDate: endDate ? toYMD(endDate) : undefined,
            };

            const result = isEditMode ? await updateExpense(expenseData) : await addExpense(expenseData);

            if (result.success) {
                onSuccess?.() || onClose();
            } else {
                Alert.alert('Error', result.error?.message || 'Failed to save expense');
            }
        } catch (error) {
            Alert.alert('Error', 'An unexpected error occurred');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteExpense = async () => {
        if (!id) return;
        Alert.alert('Delete Expense', 'Are you sure?', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Delete', style: 'destructive', onPress: async () => {
                    setDeleting(true);
                    const result = await removeExpense(id);
                    setDeleting(false);
                    if (result.success) onSuccess?.() || onClose();
                }
            }
        ]);
    };

    return (
        <ScrollView
            ref={scrollViewRef}
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 24, paddingBottom: 100 }}
        >
            <View>
                {/* Basic Info */}
                <View style={themedStyles.section}>
                    <Text style={[themedStyles.text, { fontWeight: '600', marginBottom: 8 }]}>Description *</Text>
                    <TextInput
                        style={themedStyles.input}
                        value={description}
                        onChangeText={setDescription}
                        placeholder="What was this for?"
                        placeholderTextColor={currentColors.textSecondary}
                    />
                </View>

                <CurrencyInput
                    label="Amount *"
                    value={amount}
                    onChangeText={setAmount}
                />

                {/* Ownership */}
                <View style={themedStyles.section}>
                    <Text style={[themedStyles.text, { fontWeight: '600', marginBottom: 8 }]}>Expense Type</Text>
                    <View style={{ flexDirection: 'row', gap: 12 }}>
                        <TouchableOpacity
                            onPress={() => setCategory('household')}
                            style={[styles.typeBadge, {
                                backgroundColor: category === 'household' ? currentColors.household : currentColors.border,
                                flex: 1
                            }]}
                        >
                            <Text style={{ color: category === 'household' ? '#FFF' : currentColors.text, fontWeight: '700', textAlign: 'center' }}>Household</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={() => setCategory('personal')}
                            style={[styles.typeBadge, {
                                backgroundColor: category === 'personal' ? currentColors.personal : currentColors.border,
                                flex: 1
                            }]}
                        >
                            <Text style={{ color: category === 'personal' ? '#FFF' : currentColors.text, fontWeight: '700', textAlign: 'center' }}>Personal</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Person Selection (if personal) */}
                {category === 'personal' && (
                    <View style={themedStyles.section}>
                        <Text style={[themedStyles.text, { fontWeight: '600', marginBottom: 8 }]}>Assign to Person *</Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                            {getAllPeople().map(p => (
                                <TouchableOpacity
                                    key={p.id}
                                    onPress={() => setPersonId(p.id)}
                                    style={[styles.badge, {
                                        backgroundColor: personId === p.id ? currentColors.secondary : currentColors.border
                                    }]}
                                >
                                    <Text style={{ color: personId === p.id ? '#FFF' : currentColors.text, fontWeight: '600' }}>{p.name}</Text>
                                </TouchableOpacity>
                            ))}
                            <TouchableOpacity
                                onPress={() => setShowAddPersonModal(true)}
                                style={[styles.badge, { borderColor: currentColors.primary, borderWidth: 1 }]}
                            >
                                <Icon name="add" size={16} color={currentColors.primary} />
                                <Text style={{ color: currentColors.primary, fontWeight: '600', marginLeft: 4 }}>New Person</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                )}

                {/* Category Tags */}
                <View style={themedStyles.section}>
                    <Text style={[themedStyles.text, { fontWeight: '600', marginBottom: 8 }]}>Category</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                        {getAllCategories().map(tag => (
                            <TouchableOpacity
                                key={tag}
                                onPress={() => setCategoryTag(tag as any)}
                                style={[styles.badge, {
                                    backgroundColor: categoryTag === tag ? currentColors.secondary : currentColors.border
                                }]}
                            >
                                <Text style={{ color: categoryTag === tag ? '#FFF' : currentColors.text, fontWeight: '600' }}>{tag}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>

                {/* Optional End Date */}
                {frequency !== 'one-time' && (
                    <View style={themedStyles.section}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <Text style={[themedStyles.text, { fontWeight: '600' }]}>End Date (Optional)</Text>
                            {endDate && (
                                <TouchableOpacity onPress={() => setEndDate(null)}>
                                    <Text style={{ color: currentColors.error, fontSize: 13, fontWeight: '600' }}>Clear</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                        {Platform.OS === 'web' ? (
                            <View style={[themedStyles.input, { padding: 0, justifyContent: 'center', overflow: 'hidden' }]}>
                                <input
                                    type="date"
                                    value={endDate ? toYMD(endDate) : ''}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        if (val) {
                                            const d = new Date(val + 'T00:00:00');
                                            if (!isNaN(d.getTime())) setEndDate(d);
                                        } else {
                                            setEndDate(null);
                                        }
                                    }}
                                    onClick={(e) => {
                                        try {
                                            // @ts-ignore
                                            if (e.target.showPicker) e.target.showPicker();
                                        } catch (err) { }
                                    }}
                                    placeholder="No end date"
                                    style={{
                                        background: 'transparent',
                                        border: 'none',
                                        color: endDate ? currentColors.text : currentColors.textSecondary,
                                        width: '100%',
                                        // @ts-ignore
                                        height: '60px',
                                        padding: '0 16px',
                                        outline: 'none',
                                        fontSize: '16px',
                                        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
                                        cursor: 'pointer',
                                        boxSizing: 'border-box',
                                        colorScheme: isDarkMode ? 'dark' : 'light',
                                    }}
                                />
                            </View>
                        ) : (
                            <>
                                <TouchableOpacity
                                    onPress={() => setShowEndPicker(true)}
                                    style={[themedStyles.input, { marginBottom: 0 }]}
                                >
                                    <Text style={[themedStyles.text, { color: endDate ? currentColors.text : currentColors.textSecondary }]}>
                                        {endDate ? toYMD(endDate) : 'No end date'}
                                    </Text>
                                </TouchableOpacity>
                                {showEndPicker && (
                                    <DateTimePicker
                                        value={endDate || new Date()}
                                        mode="date"
                                        onChange={(e, d) => {
                                            setShowEndPicker(false);
                                            if (d) setEndDate(d);
                                        }}
                                    />
                                )}
                            </>
                        )}
                        <Text style={[themedStyles.textSecondary, { marginTop: 8, fontSize: 12 }]}>
                            If set, the expense will stop appearing after this date.
                        </Text>
                    </View>
                )}

                {/* Recurring Frequency */}
                <View style={themedStyles.section}>
                    <Text style={[themedStyles.text, { fontWeight: '600', marginBottom: 8 }]}>Frequency</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                        {['one-time', 'daily', 'weekly', 'monthly', 'yearly'].map(f => (
                            <TouchableOpacity
                                key={f}
                                onPress={() => setFrequency(f as any)}
                                style={[styles.badge, {
                                    backgroundColor: frequency === f ? currentColors.primary : currentColors.border
                                }]}
                            >
                                <Text style={{ color: frequency === f ? '#FFF' : currentColors.text, fontWeight: '600' }}>
                                    {f === 'one-time' ? 'One-time' : f.charAt(0).toUpperCase() + f.slice(1)}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>

                {/* Actions */}
                <View style={{ flexDirection: 'row', gap: 12, marginTop: 24 }}>
                    {isEditMode && (
                        <Button
                            text="Delete"
                            onPress={handleDeleteExpense}
                            variant="danger"
                            style={{ flex: 1 }}
                            loading={deleting}
                        />
                    )}
                    <Button
                        text={isEditMode ? 'Update Expense' : 'Add Expense'}
                        onPress={handleSaveExpense}
                        variant="primary"
                        style={{ flex: 2 }}
                        loading={isSaving}
                    />
                </View>
            </View>

            {/* Add Person Modal */}
            <RNModal visible={showAddPersonModal} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={[styles.miniModal, { backgroundColor: currentColors.background }]}>
                        <Text style={[themedStyles.subtitle, { marginBottom: 16 }]}>Add Person</Text>
                        <TextInput
                            style={themedStyles.input}
                            placeholder="Name"
                            value={newPersonName}
                            onChangeText={setNewPersonName}
                            autoFocus
                        />
                        <View style={{ flexDirection: 'row', gap: 12 }}>
                            <Button text="Cancel" variant="outline" onPress={() => setShowAddPersonModal(false)} style={{ flex: 1 }} />
                            <Button text="Add" onPress={() => {
                                if (newPersonName.trim()) {
                                    const temp: TempPerson = { id: `temp_${Date.now()}`, name: newPersonName.trim(), isTemp: true };
                                    setTempPeople(prev => [...prev, temp]);
                                    setPersonId(temp.id);
                                    setNewPersonName('');
                                    setShowAddPersonModal(false);
                                }
                            }} style={{ flex: 1 }} />
                        </View>
                    </View>
                </View>
            </RNModal>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    typeBadge: {
        paddingVertical: 14,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    badge: {
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 20,
        flexDirection: 'row',
        alignItems: 'center',
    },
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
