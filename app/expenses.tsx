
import { useState, useCallback, useRef, useEffect } from 'react';
import { useBudgetData } from '../hooks/useBudgetData';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Text, View, ScrollView, TouchableOpacity, ActivityIndicator, AccessibilityInfo, Pressable, Platform, TextInput } from 'react-native';
import { Alert } from '../utils/alert';
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
import { useDesktopModals } from '../hooks/useDesktopModals';

type SortOption = 'date' | 'alphabetical' | 'cost' | 'type' | 'assignedTo' | 'frequency' | 'categoryTag' | 'endDate' | 'debtRepayment';
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
  const [debtFilter, setDebtFilter] = useState<'all' | 'any' | 'loan' | 'mortgage' | 'credit_card'>('all');

  const [deletingExpenseId, setDeletingExpenseId] = useState<string | null>(null);
  const [isSearchFocused, setIsSearchFocused] = useState(false);

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
      setDebtFilter(filters.debtFilter || 'all');

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
            setDebtFilter('all');

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
          debtFilter: debtFilter,
          isDashboardNavigation
        });
        saveExpensesFilters({
          category: categoryFilter,
          search: searchQuery,
          hasEndDate: hasEndDateFilter,
          filter: filter,
          personFilter: personFilter,
          debtFilter: debtFilter
        });
      }, 500);
      return () => clearTimeout(timeoutId);
    }
  }, [categoryFilter, categoryFilters, searchQuery, hasEndDateFilter, filter, personFilter, debtFilter, params.fromDashboard]);

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

  const { openModal, isDesktop } = useDesktopModals();

  const handleEditExpense = useCallback((expense: any) => {
    if (isDesktop) {
      openModal('edit-expense', expense.id);
    } else {
      router.push({
        pathname: '/add-expense',
        params: { id: expense.id, origin: 'expenses' },
      });
    }
  }, [openModal, isDesktop]);

  const handleNavigateToAddExpense = useCallback(() => {
    if (isDesktop) {
      openModal('add-expense');
    } else {
      router.push('/add-expense');
    }
  }, [openModal, isDesktop]);

  const handleClearFilters = useCallback(() => {
    console.log('ExpensesScreen: Clearing all filters');
    setCategoryFilter(null);
    setCategoryFilters([]);
    setSearchQuery('');
    setSearchTerm('');
    setFilter('all');
    setPersonFilter(null);
    setHasEndDateFilter(false);
    setDebtFilter('all');
    announceFilter('All filters cleared');

    // Also clear persisted filters
    saveExpensesFilters({
      category: null,
      search: '',
      hasEndDate: false,
      filter: 'all',
      personFilter: null,
      debtFilter: 'all'
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
      case 'type': return 'Type';
      case 'assignedTo': return 'Assigned To';
      case 'frequency': return 'Frequency';
      case 'categoryTag': return 'Category';
      case 'endDate': return 'End Date';
      case 'debtRepayment': return 'Expense Type';
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

  // Apply debt repayment filter
  if (debtFilter && debtFilter !== 'all') {
    const beforeCount = filteredExpenses.length;
    filteredExpenses = filteredExpenses.filter((e) => {
      if (debtFilter === 'any') {
        return !!e.debtRepayment;
      }
      return e.debtRepayment === debtFilter;
    });
    console.log('ExpensesScreen: Debt filter applied. Before:', beforeCount, 'After:', filteredExpenses.length);
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
      case 'type':
        comparison = a.category.toLowerCase().localeCompare(b.category.toLowerCase());
        break;
      case 'assignedTo': {
        const nameA = (a.personId ? (data.people.find(p => p.id === a.personId)?.name || '') : 'Household').toLowerCase();
        const nameB = (b.personId ? (data.people.find(p => p.id === b.personId)?.name || '') : 'Household').toLowerCase();
        comparison = nameA.localeCompare(nameB);
        break;
      }
      case 'frequency':
        comparison = a.frequency.toLowerCase().localeCompare(b.frequency.toLowerCase());
        break;
      case 'categoryTag': {
        const tagA = (a.categoryTag || 'Misc').toLowerCase();
        const tagB = (b.categoryTag || 'Misc').toLowerCase();
        comparison = tagA.localeCompare(tagB);
        break;
      }
      case 'endDate': {
        const valA = a.endDate || '';
        const valB = b.endDate || '';
        if (!valA && !valB) comparison = 0;
        else if (!valA) comparison = 1;
        else if (!valB) comparison = -1;
        else comparison = valA.localeCompare(valB);
        break;
      }
      case 'debtRepayment': {
        const typeA = (a.debtRepayment === 'credit_card' ? 'Credit Card' : a.debtRepayment === 'loan' ? 'Loan' : a.debtRepayment === 'mortgage' ? 'Mortgage' : 'General').toLowerCase();
        const typeB = (b.debtRepayment === 'credit_card' ? 'Credit Card' : b.debtRepayment === 'loan' ? 'Loan' : b.debtRepayment === 'mortgage' ? 'Mortgage' : 'General').toLowerCase();
        comparison = typeA.localeCompare(typeB);
        break;
      }
      default:
        comparison = new Date(a.date).getTime() - new Date(b.date).getTime();
    }

    return sortOrder === 'asc' ? comparison : -comparison;
  });

  console.log('ExpensesScreen: Final filtered expenses count:', filteredExpenses.length);

  const totalMonthlyAmount = filteredExpenses.reduce((sum, e) => {
    return sum + calculateMonthlyAmount(e.amount, e.frequency);
  }, 0);

  const hasActiveFilters = !!categoryFilter || categoryFilters.length > 0 || !!searchTerm || (filter !== 'all') || !!personFilter || hasEndDateFilter || (debtFilter !== 'all');

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

  // Table Header Column helper for Desktop Table view
  const TableHeaderColumn = useCallback(({
    label,
    sortType,
    flex = 1,
    alignRight = false,
  }: {
    label: string;
    sortType?: SortOption;
    flex?: number;
    alignRight?: boolean;
  }) => {
    const isSorted = sortType && sortBy === sortType;
    const arrow = sortOrder === 'asc' ? ' ↑' : ' ↓';

    const content = (
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: alignRight ? 'flex-end' : 'flex-start' }}>
        <Text style={[
          themedStyles.textSecondary,
          {
            fontWeight: '700',
            fontSize: 13,
            color: isSorted ? currentColors.primary : currentColors.textSecondary
          }
        ]}>
          {label}
        </Text>
        {isSorted && (
          <Text style={{ color: currentColors.primary, fontFamily: Platform.OS === 'web' ? 'Inter, system-ui, sans-serif' : undefined, fontWeight: '700', fontSize: 13 }}>
            {arrow}
          </Text>
        )}
      </View>
    );

    if (sortType) {
      return (
        <TouchableOpacity
          onPress={() => handleSortPress(sortType)}
          style={{ flex, paddingVertical: 12, paddingHorizontal: 8 }}
          activeOpacity={0.7}
        >
          {content}
        </TouchableOpacity>
      );
    }

    return (
      <View style={{ flex, paddingVertical: 12, paddingHorizontal: 8 }}>
        {content}
      </View>
    );
  }, [sortBy, sortOrder, currentColors, themedStyles, handleSortPress]);

  // Expense Row helper for Desktop Table view
  const ExpenseRow = useCallback(({ expense }: { expense: typeof data.expenses[0] }) => {
    const [hovered, setHovered] = useState(false);
    const person = expense.personId ? data.people.find((p) => p.id === expense.personId) : null;
    const isDeleting = deletingExpenseId === expense.id;
    const typeColor = expense.category === 'household' ? currentColors.household : currentColors.personal;

    return (
      <Pressable
        onPress={() => handleEditExpense(expense)}
        // @ts-ignore
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: hovered ? currentColors.backgroundAlt + '60' : currentColors.background,
          borderBottomWidth: 1,
          borderBottomColor: currentColors.border,
          minHeight: 52,
          paddingHorizontal: 8,
          // @ts-ignore
          transitionDuration: '0.15s',
          opacity: isDeleting ? 0.6 : 1,
        }}
      >
        <View style={{ flex: 1.6, paddingHorizontal: 8, justifyContent: 'center' }}>
          <Text style={[themedStyles.text, { fontWeight: '600', fontSize: 14 }]} numberOfLines={1}>
            {expense.description}
          </Text>
        </View>

        <View style={{ flex: 1.1, paddingHorizontal: 8, alignItems: 'flex-start' }}>
          <View style={{
            backgroundColor: typeColor + '15',
            paddingHorizontal: 8,
            paddingVertical: 2,
            borderRadius: 6,
            borderWidth: 1,
            borderColor: typeColor + '30',
          }}>
            <Text style={{
              color: typeColor,
              fontSize: 10,
              fontWeight: '700',
              textTransform: 'uppercase',
            }}>
              {expense.category}
            </Text>
          </View>
        </View>

        <View style={{ flex: 1.3, paddingHorizontal: 8, alignItems: 'flex-start' }}>
          <View style={{
            backgroundColor: (expense.debtRepayment === 'mortgage' ? '#FF9500' : expense.debtRepayment === 'credit_card' ? '#5856D6' : expense.debtRepayment === 'loan' ? '#34C759' : currentColors.textSecondary) + '15',
            paddingHorizontal: 8,
            paddingVertical: 2,
            borderRadius: 6,
            borderWidth: 1,
            borderColor: (expense.debtRepayment === 'mortgage' ? '#FF9500' : expense.debtRepayment === 'credit_card' ? '#5856D6' : expense.debtRepayment === 'loan' ? '#34C759' : currentColors.border) + '30',
          }}>
            <Text style={{
              color: expense.debtRepayment === 'mortgage' ? '#FF9500' : expense.debtRepayment === 'credit_card' ? '#5856D6' : expense.debtRepayment === 'loan' ? '#34C759' : currentColors.textSecondary,
              fontSize: 10,
              fontWeight: '700',
              textTransform: 'uppercase',
            }}>
              {expense.debtRepayment === 'mortgage' ? 'Mortgage' : expense.debtRepayment === 'credit_card' ? 'Credit Card' : expense.debtRepayment === 'loan' ? 'Loan' : 'General'}
            </Text>
          </View>
        </View>

        <View style={{ flex: 1.2, paddingHorizontal: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Icon
              name={person ? 'person-outline' : 'people-outline'}
              size={14}
              style={{ color: currentColors.textSecondary, marginRight: 6 }}
            />
            <Text style={[themedStyles.textSecondary, { fontSize: 13 }]} numberOfLines={1}>
              {person ? person.name : 'Household'}
            </Text>
          </View>
        </View>

        <View style={{ flex: 1.1, paddingHorizontal: 8, alignItems: 'flex-start' }}>
          <View style={{
            backgroundColor: currentColors.backgroundAlt,
            paddingHorizontal: 8,
            paddingVertical: 2,
            borderRadius: 6,
            borderWidth: 1,
            borderColor: currentColors.border,
          }}>
            <Text style={[themedStyles.textSecondary, { fontSize: 12, fontWeight: '500' }]} numberOfLines={1}>
              {expense.categoryTag || 'Unassigned'}
            </Text>
          </View>
        </View>

        <View style={{ flex: 0.9, paddingHorizontal: 8 }}>
          <Text style={[themedStyles.textSecondary, { fontSize: 13, textTransform: 'capitalize' }]}>
            {expense.frequency}
          </Text>
        </View>

        <View style={{ flex: 1.1, paddingHorizontal: 8 }}>
          <Text style={[themedStyles.textSecondary, { fontSize: 13 }]}>
            {expense.date ? expense.date.split('T')[0] : ''}
          </Text>
        </View>

        <View style={{ flex: 0.9, paddingHorizontal: 8 }}>
          <Text style={[themedStyles.textSecondary, { fontSize: 13 }]}>
            {expense.endDate || '-'}
          </Text>
        </View>

        <View style={{ flex: 1.1, paddingHorizontal: 8, alignItems: 'flex-end' }}>
          <Text style={[themedStyles.text, { fontWeight: '700', fontSize: 15, color: currentColors.text }]}>
            {formatCurrency(expense.amount)}
          </Text>
        </View>

        <View style={{ flex: 0.7, paddingHorizontal: 8, flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
          <TouchableOpacity
            onPress={(e) => {
              e.stopPropagation();
              handleDeletePress(expense);
            }}
            disabled={saving || isDeleting}
            style={{
              padding: 6,
              borderRadius: 8,
              backgroundColor: currentColors.error + '15',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {isDeleting ? (
              <ActivityIndicator size="small" color={currentColors.error} style={{ width: 14, height: 14 }} />
            ) : (
              <Icon name="trash-outline" size={14} style={{ color: currentColors.error }} />
            )}
          </TouchableOpacity>
        </View>
      </Pressable>
    );
  }, [data.people, deletingExpenseId, currentColors, themedStyles, formatCurrency, handleDeletePress, handleEditExpense, saving]);

  return (
    <View style={themedStyles.container}>
      {isPad ? (
        // Desktop Header / Title Row
        <View style={{
          paddingHorizontal: 32,
          paddingTop: 32,
          paddingBottom: 16,
          backgroundColor: currentColors.background,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 16,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Icon name="receipt-outline" size={28} style={{ color: currentColors.primary, marginRight: 12 }} />
            <Text style={[themedStyles.subtitle, { fontSize: 26, fontWeight: '700', marginBottom: 0 }]}>Expenses</Text>
          </View>
          {/* Desktop Search / Filter Toolbar */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: currentColors.backgroundAlt,
              borderWidth: 2,
              borderColor: isSearchFocused ? currentColors.primary : currentColors.border,
              borderRadius: 12,
              paddingHorizontal: 12,
              width: 240,
              height: 44,
            }}>
              <Icon name="search-outline" size={18} style={{ color: currentColors.textSecondary, marginRight: 8 }} />
              <TextInput
                placeholder="Search expenses..."
                placeholderTextColor={currentColors.textSecondary}
                value={searchQuery}
                onChangeText={(t) => {
                  setSearchQuery(t);
                  setSearchTerm(t);
                }}
                onFocus={() => setIsSearchFocused(true)}
                onBlur={() => setIsSearchFocused(false)}
                style={{
                  flex: 1,
                  color: currentColors.text,
                  fontSize: 14,
                  fontWeight: '500',
                  // @ts-ignore
                  outlineStyle: 'none',
                  outlineWidth: 0,
                  outlineColor: 'transparent',
                  borderWidth: 0,
                  padding: 0,
                  height: '100%',
                }}
              />
              {searchQuery !== '' && (
                <TouchableOpacity onPress={() => { setSearchQuery(''); setSearchTerm(''); }}>
                  <Icon name="close-circle" size={16} style={{ color: currentColors.textSecondary }} />
                </TouchableOpacity>
              )}
            </View>

            {/* Quick Filters */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {/* Household Pill */}
              <TouchableOpacity
                testID="quick-filter-household"
                onPress={() => {
                  if (filter === 'household') {
                    setFilter('all');
                  } else {
                    setFilter('household');
                    setPersonFilter(null);
                  }
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: filter === 'household' ? currentColors.primary + '15' : currentColors.backgroundAlt,
                  borderWidth: 1.5,
                  borderColor: filter === 'household' ? currentColors.primary : currentColors.border,
                  borderRadius: 20,
                  paddingHorizontal: 14,
                  height: 38,
                }}
              >
                {filter === 'household' && (
                  <Icon name="checkmark" size={14} style={{ color: currentColors.primary, marginRight: 6 }} />
                )}
                <Text style={{
                  color: filter === 'household' ? currentColors.primary : currentColors.textSecondary,
                  fontSize: 13,
                  fontWeight: '600',
                }}>
                  Household
                </Text>
              </TouchableOpacity>

              {/* People Pills */}
              {data.people.map((person) => {
                const isActive = personFilter === person.id;
                return (
                  <TouchableOpacity
                    key={person.id}
                    testID={`quick-filter-person-${person.id}`}
                    onPress={() => {
                      if (isActive) {
                        setPersonFilter(null);
                      } else {
                        setPersonFilter(person.id);
                        setFilter('all');
                      }
                    }}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      backgroundColor: isActive ? currentColors.primary + '15' : currentColors.backgroundAlt,
                      borderWidth: 1.5,
                      borderColor: isActive ? currentColors.primary : currentColors.border,
                      borderRadius: 20,
                      paddingHorizontal: 14,
                      height: 38,
                    }}
                  >
                    {isActive && (
                      <Icon name="checkmark" size={14} style={{ color: currentColors.primary, marginRight: 6 }} />
                    )}
                    <Text style={{
                      color: isActive ? currentColors.primary : currentColors.textSecondary,
                      fontSize: 13,
                      fontWeight: '600',
                    }}>
                      {person.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}

              {/* Debt Repayments Pill */}
              <TouchableOpacity
                testID="quick-filter-debt"
                onPress={() => {
                  if (debtFilter !== 'all') {
                    setDebtFilter('all');
                  } else {
                    setDebtFilter('any');
                  }
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: debtFilter !== 'all' ? currentColors.primary + '15' : currentColors.backgroundAlt,
                  borderWidth: 1.5,
                  borderColor: debtFilter !== 'all' ? currentColors.primary : currentColors.border,
                  borderRadius: 20,
                  paddingHorizontal: 14,
                  height: 38,
                }}
              >
                {debtFilter !== 'all' && (
                  <Icon name="checkmark" size={14} style={{ color: currentColors.primary, marginRight: 6 }} />
                )}
                <Text style={{
                  color: debtFilter !== 'all' ? currentColors.primary : currentColors.textSecondary,
                  fontSize: 13,
                  fontWeight: '600',
                }}>
                  Debt Repayments
                </Text>
              </TouchableOpacity>
            </View>

            {/* Advanced Filters Button */}
            <TouchableOpacity
              testID="advanced-filters-button"
              onPress={() => setShowFilterModal(true)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: hasActiveFilters ? currentColors.primary : currentColors.backgroundAlt,
                borderWidth: 1,
                borderColor: hasActiveFilters ? 'transparent' : currentColors.border,
                borderRadius: 12,
                paddingHorizontal: 16,
                height: 44,
                boxShadow: '0px 2px 4px rgba(0,0,0,0.05)',
              }}
            >
              <Icon
                name={hasActiveFilters ? 'funnel' : 'options-outline'}
                size={18}
                style={{ color: hasActiveFilters ? '#FFFFFF' : currentColors.text, marginRight: 8 }}
              />
              <Text style={{
                color: hasActiveFilters ? '#FFFFFF' : currentColors.text,
                fontSize: 14,
                fontWeight: '600'
              }}>
                Filters
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <StandardHeader
          title="Expenses"
          showLeftIcon={false}
          showRightIcon={false}
          leftButtons={leftButtons}
          rightButtons={rightButtons}
          loading={saving || deletingExpenseId !== null}
        />
      )}

      {/* Sort controls - simplified and cleaner (Mobile Only) */}
      {!isPad && (
        <View style={{
          paddingHorizontal: 20,
          paddingVertical: 12,
          backgroundColor: currentColors.backgroundAlt,
          borderBottomWidth: 1,
          borderBottomColor: currentColors.border,
        }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={[themedStyles.textSecondary, { fontSize: 13, fontWeight: '600', marginRight: 12 }]}>Sort by:</Text>
              <SortButton sortType="date" />
              <SortButton sortType="alphabetical" />
              <SortButton sortType="cost" />
            </View>
          </ScrollView>
        </View>
      )}

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
        <View style={{ paddingHorizontal: isPad ? 32 : 20, paddingTop: isPad ? 32 : 20, paddingBottom: 16 }}>
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
        <ScrollView
          style={[themedStyles.content, isPad && { paddingLeft: 0, paddingRight: 0 }]}
          contentContainerStyle={[themedStyles.scrollContent, isPad && { paddingHorizontal: 32 }]}
        >
          {isPad ? (
            // Desktop Table Layout
            <View style={[
              themedStyles.card,
              {
                padding: 0,
                overflow: 'hidden',
                borderWidth: 1,
                borderColor: currentColors.border,
                borderRadius: 16,
              }
            ]}>
              {/* Header row */}
              <View style={{
                flexDirection: 'row',
                backgroundColor: currentColors.backgroundAlt,
                borderBottomWidth: 1,
                borderBottomColor: currentColors.border,
                paddingHorizontal: 8,
                minHeight: 48,
                alignItems: 'center',
              }}>
                <TableHeaderColumn label="Description" sortType="alphabetical" flex={1.6} />
                <TableHeaderColumn label="Type" sortType="type" flex={1.1} />
                <TableHeaderColumn label="Expense Type" sortType="debtRepayment" flex={1.3} />
                <TableHeaderColumn label="Assigned To" sortType="assignedTo" flex={1.2} />
                <TableHeaderColumn label="Category" sortType="categoryTag" flex={1.1} />
                <TableHeaderColumn label="Frequency" sortType="frequency" flex={0.9} />
                <TableHeaderColumn label="Date Added" sortType="date" flex={1.1} />
                <TableHeaderColumn label="End Date" sortType="endDate" flex={0.9} />
                <TableHeaderColumn label="Amount" sortType="cost" flex={1.1} alignRight />
                <TableHeaderColumn label="Actions" flex={0.7} />
              </View>

              {/* Rows */}
              {filteredExpenses.map((expense) => (
                <ExpenseRow key={expense.id} expense={expense} />
              ))}

              {/* Total Monthly Payments Row */}
              <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: currentColors.backgroundAlt,
                borderTopWidth: 2,
                borderTopColor: currentColors.border,
                minHeight: 52,
                paddingHorizontal: 8,
              }}>
                <View style={{ flex: 9.2, paddingHorizontal: 8, flexDirection: 'row', justifyContent: 'flex-end' }}>
                  <Text style={[themedStyles.text, { fontWeight: '700', fontSize: 13, color: currentColors.textSecondary }]}>
                    Total Monthly Payments:
                  </Text>
                </View>
                <View style={{ flex: 1.1, paddingHorizontal: 8, alignItems: 'flex-end' }}>
                  <Text style={[themedStyles.text, { fontWeight: '800', fontSize: 15, color: currentColors.primary }]}>
                    {formatCurrency(totalMonthlyAmount)}
                  </Text>
                </View>
                <View style={{ flex: 0.7, paddingHorizontal: 8 }} />
              </View>
            </View>
          ) : (
            // Mobile Card Layout
            <View style={[
              {
                flexDirection: 'column',
                gap: 8,
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
                      width: '100%',
                    }}
                  />
                );
              })}
            </View>
          )}
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
        debtFilter={debtFilter}
        setDebtFilter={setDebtFilter}
        people={data.people}
        expenses={data.expenses}
        customCategories={customCategories}
        onClearFilters={handleClearFilters}
        announceFilter={announceFilter}
      />
    </View >
  );
}
