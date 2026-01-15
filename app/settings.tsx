import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useTheme } from '../hooks/useTheme';
import Button from '../components/Button';
import {
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator
} from 'react-native';
import { Alert } from '../utils/alert';
import { router } from 'expo-router';
import Icon from '../components/Icon';
import { useCurrency, CURRENCIES, Currency } from '../hooks/useCurrency';
import { useBudgetData } from '../hooks/useBudgetData';
import { useThemedStyles } from '../hooks/useThemedStyles';
import { useToast } from '../hooks/useToast';
import StandardHeader from '../components/StandardHeader';
import { DEFAULT_CATEGORIES, Budget } from '../types/budget';
import { getCustomExpenseCategories, saveCustomExpenseCategories, normalizeCategoryName, renameCustomExpenseCategory } from '../utils/storage';
import { supabase } from '../utils/supabase';

type SettingsSection =
  | 'budgets'
  | 'account'
  | 'categories'
  | 'currency'
  | 'theme'
  | 'tools'
  | 'about'
  | 'danger';

const formatDate = (timestamp: number): string => {
  return new Date(timestamp).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

export default function SettingsScreen() {
  const { currentColors, themeMode, setThemeMode } = useTheme();
  const { currency, setCurrency } = useCurrency();
  const { appData, data, clearAllData, refreshData, activeBudget, addBudget, renameBudget, deleteBudget, duplicateBudget, setActiveBudget, user, isSyncing } = useBudgetData();
  const { themedStyles, isPad } = useThemedStyles();
  const { showToast } = useToast();

  // Auth state for Settings UI
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');

  // iPad split view state
  const [selectedSection, setSelectedSection] = useState<SettingsSection>('budgets');

  // Currency selection state
  const [currencySearchQuery, setCurrencySearchQuery] = useState('');

  // Manage categories state
  const [customs, setCustoms] = useState<string[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [renameModalVisible, setRenameModalVisible] = useState(false);
  const [categoryToRename, setCategoryToRename] = useState<string>('');
  const [newCategoryName, setNewCategoryName] = useState<string>('');
  const [renaming, setRenaming] = useState(false);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [newCategoryInput, setNewCategoryInput] = useState<string>('');
  const [creating, setCreating] = useState(false);

  // Budget management state
  const [newBudgetName, setNewBudgetName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [editingBudgetId, setEditingBudgetId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [dropdownBudgetId, setDropdownBudgetId] = useState<string | null>(null);
  const [showCreateBudgetModal, setShowCreateBudgetModal] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ x: 0, y: 0 });
  const [operationInProgress, setOperationInProgress] = useState(false);
  const buttonRefs = useRef<{ [key: string]: any }>({});

  const handleDistributionMethodChange = (method: 'even' | 'income-based') => {
    console.log('Distribution method change:', method);
    showToast(`Distribution method changed to ${method}`, 'success');
  };

  const handleThemeChange = (newTheme: 'system' | 'light' | 'dark') => {
    setThemeMode(newTheme);
    showToast(`Theme changed to ${newTheme}`, 'success');
  };

  const handleClearAllData = () => {
    Alert.alert(
      'Clear All Data',
      'This will permanently delete all your budgets, people, and expenses. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All Data',
          style: 'destructive',
          onPress: async () => {
            try {
              const result = await clearAllData();
              if (result.success) {
                showToast('All data cleared successfully', 'success');
                // Reload the page to ensure all caches are cleared
                setTimeout(() => {
                  console.log('Settings: Reloading page after clearing data');
                  if (Platform.OS === 'web') {
                    window.location.href = '/';
                  } else {
                    router.replace('/');
                  }
                }, 500);
              } else {
                showToast('Failed to clear data', 'error');
              }
            } catch (error) {
              console.error('Settings: Clear data error:', error);
              showToast('Failed to clear data', 'error');
            }
          },
        },
      ]
    );
  };

  const handleCurrencyChange = (curr: Currency) => {
    setCurrency(curr);
    setCurrencySearchQuery('');
    showToast(`Currency changed to ${curr.name}`, 'success');
  };

  // Categories management functions
  const refreshCategories = useCallback(async () => {
    try {
      setCategoriesLoading(true);
      const list = await getCustomExpenseCategories();
      setCustoms(list);
    } catch (e) {
      console.log('Failed to load custom categories', e);
    } finally {
      setCategoriesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedSection === 'categories') {
      refreshCategories();
    }
  }, [selectedSection, refreshCategories]);

  const isInUse = (category: string): boolean => {
    if (!data?.expenses) return false;
    const normalized = normalizeCategoryName(category);
    return data.expenses.some((e) => normalizeCategoryName(e.categoryTag || 'Misc') === normalized);
  };

  const handleDeleteCategory = (category: string) => {
    if (isInUse(category)) {
      Alert.alert('Cannot delete', 'This category is currently in use by one or more expenses.');
      return;
    }
    Alert.alert('Delete Category', `Are you sure you want to delete "${category}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            const next = customs.filter((c) => c !== category);
            await saveCustomExpenseCategories(next);
            setCustoms(next);
          } catch (e) {
            console.log('Failed to delete custom category', e);
            Alert.alert('Error', 'Failed to delete category. Please try again.');
          }
        },
      },
    ]);
  };

  const handleRenameCategory = (category: string) => {
    setCategoryToRename(category);
    setNewCategoryName(category);
    setRenameModalVisible(true);
  };

  const handleRenameSubmit = async () => {
    if (!newCategoryName.trim()) {
      Alert.alert('Error', 'Category name cannot be empty.');
      return;
    }

    if (newCategoryName.trim() === categoryToRename) {
      setRenameModalVisible(false);
      return;
    }

    setRenaming(true);
    try {
      const result = await renameCustomExpenseCategory(categoryToRename, newCategoryName.trim());

      if (result.success) {
        await refreshCategories();
        await refreshData();
        setRenameModalVisible(false);
        setCategoryToRename('');
        setNewCategoryName('');
      } else {
        Alert.alert('Error', result.error?.message || 'Failed to rename category. Please try again.');
      }
    } catch (e) {
      console.log('Failed to rename custom category', e);
      Alert.alert('Error', 'Failed to rename category. Please try again.');
    } finally {
      setRenaming(false);
    }
  };

  const handleRenameCancel = () => {
    setRenameModalVisible(false);
    setCategoryToRename('');
    setNewCategoryName('');
  };

  const handleCreateCategory = () => {
    setNewCategoryInput('');
    setCreateModalVisible(true);
  };

  const handleCreateSubmit = async () => {
    const trimmedName = newCategoryInput.trim();
    if (!trimmedName) {
      Alert.alert('Error', 'Category name cannot be empty.');
      return;
    }

    const normalized = normalizeCategoryName(trimmedName);

    if (DEFAULT_CATEGORIES.includes(normalized)) {
      Alert.alert('Error', 'This category name conflicts with a default category.');
      return;
    }

    if (customs.includes(normalized)) {
      Alert.alert('Error', 'A category with this name already exists.');
      return;
    }

    setCreating(true);
    try {
      const updatedCategories = [...customs, normalized];
      await saveCustomExpenseCategories(updatedCategories);
      setCustoms(updatedCategories);
      setCreateModalVisible(false);
      setNewCategoryInput('');
    } catch (e) {
      console.log('Failed to create custom category', e);
      Alert.alert('Error', 'Failed to create category. Please try again.');
    } finally {
      setCreating(false);
    }
  };

  const handleCreateCancel = () => {
    setCreateModalVisible(false);
    setNewCategoryInput('');
  };

  // Budget management functions
  const budgets = useMemo(() => {
    return appData.budgets || [];
  }, [appData.budgets]);

  const handleCreateBudget = useCallback(async () => {
    if (!newBudgetName.trim()) {
      showToast('Please enter a budget name', 'error');
      return;
    }

    setIsCreating(true);
    try {
      const result = await addBudget(newBudgetName.trim());
      if (result.success) {
        showToast('Budget created successfully', 'success');
        setNewBudgetName('');
        setShowCreateBudgetModal(false);
      } else {
        showToast(result.error?.message || 'Failed to create budget', 'error');
      }
    } catch (error) {
      console.error('Error creating budget:', error);
      showToast('Failed to create budget', 'error');
    } finally {
      setIsCreating(false);
    }
  }, [newBudgetName, addBudget, showToast]);

  const handleRenameBudget = useCallback(async (budgetId: string) => {
    if (!editingName.trim()) {
      showToast('Please enter a budget name', 'error');
      return;
    }

    setOperationInProgress(true);
    try {
      const result = await renameBudget(budgetId, editingName.trim());
      if (result.success) {
        showToast('Budget renamed successfully', 'success');
        setEditingBudgetId(null);
        setEditingName('');
        setDropdownBudgetId(null);
      } else {
        showToast(result.error?.message || 'Failed to rename budget', 'error');
      }
    } catch (error) {
      console.error('Error renaming budget:', error);
      showToast('Failed to rename budget', 'error');
    } finally {
      setOperationInProgress(false);
    }
  }, [editingName, renameBudget, showToast]);

  const handleDeleteBudget = useCallback(async (budgetId: string, budgetName: string) => {
    if (activeBudget?.id === budgetId) {
      showToast('Cannot delete the active budget. Please set another budget as active first.', 'error');
      return;
    }

    Alert.alert(
      'Delete Budget',
      `Are you sure you want to delete "${budgetName}"? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setOperationInProgress(true);
            setDropdownBudgetId(null);
            try {
              const result = await deleteBudget(budgetId);
              if (result.success) {
                showToast('Budget deleted successfully', 'success');
              } else {
                showToast(result.error?.message || 'Failed to delete budget', 'error');
              }
            } catch (error) {
              console.error('Error deleting budget:', error);
              showToast('Failed to delete budget', 'error');
            } finally {
              setOperationInProgress(false);
            }
          },
        },
      ]
    );
  }, [deleteBudget, showToast, activeBudget]);

  const handleDuplicateBudget = useCallback(async (budgetId: string, budgetName: string) => {
    setOperationInProgress(true);
    setDropdownBudgetId(null);
    try {
      const result = await duplicateBudget(budgetId, `${budgetName} (Copy)`);
      if (result.success) {
        showToast('Budget duplicated successfully', 'success');
      } else {
        showToast(result.error?.message || 'Failed to duplicate budget', 'error');
      }
    } catch (error) {
      console.error('Error duplicating budget:', error);
      showToast('Failed to duplicate budget', 'error');
    } finally {
      setOperationInProgress(false);
    }
  }, [duplicateBudget, showToast]);

  const handleSetActiveBudget = useCallback(async (budgetId: string) => {
    setOperationInProgress(true);
    setDropdownBudgetId(null);
    try {
      const result = await setActiveBudget(budgetId);
      if (result.success) {
        console.log('Active budget changed successfully');
      } else {
        showToast(result.error?.message || 'Failed to set active budget', 'error');
      }
    } catch (error) {
      console.error('Error setting active budget:', error);
      showToast('Failed to set active budget', 'error');
    } finally {
      setOperationInProgress(false);
    }
  }, [setActiveBudget, showToast]);

  const handleDropdownPress = useCallback((budgetId: string) => {
    const buttonRef = buttonRefs.current[budgetId];
    if (buttonRef) {
      buttonRef.measure((_x: number, _y: number, width: number, height: number, pageX: number, pageY: number) => {
        setDropdownPosition({
          x: pageX - 180 + width,
          y: pageY + height + 8,
        });
        setDropdownBudgetId(dropdownBudgetId === budgetId ? null : budgetId);
      });
    } else {
      setDropdownPosition({ x: 200, y: 150 });
      setDropdownBudgetId(dropdownBudgetId === budgetId ? null : budgetId);
    }
  }, [dropdownBudgetId]);

  const DropdownMenu = ({ budget }: { budget: Budget }) => {
    const isActive = activeBudget?.id === budget.id;

    return (
      <Modal
        visible={dropdownBudgetId === budget.id}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setDropdownBudgetId(null)}
      >
        <TouchableOpacity
          style={{
            flex: 1,
            backgroundColor: 'rgba(0, 0, 0, 0.3)',
          }}
          activeOpacity={1}
          onPress={() => setDropdownBudgetId(null)}
        >
          <View
            style={{
              position: 'absolute',
              left: dropdownPosition.x,
              top: dropdownPosition.y,
              minWidth: 180,
              backgroundColor: currentColors.backgroundAlt,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: currentColors.border,
              shadowColor: currentColors.text,
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.15,
              shadowRadius: 12,
              elevation: 8,
              paddingVertical: 8,
              zIndex: 1000,
            }}
          >
            {!isActive && (
              <TouchableOpacity
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                }}
                onPress={() => handleSetActiveBudget(budget.id)}
                activeOpacity={0.7}
              >
                <Icon name="checkmark-circle" size={18} style={{ color: currentColors.success }} />
                <Text style={[themedStyles.text, { marginLeft: 12, fontSize: 15 }]}>Set as Active</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 16,
                paddingVertical: 12,
              }}
              onPress={() => {
                setEditingBudgetId(budget.id);
                setEditingName(budget.name);
                setDropdownBudgetId(null);
              }}
              activeOpacity={0.7}
            >
              <Icon name="create" size={18} style={{ color: currentColors.text }} />
              <Text style={[themedStyles.text, { marginLeft: 12, fontSize: 15 }]}>Rename</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 16,
                paddingVertical: 12,
              }}
              onPress={() => handleDuplicateBudget(budget.id, budget.name)}
              activeOpacity={0.7}
            >
              <Icon name="copy" size={18} style={{ color: currentColors.text }} />
              <Text style={[themedStyles.text, { marginLeft: 12, fontSize: 15 }]}>Duplicate</Text>
            </TouchableOpacity>

            {budgets.length > 1 && (
              <TouchableOpacity
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  opacity: isActive ? 0.5 : 1,
                }}
                onPress={() => {
                  if (!isActive) {
                    handleDeleteBudget(budget.id, budget.name);
                  }
                }}
                disabled={isActive}
                activeOpacity={0.7}
              >
                <Icon name="trash" size={18} color={isActive ? currentColors.textSecondary : currentColors.error} />
                <Text style={[themedStyles.text, {
                  marginLeft: 12,
                  fontSize: 15,
                  color: isActive ? currentColors.textSecondary : currentColors.error
                }]}>
                  {isActive ? 'Cannot Delete Active' : 'Delete'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    );
  };

  // Filter currencies based on search query
  const filteredCurrencies = useMemo(() => {
    if (!currencySearchQuery.trim()) {
      return CURRENCIES;
    }

    const query = currencySearchQuery.toLowerCase().trim();
    return CURRENCIES.filter(curr =>
      curr.name.toLowerCase().includes(query) ||
      curr.code.toLowerCase().includes(query) ||
      curr.symbol.toLowerCase().includes(query)
    );
  }, [currencySearchQuery]);

  // Navigation items for iPad sidebar
  const navigationItems = [
    { id: 'budgets' as SettingsSection, icon: 'folder-outline', label: 'Budgets', subtitle: `${appData?.budgets?.length || 0} budget${(appData?.budgets?.length || 0) !== 1 ? 's' : ''}` },
    { id: 'account' as SettingsSection, icon: 'person-outline', label: 'Cloud Sync', subtitle: user ? user.email : 'Backup your data' },
    { id: 'categories' as SettingsSection, icon: 'pricetags-outline', label: 'Categories', subtitle: 'Manage expense categories' },
    { id: 'currency' as SettingsSection, icon: 'card-outline', label: 'Currency', subtitle: `${currency.symbol} ${currency.code}` },
    { id: 'theme' as SettingsSection, icon: 'color-palette-outline', label: 'Theme', subtitle: themeMode.charAt(0).toUpperCase() + themeMode.slice(1) },
    { id: 'tools' as SettingsSection, icon: 'calculator-outline', label: 'Financial Tools', subtitle: 'Credit card calculator' },
    { id: 'about' as SettingsSection, icon: 'information-circle-outline', label: 'About', subtitle: 'App information' },
    { id: 'danger' as SettingsSection, icon: 'warning', label: 'Danger Zone', subtitle: 'Clear all data' },
  ];

  // Render detail view based on selected section
  const renderDetailView = () => {
    switch (selectedSection) {
      case 'budgets':
        return (
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
              <View>
                <Text style={[themedStyles.title, { textAlign: 'left', marginBottom: 8 }]}>Budgets</Text>
                <Text style={[themedStyles.textSecondary]}>
                  Manage your budgets, create new ones, or switch between existing budgets.
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowCreateBudgetModal(true)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: currentColors.primary,
                  paddingHorizontal: 20,
                  paddingVertical: 12,
                  borderRadius: 12,
                }}
              >
                <Icon name="add" size={20} style={{ color: 'white', marginRight: 8 }} />
                <Text style={{ color: 'white', fontSize: 16, fontWeight: '600' }}>New Budget</Text>
              </TouchableOpacity>
            </View>

            {operationInProgress && (
              <View style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0, 0, 0, 0.3)',
                justifyContent: 'center',
                alignItems: 'center',
                zIndex: 9999,
              }}>
                <View style={{
                  backgroundColor: currentColors.backgroundAlt,
                  padding: 24,
                  borderRadius: 16,
                  alignItems: 'center',
                  minWidth: 150,
                }}>
                  <ActivityIndicator size="large" color={currentColors.primary} />
                  <Text style={[themedStyles.text, { marginTop: 16, fontSize: 16 }]}>
                    Processing...
                  </Text>
                </View>
              </View>
            )}

            <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={true}>
              {budgets.length > 0 ? budgets.map((budget) => {
                const isActive = activeBudget?.id === budget.id;
                const isEditing = editingBudgetId === budget.id;

                return (
                  <View
                    key={budget.id}
                    style={[
                      themedStyles.card,
                      {
                        position: 'relative',
                        borderWidth: isActive ? 2 : 1,
                        borderColor: isActive ? currentColors.success : currentColors.border,
                        backgroundColor: isActive ? currentColors.success + '08' : currentColors.backgroundAlt,
                        boxShadow: isActive ? '0px 4px 12px rgba(34, 197, 94, 0.15)' : '0px 2px 4px rgba(0,0,0,0.05)',
                      }
                    ]}
                  >
                    <View style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}>
                      <View style={{ flex: 1 }}>
                        {isEditing ? (
                          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                            <TextInput
                              style={[themedStyles.input, { flex: 1, marginBottom: 0 }]}
                              value={editingName}
                              onChangeText={setEditingName}
                              autoFocus
                              selectTextOnFocus
                            />
                            <TouchableOpacity
                              onPress={() => handleRenameBudget(budget.id)}
                              style={{ padding: 8 }}
                            >
                              <Icon name="checkmark" size={20} style={{ color: currentColors.success }} />
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => {
                                setEditingBudgetId(null);
                                setEditingName('');
                              }}
                              style={{ padding: 8 }}
                            >
                              <Icon name="close" size={20} style={{ color: currentColors.error }} />
                            </TouchableOpacity>
                          </View>
                        ) : (
                          <TouchableOpacity
                            onPress={() => !isActive && handleSetActiveBudget(budget.id)}
                            style={{ flex: 1 }}
                            disabled={operationInProgress}
                          >
                            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                              <Text style={[
                                themedStyles.text,
                                {
                                  fontWeight: isActive ? '700' : '600',
                                  flex: 1,
                                  fontSize: 18,
                                  color: isActive ? currentColors.success : currentColors.text
                                }
                              ]}>
                                {budget.name}
                              </Text>
                              {isActive && (
                                <View style={[
                                  {
                                    backgroundColor: currentColors.success,
                                    paddingHorizontal: 10,
                                    paddingVertical: 4,
                                    borderRadius: 8,
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                  }
                                ]}>
                                  <Icon name="checkmark-circle" size={14} color="#FFFFFF" style={{ marginRight: 4 }} />
                                  <Text style={[
                                    {
                                      color: '#FFFFFF',
                                      fontSize: 12,
                                      fontWeight: '700'
                                    }
                                  ]}>
                                    Active
                                  </Text>
                                </View>
                              )}
                            </View>

                            <View style={{ flexDirection: 'column', gap: 4 }}>
                              <View style={{ flexDirection: 'row', gap: 20 }}>
                                <Text style={[themedStyles.textSecondary, { fontSize: 14 }]}>
                                  {budget.people?.length || 0} people
                                </Text>
                                <Text style={[themedStyles.textSecondary, { fontSize: 14 }]}>
                                  {budget.expenses?.length || 0} expenses
                                </Text>
                              </View>
                              <View style={{ flexDirection: 'row', gap: 20 }}>
                                <Text style={[themedStyles.textSecondary, { fontSize: 13 }]}>
                                  Created: {formatDate(budget.createdAt)}
                                </Text>
                                <Text style={[themedStyles.textSecondary, { fontSize: 13 }]}>
                                  Modified: {formatDate(budget.modifiedAt)}
                                </Text>
                              </View>
                            </View>
                          </TouchableOpacity>
                        )}
                      </View>

                      {!isEditing && (
                        <TouchableOpacity
                          ref={(ref) => {
                            buttonRefs.current[budget.id] = ref;
                          }}
                          onPress={() => handleDropdownPress(budget.id)}
                          style={{
                            padding: 8,
                            marginLeft: 12,
                            borderRadius: 8,
                            backgroundColor: currentColors.background + '80'
                          }}
                          activeOpacity={0.7}
                          disabled={operationInProgress}
                        >
                          <Icon name="ellipsis-vertical" size={20} style={{ color: currentColors.text }} />
                        </TouchableOpacity>
                      )}
                    </View>

                    <DropdownMenu budget={budget} />
                  </View>
                );
              }) : (
                <View style={[themedStyles.card, themedStyles.centerContent, { paddingVertical: 60 }]}>
                  <Icon name="folder" size={64} style={{ color: currentColors.textSecondary }} />
                  <Text style={[themedStyles.text, { marginTop: 20, textAlign: 'center', fontSize: 18, fontWeight: '600' }]}>
                    No budgets yet
                  </Text>
                  <Text style={[themedStyles.textSecondary, { textAlign: 'center', marginTop: 8, fontSize: 15 }]}>
                    Tap the New Budget button to create your first budget
                  </Text>
                </View>
              )}
            </ScrollView>
          </View>
        );

      case 'account':
        return (
          <View style={{ flex: 1 }}>
            <View style={{ marginBottom: 24 }}>
              <Text style={[themedStyles.title, { textAlign: 'left', marginBottom: 8 }]}>Cloud Sync</Text>
              <Text style={[themedStyles.textSecondary]}>
                Your data is automatically synced to the cloud for access on all your devices.
              </Text>
            </View>

            {user ? (
              <View style={[themedStyles.card, { padding: 24 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 24 }}>
                  <View style={{
                    width: 60,
                    height: 60,
                    borderRadius: 30,
                    backgroundColor: currentColors.primary + '20',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: 16
                  }}>
                    <Icon name="person" size={30} style={{ color: currentColors.primary }} />
                  </View>
                  <View>
                    <Text style={[themedStyles.text, { fontWeight: '700', fontSize: 18 }]}>{user.email}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                      <View style={{
                        width: 8,
                        height: 8,
                        borderRadius: 4,
                        backgroundColor: currentColors.success,
                        marginRight: 8
                      }} />
                      <Text style={[themedStyles.textSecondary, { fontSize: 14 }]}>
                        {isSyncing ? 'Syncing...' : 'Connected & Synced'}
                      </Text>
                    </View>
                  </View>
                </View>

                <Button
                  text="Sign Out"
                  variant="outline"
                  onPress={async () => {
                    if (Platform.OS === 'web') {
                      const confirmed = (window as any).confirm('Are you sure you want to sign out?');
                      if (confirmed) {
                        await supabase.auth.signOut();
                      }
                    } else {
                      Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Sign Out',
                          style: 'destructive',
                          onPress: async () => {
                            await supabase.auth.signOut();
                            showToast('Signed out successfully', 'success');
                          },
                        },
                      ]);
                    }
                  }}
                  style={{ borderColor: currentColors.error }}
                  // @ts-ignore
                  textStyle={{ color: currentColors.error }}
                />
              </View>
            ) : (
              <View style={[themedStyles.card, { padding: 24 }]}>
                <Text style={[themedStyles.subtitle, { marginBottom: 20 }]}>
                  {authMode === 'login' ? 'Welcome Back' : 'Create Account'}
                </Text>

                <TextInput
                  style={[themedStyles.input, { marginBottom: 12 }]}
                  placeholder="Email"
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                />

                <TextInput
                  style={[themedStyles.input, { marginBottom: 20 }]}
                  placeholder="Password"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                />

                <Button
                  text={authLoading ? 'Please wait...' : (authMode === 'login' ? 'Sign In' : 'Sign Up')}
                  onPress={async () => {
                    setAuthLoading(true);
                    try {
                      const { error } = authMode === 'login'
                        ? await supabase.auth.signInWithPassword({ email, password })
                        : await supabase.auth.signUp({ email, password });

                      if (error) throw error;
                      showToast(authMode === 'login' ? 'Signed in!' : 'Registered! Please check your email.', 'success');
                    } catch (err: any) {
                      showToast(err.message, 'error');
                    } finally {
                      setAuthLoading(false);
                    }
                  }}
                  disabled={authLoading || !email || !password}
                />

                <TouchableOpacity
                  onPress={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}
                  style={{ marginTop: 16, alignItems: 'center' }}
                >
                  <Text style={[themedStyles.textSecondary, { color: currentColors.primary, fontWeight: '600' }]}>
                    {authMode === 'login' ? "Don't have an account? Sign Up" : "Already have an account? Sign In"}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={[themedStyles.card, { marginTop: 24, backgroundColor: currentColors.info + '10', borderColor: currentColors.info + '30' }]}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                <Icon name="cloud-done-outline" size={24} style={{ color: currentColors.info, marginRight: 12, marginTop: 2 }} />
                <View style={{ flex: 1 }}>
                  <Text style={[themedStyles.text, { fontWeight: '700', marginBottom: 4, color: currentColors.info }]}>Cloud-Native Budgeting</Text>
                  <Text style={[themedStyles.textSecondary, { fontSize: 13, lineHeight: 18 }]}>
                    All your budget data is securely stored in your private cloud account. Changes sync instantly across all your devices when you're online.
                  </Text>
                </View>
              </View>
            </View>
          </View>
        );

      case 'categories':
        return (
          <View style={{ flex: 1 }}>
            <View style={{ marginBottom: 24 }}>
              <Text style={[themedStyles.title, { textAlign: 'left', marginBottom: 8 }]}>Categories</Text>
              <Text style={[themedStyles.textSecondary]}>
                Customize your expense categories to better organize your spending.
              </Text>
            </View>

            <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={true}>
              <View style={[themedStyles.card, { marginBottom: 16 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                  <Icon name="shield-checkmark-outline" size={20} style={{ color: currentColors.primary, marginRight: 8 }} />
                  <Text style={[themedStyles.text, { fontWeight: '600' }]}>Default Categories</Text>
                </View>
                <Text style={[themedStyles.textSecondary, { marginBottom: 12, fontSize: 14 }]}>
                  These categories cannot be deleted.
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                  {DEFAULT_CATEGORIES.map((c) => (
                    <View
                      key={c}
                      style={[
                        themedStyles.badge,
                        {
                          backgroundColor: currentColors.border,
                          paddingHorizontal: 12,
                          paddingVertical: 6,
                          borderRadius: 16,
                          marginRight: 8,
                          marginBottom: 8,
                        },
                      ]}
                    >
                      <Text style={[themedStyles.badgeText, { color: currentColors.text, fontSize: 12 }]}>{c}</Text>
                    </View>
                  ))}
                </View>
              </View>

              <View style={[themedStyles.card, { flex: 1 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Icon name="pricetags-outline" size={20} style={{ color: currentColors.primary, marginRight: 8 }} />
                    <Text style={[themedStyles.text, { fontWeight: '600' }]}>Custom Categories</Text>
                  </View>
                  <TouchableOpacity
                    onPress={handleCreateCategory}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      backgroundColor: currentColors.primary,
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      borderRadius: 20,
                    }}
                    accessibilityLabel="Add new category"
                    accessibilityRole="button"
                  >
                    <Icon name="add" size={16} style={{ color: 'white', marginRight: 4 }} />
                    <Text style={{ color: 'white', fontSize: 12, fontWeight: '600' }}>Add New</Text>
                  </TouchableOpacity>
                </View>

                {categoriesLoading ? (
                  <View style={{ alignItems: 'center', paddingVertical: 20 }}>
                    <ActivityIndicator size="small" color={currentColors.primary} />
                    <Text style={[themedStyles.textSecondary, { marginTop: 8 }]}>Loading...</Text>
                  </View>
                ) : customs.length === 0 ? (
                  <View style={{ alignItems: 'center', paddingVertical: 20 }}>
                    <Text style={[themedStyles.textSecondary, { textAlign: 'center', marginBottom: 16 }]}>
                      No custom categories yet.
                    </Text>
                    <TouchableOpacity
                      onPress={handleCreateCategory}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        backgroundColor: currentColors.primary + '15',
                        paddingHorizontal: 16,
                        paddingVertical: 12,
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: currentColors.primary + '30',
                      }}
                    >
                      <Icon name="add" size={20} style={{ color: currentColors.primary, marginRight: 8 }} />
                      <Text style={{ color: currentColors.primary, fontSize: 14, fontWeight: '600' }}>Create Your First Category</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  customs.map((c) => {
                    const used = isInUse(c);
                    return (
                      <View
                        key={c}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          paddingVertical: 12,
                          borderBottomWidth: customs.indexOf(c) === customs.length - 1 ? 0 : 1,
                          borderBottomColor: currentColors.border,
                        }}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <View
                            style={[
                              themedStyles.badge,
                              {
                                backgroundColor: currentColors.secondary + '20',
                                paddingHorizontal: 10,
                                paddingVertical: 6,
                                borderRadius: 16,
                                marginRight: 12,
                                borderWidth: 1,
                                borderColor: currentColors.secondary,
                              },
                            ]}
                          >
                            <Text style={[themedStyles.text, { color: currentColors.secondary, fontSize: 12, fontWeight: '700' }]}>{c}</Text>
                          </View>
                          {used && <Text style={[themedStyles.textSecondary, { color: currentColors.warning }]}>In use</Text>}
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <TouchableOpacity
                            onPress={() => handleRenameCategory(c)}
                            style={{
                              padding: 10,
                              borderRadius: 8,
                              backgroundColor: currentColors.primary + '15',
                              marginRight: 8,
                            }}
                            accessibilityLabel={`Rename ${c}`}
                            accessibilityRole="button"
                          >
                            <Icon name="pencil-outline" size={20} style={{ color: currentColors.primary }} />
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => handleDeleteCategory(c)}
                            disabled={used}
                            style={{
                              padding: 10,
                              borderRadius: 8,
                              backgroundColor: used ? currentColors.border : currentColors.error + '15',
                            }}
                            accessibilityLabel={`Delete ${c}`}
                            accessibilityRole="button"
                          >
                            <Icon
                              name="trash-outline"
                              size={20}
                              style={{ color: used ? currentColors.textSecondary : currentColors.error }}
                            />
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })
                )}
              </View>
            </ScrollView>
          </View>
        );

      case 'currency':
        return (
          <View style={{ flex: 1 }}>
            <View style={{ marginBottom: 24 }}>
              <Text style={[themedStyles.title, { textAlign: 'left', marginBottom: 8 }]}>Currency</Text>
              <Text style={[themedStyles.textSecondary]}>
                Select your preferred currency for displaying amounts throughout the app.
              </Text>
            </View>

            <View style={[themedStyles.card, { marginBottom: 16 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                <Icon name="search" size={20} style={{ color: currentColors.textSecondary, marginRight: 8 }} />
                <Text style={[themedStyles.text, { fontWeight: '600' }]}>Search Currencies</Text>
              </View>
              <TextInput
                style={[
                  themedStyles.input,
                  {
                    marginBottom: 0,
                    borderColor: currentColors.border,
                  }
                ]}
                value={currencySearchQuery}
                onChangeText={setCurrencySearchQuery}
                placeholder="Search by name, code, or symbol..."
                placeholderTextColor={currentColors.textSecondary}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <View style={[themedStyles.card, { marginBottom: 16, paddingBottom: 12 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Icon name="globe-outline" size={20} style={{ color: currentColors.primary, marginRight: 8 }} />
                <Text style={[themedStyles.text, { fontWeight: '600' }]}>
                  {currencySearchQuery.trim()
                    ? `Search Results (${filteredCurrencies.length})`
                    : `All Currencies (${CURRENCIES.length})`
                  }
                </Text>
              </View>
            </View>

            <View style={[
              themedStyles.card,
              {
                flex: 1,
                padding: 0,
                overflow: 'hidden'
              }
            ]}>
              <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ padding: 16 }}
                showsVerticalScrollIndicator={true}
                nestedScrollEnabled={true}
              >
                {filteredCurrencies.length === 0 ? (
                  <View style={{ alignItems: 'center', padding: 20 }}>
                    <Icon name="search" size={32} style={{ color: currentColors.textSecondary, marginBottom: 8 }} />
                    <Text style={[themedStyles.textSecondary, { textAlign: 'center' }]}>
                      No currencies found matching "{currencySearchQuery}"
                    </Text>
                  </View>
                ) : (
                  filteredCurrencies.map((curr, index) => (
                    <TouchableOpacity
                      key={curr.code}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        paddingVertical: 12,
                        borderBottomWidth: index === filteredCurrencies.length - 1 ? 0 : 1,
                        borderBottomColor: currentColors.border,
                      }}
                      onPress={() => handleCurrencyChange(curr)}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[themedStyles.text, { fontWeight: '600', marginBottom: 2 }]}>
                          {curr.name}
                        </Text>
                        <Text style={themedStyles.textSecondary}>
                          {curr.symbol} • {curr.code}
                        </Text>
                      </View>
                      {currency.code === curr.code && (
                        <Icon name="checkmark-circle" size={24} style={{ color: currentColors.primary }} />
                      )}
                    </TouchableOpacity>
                  ))
                )}
              </ScrollView>
            </View>
          </View>
        );

      case 'theme':
        return (
          <View style={{ flex: 1 }}>
            <Text style={[themedStyles.title, { textAlign: 'left', marginBottom: 16 }]}>Theme</Text>
            <Text style={[themedStyles.textSecondary, { marginBottom: 24 }]}>
              Choose your preferred color scheme for the app.
            </Text>
            <View style={themedStyles.card}>
              {[
                { key: 'system', label: 'System', description: 'Follow device settings' },
                { key: 'light', label: 'Light', description: 'Light color scheme' },
                { key: 'dark', label: 'Dark', description: 'Dark color scheme' },
              ].map((theme, index) => (
                <TouchableOpacity
                  key={theme.key}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingVertical: 16,
                    borderBottomWidth: index === 2 ? 0 : 1,
                    borderBottomColor: currentColors.border,
                  }}
                  onPress={() => handleThemeChange(theme.key as any)}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[themedStyles.text, { fontWeight: '600', marginBottom: 4 }]}>{theme.label}</Text>
                    <Text style={themedStyles.textSecondary}>{theme.description}</Text>
                  </View>
                  {themeMode === theme.key && (
                    <Icon name="checkmark-circle" size={24} style={{ color: currentColors.primary }} />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        );

      case 'tools':
        return (
          <View style={{ flex: 1 }}>
            <Text style={[themedStyles.title, { textAlign: 'left', marginBottom: 16 }]}>Financial Tools</Text>
            <Text style={[themedStyles.textSecondary, { marginBottom: 24 }]}>
              Access helpful financial calculators and tools.
            </Text>
            <TouchableOpacity
              style={[themedStyles.card, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
              onPress={() => router.push('/tools')}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                <Icon name="calculator-outline" size={24} style={{ color: currentColors.primary, marginRight: 16 }} />
                <View style={{ flex: 1 }}>
                  <Text style={[themedStyles.text, { fontWeight: '600', marginBottom: 4 }]}>Credit Card Payoff Calculator</Text>
                  <Text style={themedStyles.textSecondary}>
                    Calculate how long it will take to pay off your credit card
                  </Text>
                </View>
              </View>
              <Icon name="chevron-forward" size={24} style={{ color: currentColors.textSecondary }} />
            </TouchableOpacity>
          </View>
        );

      case 'about':
        return (
          <View style={{ flex: 1 }}>
            <Text style={[themedStyles.title, { textAlign: 'left', marginBottom: 16 }]}>About</Text>
            <Text style={[themedStyles.textSecondary, { marginBottom: 24 }]}>
              Information about Budget Flow and your data.
            </Text>
            <View style={themedStyles.card}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
                <Icon name="wallet-outline" size={32} style={{ color: currentColors.primary, marginRight: 16 }} />
                <View>
                  <Text style={[themedStyles.subtitle, { marginBottom: 4 }]}>Budget Flow</Text>
                  <Text style={themedStyles.textSecondary}>Version 1.0.0</Text>
                </View>
              </View>
              <View style={{ paddingTop: 20, borderTopWidth: 1, borderTopColor: currentColors.border }}>
                <Text style={[themedStyles.text, { marginBottom: 12, lineHeight: 24 }]}>
                  Cloud-native budget tracking app
                </Text>
                <Text style={[themedStyles.textSecondary, { lineHeight: 22 }]}>
                  • Secure cloud sync{'\n'}
                  • Access on all your devices{'\n'}
                  • Complete privacy & encryption{'\n'}
                  • Track household and personal expenses{'\n'}
                  • Manage multiple budgets
                </Text>
              </View>
            </View>
          </View>
        );

      case 'danger':
        return (
          <View style={{ flex: 1 }}>
            <Text style={[themedStyles.title, { textAlign: 'left', marginBottom: 16, color: currentColors.error }]}>Danger Zone</Text>
            <Text style={[themedStyles.textSecondary, { marginBottom: 24 }]}>
              Irreversible actions that will permanently delete your data.
            </Text>
            <View style={[
              themedStyles.card,
              {
                borderColor: currentColors.error + '40',
                borderWidth: 2,
                backgroundColor: currentColors.error + '08',
              }
            ]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
                <Icon name="warning" size={32} style={{ color: currentColors.error, marginRight: 16 }} />
                <Text style={[themedStyles.subtitle, { color: currentColors.error, marginBottom: 0 }]}>
                  Clear All Data
                </Text>
              </View>

              <Text style={[themedStyles.text, { marginBottom: 24, lineHeight: 24 }]}>
                This action will permanently delete all your budgets, people, expenses, and settings. This cannot be undone.
              </Text>

              <TouchableOpacity
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingVertical: 16,
                  paddingHorizontal: 24,
                  backgroundColor: currentColors.error,
                  borderRadius: 12,
                  borderWidth: 2,
                  borderColor: currentColors.error,
                }}
                onPress={handleClearAllData}
              >
                <Icon name="trash" size={24} style={{ color: currentColors.background, marginRight: 12 }} />
                <Text style={[themedStyles.text, { color: currentColors.background, fontWeight: '700', fontSize: 18 }]}>
                  Clear All Data
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        );

      default:
        return null;
    }
  };

  // iPad split view layout
  if (isPad) {
    return (
      <View style={[themedStyles.container, { backgroundColor: currentColors.background }]}>
        <StandardHeader
          title="Settings"
          showLeftIcon={false}
          showRightIcon={false}
          backgroundColor={currentColors.backgroundAlt}
        />

        <View style={{ flex: 1, flexDirection: 'row' }}>
          {/* Left Navigation Sidebar */}
          <View style={{
            width: 320,
            backgroundColor: currentColors.backgroundAlt,
            borderRightWidth: 1,
            borderRightColor: currentColors.border,
          }}>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
              {navigationItems.map((item, index) => (
                <TouchableOpacity
                  key={item.id}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    padding: 16,
                    borderRadius: 12,
                    marginBottom: 8,
                    backgroundColor: selectedSection === item.id ? currentColors.primary + '15' : 'transparent',
                    borderWidth: selectedSection === item.id ? 2 : 0,
                    borderColor: selectedSection === item.id ? currentColors.primary : 'transparent',
                  }}
                  onPress={() => setSelectedSection(item.id)}
                >
                  <Icon
                    name={item.icon as any}
                    size={24}
                    style={{
                      color: selectedSection === item.id ? currentColors.primary : currentColors.text,
                      marginRight: 16
                    }}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={[
                      themedStyles.text,
                      {
                        fontWeight: selectedSection === item.id ? '700' : '600',
                        marginBottom: 4,
                        color: selectedSection === item.id ? currentColors.primary : currentColors.text
                      }
                    ]}>
                      {item.label}
                    </Text>
                    <Text style={[
                      themedStyles.textSecondary,
                      {
                        fontSize: 13,
                        color: selectedSection === item.id ? currentColors.primary + 'CC' : currentColors.textSecondary
                      }
                    ]}>
                      {item.subtitle}
                    </Text>
                  </View>
                  {selectedSection === item.id && (
                    <Icon name="chevron-forward" size={20} style={{ color: currentColors.primary }} />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* App Version Footer */}
            <View style={{
              padding: 16,
              borderTopWidth: 1,
              borderTopColor: currentColors.border,
              backgroundColor: currentColors.background,
            }}>
              <Text style={[themedStyles.textSecondary, { fontSize: 12, textAlign: 'center', lineHeight: 18 }]}>
                Budget Flow v1.0.0{'\n'}
                Secure Cloud Sync
              </Text>
            </View>
          </View>

          {/* Right Detail View */}
          <View style={{ flex: 1, padding: 48, paddingBottom: 140 }}>
            {renderDetailView()}
          </View>
        </View>

        {/* Rename Category Modal */}
        <Modal
          visible={renameModalVisible}
          transparent={true}
          animationType="fade"
          onRequestClose={handleRenameCancel}
        >
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <View style={{
              flex: 1,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              justifyContent: 'center',
              alignItems: 'center',
              paddingHorizontal: 20,
            }}>
              <View style={[
                themedStyles.card,
                {
                  width: '100%',
                  maxWidth: 400,
                  padding: 24,
                  borderRadius: 16,
                  backgroundColor: currentColors.background,
                }
              ]}>
                <Text style={[
                  themedStyles.title,
                  {
                    marginBottom: 8,
                    textAlign: 'center',
                    color: currentColors.text,
                    fontSize: 20,
                    fontWeight: '700'
                  }
                ]}>
                  Rename Category
                </Text>
                <Text style={[
                  themedStyles.textSecondary,
                  {
                    marginBottom: 20,
                    textAlign: 'center',
                    color: currentColors.textSecondary,
                    fontSize: 14
                  }
                ]}>
                  Enter a new name for "{categoryToRename}"
                </Text>

                <View style={{ marginBottom: 24 }}>
                  <Text style={[
                    themedStyles.text,
                    {
                      marginBottom: 8,
                      color: currentColors.text,
                      fontSize: 16,
                      fontWeight: '600'
                    }
                  ]}>
                    Category Name
                  </Text>
                  <TextInput
                    style={[
                      themedStyles.input,
                      {
                        borderColor: currentColors.border,
                        borderWidth: 1,
                        borderRadius: 12,
                        paddingHorizontal: 16,
                        paddingVertical: 12,
                        fontSize: 16,
                        color: currentColors.text,
                        backgroundColor: currentColors.background,
                      }
                    ]}
                    value={newCategoryName}
                    onChangeText={setNewCategoryName}
                    placeholder="Enter category name"
                    placeholderTextColor={currentColors.textSecondary}
                    maxLength={20}
                    autoFocus={true}
                    selectTextOnFocus={true}
                  />
                </View>

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                  <Button
                    text="Cancel"
                    onPress={handleRenameCancel}
                    variant="outline"
                    style={{ flex: 1 }}
                  />
                  <Button
                    text={renaming ? "Renaming..." : "Rename"}
                    onPress={handleRenameSubmit}
                    disabled={!newCategoryName.trim() || newCategoryName.trim() === categoryToRename || renaming}
                    style={{ flex: 1 }}
                  />
                </View>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* Create Category Modal */}
        <Modal
          visible={createModalVisible}
          transparent={true}
          animationType="fade"
          onRequestClose={handleCreateCancel}
        >
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <View style={{
              flex: 1,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              justifyContent: 'center',
              alignItems: 'center',
              paddingHorizontal: 20,
            }}>
              <View style={[
                themedStyles.card,
                {
                  width: '100%',
                  maxWidth: 400,
                  padding: 24,
                  borderRadius: 16,
                  backgroundColor: currentColors.background,
                }
              ]}>
                <Text style={[
                  themedStyles.title,
                  {
                    marginBottom: 8,
                    textAlign: 'center',
                    color: currentColors.text,
                    fontSize: 20,
                    fontWeight: '700'
                  }
                ]}>
                  Create New Category
                </Text>
                <Text style={[
                  themedStyles.textSecondary,
                  {
                    marginBottom: 20,
                    textAlign: 'center',
                    color: currentColors.textSecondary,
                    fontSize: 14
                  }
                ]}>
                  Enter a name for your new custom category
                </Text>

                <View style={{ marginBottom: 24 }}>
                  <Text style={[
                    themedStyles.text,
                    {
                      marginBottom: 8,
                      color: currentColors.text,
                      fontSize: 16,
                      fontWeight: '600'
                    }
                  ]}>
                    Category Name
                  </Text>
                  <TextInput
                    style={[
                      themedStyles.input,
                      {
                        borderColor: currentColors.border,
                        borderWidth: 1,
                        borderRadius: 12,
                        paddingHorizontal: 16,
                        paddingVertical: 12,
                        fontSize: 16,
                        color: currentColors.text,
                        backgroundColor: currentColors.background,
                      }
                    ]}
                    value={newCategoryInput}
                    onChangeText={setNewCategoryInput}
                    placeholder="Enter category name"
                    placeholderTextColor={currentColors.textSecondary}
                    maxLength={20}
                    autoFocus={true}
                  />
                </View>

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                  <Button
                    text="Cancel"
                    onPress={handleCreateCancel}
                    variant="outline"
                    style={{ flex: 1 }}
                  />
                  <Button
                    text={creating ? "Creating..." : "Create"}
                    onPress={handleCreateSubmit}
                    disabled={!newCategoryInput.trim() || creating}
                    style={{ flex: 1 }}
                  />
                </View>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* Create Budget Modal */}
        <Modal
          visible={showCreateBudgetModal}
          transparent={true}
          animationType="fade"
          onRequestClose={() => {
            setShowCreateBudgetModal(false);
            setNewBudgetName('');
          }}
        >
          <View style={{
            flex: 1,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            justifyContent: 'center',
            alignItems: 'center',
          }}>
            <View style={{
              backgroundColor: currentColors.backgroundAlt,
              borderRadius: 16,
              padding: 24,
              margin: 20,
              width: '90%',
              maxWidth: 400,
              borderWidth: 1,
              borderColor: currentColors.border,
            }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <Text style={[themedStyles.subtitle, { marginBottom: 0, fontSize: 20 }]}>Create New Budget</Text>
                <TouchableOpacity onPress={() => {
                  setShowCreateBudgetModal(false);
                  setNewBudgetName('');
                }}>
                  <Icon name="close" size={24} style={{ color: currentColors.text }} />
                </TouchableOpacity>
              </View>

              <Text style={[themedStyles.text, { marginBottom: 8, fontWeight: '600' }]}>
                Budget Name:
              </Text>

              <TextInput
                style={themedStyles.input}
                placeholder="Enter budget name"
                placeholderTextColor={currentColors.textSecondary}
                value={newBudgetName}
                onChangeText={setNewBudgetName}
                editable={!isCreating}
                autoFocus
              />

              <View style={{ flexDirection: 'row', gap: 12, marginTop: 20 }}>
                <View style={{ flex: 1 }}>
                  <Button
                    text="Cancel"
                    onPress={() => {
                      setShowCreateBudgetModal(false);
                      setNewBudgetName('');
                    }}
                    disabled={isCreating}
                    variant="outline"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Button
                    text={isCreating ? 'Creating...' : 'Create'}
                    onPress={handleCreateBudget}
                    disabled={!newBudgetName.trim() || isCreating}
                    variant="primary"
                  />
                </View>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  // iPhone layout (original single-column layout) - keeping all existing modals
  return (
    <View style={[themedStyles.container, { backgroundColor: currentColors.background }]}>
      <StandardHeader
        title="Settings"
        showLeftIcon={false}
        showRightIcon={false}
        backgroundColor={currentColors.backgroundAlt}
      />

      <ScrollView style={themedStyles.content} contentContainerStyle={[themedStyles.scrollContent, { paddingHorizontal: 0, paddingTop: 16 }]}>
        {/* App Info */}
        <View style={[themedStyles.card, { marginBottom: 24 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
            <Icon name="wallet-outline" size={24} style={{ color: currentColors.primary, marginRight: 12 }} />
            <Text style={[themedStyles.subtitle, { flex: 1 }]}>Budget Flow</Text>
          </View>
          <Text style={themedStyles.textSecondary}>
            Secure cloud-native budget tracking
          </Text>
        </View>

        {/* Budgets */}
        <View style={[themedStyles.card, { marginBottom: 16 }]}>
          <TouchableOpacity
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              minHeight: 44,
            }}
            onPress={() => router.push('/budgets')}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
              <Icon name="folder-outline" size={20} style={{ color: currentColors.text, marginRight: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={[themedStyles.text, { fontWeight: '600' }]}>Manage Budgets</Text>
                <Text style={themedStyles.textSecondary}>
                  {appData?.budgets?.length || 0} budget{(appData?.budgets?.length || 0) !== 1 ? 's' : ''}
                </Text>
              </View>
            </View>
            <Icon name="chevron-forward" size={20} style={{ color: currentColors.textSecondary }} />
          </TouchableOpacity>
        </View>

        {/* Categories */}
        <View style={[themedStyles.card, { marginBottom: 16 }]}>
          <TouchableOpacity
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              minHeight: 44,
            }}
            onPress={() => router.push('/manage-categories')}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
              <Icon name="pricetags-outline" size={20} style={{ color: currentColors.text, marginRight: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={[themedStyles.text, { fontWeight: '600' }]}>Manage Categories</Text>
                <Text style={themedStyles.textSecondary}>
                  Customize expense categories
                </Text>
              </View>
            </View>
            <Icon name="chevron-forward" size={20} style={{ color: currentColors.textSecondary }} />
          </TouchableOpacity>
        </View>

        {/* Currency - Opens modal on iPhone */}
        <View style={[themedStyles.card, { marginBottom: 16 }]}>
          <TouchableOpacity
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              minHeight: 44,
            }}
            onPress={() => {
              Alert.alert(
                'Select Currency',
                'Choose your preferred currency',
                [
                  { text: 'Cancel', style: 'cancel' },
                  ...CURRENCIES.slice(0, 10).map(curr => ({
                    text: `${curr.symbol} ${curr.name} (${curr.code})`,
                    onPress: () => handleCurrencyChange(curr)
                  })),
                  {
                    text: 'View All Currencies',
                    onPress: () => {
                      // Use native prompt on web, show message on native
                      if (Platform.OS === 'web') {
                        const text = window.prompt('Search Currency\n\nEnter currency name or code:');
                        if (text) {
                          const found = CURRENCIES.find(c =>
                            c.code.toLowerCase() === text.toLowerCase() ||
                            c.name.toLowerCase().includes(text.toLowerCase())
                          );
                          if (found) {
                            handleCurrencyChange(found);
                          } else {
                            Alert.alert('Not Found', 'Currency not found. Please try again.');
                          }
                        }
                      } else {
                        Alert.alert('Currency Search', 'Please use the currency selector to browse all available currencies.');
                      }
                    }
                  }
                ]
              );
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
              <Icon name="card-outline" size={20} style={{ color: currentColors.text, marginRight: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={[themedStyles.text, { fontWeight: '600' }]}>Currency</Text>
                <Text style={themedStyles.textSecondary}>
                  {currency.symbol} {currency.name} ({currency.code})
                </Text>
              </View>
            </View>
            <Icon name="chevron-forward" size={20} style={{ color: currentColors.textSecondary }} />
          </TouchableOpacity>
        </View>

        {/* Theme */}
        <View style={[themedStyles.card, { marginBottom: 16 }]}>
          <Text style={[themedStyles.text, { fontWeight: '600', marginBottom: 12 }]}>Theme</Text>
          {[
            { key: 'system', label: 'System' },
            { key: 'light', label: 'Light' },
            { key: 'dark', label: 'Dark' },
          ].map((theme) => (
            <TouchableOpacity
              key={theme.key}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingVertical: 8,
                borderBottomWidth: theme.key === 'dark' ? 0 : 1,
                borderBottomColor: currentColors.border,
              }}
              onPress={() => handleThemeChange(theme.key as any)}
            >
              <Text style={themedStyles.text}>{theme.label}</Text>
              {themeMode === theme.key && (
                <Icon name="checkmark" size={20} style={{ color: currentColors.primary }} />
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* Tools */}
        <View style={[themedStyles.card, { marginBottom: 16 }]}>
          <TouchableOpacity
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              minHeight: 44,
            }}
            onPress={() => router.push('/tools')}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
              <Icon name="calculator-outline" size={20} style={{ color: currentColors.text, marginRight: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={[themedStyles.text, { fontWeight: '600' }]}>Financial Tools</Text>
                <Text style={themedStyles.textSecondary}>
                  Credit card payoff calculator
                </Text>
              </View>
            </View>
            <Icon name="chevron-forward" size={20} style={{ color: currentColors.textSecondary }} />
          </TouchableOpacity>
        </View>

        {/* Logout (Mobile Only) */}
        {!isPad && (
          <View style={[themedStyles.card, { marginBottom: 16 }]}>
            <TouchableOpacity
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                minHeight: 44,
              }}
              onPress={async () => {
                if (Platform.OS === 'web') {
                  const confirmed = (window as any).confirm('Are you sure you want to sign out?');
                  if (confirmed) {
                    await supabase.auth.signOut();
                    showToast('Signed out successfully', 'success');
                  }
                } else {
                  Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Sign Out',
                      style: 'destructive',
                      onPress: async () => {
                        await supabase.auth.signOut();
                        showToast('Signed out successfully', 'success');
                      },
                    },
                  ]);
                }
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                <Icon name="log-out-outline" size={20} style={{ color: currentColors.error, marginRight: 12 }} />
                <View style={{ flex: 1 }}>
                  <Text style={[themedStyles.text, { fontWeight: '600', color: currentColors.error }]}>Log Out</Text>
                  <Text style={themedStyles.textSecondary}>
                    {user?.email}
                  </Text>
                </View>
              </View>
              <Icon name="chevron-forward" size={20} style={{ color: currentColors.textSecondary }} />
            </TouchableOpacity>
          </View>
        )}

        {/* Danger Zone */}
        <View style={[
          themedStyles.card,
          {
            marginBottom: 24,
            borderColor: currentColors.error + '40',
            borderWidth: 2,
            backgroundColor: currentColors.error + '08',
          }
        ]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
            <Icon name="warning" size={24} style={{ color: currentColors.error, marginRight: 12 }} />
            <Text style={[themedStyles.text, { fontWeight: '700', color: currentColors.error, fontSize: 18 }]}>
              Danger Zone
            </Text>
          </View>

          <Text style={[themedStyles.textSecondary, { marginBottom: 16, lineHeight: 20 }]}>
            This action will permanently delete all your data. This cannot be undone.
          </Text>

          <TouchableOpacity
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              paddingVertical: 12,
              paddingHorizontal: 16,
              backgroundColor: currentColors.error,
              borderRadius: 12,
              borderWidth: 2,
              borderColor: currentColors.error,
            }}
            onPress={handleClearAllData}
          >
            <Icon name="trash" size={20} style={{ color: currentColors.background, marginRight: 8 }} />
            <Text style={[themedStyles.text, { color: currentColors.background, fontWeight: '700' }]}>
              Clear All Data
            </Text>
          </TouchableOpacity>
        </View>

        {/* App Info */}
        <View style={[themedStyles.card, { backgroundColor: currentColors.backgroundAlt }]}>
          <Text style={[themedStyles.textSecondary, { fontSize: 12, textAlign: 'center', lineHeight: 18 }]}>
            Budget Flow v1.0.0{'\n'}
            Secure Cloud Sync
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
