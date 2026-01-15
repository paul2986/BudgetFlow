
import { useState, useEffect, useCallback, useRef } from 'react';
import { useBudgetData } from '../hooks/useBudgetData';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Text, View, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Modal, Platform } from 'react-native';
import { Alert } from '../utils/alert';
import { useTheme } from '../hooks/useTheme';
import { useThemedStyles } from '../hooks/useThemedStyles';
import { useCurrency } from '../hooks/useCurrency';
import Button from '../components/Button';
import CurrencyInput from '../components/CurrencyInput';
import Icon from '../components/Icon';
import { Expense, ExpenseCategory, DEFAULT_CATEGORIES, Person } from '../types/budget';
import StandardHeader from '../components/StandardHeader';
import { getCustomExpenseCategories, saveCustomExpenseCategories, normalizeCategoryName } from '../utils/storage';
import DateTimePicker from '@react-native-community/datetimepicker';

const EXPENSE_CATEGORIES: ExpenseCategory[] = DEFAULT_CATEGORIES;

// Types for temporary entities that will be created on save
type TempPerson = {
  id: string;
  name: string;
  isTemp: true;
};

type TempCategory = {
  name: string;
  isTemp: true;
};

// Helper function to safely handle async operations
const safeAsync = async <T,>(
  operation: () => Promise<T>,
  fallback: T,
  operationName: string
): Promise<T> => {
  try {
    const result = await operation();
    return result;
  } catch (error) {
    console.error(`AddExpenseScreen: Error in ${operationName}:`, error);
    return fallback;
  }
};

