
import { useState, useEffect, useCallback, useRef } from 'react';
import { useBudgetData } from '../../hooks/useBudgetData';
import { View, Text, ScrollView, TextInput } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Alert, confirmDiscard } from '../../utils/alert';
import { useTheme } from '../../hooks/useTheme';
import { useScrollBottomPadding, BOUNCE_MIN_HEIGHT } from '../../hooks/useBreakpoint';
import { useDiscardGuard } from '../../hooks/useDiscardGuard';
import Button from '../Button';
import StandardHeader from '../StandardHeader';
import CurrencyInput from '../CurrencyInput';
import { ChoicePills, DateField, Input, SegmentedControl } from '../ui';
import { type, space } from '../../styles/tokens';
import { BucketId, Expense, ExpenseCategory, DEFAULT_CATEGORIES, CATEGORY_BY_DEBT_REPAYMENT, debtRepaymentForCategory } from '../../types/budget';
import { categoryBucketLookup, isBucketId, resolveBucket } from '../../utils/budgetReview';
import { BUCKET_META, BUCKET_OPTIONS } from '../tools/bucketMeta';
import { getCustomExpenseCategories, normalizeCategoryName } from '../../utils/storage';
import { newPersonHandoff } from '../../utils/newPersonHandoff';
import { toYMD } from '../../utils/dates';

const EXPENSE_CATEGORIES: ExpenseCategory[] = DEFAULT_CATEGORIES;

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

type FormValues = {
    description: string;
    amount: string;
    category: 'household' | 'personal';
    frequency: 'daily' | 'weekly' | 'monthly' | 'yearly' | 'one-time';
    personId: string;
    categoryTag: ExpenseCategory;
    /** The bucket this expense chose for itself, or null to follow its category. */
    bucket: BucketId | null;
    startDateYMD: string;
    endDate: Date | null;
};

interface ExpenseFormProps {
    id?: string;
    onClose: () => void;
    onSuccess?: () => void;
}

