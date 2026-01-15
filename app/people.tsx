
import { Text, View, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Modal, Platform } from 'react-native';
import { Alert } from '../utils/alert';
import { router, useFocusEffect } from 'expo-router';
import { useState, useCallback } from 'react';
import { useThemedStyles } from '../hooks/useThemedStyles';
import { useBudgetData } from '../hooks/useBudgetData';
import { useTheme } from '../hooks/useTheme';
import { useCurrency } from '../hooks/useCurrency';
import { Person, Income } from '../types/budget';
import {
  calculatePersonIncome,
  calculateMonthlyAmount,
  calculatePersonalExpenses,
  calculateHouseholdShare,
  calculateHouseholdExpenses
} from '../utils/calculations';
import Button from '../components/Button';
import Icon from '../components/Icon';
import StandardHeader from '../components/StandardHeader';
import IncomeModal from '../components/IncomeModal';

export default function PeopleScreen() {
  const { data, addPerson, removePerson, addIncome, removeIncome, saving, refreshData, loading } = useBudgetData();
  const { currentColors } = useTheme();
  const { themedStyles, themedButtonStyles, isPad } = useThemedStyles();
  const { formatCurrency } = useCurrency();
  const [showAddPerson, setShowAddPerson] = useState(false);
  const [newPersonName, setNewPersonName] = useState('');
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [showIncomeModal, setShowIncomeModal] = useState(false);
  const [deletingPersonId, setDeletingPersonId] = useState<string | null>(null);
  const [deletingIncomeId, setDeletingIncomeId] = useState<string | null>(null);
  const [isDataLoaded, setIsDataLoaded] = useState(false);

  // Track when data has been loaded to prevent flicker
  useFocusEffect(
    useCallback(() => {
      console.log('PeopleScreen: Screen focused, refreshing data...');
      refreshData();
      // Mark data as loaded after initial load completes
      if (!loading) {
        setIsDataLoaded(true);
      }
    }, [refreshData, loading])
  );

  // Update isDataLoaded when loading state changes
  useFocusEffect(
    useCallback(() => {
      if (!loading && !isDataLoaded) {
        console.log('PeopleScreen: Data loading completed, marking as loaded');
        setIsDataLoaded(true);
      }
    }, [loading, isDataLoaded])
  );

  const handleAddPerson = useCallback(async () => {
    console.log('PeopleScreen: Add person button pressed');
    console.log('PeopleScreen: New person name:', newPersonName);

    if (!newPersonName.trim()) {
      Alert.alert('Error', 'Please enter a name');
      return;
    }

    try {
      const person: Person = {
        id: `person_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: newPersonName.trim(),
        income: [],
      };

      console.log('PeopleScreen: Adding new person:', person);
      const result = await addPerson(person);
      console.log('PeopleScreen: Person added result:', result);

      if (result.success) {
        setNewPersonName('');
        setShowAddPerson(false);
        console.log('PeopleScreen: Person added successfully');
      } else {
        Alert.alert('Error', 'Failed to add person. Please try again.');
      }
    } catch (error) {
      console.error('PeopleScreen: Error adding person:', error);
      Alert.alert('Error', 'Failed to add person. Please try again.');
    }
  }, [newPersonName, addPerson]);

  const handleRemovePerson = useCallback((person: Person) => {
    console.log('PeopleScreen: Attempting to remove person:', person);

    // Prevent multiple deletion attempts
    if (deletingPersonId === person.id || saving) {
      console.log('PeopleScreen: Deletion already in progress, ignoring');
      return;
    }

    Alert.alert(
      'Remove Person',
      `Are you sure you want to remove ${person.name}? This will also remove all their income and personal expenses.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              console.log('PeopleScreen: Starting person removal process');
              setDeletingPersonId(person.id);

              const result = await removePerson(person.id);
              console.log('PeopleScreen: Person removal result:', result);

              if (result.success) {
                console.log('PeopleScreen: Person removed successfully');
              } else {
                console.error('PeopleScreen: Person removal failed:', result.error);
                Alert.alert('Error', 'Failed to remove person. Please try again.');
              }
            } catch (error) {
              console.error('PeopleScreen: Error removing person:', error);
              Alert.alert('Error', 'Failed to remove person. Please try again.');
            } finally {
              setDeletingPersonId(null);
            }
          }
        },
      ]
    );
  }, [deletingPersonId, saving, removePerson]);

  const handleEditPerson = useCallback((person: Person) => {
    console.log('PeopleScreen: Navigating to edit person:', person);

    // Verify the person exists in current data before navigating
    const personExists = data.people.find(p => p.id === person.id);
    if (!personExists) {
      console.error('PeopleScreen: Person not found in current data, refreshing...');
      Alert.alert('Error', 'Person not found. Please try again.');
      refreshData(true);
      return;
    }

    router.push({
      pathname: '/edit-person',
      params: { personId: person.id, origin: 'people' }
    });
  }, [data.people, refreshData]);

  const handleAddIncomeFromModal = useCallback(async (personId: string, incomeData: Omit<Income, 'id' | 'personId'>) => {
    console.log('PeopleScreen: Add income from modal');
    console.log('PeopleScreen: Income data:', incomeData);
    console.log('PeopleScreen: Person ID:', personId);

    try {
      const income: Income = {
        id: `income_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        amount: incomeData.amount,
        label: incomeData.label,
        frequency: incomeData.frequency,
        personId: personId,
      };

      console.log('PeopleScreen: Adding new income:', income);
      const result = await addIncome(personId, income);
      console.log('PeopleScreen: Income added result:', result);

      if (result.success) {
        console.log('PeopleScreen: Income added successfully');
        return { success: true };
      } else {
        Alert.alert('Error', 'Failed to add income. Please try again.');
        return { success: false, error: result.error };
      }
    } catch (error) {
      console.error('PeopleScreen: Error adding income:', error);
      Alert.alert('Error', 'Failed to add income. Please try again.');
      return { success: false, error };
    }
  }, [addIncome]);

  const handleRemoveIncome = useCallback((personId: string, incomeId: string, incomeLabel: string) => {
    console.log('PeopleScreen: Attempting to remove income:', { personId, incomeId, incomeLabel });

    // Prevent multiple deletion attempts
    if (deletingIncomeId === incomeId || saving) {
      console.log('PeopleScreen: Income deletion already in progress, ignoring');
      return;
    }

    Alert.alert(
      'Remove Income',
      `Are you sure you want to remove "${incomeLabel}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              console.log('PeopleScreen: Starting income removal process');
              setDeletingIncomeId(incomeId);

              const result = await removeIncome(personId, incomeId);
              console.log('PeopleScreen: Income removal result:', result);

              if (result.success) {
                console.log('PeopleScreen: Income removed successfully');
              } else {
                console.error('PeopleScreen: Income removal failed:', result.error);
                Alert.alert('Error', 'Failed to remove income. Please try again.');
              }
            } catch (error) {
              console.error('PeopleScreen: Error removing income:', error);
              Alert.alert('Error', 'Failed to remove income. Please try again.');
            } finally {
              setDeletingIncomeId(null);
            }
          }
        },
      ]
    );
  }, [deletingIncomeId, saving, removeIncome]);

  const calculateRemainingIncome = useCallback((person: Person) => {
    const totalIncome = calculatePersonIncome(person);
    const personalExpenses = calculatePersonalExpenses(data.expenses, person.id);
    const householdExpenses = calculateHouseholdExpenses(data.expenses);
    const householdShare = calculateHouseholdShare(
      householdExpenses,
      data.people,
      data.householdSettings.distributionMethod,
      person.id
    );

    return totalIncome - personalExpenses - householdShare;
  }, [data.expenses, data.people, data.householdSettings.distributionMethod]);

  const handleNavigateToAddPerson = useCallback(() => {
    setShowAddPerson(true);
  }, []);

  return (
    <View style={themedStyles.container}>
      <StandardHeader
        title="People"
        showLeftIcon={false}
        rightButtons={[
          {
            icon: 'add' as const,
            onPress: handleNavigateToAddPerson,
            backgroundColor: currentColors.primary,
            iconColor: '#FFFFFF',
          }
        ]}
        loading={saving}
      />

      <ScrollView style={themedStyles.content} contentContainerStyle={[themedStyles.scrollContent, { paddingHorizontal: 16, paddingTop: 16 }]}>
        {/* Loading indicator while data is being loaded */}
        {loading && !isDataLoaded && (
          <View style={themedStyles.card}>
            <View style={themedStyles.centerContent}>
              <ActivityIndicator size="large" color={currentColors.primary} />
              <Text style={[themedStyles.textSecondary, { textAlign: 'center', marginTop: 12 }]}>
                Loading people...
              </Text>
            </View>
          </View>
        )}

        {/* Prominent Add Person Button - Only show when no people exist and data is loaded */}
        {isDataLoaded && data.people.length === 0 && !showAddPerson && (
          <View style={themedStyles.card}>
            <View style={themedStyles.centerContent}>
              <Icon name="people-outline" size={48} style={{ color: currentColors.primary, marginBottom: 12 }} />
              <Text style={[themedStyles.subtitle, { textAlign: 'center', marginBottom: 8 }]}>
                No People Added Yet
              </Text>
              <Text style={[themedStyles.textSecondary, { textAlign: 'center', marginBottom: 16 }]}>
                Add people to track personal expenses and income
              </Text>
              <Button
                text="Add Your First Person"
                onPress={() => setShowAddPerson(true)}
                variant="primary"
                disabled={saving}
              />
            </View>
          </View>
        )}

        {/* People List - Only show when data is loaded */}
        {isDataLoaded && data.people.length > 0 && (
          <View style={isPad ? { flexDirection: 'row', flexWrap: 'wrap', gap: 16 } : {}}>
            {data.people.map((person) => {
              const totalIncome = calculatePersonIncome(person);
              const monthlyIncome = calculateMonthlyAmount(totalIncome, 'yearly');
              const remainingIncome = calculateRemainingIncome(person);
              const monthlyRemaining = calculateMonthlyAmount(remainingIncome, 'yearly');
              const isDeleting = deletingPersonId === person.id;

              return (
                <TouchableOpacity
                  key={person.id}
                  style={[
                    themedStyles.card,
                    {
                      opacity: isDeleting ? 0.6 : 1,
                      width: isPad ? (Platform.OS === 'web' ? 'calc(50% - 8px)' as any : '48%') : '100%',
                    }
                  ]}
                  onPress={() => handleEditPerson(person)}
                  activeOpacity={0.7}
                  disabled={saving || isDeleting}
                >
                  <View style={[themedStyles.row, { marginBottom: 12 }]}>
                    <Text style={[themedStyles.subtitle, { marginBottom: 0 }]}>
                      {person.name}
                    </Text>
                    <TouchableOpacity
                      onPress={(e) => {
                        e.stopPropagation(); // Prevent triggering the edit action
                        console.log('PeopleScreen: Delete button pressed for person:', person.id, person.name);
                        handleRemovePerson(person);
                      }}
                      disabled={saving || isDeleting}
                      style={{
                        padding: 4,
                        borderRadius: 12,
                        backgroundColor: currentColors.error + '20',
                        alignItems: 'center',
                        justifyContent: 'center',
                        minWidth: 28,
                        minHeight: 28,
                      }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      {isDeleting ? (
                        <ActivityIndicator size="small" color={currentColors.error} />
                      ) : (
                        <Icon name="trash-outline" size={16} style={{ color: saving ? currentColors.textSecondary : currentColors.error }} />
                      )}
                    </TouchableOpacity>
                  </View>

                  <View style={[themedStyles.row, { marginBottom: 8 }]}>
                    <Text style={themedStyles.text}>Monthly Income:</Text>
                    <Text style={[themedStyles.text, { color: currentColors.income, fontWeight: '600' }]}>
                      {formatCurrency(monthlyIncome)}
                    </Text>
                  </View>

                  <View style={[themedStyles.row, { marginBottom: 12 }]}>
                    <Text style={[themedStyles.text, { fontWeight: '600' }]}>Remaining Income:</Text>
                    <Text style={[
                      themedStyles.text,
                      {
                        color: monthlyRemaining >= 0 ? currentColors.success : currentColors.error,
                        fontWeight: '700'
                      }
                    ]}>
                      {formatCurrency(monthlyRemaining)}
                    </Text>
                  </View>

                  {/* Income Sources */}
                  <View>
                    <View style={[themedStyles.row, { marginBottom: 8 }]}>
                      <Text style={[themedStyles.text, { fontWeight: '600' }]}>Income Sources:</Text>
                      <TouchableOpacity
                        onPress={(e) => {
                          e.stopPropagation(); // Prevent triggering the edit action
                          setSelectedPersonId(person.id);
                          setShowIncomeModal(true);
                        }}
                        disabled={saving || isDeleting}
                      >
                        <Icon name="add-circle-outline" size={20} style={{ color: saving || isDeleting ? currentColors.textSecondary : currentColors.income }} />
                      </TouchableOpacity>
                    </View>

                    {person.income.length === 0 ? (
                      <Text style={themedStyles.textSecondary}>No income sources added</Text>
                    ) : (
                      <View>
                        {person.income.map((income) => {
                          const isDeletingIncome = deletingIncomeId === income.id;

                          return (
                            <TouchableOpacity
                              key={income.id}
                              style={[themedStyles.row, { marginBottom: 4, paddingVertical: 4 }]}
                              onPress={(e) => {
                                e.stopPropagation(); // Prevent triggering the edit person action
                                router.push({
                                  pathname: '/edit-income',
                                  params: { personId: person.id, incomeId: income.id }
                                });
                              }}
                              disabled={saving || isDeletingIncome}
                              activeOpacity={0.7}
                            >
                              <View style={themedStyles.flex1}>
                                <Text style={themedStyles.text}>{income.label}</Text>
                                <Text style={themedStyles.textSecondary}>
                                  {formatCurrency(income.amount)} • {income.frequency}
                                </Text>
                              </View>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <Icon name="pencil-outline" size={16} style={{ color: saving || isDeletingIncome ? currentColors.textSecondary : currentColors.primary }} />
                                <TouchableOpacity
                                  onPress={(e) => {
                                    e.stopPropagation(); // Prevent triggering the edit action
                                    console.log('PeopleScreen: Delete income button pressed:', income.id, income.label);
                                    handleRemoveIncome(person.id, income.id, income.label);
                                  }}
                                  disabled={saving || isDeletingIncome}
                                  style={{
                                    padding: 2,
                                    borderRadius: 8,
                                    backgroundColor: currentColors.error + '20',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    minWidth: 20,
                                    minHeight: 20,
                                  }}
                                  hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                                >
                                  {isDeletingIncome ? (
                                    <ActivityIndicator size="small" color={currentColors.error} />
                                  ) : (
                                    <Icon name="close-circle-outline" size={14} style={{ color: saving ? currentColors.textSecondary : currentColors.error }} />
                                  )}
                                </TouchableOpacity>
                              </View>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Add Person Modal */}
      <Modal visible={showAddPerson} animationType="fade" transparent onRequestClose={() => setShowAddPerson(false)}>
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
                onPress={() => { setShowAddPerson(false); setNewPersonName(''); }}
                style={[themedStyles.badge, { backgroundColor: currentColors.border, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, flex: 1, alignItems: 'center' }]}
                disabled={saving}
              >
                <Text style={[themedStyles.badgeText, { color: currentColors.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleAddPerson}
                style={[themedStyles.badge, { backgroundColor: currentColors.primary, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, flex: 1, alignItems: 'center' }]}
                disabled={saving || !newPersonName.trim()}
              >
                {saving ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={[themedStyles.badgeText, { color: '#FFFFFF', fontWeight: '700' }]}>Add</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Income Modal */}
      <IncomeModal
        visible={showIncomeModal}
        onClose={() => {
          setShowIncomeModal(false);
          setSelectedPersonId(null);
        }}
        onAddIncome={handleAddIncomeFromModal}
        people={data.people}
        selectedPersonId={selectedPersonId}
        saving={saving}
      />
    </View>
  );
}