export default function AddExpenseScreen() {
  const { data, addExpense, updateExpense, removeExpense, addPerson, saving, refreshTrigger } = useBudgetData();
  const { currentColors } = useTheme();
  const { themedStyles, themedButtonStyles, isPad } = useThemedStyles();
  const { formatCurrency } = useCurrency();
  const params = useLocalSearchParams<{ id?: string; origin?: string }>();

  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<'household' | 'personal'>('household');
  const [frequency, setFrequency] = useState<'daily' | 'weekly' | 'monthly' | 'yearly' | 'one-time'>('monthly');
  const [personId, setPersonId] = useState<string>('');
  const [categoryTag, setCategoryTag] = useState<ExpenseCategory>('Misc');
  const [deleting, setDeleting] = useState(false);
  const [isSaving, setIsSaving] = useState(false); // Track local saving state

  // Temporary entities that will be created on save
  const [tempPeople, setTempPeople] = useState<TempPerson[]>([]);
  const [tempCategories, setTempCategories] = useState<TempCategory[]>([]);

  // Dates
  const toYMD = (d: Date): string => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  const [startDateYMD, setStartDateYMD] = useState<string>(toYMD(new Date()));
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [showEndPicker, setShowEndPicker] = useState(false);

  const [customCategories, setCustomCategories] = useState<string[]>([]);
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [newCustomName, setNewCustomName] = useState('');
  const [customError, setCustomError] = useState<string | null>(null);

  // Add person modal state
  const [showAddPersonModal, setShowAddPersonModal] = useState(false);
  const [newPersonName, setNewPersonName] = useState('');
  const [addingPerson, setAddingPerson] = useState(false);

  const scrollViewRef = useRef<ScrollView>(null);

  const isEditMode = !!params.id;
  const origin = params.origin || 'expenses'; // Default to expenses if no origin specified
  const expenseToEdit = isEditMode ? data.expenses.find(e => e.id === params.id) : null;

  // Get combined list of people (existing + temporary) - memoized to prevent infinite loops
  const getAllPeople = useCallback(() => {
    return [...data.people, ...tempPeople];
  }, [data.people, tempPeople]);

  // Get combined list of categories (existing + temporary) - memoized to prevent infinite loops
  const getAllCategories = useCallback(() => {
    const tempCategoryNames = tempCategories.map(tc => tc.name);
    return [...EXPENSE_CATEGORIES, ...customCategories, ...tempCategoryNames];
  }, [customCategories, tempCategories]);

  // Check if form is valid for enabling the save button
  const isFormValid = useCallback(() => {
    // Basic validation
    if (!description.trim()) return false;

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) return false;

    // For personal expenses, require a person to be assigned
    const allPeople = getAllPeople();
    if (category === 'personal') {
      if (allPeople.length === 0) return false;
      if (!personId) return false;
    }

    // Validate category tag
    const normalizedTag = normalizeCategoryName(categoryTag || 'Misc');
    if (!normalizedTag) return false;

    // Validate end date rules for recurring only
    const isRecurring = ['daily', 'weekly', 'monthly', 'yearly'].includes(frequency);
    if (isRecurring && endDate) {
      const startVal = new Date(startDateYMD + 'T00:00:00');
      if (endDate < startVal) return false;
    }

    return true;
  }, [description, amount, category, personId, categoryTag, frequency, startDateYMD, endDate, getAllPeople]);

  // Load custom categories initially and scroll to top
  useEffect(() => {
    const loadCustomCategories = async () => {
      try {
        const list = await safeAsync(
          () => getCustomExpenseCategories(),
          [],
          'getCustomExpenseCategories'
        );
        console.log('AddExpenseScreen: Loaded custom categories:', list);
        setCustomCategories(list);
      } catch (error) {
        console.error('AddExpenseScreen: Error loading custom categories:', error);
        setCustomCategories([]);
      }
    };

    loadCustomCategories();

    // Scroll to top when component mounts
    setTimeout(() => {
      scrollViewRef.current?.scrollTo({ y: 0, animated: false });
    }, 100);
  }, []);

  // Always scroll to top when the screen comes into focus
  useFocusEffect(
    useCallback(() => {
      console.log('AddExpenseScreen: Screen focused, scrolling to top to ensure description field is visible');
      // Use a small delay to ensure the screen is fully rendered
      const timeoutId = setTimeout(() => {
        scrollViewRef.current?.scrollTo({ y: 0, animated: false });
      }, 50);

      return () => {
        clearTimeout(timeoutId);
      };
    }, [])
  );

  // Reload custom categories when data changes (e.g., after clearing all data)
  // Fixed: Removed categoryTag and tempCategories from dependencies to prevent infinite loop
  useEffect(() => {
    const reloadCustomCategories = async () => {
      try {
        const list = await safeAsync(
          () => getCustomExpenseCategories(),
          [],
          'getCustomExpenseCategories-reload'
        );
        console.log('AddExpenseScreen: Reloaded custom categories after data change:', list);
        setCustomCategories(list);
      } catch (error) {
        console.error('AddExpenseScreen: Error reloading custom categories:', error);
      }
    };

    reloadCustomCategories();
  }, [data.people.length, data.expenses.length, refreshTrigger]);

  // Separate effect to validate categoryTag when custom categories change
  // Fixed: Don't run validation when saving to prevent category flickering
  useEffect(() => {
    // Skip validation if we're currently saving to prevent flickering
    if (isSaving || saving) {
      return;
    }

    // Check if current categoryTag is still valid
    const currentCategoryStillValid = DEFAULT_CATEGORIES.includes(categoryTag) ||
      customCategories.includes(categoryTag) ||
      tempCategories.some(tc => tc.name === categoryTag);

    // If current categoryTag is not valid, reset to 'Misc'
    if (categoryTag && !currentCategoryStillValid) {
      console.log('AddExpenseScreen: Current category tag not found in updated list, resetting to Misc:', {
        currentCategoryTag: categoryTag,
        availableDefaults: DEFAULT_CATEGORIES,
        availableCustom: customCategories,
        tempCategories: tempCategories.map(tc => tc.name)
      });
      setCategoryTag('Misc');
    }
  }, [customCategories, tempCategories, categoryTag, isSaving, saving]);

  // Load expense data for editing
  useEffect(() => {
    if (isEditMode && expenseToEdit && data.people.length >= 0) {
      console.log('AddExpenseScreen: Loading expense for editing:', expenseToEdit);
      setDescription(expenseToEdit.description || '');
      setAmount(expenseToEdit.amount?.toString() || '');
      setCategory(expenseToEdit.category || 'household');
      setFrequency((expenseToEdit.frequency as 'daily' | 'weekly' | 'monthly' | 'yearly') || 'monthly');
      setPersonId(expenseToEdit.personId || '');

      const normalized = normalizeCategoryName((expenseToEdit.categoryTag as ExpenseCategory) || 'Misc');
      setCategoryTag(normalized || 'Misc');

      // Dates
      try {
        const d = new Date(expenseToEdit.date);
        if (!isNaN(d.getTime())) setStartDateYMD(toYMD(d));
      } catch (e) {
        console.log('Invalid start date in expense');
      }

      // Handle end date
      const endDateValue = (expenseToEdit as any).endDate;
      if (endDateValue) {
        try {
          const endDateObj = new Date(endDateValue + 'T00:00:00');
          if (!isNaN(endDateObj.getTime())) {
            setEndDate(endDateObj);
          }
        } catch (e) {
          console.log('Invalid end date in expense');
        }
      } else {
        setEndDate(null);
      }

      // Ensure custom category is in the list if not default
      if (normalized && !DEFAULT_CATEGORIES.includes(normalized) && !customCategories.includes(normalized)) {
        const next = [...customCategories, normalized];
        setCustomCategories(next);
        safeAsync(
          () => saveCustomExpenseCategories(next),
          undefined,
          'saveCustomExpenseCategories-missing'
        ).then(() => console.log('Saved missing custom category from edited expense'));
      }
    } else if (!isEditMode) {
      // Reset form for new expense
      console.log('AddExpenseScreen: Resetting form for new expense');
      setDescription('');
      setAmount('');
      setCategory('household');
      setFrequency('monthly');
      // For household expenses, don't auto-select a person
      setPersonId('');
      setCategoryTag('Misc');
      setStartDateYMD(toYMD(new Date()));
      setEndDate(null);
      // Clear temporary entities for new expense
      setTempPeople([]);
      setTempCategories([]);
    }
  }, [isEditMode, expenseToEdit, data.people, params.id, customCategories]);

  const navigateToOrigin = useCallback(() => {
    console.log('AddExpenseScreen: Navigating back to origin:', origin);

    // Small delay to ensure state is updated before navigation
    setTimeout(() => {
      try {
        router.replace('/expenses');
      } catch (error) {
        console.error('AddExpenseScreen: Error navigating back:', error);
      }
    }, 100);
  }, [origin]);

  const handleSaveExpense = useCallback(async () => {
    if (!description.trim()) {
      Alert.alert('Error', 'Please enter a description');
      return;
    }

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }

    // Check if no people exist at all (including temp people) for personal expenses only
    const allPeople = getAllPeople();
    if (category === 'personal' && allPeople.length === 0) {
      Alert.alert(
        'No People Added',
        'You must add at least one person before creating personal expenses.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Add Person',
            onPress: () => {
              setShowAddPersonModal(true);
            }
          }
        ]
      );
      return;
    }

    // Determine the final personId to use
    let finalPersonId: string | undefined = personId || undefined;

    // For household expenses, personId is optional
    if (category === 'household') {
      // If no person is selected for household expense, that's fine - leave it undefined
      finalPersonId = personId || undefined;
    } else {
      // For personal expenses, require a person to be assigned
      if (!finalPersonId) {
        Alert.alert('Error', 'Please select a person to assign this personal expense to');
        return;
      }
    }

    const normalizedTag = normalizeCategoryName(categoryTag || 'Misc');
    if (!normalizedTag) {
      Alert.alert('Error', 'Please select a category');
      return;
    }

    // Validate end date rules for recurring only
    const isRecurring = ['daily', 'weekly', 'monthly', 'yearly'].includes(frequency);
    if (isRecurring && endDate) {
      const startVal = new Date(startDateYMD + 'T00:00:00');
      if (endDate < startVal) {
        Alert.alert('Invalid end date', 'End date cannot be earlier than the start date');
        return;
      }
    }

    try {
      // Set local saving state to prevent category validation during save
      setIsSaving(true);

      console.log('AddExpenseScreen: Starting save process with temp entities:', {
        tempPeople: tempPeople.length,
        tempCategories: tempCategories.length,
        selectedPersonId: finalPersonId,
        selectedCategory: normalizedTag,
        expenseCategory: category
      });

      // Step 1: Create any new people first (only if we have a person to create)
      let actualPersonId = finalPersonId;
      if (finalPersonId) {
        for (const tempPerson of tempPeople) {
          if (tempPerson.id === finalPersonId) {
            console.log('AddExpenseScreen: Creating temp person:', tempPerson);
            const newPerson: Person = {
              id: `person_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              name: tempPerson.name,
              income: [],
            };

            const result = await addPerson(newPerson);
            if (!result.success) {
              throw new Error(`Failed to create person: ${result.error?.message || 'Unknown error'}`);
            }

            actualPersonId = newPerson.id;
            console.log('AddExpenseScreen: Created person successfully:', newPerson.id);
            break;
          }
        }
      }

      // Step 2: Create any new custom categories
      if (tempCategories.length > 0) {
        const newCustomCategories = [...customCategories];
        for (const tempCategory of tempCategories) {
          if (!newCustomCategories.includes(tempCategory.name)) {
            newCustomCategories.push(tempCategory.name);
            console.log('AddExpenseScreen: Adding temp category to list:', tempCategory.name);
          }
        }

        if (newCustomCategories.length > customCategories.length) {
          await safeAsync(
            () => saveCustomExpenseCategories(newCustomCategories),
            undefined,
            'saveCustomExpenseCategories-temp'
          );
          setCustomCategories(newCustomCategories);
          console.log('AddExpenseScreen: Saved new custom categories:', newCustomCategories);
        }
      }

      // Step 3: Create the expense with all the data
      const expenseData: Expense = {
        id: isEditMode ? expenseToEdit!.id : `expense_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        description: description.trim(),
        amount: numAmount,
        category,
        frequency,
        personId: actualPersonId, // Use the actual person ID (either existing, newly created, or undefined for household)
        date: isEditMode ? expenseToEdit!.date : new Date(startDateYMD + 'T00:00:00Z').toISOString(),
        notes: '', // Always include notes as empty string
        categoryTag: normalizedTag,
        endDate: isRecurring && endDate ? toYMD(endDate) : undefined,
      };

      console.log('AddExpenseScreen: Final expense data before save:', {
        category: expenseData.category,
        personId: expenseData.personId,
        description: expenseData.description,
        amount: expenseData.amount
      });

      console.log('AddExpenseScreen: Saving expense:', expenseData);
      console.log('AddExpenseScreen: Expense category being saved:', expenseData.category);
      console.log('AddExpenseScreen: Expense personId being saved:', expenseData.personId);

      let result;
      if (isEditMode) {
        // If switched to one-time, clear endDate
        if (expenseData.frequency === 'one-time') {
          delete (expenseData as any).endDate;
        }
        result = await updateExpense(expenseData);
        console.log('AddExpenseScreen: Expense updated result:', result);
      } else {
        result = await addExpense(expenseData);
        console.log('AddExpenseScreen: Expense added result:', result);
      }

      if (result && result.success) {
        console.log('AddExpenseScreen: Expense saved successfully, clearing temp entities and navigating back');
        // Clear temporary entities since they've been created
        setTempPeople([]);
        setTempCategories([]);
        navigateToOrigin();
      } else {
        console.error('AddExpenseScreen: Expense save failed:', result?.error);
        Alert.alert('Error', result?.error?.message || 'Failed to save expense. Please try again.');
      }
    } catch (error) {
      console.error('AddExpenseScreen: Error saving expense:', error);
      Alert.alert('Error', 'Failed to save expense. Please try again.');
    } finally {
      // Reset local saving state
      setIsSaving(false);
    }
  }, [description, amount, category, frequency, personId, categoryTag, isEditMode, expenseToEdit, addExpense, updateExpense, navigateToOrigin, startDateYMD, endDate, getAllPeople, tempPeople, tempCategories, customCategories, addPerson]);

  const handleDeleteExpense = useCallback(async () => {
    if (!isEditMode || !expenseToEdit) {
      console.log('AddExpenseScreen: Cannot delete - not in edit mode or no expense to edit');
      return;
    }

    console.log('AddExpenseScreen: Delete expense requested for:', expenseToEdit.id, expenseToEdit.description);

    Alert.alert(
      'Delete Expense',
      `Are you sure you want to delete "${expenseToEdit.description}"?`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
          onPress: () => console.log('AddExpenseScreen: Delete cancelled')
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            console.log('AddExpenseScreen: Delete confirmed for expense:', expenseToEdit.id);
            try {
              setDeleting(true);
              const result = await removeExpense(expenseToEdit.id);
              console.log('AddExpenseScreen: Expense deletion result:', result);

              if (result && result.success) {
                console.log('AddExpenseScreen: Expense deleted successfully, navigating back to origin');
                navigateToOrigin();
              } else {
                console.error('AddExpenseScreen: Expense deletion failed:', result?.error);
                Alert.alert('Error', result?.error?.message || 'Failed to delete expense. Please try again.');
              }
            } catch (error) {
              console.error('AddExpenseScreen: Error deleting expense:', error);
              Alert.alert('Error', 'Failed to delete expense. Please try again.');
            } finally {
              setDeleting(false);
            }
          }
        },
      ]
    );
  }, [amount, category, description, endDate, frequency, personId, startDateYMD, isEditMode, expenseToEdit, removeExpense, navigateToOrigin]);

  const handleGoBack = useCallback(() => {
    try {
      router.replace('/expenses');
    } catch (error) {
      console.error('AddExpenseScreen: Error going back:', error);
    }
  }, []);

  const OwnershipPicker = useCallback(() => (
    <View style={[themedStyles.section, { paddingTop: 0 }]}>
      <Text style={[themedStyles.text, { marginBottom: 8, fontWeight: '600' }]}>Expense Type</Text>
      <View style={[themedStyles.row, { marginTop: 8 }]}>
        <TouchableOpacity
          style={[
            themedStyles.badge,
            {
              backgroundColor: category === 'household' ? currentColors.household : currentColors.border,
              marginRight: 12,
              paddingHorizontal: 20,
              paddingVertical: 12,
              borderRadius: 24,
              flex: 1,
            }
          ]}
          onPress={() => {
            console.log('AddExpenseScreen: Setting category to household');
            setCategory('household');
            // For household expenses, clear person assignment since it's optional
            // But don't clear if user has explicitly selected someone
            if (isEditMode && expenseToEdit?.category === 'personal') {
              // If editing and switching from personal to household, clear the person assignment
              setPersonId('');
              console.log('AddExpenseScreen: Cleared person assignment when switching from personal to household');
            }
          }}
          disabled={saving || deleting || isSaving}
        >
          <Text style={[
            themedStyles.badgeText,
            {
              color: category === 'household' ? '#FFFFFF' : currentColors.text,
              fontWeight: '600',
              textAlign: 'center',
            }
          ]}>
            Household
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            themedStyles.badge,
            {
              backgroundColor: category === 'personal' ? currentColors.personal : currentColors.border,
              paddingHorizontal: 20,
              paddingVertical: 12,
              borderRadius: 24,
              flex: 1,
            }
          ]}
          onPress={() => {
            console.log('AddExpenseScreen: Setting category to personal');
            setCategory('personal');
            // Clear personId when switching to personal so user must select
            setPersonId('');
          }}
          disabled={saving || deleting || isSaving}
        >
          <Text style={[
            themedStyles.badgeText,
            {
              color: category === 'personal' ? '#FFFFFF' : currentColors.text,
              fontWeight: '600',
              textAlign: 'center',
            }
          ]}>
            Personal
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  ), [category, currentColors, saving, deleting, isSaving, themedStyles, isEditMode, expenseToEdit]);

  const handleAddPersonFromExpense = useCallback(async () => {
    if (!newPersonName.trim()) {
      Alert.alert('Error', 'Please enter a name');
      return;
    }

    try {
      setAddingPerson(true);

      // Create a temporary person that will be created when the expense is saved
      const tempPerson: TempPerson = {
        id: `temp_person_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: newPersonName.trim(),
        isTemp: true,
      };

      console.log('AddExpenseScreen: Adding temporary person (will be created on save):', tempPerson);
      console.log('AddExpenseScreen: Current form state preserved:', {
        description,
        amount,
        category,
        categoryTag,
        frequency,
        startDateYMD,
        endDate
      });

      // Add to temporary people list
      setTempPeople(prev => [...prev, tempPerson]);

      // Clear modal state
      setNewPersonName('');
      setShowAddPersonModal(false);

      // Auto-select the newly created temporary person
      setPersonId(tempPerson.id);

      // If we're adding a person and the category is household, switch to personal
      // since the user explicitly wanted to add a person for assignment
      if (category === 'household') {
        setCategory('personal');
        console.log('AddExpenseScreen: Switched to personal category since user added a person');
      }

      // All form state (description, amount, categoryTag, frequency, dates, etc.) is preserved
      console.log('AddExpenseScreen: Temporary person added and auto-selected, all form state preserved:', {
        description,
        amount,
        category: category === 'household' ? 'personal' : category,
        categoryTag,
        frequency,
        startDateYMD,
        endDate,
        selectedPersonId: tempPerson.id,
        tempPeopleCount: tempPeople.length + 1
      });
    } catch (error) {
      console.error('AddExpenseScreen: Error adding temporary person:', error);
      Alert.alert('Error', 'Failed to add person. Please try again.');
    } finally {
      setAddingPerson(false);
    }
  }, [newPersonName, description, amount, category, categoryTag, frequency, startDateYMD, endDate, tempPeople]);

  const PersonPicker = useCallback(() => {
    // Don't show person picker for household expenses
    if (category === 'household') {
      return null;
    }

    const allPeople = getAllPeople();

    // Show message when personal is selected but no people exist
    if (category === 'personal' && allPeople.length === 0) {
      return (
        <View style={themedStyles.section}>
          <Text style={[themedStyles.text, { marginBottom: 8, fontWeight: '600' }]}>
            Assign to Person <Text style={{ color: currentColors.error }}>*</Text>
          </Text>
          <View style={[themedStyles.card, { backgroundColor: currentColors.error + '10', borderColor: currentColors.error + '30', borderWidth: 1 }]}>
            <View style={themedStyles.centerContent}>
              <Icon name="people-outline" size={32} style={{ color: currentColors.error, marginBottom: 8 }} />
              <Text style={[themedStyles.text, { textAlign: 'center', marginBottom: 8, color: currentColors.error, fontWeight: '600' }]}>
                No People Added
              </Text>
              <Text style={[themedStyles.textSecondary, { textAlign: 'center', marginBottom: 12, fontSize: 14 }]}>
                You need to add people to your budget before creating personal expenses.
              </Text>
              <TouchableOpacity
                onPress={() => {
                  console.log('AddExpenseScreen: Opening add person modal, preserving form state:', {
                    description,
                    amount,
                    category,
                    categoryTag,
                    frequency,
                    startDateYMD,
                    endDate
                  });
                  setShowAddPersonModal(true);
                }}
                style={[
                  themedStyles.badge,
                  {
                    backgroundColor: currentColors.primary,
                    paddingHorizontal: 16,
                    paddingVertical: 10,
                    borderRadius: 20,
                  }
                ]}
              >
                <Text style={[themedStyles.badgeText, { color: '#FFFFFF', fontWeight: '600' }]}>
                  Add Person
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      );
    }

    // Only show person picker for personal expenses when people exist
    if (category === 'personal' && allPeople.length > 0) {
      return (
        <View style={themedStyles.section}>
          <Text style={[themedStyles.text, { marginBottom: 8, fontWeight: '600' }]}>
            Assign to Person <Text style={{ color: currentColors.error }}>*</Text>
          </Text>
          <View style={[themedStyles.row, { marginTop: 8, flexWrap: 'wrap' }]}>
            {allPeople.map((person) => {
              const isTemp = 'isTemp' in person && person.isTemp;
              return (
                <TouchableOpacity
                  key={person.id}
                  style={[
                    themedStyles.badge,
                    {
                      backgroundColor: personId === person.id ? currentColors.secondary : currentColors.border,
                      marginRight: 8,
                      marginBottom: 8,
                      paddingHorizontal: 16,
                      paddingVertical: 10,
                      borderRadius: 20,
                      borderWidth: isTemp ? 2 : 0,
                      borderColor: isTemp ? currentColors.primary : 'transparent',
                    }
                  ]}
                  onPress={() => setPersonId(person.id)}
                  disabled={saving || deleting || isSaving}
                >
                  <Text style={[
                    themedStyles.badgeText,
                    {
                      color: personId === person.id ? '#FFFFFF' : currentColors.text,
                      fontWeight: '600',
                    }
                  ]}>
                    {person.name}{isTemp ? ' (new)' : ''}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={[themedStyles.textSecondary, { fontSize: 12, marginTop: 4 }]}>
            Select the person this personal expense belongs to. {tempPeople.length > 0 ? 'New people will be created when you save.' : ''}
          </Text>
        </View>
      );
    }

    // Return null for all other cases
    return null;
  }, [getAllPeople, personId, currentColors, saving, deleting, isSaving, themedStyles, category, tempPeople]);

  const CategoryTagPicker = useCallback(() => {
    const allCategories = getAllCategories();

    return (
      <View style={themedStyles.section}>
        <Text style={[themedStyles.text, { marginBottom: 8, fontWeight: '600' }]}>Category</Text>
        <View style={[themedStyles.row, { marginTop: 8, flexWrap: 'wrap' }]}>
          {allCategories.map((tag, index) => {
            const isTemp = tempCategories.some(tc => tc.name === tag);
            return (
              <TouchableOpacity
                key={`category-${tag}-${index}`}
                style={[
                  themedStyles.badge,
                  {
                    backgroundColor: categoryTag === tag ? currentColors.secondary : currentColors.border,
                    marginRight: 8,
                    marginBottom: 8,
                    paddingHorizontal: 16,
                    paddingVertical: 10,
                    borderRadius: 20,
                    borderWidth: isTemp ? 2 : 0,
                    borderColor: isTemp ? currentColors.primary : 'transparent',
                  }
                ]}
                onPress={() => setCategoryTag(tag)}
                disabled={saving || deleting || isSaving}
                accessibilityHint="Applies a category to this expense"
                accessibilityLabel={`Select category ${tag}${categoryTag === tag ? ', selected' : ''}`}
              >
                <Text style={[
                  themedStyles.badgeText,
                  {
                    color: categoryTag === tag ? '#FFFFFF' : currentColors.text,
                    fontWeight: '600',
                  }
                ]}>
                  {tag}{isTemp ? ' (new)' : ''}
                </Text>
              </TouchableOpacity>
            );
          })}

          {/* Add custom chip */}
          <TouchableOpacity
            key="add_custom"
            style={[
              themedStyles.badge,
              {
                backgroundColor: currentColors.primary,
                marginRight: 8,
                marginBottom: 8,
                paddingHorizontal: 16,
                paddingVertical: 10,
                borderRadius: 20,
              }
            ]}
            onPress={() => {
              console.log('AddExpenseScreen: Opening custom category modal, preserving form state:', {
                description,
                amount,
                category,
                categoryTag,
                frequency,
                personId,
                startDateYMD,
                endDate
              });
              setCustomError(null);
              setNewCustomName('');
              setShowCustomModal(true);
            }}
            disabled={saving || deleting || isSaving}
            accessibilityLabel="Add custom category"
            accessibilityHint="Opens entry to add a custom category"
          >
            <Text style={[
              themedStyles.badgeText,
              {
                color: '#FFFFFF',
                fontWeight: '700',
              }
            ]}>
              + Add custom
            </Text>
          </TouchableOpacity>
        </View>
        {tempCategories.length > 0 && (
          <Text style={[themedStyles.textSecondary, { fontSize: 12, marginTop: 4 }]}>
            New categories will be created when you save.
          </Text>
        )}
      </View>
    );
  }, [categoryTag, currentColors, saving, deleting, isSaving, themedStyles, getAllCategories, tempCategories]);

  const FrequencyPicker = useCallback(() => (
    <View style={themedStyles.section}>
      <Text style={[themedStyles.text, { marginBottom: 8, fontWeight: '600' }]}>Frequency</Text>
      <View style={[themedStyles.row, { marginTop: 8, flexWrap: 'wrap' }]}>
        {(['daily', 'weekly', 'monthly', 'yearly'] as const).map((freq) => (
          <TouchableOpacity
            key={freq}
            style={[
              themedStyles.badge,
              {
                backgroundColor: frequency === freq ? currentColors.primary : currentColors.border,
                marginRight: 8,
                marginBottom: 8,
                paddingHorizontal: 16,
                paddingVertical: 10,
                borderRadius: 20,
              }
            ]}
            onPress={() => setFrequency(freq)}
            disabled={saving || deleting || isSaving}
          >
            <Text style={[
              themedStyles.badgeText,
              {
                color: frequency === freq ? '#FFFFFF' : currentColors.text,
                fontWeight: '600',
                textTransform: 'capitalize',
              }
            ]}>
              {freq}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  ), [frequency, currentColors, saving, deleting, isSaving, themedStyles]);

  const handleCreateCustomCategory = useCallback(async () => {
    const normalized = normalizeCategoryName(newCustomName);
    if (!normalized) {
      setCustomError('Please enter a valid name (letters, numbers and spaces)');
      return;
    }

    // Check duplicates (case-insensitive) in existing categories
    const existsInDefaults = DEFAULT_CATEGORIES.some((c) => c.toLowerCase() === normalized.toLowerCase());
    const existsInCustom = customCategories.some((c) => c.toLowerCase() === normalized.toLowerCase());
    const existsInTemp = tempCategories.some((tc) => tc.name.toLowerCase() === normalized.toLowerCase());

    if (existsInDefaults || existsInCustom || existsInTemp) {
      setCustomError('That category already exists');
      return;
    }

    try {
      console.log('AddExpenseScreen: Adding temporary custom category (will be created on save):', normalized);
      console.log('AddExpenseScreen: Current form state preserved:', { description, amount, category, frequency, personId });

      // Create temporary category
      const tempCategory: TempCategory = {
        name: normalized,
        isTemp: true,
      };

      // Add to temporary categories list
      setTempCategories(prev => [...prev, tempCategory]);

      // Automatically select the newly created temporary category
      setCategoryTag(normalized);

      // Close modal and clear modal state
      setShowCustomModal(false);
      setNewCustomName('');
      setCustomError(null);

      // Form state (description, amount, category, frequency, personId, etc.) is preserved
      console.log('AddExpenseScreen: Temporary custom category added and auto-selected, form state preserved:', {
        description,
        amount,
        category,
        frequency,
        personId,
        selectedCategoryTag: normalized,
        tempCategoriesCount: tempCategories.length + 1
      });
    } catch (e) {
      console.error('AddExpenseScreen: Error adding temporary custom category', e);
      setCustomError('Failed to add category. Try again.');
    }
  }, [newCustomName, customCategories, tempCategories, description, amount, category, frequency, personId]);

  // Format date for display
  const formatDateForDisplay = useCallback((date: Date) => {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }, []);

  // Handle end date change from DateTimePicker
  const handleEndDateChange = useCallback((event: any, selectedDate?: Date) => {
    console.log('AddExpenseScreen: End date picker event:', event.type, selectedDate);

    if (Platform.OS === 'android') {
      // On Android, always hide the picker after any interaction
      setShowEndPicker(false);

      if (event.type === 'set' && selectedDate) {
        console.log('AddExpenseScreen: Setting end date to:', selectedDate);
        setEndDate(selectedDate);
      }
    } else {
      // On iOS, only set the date if it's provided
      if (selectedDate) {
        console.log('AddExpenseScreen: Setting end date to:', selectedDate);
        setEndDate(selectedDate);
      }
    }
  }, []);

  // Calculate loading state - only show spinner when actually saving/deleting or when there's a date validation error
  const isLoading = (() => {
    const isRecurring = ['daily', 'weekly', 'monthly', 'yearly'].includes(frequency);
    const hasDateError = isRecurring && endDate && endDate < new Date(startDateYMD + 'T00:00:00');
    return saving || deleting || isSaving || hasDateError;
  })();

  const isLoadingValue = !!(saving || deleting || isSaving);

  return (
    <View style={themedStyles.container}>
      <StandardHeader
        title={isEditMode ? 'Edit Expense' : 'Add Expense'}
        onLeftPress={handleGoBack}
        rightIcon={isEditMode ? 'checkmark' : 'add'}
        onRightPress={handleSaveExpense}
        showRightIcon={true}
        rightIconColor={isFormValid() && !isLoadingValue ? '#FFFFFF' : currentColors.textSecondary}
        loading={isLoadingValue}
        rightButtons={[{
          icon: isEditMode ? 'checkmark' : 'add',
          onPress: handleSaveExpense,
          backgroundColor: isFormValid() && !isLoadingValue ? currentColors.primary : currentColors.border,
          iconColor: isFormValid() && !isLoadingValue ? '#FFFFFF' : currentColors.textSecondary
        }]}
      />

      <ScrollView
        ref={scrollViewRef}
        style={themedStyles.content}
        contentContainerStyle={[themedStyles.scrollContent, { paddingHorizontal: 16, paddingTop: 16 }]}
      >
        <View style={themedStyles.section}>
          <Text style={[themedStyles.text, { marginBottom: 8, fontWeight: '600' }]}>Description</Text>
          <TextInput
            style={themedStyles.input}
            value={description}
            onChangeText={setDescription}
            placeholder="Enter expense description"
            placeholderTextColor={currentColors.textSecondary}
            editable={!saving && !deleting && !isSaving}
          />
        </View>

        <CurrencyInput
          label="Amount"
          value={amount}
          onChangeText={setAmount}
          editable={!saving && !deleting && !isSaving}
          containerStyle={themedStyles.section}
        />

        <OwnershipPicker />
        <PersonPicker />
        <CategoryTagPicker />

        <View style={themedStyles.section}>
          <Text style={[themedStyles.text, { marginBottom: 8, fontWeight: '600' }]}>Frequency</Text>
          <View style={[themedStyles.row, { marginTop: 8, flexWrap: 'wrap', justifyContent: 'flex-start' }]}>
            {(['one-time', 'daily', 'weekly', 'monthly', 'yearly'] as const).map((freq) => (
              <TouchableOpacity
                key={freq}
                style={[
                  themedStyles.badge,
                  {
                    backgroundColor: frequency === freq ? currentColors.secondary : currentColors.border,
                    marginRight: 8,
                    marginBottom: 8,
                    paddingHorizontal: 16,
                    paddingVertical: 10,
                    borderRadius: 20,
                  }
                ]}
                onPress={() => setFrequency(freq)}
                disabled={saving || deleting || isSaving}
              >
                <Text style={[
                  themedStyles.badgeText,
                  {
                    color: frequency === freq ? '#FFFFFF' : currentColors.text,
                    fontWeight: '600',
                    textTransform: 'capitalize',
                  }
                ]}>
                  {freq}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={themedStyles.section}>
          <Text style={[themedStyles.text, { marginBottom: 8, fontWeight: '600' }]}>Start Date</Text>
          {Platform.OS === 'web' ? (
            <TextInput
              style={themedStyles.input}
              value={startDateYMD}
              onChangeText={setStartDateYMD}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={currentColors.textSecondary}
              editable={!saving && !deleting && !isSaving}
            />
          ) : (
            <View>
              <DateTimePicker
                value={new Date(startDateYMD)}
                mode="date"
                display="default"
                onChange={(e, d) => {
                  if (d) setStartDateYMD(toYMD(d));
                }}
                disabled={saving || deleting || isSaving}
                style={{ alignSelf: 'flex-start' }}
              />
            </View>
          )}
        </View>

        {/* End date picker for recurring expenses */}
        {(['daily', 'weekly', 'monthly', 'yearly'] as const).includes(frequency as any) && (
          <View style={themedStyles.section}>
            <View style={themedStyles.row}>
              <Text style={[themedStyles.text, { marginBottom: 8, fontWeight: '600' }]}>End Date (Optional)</Text>
              {endDate && (
                <TouchableOpacity onPress={() => setEndDate(null)}>
                  <Text style={{ color: currentColors.error, fontSize: 13, fontWeight: '600' }}>Clear</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* End date input field */}
            {!endDate && !showEndPicker ? (
              <TouchableOpacity
                style={[
                  themedStyles.input,
                  { justifyContent: 'center', alignItems: 'center', backgroundColor: currentColors.backgroundAlt }
                ]}
                onPress={() => setShowEndPicker(true)}
                disabled={saving || deleting || isSaving}
              >
                <Text style={[themedStyles.textSecondary, { fontWeight: '500' }]}>
                  + Add End Date
                </Text>
              </TouchableOpacity>
            ) : (
              Platform.OS === 'web' ? (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TextInput
                    style={[themedStyles.input, { flex: 1 }]}
                    value={endDate ? toYMD(endDate) : ''}
                    onChangeText={(text) => {
                      if (text.length === 10) {
                        const d = new Date(text + 'T00:00:00');
                        if (!isNaN(d.getTime())) setEndDate(d);
                      } else if (text === '') {
                        setEndDate(null);
                      }
                    }}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={currentColors.textSecondary}
                    editable={!saving && !deleting && !isSaving}
                  />
                </View>
              ) : (
                <View>
                  <DateTimePicker
                    value={endDate || new Date()}
                    mode="date"
                    display="default"
                    onChange={handleEndDateChange}
                    minimumDate={new Date(startDateYMD + 'T00:00:00')}
                    disabled={saving || deleting || isSaving}
                  />
                </View>
              )
            )}

            {endDate && endDate < new Date(startDateYMD + 'T00:00:00') ? (
              <Text style={[themedStyles.textSecondary, { color: currentColors.error, marginTop: 6 }]}>
                End date cannot be earlier than start date
              </Text>
            ) : null}
          </View>
        )}

        <View style={[themedStyles.section, { paddingTop: 32, paddingBottom: 40 }]}>
          <Button
            text={saving || isSaving ? 'Saving...' : deleting ? 'Deleting...' : (isEditMode ? 'Update Expense' : 'Add Expense')}
            onPress={handleSaveExpense}
            disabled={!isFormValid() || saving || deleting || isSaving}
            variant="primary"
          />

          {isEditMode && (
            <View style={{ marginTop: 16 }}>
              <Button
                text={deleting ? 'Deleting...' : 'Delete Expense'}
                onPress={handleDeleteExpense}
                disabled={saving || deleting || isSaving}
                variant="danger"
              />
            </View>
          )}
        </View>
      </ScrollView>

      {/* Custom Category Modal */}
      <Modal visible={showCustomModal} animationType="fade" transparent onRequestClose={() => setShowCustomModal(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <View style={[themedStyles.card, { width: '100%', maxWidth: 400 }]}>
            <Text style={[themedStyles.subtitle, { marginBottom: 12 }]}>New Category</Text>
            <TextInput
              style={themedStyles.input}
              value={newCustomName}
              onChangeText={(t) => { setCustomError(null); setNewCustomName(t); }}
              placeholder="e.g. Subscriptions"
              placeholderTextColor={currentColors.textSecondary}
              maxLength={20}
              autoFocus
            />
            {customError ? <Text style={[themedStyles.textSecondary, { color: currentColors.error, marginBottom: 12 }]}>{customError}</Text> : null}
            <View style={[themedStyles.row, { gap: 12 }]}>
              <TouchableOpacity
                onPress={() => setShowCustomModal(false)}
                style={[themedStyles.badge, { backgroundColor: currentColors.border, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, flex: 1, alignItems: 'center' }]}
              >
                <Text style={[themedStyles.badgeText, { color: currentColors.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleCreateCustomCategory}
                style={[themedStyles.badge, { backgroundColor: currentColors.primary, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, flex: 1, alignItems: 'center' }]}
              >
                <Text style={[themedStyles.badgeText, { color: '#FFFFFF', fontWeight: '700' }]}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add Person Modal */}
      <Modal visible={showAddPersonModal} animationType="fade" transparent onRequestClose={() => setShowAddPersonModal(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <View style={[themedStyles.card, { width: '100%', maxWidth: 400 }]}>
            <Text style={[themedStyles.subtitle, { marginBottom: 12 }]}>Add Person</Text>
            <TextInput
              style={themedStyles.input}
              value={newPersonName}
              onChangeText={setNewPersonName}
              placeholder="Enter person's name"
              placeholderTextColor={currentColors.textSecondary}
              maxLength={50}
              autoFocus
            />
            <View style={[themedStyles.row, { gap: 12, marginTop: 16 }]}>
              <TouchableOpacity
                onPress={() => setShowAddPersonModal(false)}
                style={[themedStyles.badge, { backgroundColor: currentColors.border, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, flex: 1, alignItems: 'center' }]}
                disabled={addingPerson}
              >
                <Text style={[themedStyles.badgeText, { color: currentColors.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleAddPersonFromExpense}
                style={[themedStyles.badge, { backgroundColor: currentColors.primary, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, flex: 1, alignItems: 'center' }]}
                disabled={addingPerson || !newPersonName.trim()}
              >
                {addingPerson ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={[themedStyles.badgeText, { color: '#FFFFFF', fontWeight: '700' }]}>Add</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
