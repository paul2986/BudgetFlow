
import { useState, useEffect, useCallback, useRef } from 'react';
import { useBudgetData } from '../../hooks/useBudgetData';
import { View, Text, ScrollView } from 'react-native';
import { Alert } from '../../utils/alert';
import { useTheme } from '../../hooks/useTheme';
import { bottomClearance } from '../../hooks/useBreakpoint';
import Button from '../Button';
import CurrencyInput from '../CurrencyInput';
import { ChoicePills, DateField, Input, SegmentedControl, Sheet } from '../ui';
import { type, space } from '../../styles/tokens';
import { Expense, ExpenseCategory, DEFAULT_CATEGORIES, Person } from '../../types/budget';
import { getCustomExpenseCategories, saveCustomExpenseCategories, normalizeCategoryName } from '../../utils/storage';

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
    const { tokens } = useTheme();

    const [description, setDescription] = useState('');
    const [amount, setAmount] = useState('');
    const [category, setCategory] = useState<'household' | 'personal'>('household');
    const [frequency, setFrequency] = useState<'daily' | 'weekly' | 'monthly' | 'yearly' | 'one-time'>('monthly');
    const [personId, setPersonId] = useState<string>('');
    const [categoryTag, setCategoryTag] = useState<ExpenseCategory>('Misc');
    const [debtRepayment, setDebtRepayment] = useState<'loan' | 'mortgage' | 'credit_card' | undefined>(undefined);
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
            setDebtRepayment(expenseToEdit.debtRepayment || undefined);

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
                personId: category === 'household' ? undefined : (actualPersonId || undefined),
                date: new Date(startDateYMD + 'T00:00:00Z').toISOString(),
                notes: '',
                categoryTag: categoryTag || 'Misc',
                endDate: endDate ? toYMD(endDate) : undefined,
                debtRepayment: debtRepayment || undefined,
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

    const canSave = !!description.trim() && !!amount && parseFloat(amount) > 0 && (category === 'household' || !!personId);
    const closeAddPerson = () => {
        setShowAddPersonModal(false);
        setNewPersonName('');
    };
    const confirmAddPerson = () => {
        if (!newPersonName.trim()) return;
        const temp: TempPerson = { id: `temp_${Date.now()}`, name: newPersonName.trim(), isTemp: true };
        setTempPeople(prev => [...prev, temp]);
        setPersonId(temp.id);
        closeAddPerson();
    };

    return (
        <>
        <ScrollView
            ref={scrollViewRef}
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: space.s5, paddingBottom: bottomClearance(space.s10), gap: space.s5 }}
            keyboardShouldPersistTaps="handled"
        >
            <Input
                label="Description"
                value={description}
                onChangeText={setDescription}
                placeholder="e.g. Council tax"
                returnKeyType="next"
                autoFocus={!isEditMode}
            />

            <CurrencyInput label="Amount" value={amount} onChangeText={setAmount} />

            <ChoicePills
                label="How often"
                value={frequency}
                onChange={(f) => setFrequency(f)}
                options={[
                    { value: 'one-time', label: 'Once' },
                    { value: 'daily', label: 'Daily' },
                    { value: 'weekly', label: 'Weekly' },
                    { value: 'monthly', label: 'Monthly' },
                    { value: 'yearly', label: 'Yearly' },
                ]}
            />

            <View>
                <Text style={[type.caption, { color: tokens.colors.textMuted, marginBottom: space.s2 }]}>Who pays</Text>
                <SegmentedControl<'household' | 'personal'>
                    label="Who pays"
                    value={category}
                    onChange={setCategory}
                    options={[
                        { value: 'household', label: 'Household' },
                        { value: 'personal', label: 'One person' },
                    ]}
                />
                <Text style={[type.caption, { color: tokens.colors.textFaint, marginTop: space.s1 }]}>
                    {category === 'household'
                        ? 'Shared costs are split between everyone in the budget.'
                        : 'Only counts against the person you choose.'}
                </Text>
            </View>

            {category === 'personal' ? (
                <ChoicePills
                    label="Person"
                    value={personId || undefined}
                    onChange={setPersonId}
                    options={getAllPeople().map(p => ({ value: p.id, label: p.name, icon: 'person-outline' }))}
                    addLabel="New person"
                    onAdd={() => setShowAddPersonModal(true)}
                />
            ) : null}

            <ChoicePills
                label="Category"
                value={categoryTag}
                onChange={(tag) => setCategoryTag(tag as any)}
                options={getAllCategories().map(tag => ({ value: tag, label: tag }))}
            />

            <ChoicePills<'none' | 'loan' | 'mortgage' | 'credit_card'>
                label="Debt repayment"
                value={debtRepayment ?? 'none'}
                onChange={(v) => setDebtRepayment(v === 'none' ? undefined : v)}
                options={[
                    { value: 'none', label: 'Not a debt' },
                    { value: 'loan', label: 'Loan', icon: 'cash-outline' },
                    { value: 'mortgage', label: 'Mortgage', icon: 'business-outline' },
                    { value: 'credit_card', label: 'Credit card', icon: 'card-outline' },
                ]}
            />

            {frequency !== 'one-time' ? (
                <DateField
                    label="End date"
                    value={endDate}
                    onChange={setEndDate}
                    placeholder="No end date"
                    helperText="Optional. The expense stops counting after this date."
                />
            ) : null}

            <View style={{ marginTop: space.s2 }}>
                <Button
                    text={isEditMode ? 'Save changes' : 'Add expense'}
                    onPress={handleSaveExpense}
                    size="lg"
                    loading={isSaving}
                    disabled={!canSave}
                    style={{ marginTop: 0 }}
                />
                {isEditMode ? (
                    <Button
                        text="Delete expense"
                        onPress={handleDeleteExpense}
                        variant="ghost"
                        loading={deleting}
                        textStyle={{ color: tokens.colors.danger }}
                        style={{ marginTop: space.s2 }}
                    />
                ) : null}
            </View>
        </ScrollView>

        <Sheet
            visible={showAddPersonModal}
            onClose={closeAddPerson}
            title="New person"
            leadingAction={{ label: 'Cancel', onPress: closeAddPerson }}
            trailingAction={{ label: 'Add', onPress: confirmAddPerson, disabled: !newPersonName.trim() }}
            width={420}
        >
            <View style={{ padding: space.s5 }}>
                <Input
                    label="Name"
                    value={newPersonName}
                    onChangeText={setNewPersonName}
                    autoFocus
                    maxLength={50}
                    returnKeyType="done"
                    onSubmitEditing={confirmAddPerson}
                    helperText="They'll be added to this budget when you save the expense."
                />
            </View>
        </Sheet>
        </>
    );
}