export default function ExpenseForm({ id, onClose, onSuccess }: ExpenseFormProps) {
    const { data, activeBudget, addExpense, updateExpense, removeExpense } = useBudgetData();
    const { tokens } = useTheme();
    const scrollBottomPadding = useScrollBottomPadding();

    const [description, setDescription] = useState('');
    const [amount, setAmount] = useState('');
    const [category, setCategory] = useState<'household' | 'personal'>('household');
    const [frequency, setFrequency] = useState<'daily' | 'weekly' | 'monthly' | 'yearly' | 'one-time'>('monthly');
    const [personId, setPersonId] = useState<string>('');
    const [categoryTag, setCategoryTag] = useState<ExpenseCategory>('Misc');
    const [bucketChoice, setBucketChoice] = useState<BucketId | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const [startDateYMD, setStartDateYMD] = useState<string>(toYMD(new Date()));
    const [endDate, setEndDate] = useState<Date | null>(null);

    // What the form held when it opened, to tell whether Cancel would lose edits.
    const snapshotOf = (v: FormValues) =>
        JSON.stringify({
            ...v,
            description: v.description.trim(),
            amount: v.amount ? parseFloat(v.amount) : null,
            endDate: v.endDate ? toYMD(v.endDate) : null,
        });
    const [baseline, setBaseline] = useState<string>(() =>
        snapshotOf({
            description: '',
            amount: '',
            category: 'household',
            frequency: 'monthly',
            personId: '',
            categoryTag: 'Misc',
            bucket: null,
            startDateYMD: toYMD(new Date()),
            endDate: null,
        })
    );

    const [customCategories, setCustomCategories] = useState<string[]>([]);

    // Set while Add person is open over this form, so returning to it selects
    // the person just added (see newPersonHandoff).
    const awaitingNewPerson = useRef(false);

    const scrollViewRef = useRef<ScrollView>(null);
    const isEditMode = !!id;
    const expenseToEdit = isEditMode ? data.expenses.find(e => e.id === id) : null;
    const descriptionRef = useRef<TextInput>(null);

    // Where the chosen category counts in the budget review, with the budget's own choices applied.
    const categoryBucket = resolveBucket(categoryTag, categoryBucketLookup(activeBudget?.categoryBuckets));
    const countsAs = bucketChoice && bucketChoice !== categoryBucket.bucket ? bucketChoice : categoryBucket.bucket;
    const pickBucket = (next: BucketId) => setBucketChoice(next === categoryBucket.bucket ? null : next);

    // New expense: focus the description when the screen appears, not on
    // mount (autoFocus). A fresh form mounts while its screen is still hidden
    // (see useFormSessionKey), and autoFocus there would grab the keyboard.
    // preventScroll (web): the screen is still sliding in, and scrolling the
    // input into view would shift the clipped container and cancel the slide.
    useFocusEffect(
        useCallback(() => {
            if (!isEditMode) (descriptionRef.current as unknown as { focus: (o?: FocusOptions) => void } | null)?.focus({ preventScroll: true });
        }, [isEditMode])
    );

    const getAllCategories = useCallback(() => {
        return [...EXPENSE_CATEGORIES, ...customCategories];
    }, [customCategories]);

    useEffect(() => {
        const loadCustomCategories = async () => {
            const list = await safeAsync(() => getCustomExpenseCategories(), [], 'getCustomExpenseCategories');
            setCustomCategories(list);
        };
        loadCustomCategories();
    }, []);

    // Load the expense once per form (the screen keys the form per visit).
    // Reloading whenever `data` refreshes (focus, sync) would overwrite edits.
    const loadedRef = useRef(false);
    useEffect(() => {
        if (isEditMode && expenseToEdit && !loadedRef.current) {
            loadedRef.current = true;
            const loaded: FormValues = {
                description: expenseToEdit.description || '',
                amount: expenseToEdit.amount?.toString() || '',
                category: expenseToEdit.category || 'household',
                frequency: (expenseToEdit.frequency as any) || 'monthly',
                personId: expenseToEdit.personId || '',
                categoryTag: normalizeCategoryName((expenseToEdit.categoryTag as any) || 'Misc') as any,
                bucket: isBucketId(expenseToEdit.bucket) ? expenseToEdit.bucket : null,
                startDateYMD,
                endDate: null,
            };

            try {
                const d = new Date(expenseToEdit.date);
                if (!isNaN(d.getTime())) loaded.startDateYMD = toYMD(d);
            } catch (e) { }

            // Older expenses could carry a debt tag under any category. Show them
            // under the matching debt category so saving keeps the tag. The
            // baseline keeps the stored category, so the switch reads as an edit
            // the user can save.
            const storedCategoryTag = loaded.categoryTag;
            const legacyDebt = expenseToEdit.debtRepayment;
            if (legacyDebt && debtRepaymentForCategory(loaded.categoryTag) !== legacyDebt) {
                loaded.categoryTag = CATEGORY_BY_DEBT_REPAYMENT[legacyDebt];
            }

            const endDateValue = (expenseToEdit as any).endDate;
            if (endDateValue) {
                try {
                    const endDateObj = new Date(endDateValue + 'T00:00:00');
                    if (!isNaN(endDateObj.getTime())) loaded.endDate = endDateObj;
                } catch (e) { }
            }

            setDescription(loaded.description);
            setAmount(loaded.amount);
            setCategory(loaded.category);
            setFrequency(loaded.frequency);
            setPersonId(loaded.personId);
            setCategoryTag(loaded.categoryTag);
            setBucketChoice(loaded.bucket);
            setStartDateYMD(loaded.startDateYMD);
            setEndDate(loaded.endDate);
            setBaseline(snapshotOf({ ...loaded, categoryTag: storedCategoryTag }));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isEditMode, expenseToEdit]);

    const handleSaveExpense = async () => {
        if (!description.trim() || !amount || parseFloat(amount) <= 0) {
            Alert.alert('Error', 'Please fill in all required fields');
            return;
        }

        try {
            setIsSaving(true);
            const expenseData: Expense = {
                id: isEditMode ? id! : `expense_${Date.now()}`,
                description: description.trim(),
                amount: parseFloat(amount),
                category,
                frequency,
                personId: category === 'household' ? undefined : (personId || undefined),
                date: new Date(startDateYMD + 'T00:00:00Z').toISOString(),
                notes: '',
                categoryTag: categoryTag || 'Misc',
                endDate: endDate ? toYMD(endDate) : undefined,
                debtRepayment: debtRepaymentForCategory(categoryTag),
                // Only an expense that counts somewhere other than its category's bucket carries one.
                ...(bucketChoice && bucketChoice !== categoryBucket.bucket ? { bucket: bucketChoice } : {}),
            };

            const result = isEditMode ? await updateExpense(expenseData) : await addExpense(expenseData);

            if (result.success) {
                leave(() => onSuccess?.() || onClose());
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
                    if (result.success) leave(() => onSuccess?.() || onClose());
                }
            }
        ]);
    };

    const isDirty =
        snapshotOf({ description, amount, category, frequency, personId, categoryTag, bucket: bucketChoice, startDateYMD, endDate }) !==
        baseline;
    const leave = useDiscardGuard(isDirty);
    const handleCancel = () => confirmDiscard(isDirty, () => leave(onClose));

    const canSave = !!description.trim() && !!amount && parseFloat(amount) > 0 && (category === 'household' || !!personId);
    // New person: the Add person screen slides in over this form; on save it
    // hands the id back and the focus effect below selects them.
    const openAddPerson = () => {
        newPersonHandoff.take(); // drop anything stale
        awaitingNewPerson.current = true;
        leave(() => router.push({ pathname: '/edit-person', params: { pick: '1' } }));
    };
    useFocusEffect(
        useCallback(() => {
            if (!awaitingNewPerson.current) return;
            awaitingNewPerson.current = false;
            const newId = newPersonHandoff.take();
            if (newId) {
                setCategory('personal');
                setPersonId(newId);
            }
        }, [])
    );

    return (
        <>
        <StandardHeader
            title={isEditMode ? 'Edit expense' : 'New expense'}
            onLeftPress={handleCancel}
            confirm={{
                onPress: handleSaveExpense,
                dirty: isDirty,
                // Editing: nothing to save until something changes (matches person/income).
                disabled: !canSave || (isEditMode && !isDirty),
                loading: isSaving,
                accessibilityLabel: isEditMode ? 'Save changes' : 'Add expense',
            }}
        />
        <ScrollView
            ref={scrollViewRef}
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: space.s5, paddingBottom: scrollBottomPadding, gap: space.s5, minHeight: BOUNCE_MIN_HEIGHT }}
            keyboardShouldPersistTaps="handled"
            automaticallyAdjustKeyboardInsets
        >
            <Input
                label="Description"
                value={description}
                onChangeText={setDescription}
                placeholder="e.g. Electricity bill"
                returnKeyType="next"
                ref={descriptionRef}
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
                        ? 'Shared costs are split between everyone who shares household costs.'
                        : 'Only counts against the person you choose.'}
                </Text>
            </View>

            {category === 'personal' ? (
                <ChoicePills
                    label="Person"
                    value={personId || undefined}
                    onChange={setPersonId}
                    options={data.people.map(p => ({ value: p.id, label: p.name, icon: 'person-outline' }))}
                    addLabel="New person"
                    onAdd={openAddPerson}
                />
            ) : null}

            <ChoicePills
                label="Category"
                value={categoryTag}
                onChange={(tag) => setCategoryTag(tag as any)}
                options={getAllCategories().map(tag => ({ value: tag, label: tag }))}
            />

            <View>
                <Text style={[type.caption, { color: tokens.colors.textMuted, marginBottom: space.s2 }]}>Counts as</Text>
                <SegmentedControl<BucketId>
                    label="Counts as"
                    value={countsAs}
                    onChange={pickBucket}
                    options={BUCKET_OPTIONS}
                />
                <Text style={[type.caption, { color: tokens.colors.textFaint, marginTop: space.s1 }]}>
                    {countsAs === categoryBucket.bucket
                        ? `Follows the category: ${categoryTag || 'Misc'} counts as ${BUCKET_META[categoryBucket.bucket].name} in the budget review.`
                        : `Counts as ${BUCKET_META[countsAs].name} in the budget review, instead of ${BUCKET_META[categoryBucket.bucket].name}. Only this expense.`}
                </Text>
            </View>

            {frequency !== 'one-time' ? (
                <DateField
                    label="End date"
                    value={endDate}
                    onChange={setEndDate}
                    placeholder="No end date"
                    helperText="Optional. The expense stops counting after this date."
                    onExpand={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
                />
            ) : null}

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
        </ScrollView>

        </>
    );
}
