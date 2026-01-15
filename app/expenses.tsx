
import { useState, useCallback, useRef, useEffect } from 'react';
import { useBudgetData } from '../hooks/useBudgetData';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Text, View, ScrollView, TouchableOpacity, Alert, ActivityIndicator, AccessibilityInfo, Pressable, Platform } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { calculateMonthlyAmount } from '../utils/calculations';
import { useThemedStyles } from '../hooks/useThemedStyles';
import { useCurrency } from '../hooks/useCurrency';
import Icon from '../components/Icon';
import StandardHeader from '../components/StandardHeader';
import ExpenseFilterModal from '../components/ExpenseFilterModal';
import ExpenseCard from '../components/ExpenseCard';
import { DEFAULT_CATEGORIES } from '../types/budget';
import { getCustomExpenseCategories, getExpensesFilters, saveExpensesFilters, normalizeCategoryName } from '../utils/storage';

type SortOption = 'date' | 'alphabetical' | 'cost';
type SortOrder = 'asc' | 'desc';

export default function ExpensesScreen() {
  const { data, removeExpense, saving, refreshData } = useBudgetData();
  const { currentColors } = useTheme();
  const { themedStyles, isPad } = useThemedStyles();
  const { formatCurrency } = useCurrency();
  const params = useLocalSearchParams<{
    showRecurring?: string;
    filter?: string;
    category?: string;
    fromDashboard?: string;
    personId?: string;
  }>();

  // Filter modal state
  const [showFilterModal, setShowFilterModal] = useState(false);

  // Filter state - Initialize with proper defaults
  const [filter, setFilter] = useState<'all' | 'household' | 'personal'>('all');
  const [personFilter, setPersonFilter] = useState<string | null>(null);
  const [customCategories, setCustomCategories] = useState<string[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [categoryFilters, setCategoryFilters] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>(''); // debounced
  const [hasEndDateFilter, setHasEndDateFilter] = useState<boolean>(false);

  const [deletingExpenseId, setDeletingExpenseId] = useState<string | null>(null);

  // Enhanced sorting state
  const [sortBy, setSortBy] = useState<SortOption>('date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc'); // Default: newest first

  // Use ref to track if we've already refreshed on this focus
  const hasRefreshedOnFocus = useRef(false);

  // FIXED: Better state management for filter loading
  const filtersLoaded = useRef(false);
  const isInitialLoad = useRef(true);
  const lastDashboardParams = useRef<string>(''); // Track dashboard navigation changes

  // Wrap announceFilter in useCallback to fix exhaustive deps warning
  const announceFilter = useCallback((msg: string) => {
    try {
      AccessibilityInfo.announceForAccessibility?.(msg);
    } catch (e) {
      console.log('Accessibility announce failed', e);
    }
  }, []);

  // Helper formatting functions moved to ExpenseCard component

  // FIXED: Load persisted filters function with better error handling
  const loadPersistedFilters = useCallback(async () => {
    if (filtersLoaded.current) {
      console.log('ExpensesScreen: Filters already loaded, skipping...');
      return;
    }

    try {
      console.log('ExpensesScreen: Loading persisted filters...');
      const filters = await getExpensesFilters();
      console.log('ExpensesScreen: Loaded persisted filters:', filters);

      setCategoryFilter(filters.category || null);
      setCategoryFilters([]);
      setSearchQuery(filters.search || '');
      setSearchTerm(filters.search || '');
      setHasEndDateFilter(filters.hasEndDate || false);
      setFilter(filters.filter || 'all');
      setPersonFilter(filters.personFilter || null);

      filtersLoaded.current = true;
      console.log('ExpensesScreen: Filters loaded successfully');
    } catch (e) {
      console.error('ExpensesScreen: Failed to load persisted filters:', e);
      filtersLoaded.current = true; // Mark as loaded even on error to prevent infinite retries
    }
  }, []);

  // FIXED: Better dashboard navigation handling with proper filter persistence
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        // Always load custom categories
        const customs = await getCustomExpenseCategories();
        console.log('ExpensesScreen: Loaded custom categories:', customs);
        setCustomCategories(customs);

        // Create a unique key for dashboard params to detect changes
        const dashboardParamsKey = `${params.fromDashboard}-${params.filter}-${params.category}-${params.personId}`;
        const isDashboardNavigation = params.fromDashboard === 'true';
        const dashboardParamsChanged = lastDashboardParams.current !== dashboardParamsKey;

        console.log('ExpensesScreen: Navigation analysis:', {
          isDashboardNavigation,
          dashboardParamsChanged,
          currentKey: dashboardParamsKey,
          lastKey: lastDashboardParams.current,
          isInitialLoad: isInitialLoad.current,
          filtersLoaded: filtersLoaded.current
        });

        if (isDashboardNavigation) {
          // FIXED: Apply dashboard filters and mark as loaded
          if (dashboardParamsChanged || isInitialLoad.current) {
            console.log('ExpensesScreen: Applying filters from dashboard navigation');
            lastDashboardParams.current = dashboardParamsKey;

            // Apply filters from URL parameters
            if (params.filter && (params.filter === 'household' || params.filter === 'personal')) {
              setFilter(params.filter);
            } else {
              setFilter('all');
            }

            if (params.category) {
              setCategoryFilter(params.category);
              setCategoryFilters([]);
            } else {
              setCategoryFilter(null);
              setCategoryFilters([]);
            }

            if (params.personId) {
              setPersonFilter(params.personId);
            } else {
              setPersonFilter(null);
            }

            // Clear other filters when coming from dashboard
            setSearchQuery('');
            setSearchTerm('');
            setHasEndDateFilter(false);

            // Announce the applied filters for accessibility
            const filterMessages = [];
            if (params.filter) {
              filterMessages.push(`${params.filter} expenses`);
            }
            if (params.category) {
              filterMessages.push(`${params.category} category`);
            }
            if (params.personId) {
              const person = data.people.find(p => p.id === params.personId);
              if (person) {
                filterMessages.push(`${person.name}'s expenses`);
              }
            }
            if (filterMessages.length > 0) {
              announceFilter(`Filtered by ${filterMessages.join(' and ')}`);
            }

            filtersLoaded.current = true;
          } else if (!filtersLoaded.current) {
            // FIXED: If returning to screen with same dashboard params, load persisted filters
            // This handles the case where user navigates away and comes back
            console.log('ExpensesScreen: Returning to screen with same dashboard params, loading persisted filters');
            await loadPersistedFilters();
          }
        } else {
          // For normal navigation, load persisted filters only if not already loaded
          if (!filtersLoaded.current) {
            await loadPersistedFilters();
          }
          // Reset dashboard params tracking for non-dashboard navigation
          lastDashboardParams.current = '';
        }
      } catch (error) {
        console.error('ExpensesScreen: Error loading initial data:', error);
        filtersLoaded.current = true;
      }
    };

    if (isInitialLoad.current) {
      isInitialLoad.current = false;
      loadInitialData();
    } else {
      // Handle subsequent navigation changes
      loadInitialData();
    }
  }, [params.filter, params.category, params.fromDashboard, params.personId, announceFilter, data.people, loadPersistedFilters]);

  // Reload custom categories when data changes (e.g., after clearing all data)
  useEffect(() => {
    const reloadCustomCategories = async () => {
      try {
        const customs = await getCustomExpenseCategories();
        console.log('ExpensesScreen: Reloaded custom categories after data change:', customs);
        setCustomCategories(customs);
        // If current category filter is no longer valid, clear it
        if (categoryFilter && !customs.includes(categoryFilter) && !DEFAULT_CATEGORIES.includes(categoryFilter)) {
          console.log('ExpensesScreen: Clearing invalid category filter:', categoryFilter);
          setCategoryFilter(null);
        }
        // Clear invalid category filters from multiple selection
        const validCategoryFilters = categoryFilters.filter(cat =>
          customs.includes(cat) || DEFAULT_CATEGORIES.includes(cat)
        );
        if (validCategoryFilters.length !== categoryFilters.length) {
          console.log('ExpensesScreen: Clearing invalid category filters:', categoryFilters);
          setCategoryFilters(validCategoryFilters);
        }
      } catch (error) {
        console.error('ExpensesScreen: Error reloading custom categories:', error);
      }
    };

    reloadCustomCategories();
  }, [data.people.length, data.expenses.length, categoryFilter, categoryFilters]);

  // FIXED: Persist filters properly - including dashboard filters after they're applied
  useEffect(() => {
    // Persist filters if:
    // 1. Filters have been loaded (to prevent overwriting during initial load)
    // 2. Not on initial load
    // 3. Either not from dashboard OR dashboard filters have been applied and should be persisted
    const isDashboardNavigation = params.fromDashboard === 'true';

    if (filtersLoaded.current && !isInitialLoad.current) {
      const timeoutId = setTimeout(() => {
        console.log('ExpensesScreen: Persisting filters:', {
          category: categoryFilter,
          search: searchQuery,
          hasEndDate: hasEndDateFilter,
          filter: filter,
          personFilter: personFilter,
          isDashboardNavigation
        });
        saveExpensesFilters({
          category: categoryFilter,
          search: searchQuery,
          hasEndDate: hasEndDateFilter,
          filter: filter,
          personFilter: personFilter
        });
      }, 500);
      return () => clearTimeout(timeoutId);
    }
  }, [categoryFilter, categoryFilters, searchQuery, hasEndDateFilter, filter, personFilter, params.fromDashboard]);

  // Debounce search for filtering performance
  useEffect(() => {
    const timeoutId = setTimeout(() => setSearchTerm(searchQuery.trim()), 300);
    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  // FIXED: Better focus effect handling with proper filter persistence
  useFocusEffect(
    useCallback(() => {
      console.log('ExpensesScreen: Focus effect triggered');

      if (!hasRefreshedOnFocus.current) {
        hasRefreshedOnFocus.current = true;
        refreshData(true);
        // Also refresh custom categories (in case new one added)
        getCustomExpenseCategories().then(setCustomCategories).catch((e) => console.log('Failed to refresh custom categories', e));
      }

      return () => {
        hasRefreshedOnFocus.current = false;
        // FIXED: Only reset dashboard state when actually leaving the screen for good
        // Don't reset when just navigating away temporarily
      };
    }, [refreshData])
  );

  const handleRemoveExpense = useCallback(
    async (expenseId: string, description: string) => {
      if (deletingExpenseId === expenseId || saving) return;
      try {
        setDeletingExpenseId(expenseId);
        const result = await removeExpense(expenseId);
        if (!result.success) {
          Alert.alert('Error', 'Failed to remove expense. Please try again.');
        }
      } catch (error) {
        console.error('ExpensesScreen: Error removing expense:', error);
        Alert.alert('Error', 'Failed to remove expense. Please try again.');
      } finally {
        setDeletingExpenseId(null);
      }
    },
    [deletingExpenseId, saving, removeExpense]
  );

  const handleDeletePress = useCallback(
    (expenseId: string, description: string) => {
      Alert.alert('Delete Expense', `Are you sure you want to delete "${description}"?`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            handleRemoveExpense(expenseId, description);
          },
        },
      ]);
    },
    [handleRemoveExpense]
  );

  const handleEditExpense = useCallback((expense: any) => {
    router.push({
      pathname: '/add-expense',
      params: { id: expense.id, origin: 'expenses' },
    });
  }, []);

  const handleNavigateToAddExpense = useCallback(() => {
    router.push('/add-expense');
  }, []);

  const handleClearFilters = useCallback(() => {
    console.log('ExpensesScreen: Clearing all filters');
    setCategoryFilter(null);
    setCategoryFilters([]);
    setSearchQuery('');
    setSearchTerm('');
    setFilter('all');
    setPersonFilter(null);
    setHasEndDateFilter(false);
    announceFilter('All filters cleared');

    // Also clear persisted filters
    saveExpensesFilters({
      category: null,
      search: '',
      hasEndDate: false,
      filter: 'all',
      personFilter: null
    });
  }, [announceFilter]);

  // Enhanced sort button handler
  const handleSortPress = useCallback((sortType: SortOption) => {
    if (sortBy === sortType) {
      // Toggle order if same sort type
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      // Set new sort type with appropriate default order
      setSortBy(sortType);
      if (sortType === 'date') {
        setSortOrder('desc'); // Newest first for date
      } else {
        setSortOrder('asc'); // A-Z for alphabetical, lowest first for cost
      }
    }
  }, [sortBy, sortOrder]);

  const getSortIcon = useCallback((sortType: SortOption) => {
    if (sortBy !== sortType) {
      return 'swap-vertical-outline';
    }

    return sortOrder === 'desc' ? 'arrow-down' : 'arrow-up';
  }, [sortBy, sortOrder]);

  const getSortLabel = useCallback((sortType: SortOption) => {
    switch (sortType) {
      case 'date': return 'Date';
      case 'alphabetical': return 'Name';
      case 'cost': return 'Amount';
      default: return 'Date';
    }
  }, []);

  // Enhanced sort button with hover
  const SortButton = useCallback(
    ({ sortType }: { sortType: SortOption }) => {
      const [hovered, setHovered] = useState(false);
      const isSelected = sortBy === sortType;

      return (
        <Pressable
          style={({ pressed }) => [
            {
              backgroundColor: isSelected
                ? currentColors.primary
                : (hovered ? currentColors.backgroundAlt + '80' : currentColors.backgroundAlt),
              marginRight: 12,
              paddingHorizontal: 16,
              paddingVertical: 10,
              borderRadius: 20,
              flexDirection: 'row',
              alignItems: 'center',
              borderWidth: 1,
              borderColor: isSelected ? currentColors.primary : (hovered ? currentColors.textSecondary : currentColors.border),
              minHeight: 40,
              transform: (Platform.OS === 'web' && hovered) ? [{ translateY: -1 }] : [],
              transitionDuration: '0.2s',
            },
          ]}
          onPress={() => handleSortPress(sortType)}
          disabled={saving || deletingExpenseId !== null}
          // @ts-ignore
          onHoverIn={() => setHovered(true)}
          onHoverOut={() => setHovered(false)}
        >
          <Text
            style={[
              {
                color: isSelected ? '#FFFFFF' : currentColors.text,
                fontWeight: '600',
                fontSize: 14,
                marginRight: 6,
              },
            ]}
          >
            {getSortLabel(sortType)}
          </Text>
          <Icon
            name={getSortIcon(sortType) as any}
            size={14}
            style={{
              color: isSelected ? '#FFFFFF' : currentColors.textSecondary,
            }}
          />
        </Pressable>
      );
    },
    [sortBy, sortOrder, currentColors, saving, deletingExpenseId, handleSortPress, getSortIcon, getSortLabel]
  );

  // Apply filters with proper logic and error handling
  let filteredExpenses = [...data.expenses]; // Create a copy to avoid mutating original

  console.log('ExpensesScreen: Starting filter process with', filteredExpenses.length, 'total expenses');
  console.log('ExpensesScreen: Current filter state:', {
    filter,
    personFilter,
    categoryFilter,
    searchTerm,
    hasEndDateFilter
  });

  // Apply household/personal filter correctly
  if (filter === 'household') {
    const beforeCount = filteredExpenses.length;
    filteredExpenses = filteredExpenses.filter((e) => e.category === 'household');
    console.log('ExpensesScreen: Household filter applied. Before:', beforeCount, 'After:', filteredExpenses.length);
  } else if (filter === 'personal') {
    const beforeCount = filteredExpenses.length;
    filteredExpenses = filteredExpenses.filter((e) => e.category === 'personal');
    console.log('ExpensesScreen: Personal filter applied. Before:', beforeCount, 'After:', filteredExpenses.length);
  }

  // Apply person filter with proper logic for household vs personal expenses
  if (personFilter) {
    const beforeCount = filteredExpenses.length;
    filteredExpenses = filteredExpenses.filter((e) => {
      // For household expenses, only filter if they have a personId assigned
      if (e.category === 'household') {
        return e.personId === personFilter;
      }
      // For personal expenses, always filter by personId
      return e.personId === personFilter;
    });
    console.log('ExpensesScreen: Person filter applied. Before:', beforeCount, 'After:', filteredExpenses.length);
  }

  // Apply category filter (support both single and multiple categories)
  const activeCategories = categoryFilters.length > 0 ? categoryFilters : (categoryFilter ? [categoryFilter] : []);
  if (activeCategories.length > 0) {
    const beforeCount = filteredExpenses.length;
    const selectedCategories = activeCategories.map(cat => normalizeCategoryName(cat));
    filteredExpenses = filteredExpenses.filter((e) => {
      const expenseCategory = normalizeCategoryName((e as any).categoryTag || 'Misc');
      return selectedCategories.includes(expenseCategory);
    });
    console.log('ExpensesScreen: Category filter applied. Before:', beforeCount, 'After:', filteredExpenses.length, 'Categories:', activeCategories);
  }

  // Apply search filter
  if (searchTerm) {
    const beforeCount = filteredExpenses.length;
    const q = searchTerm.toLowerCase();
    filteredExpenses = filteredExpenses.filter((e) => e.description.toLowerCase().includes(q));
    console.log('ExpensesScreen: Search filter applied. Before:', beforeCount, 'After:', filteredExpenses.length);
  }

  // Apply end date filter
  if (hasEndDateFilter) {
    const beforeCount = filteredExpenses.length;
    filteredExpenses = filteredExpenses.filter((e) => {
      // Only include expenses that have an end date and are not one-time
      const hasEndDate = e.endDate && e.frequency !== 'one-time';
      return hasEndDate;
    });
    console.log('ExpensesScreen: End date filter applied. Before:', beforeCount, 'After:', filteredExpenses.length);
  }

  // Enhanced sorting logic
  filteredExpenses = filteredExpenses.sort((a, b) => {
    let comparison = 0;

    switch (sortBy) {
      case 'date':
        comparison = new Date(a.date).getTime() - new Date(b.date).getTime();
        break;
      case 'alphabetical':
        comparison = a.description.toLowerCase().localeCompare(b.description.toLowerCase());
        break;
      case 'cost':
        comparison = a.amount - b.amount;
        break;
      default:
        comparison = new Date(a.date).getTime() - new Date(b.date).getTime();
    }

    return sortOrder === 'asc' ? comparison : -comparison;
  });

  console.log('ExpensesScreen: Final filtered expenses count:', filteredExpenses.length);

  const hasActiveFilters = !!categoryFilter || categoryFilters.length > 0 || !!searchTerm || (filter !== 'all') || !!personFilter || hasEndDateFilter;

  // Header buttons - filter button on left, add button on right
  const leftButtons = [
    {
      icon: hasActiveFilters ? 'funnel' : 'options-outline',
      onPress: () => setShowFilterModal(true),
      backgroundColor: hasActiveFilters ? currentColors.primary : currentColors.backgroundAlt,
      iconColor: hasActiveFilters ? '#FFFFFF' : currentColors.text,
      badge: hasActiveFilters ? '●' : undefined,
    },
  ];

  const rightButtons = [
    {
      icon: 'add',
      onPress: handleNavigateToAddExpense,
      backgroundColor: currentColors.primary,
      iconColor: '#FFFFFF',
    },
  ];

  return (
    <View style={themedStyles.container}>
      <StandardHeader
        title="Expenses"
        showLeftIcon={false}
        showRightIcon={false}
        leftButtons={leftButtons}
        rightButtons={rightButtons}
        loading={saving || deletingExpenseId !== null}
      />

      {/* Sort controls - simplified and cleaner */}
      <View style={{ paddingHorizontal: 20, paddingVertical: 16, backgroundColor: currentColors.backgroundAlt, borderBottomWidth: 1, borderBottomColor: currentColors.border }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <SortButton sortType="date" />
            <SortButton sortType="alphabetical" />
            <SortButton sortType="cost" />
          </View>
        </ScrollView>
      </View>

      {/* Active filters summary - more prominent when active */}
      {hasActiveFilters && (
        <View style={{
          paddingHorizontal: 20,
          paddingVertical: 12,
          backgroundColor: currentColors.primary + '10',
          borderBottomWidth: 1,
          borderBottomColor: currentColors.primary + '20'
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
              <Icon name="funnel" size={16} style={{ color: currentColors.primary, marginRight: 8 }} />
              <Text style={[themedStyles.text, { color: currentColors.primary, fontWeight: '600', fontSize: 14 }]}>
                {filteredExpenses.length} of {data.expenses.length} expenses
              </Text>
            </View>
            <TouchableOpacity
              onPress={handleClearFilters}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 6,
                backgroundColor: currentColors.primary,
                borderRadius: 12,
              }}
            >
              <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '600' }}>Clear</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* No matching expenses message - moved to top */}
      {filteredExpenses.length === 0 && (
        <View style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16 }}>
          <View style={[themedStyles.card, { alignItems: 'center', paddingVertical: 40, width: '100%' }]}>
            <Icon name="receipt-outline" size={48} style={{ color: currentColors.textSecondary, marginBottom: 16 }} />
            <Text style={[themedStyles.subtitle, { textAlign: 'center', marginBottom: 8, color: currentColors.textSecondary }]}>
              {hasActiveFilters ? 'No matching expenses' : 'No expenses yet'}
            </Text>
            <Text style={[themedStyles.textSecondary, { textAlign: 'center', lineHeight: 22 }]}>
              {hasActiveFilters
                ? 'Try adjusting your filters to see more expenses'
                : 'Add your first expense to get started tracking your spending'}
            </Text>
          </View>
        </View>
      )}

      {/* Conditionally render ScrollView only when there are expenses to show */}
      {filteredExpenses.length > 0 ? (
        <ScrollView style={themedStyles.content} contentContainerStyle={themedStyles.scrollContent}>
          <View style={[
            {
              flexDirection: isPad ? 'row' : 'column',
              flexWrap: isPad ? 'wrap' : 'nowrap',
              gap: 16, // Consistent gap for both
            }
          ]}>
            {filteredExpenses.map((expense) => {
              const person = expense.personId ? data.people.find((p) => p.id === expense.personId) : null;
              const isDeleting = deletingExpenseId === expense.id;

              return (
                <ExpenseCard
                  key={expense.id}
                  expense={expense}
                  person={person}
                  isDeleting={isDeleting}
                  onPress={() => handleEditExpense(expense)}
                  onDelete={handleDeletePress}
                  style={{
                    width: isPad ? '32%' : '100%',
                    flexGrow: isPad ? 1 : 0,
                  }}
                />
              );
            })}

            {isPad && filteredExpenses.length % 3 !== 0 && (
              <>
                <View style={{ width: '32%', flexGrow: 1, opacity: 0 }} />
                {filteredExpenses.length % 3 === 1 && <View style={{ width: '32%', flexGrow: 1, opacity: 0 }} />}
              </>
            )}
          </View>
        </ScrollView>
      ) : null}

      {/* Filter Modal */}
      <ExpenseFilterModal
        visible={showFilterModal}
        onClose={() => setShowFilterModal(false)}
        filter={filter}
        setFilter={setFilter}
        personFilter={personFilter}
        setPersonFilter={setPersonFilter}
        categoryFilter={categoryFilter}
        setCategoryFilter={setCategoryFilter}
        categoryFilters={categoryFilters}
        setCategoryFilters={setCategoryFilters}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        hasEndDateFilter={hasEndDateFilter}
        setHasEndDateFilter={setHasEndDateFilter}
        people={data.people}
        expenses={data.expenses}
        customCategories={customCategories}
        onClearFilters={handleClearFilters}
        announceFilter={announceFilter}
      />
    </View >
  );
}
