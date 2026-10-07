
import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useBudgetData } from '../hooks/useBudgetData';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Text, View, Animated, AccessibilityInfo, Pressable } from 'react-native';
import { Alert } from '../utils/alert';
import { useTheme } from '../hooks/useTheme';
import { calculateMonthlyAmount } from '../utils/calculations';
import { useThemedStyles } from '../hooks/useThemedStyles';
import { useCurrency } from '../hooks/useCurrency';
import Icon from '../components/Icon';
import StandardHeader, { LargeTitle } from '../components/StandardHeader';
import NoBudgetState from '../components/NoBudgetState';
import LockGate from '../components/LockGate';
import { useLargeTitle } from '../hooks/useLargeTitle';
import ExpenseFilterModal from '../components/ExpenseFilterModal';
import ExpenseCard from '../components/ExpenseCard';
import ExpenseFilterBar from '../components/ExpenseFilterBar';
import ExpenseTable, { SortOption, SortOrder } from '../components/ExpenseTable';
import BulkActionBar from '../components/BulkActionBar';
import BulkEditSheet from '../components/BulkEditSheet';
import { AmountText, ConfirmDialog, EmptyState, ListGroup, Menu, SearchField, type MenuAnchor } from '../components/ui';
import { haptics } from '../utils/haptics';
import { useBulkExpenseActions } from '../hooks/useBulkExpenseActions';
import { countLabel, type BulkEditPatch } from '../utils/bulkEdit';
import { type, space, radius } from '../styles/tokens';
import { DEFAULT_CATEGORIES, type Expense } from '../types/budget';
import { bucketOfExpense, categoryBucketLookup } from '../utils/budgetReview';
import { getCustomExpenseCategories, getExpensesFilters, saveExpensesFilters, getExpensesSort, saveExpensesSort } from '../utils/storage';
import { NO_FILTERS, filterExpenses, hasActiveFilters as anyFilterActive, sortExpenses, type ExpenseFilters } from '../utils/expenseFilters';

// Sort menu: each field offers both directions; the list defaults to newest first.
const SORT_MENU: { title: string; options: { by: SortOption; order: SortOrder; label: string }[] }[] = [
  {
    title: 'Date added',
    options: [
      { by: 'date', order: 'desc', label: 'Newest first' },
      { by: 'date', order: 'asc', label: 'Oldest first' },
    ],
  },
  {
    title: 'Name',
    options: [
      { by: 'alphabetical', order: 'asc', label: 'A to Z' },
      { by: 'alphabetical', order: 'desc', label: 'Z to A' },
    ],
  },
  {
    title: 'Amount',
    options: [
      { by: 'cost', order: 'desc', label: 'Highest first' },
      { by: 'cost', order: 'asc', label: 'Lowest first' },
    ],
  },
  {
    title: 'Category',
    options: [
      { by: 'categoryTag', order: 'asc', label: 'A to Z' },
      { by: 'categoryTag', order: 'desc', label: 'Z to A' },
    ],
  },
];

function ExpensesScreenContent() {
  const { data, activeBudget, removeExpense, saving, refreshData, loading } = useBudgetData();
  // Nothing can be added until the first budget exists (it's created on Overview).
  const noBudget = !loading && !activeBudget;
  const bulk = useBulkExpenseActions();
  const { tokens } = useTheme();
  const largeTitle = useLargeTitle();
  const { themedStyles, breakpoint } = useThemedStyles();
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

  // What the list is filtered by (utils/expenseFilters). `searchTerm` is the typed
  // search, debounced, which is what the list is actually filtered by.
  const [filters, setFilters] = useState<ExpenseFilters>(NO_FILTERS);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [customCategories, setCustomCategories] = useState<string[]>([]);
  const changeFilters = useCallback((changes: Partial<ExpenseFilters>) => setFilters((f) => ({ ...f, ...changes })), []);

  // Where each expense counts in the budget review (its own choice, else its category's).
  const categoryBuckets = activeBudget?.categoryBuckets;
  const bucketLookup = useMemo(() => categoryBucketLookup(categoryBuckets), [categoryBuckets]);
  const bucketOf = useCallback((e: Expense) => bucketOfExpense(e, bucketLookup), [bucketLookup]);

  const [deletingExpenseId, setDeletingExpenseId] = useState<string | null>(null);

  const sortButtonRef = useRef<View>(null);
  const [sortMenuAnchor, setSortMenuAnchor] = useState<MenuAnchor | null>(null);
  const [showSortMenu, setShowSortMenu] = useState(false);

  // Bulk edit. `selectMode` is the phone's Select button; the table shows its
  // checkboxes all the time, so a selection there is just a non-empty set.
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkTargets, setBulkTargets] = useState<Expense[]>([]);
  const [showBulkEdit, setShowBulkEdit] = useState(false);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const lastToggledId = useRef<string | null>(null); // anchor for Shift-click ranges

  // Enhanced sorting state
  const [sortBy, setSortBy] = useState<SortOption>('date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc'); // Default: newest first

  // The sort is this account's own default: restored on open, saved on change.
  const sortLoaded = useRef(false);
  useEffect(() => {
    let cancelled = false;
    getExpensesSort().then((saved) => {
      if (cancelled) return;
      setSortBy(saved.by);
      setSortOrder(saved.order);
      sortLoaded.current = true;
    });
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    if (sortLoaded.current) saveExpensesSort({ by: sortBy, order: sortOrder });
  }, [sortBy, sortOrder]);

  // Use ref to track if we've already refreshed on this focus
  const hasRefreshedOnFocus = useRef(false);

  // FIXED: Better state management for filter loading
  const filtersLoaded = useRef(false);
  // Filters belong to one budget: this is the one the filters on screen were loaded for.
  const budgetId = activeBudget?.id;
  const filtersBudgetId = useRef<string | null>(null);
  const latestFilters = useRef(filters);
  latestFilters.current = filters;
  const isInitialLoad = useRef(true);
  const lastDashboardParams = useRef<string>(''); // Track dashboard navigation changes

  // Wrap announceFilter in useCallback to fix exhaustive deps warning
  const announceFilter = useCallback((msg: string) => {
    try {
      AccessibilityInfo.announceForAccessibility?.(msg);
    } catch (e) {
      console.warn('Accessibility announce failed', e);
    }
  }, []);

  // Helper formatting functions moved to ExpenseCard component

  // FIXED: Load persisted filters function with better error handling
  const loadPersistedFilters = useCallback(async () => {
    if (filtersLoaded.current || !budgetId) {
      return;
    }

    try {
      const saved = await getExpensesFilters(budgetId);
      // Another budget was opened while this was reading.
      if (filtersBudgetId.current !== budgetId) return;
      setFilters(saved);
      setSearchTerm(saved.search.trim());

      filtersLoaded.current = true;
    } catch (e) {
      console.error('ExpensesScreen: Failed to load persisted filters:', e);
      filtersLoaded.current = true; // Mark as loaded even on error to prevent infinite retries
    }
  }, [budgetId]);

  // Opening another budget (the tab stays mounted): keep the old budget's filters
  // with it and start the new one from its own saved ones.
  useEffect(() => {
    if (!budgetId) return;
    const previous = filtersBudgetId.current;
    filtersBudgetId.current = budgetId;
    if (previous && previous !== budgetId) {
      if (filtersLoaded.current) saveExpensesFilters(previous, latestFilters.current);
      filtersLoaded.current = false;
      setFilters(NO_FILTERS);
      setSearchTerm('');
    }
  }, [budgetId]);

  // FIXED: Better dashboard navigation handling with proper filter persistence
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        // Always load custom categories
        const customs = await getCustomExpenseCategories();
        setCustomCategories(customs);

        // Create a unique key for dashboard params to detect changes
        const dashboardParamsKey = `${params.fromDashboard}-${params.filter}-${params.category}-${params.personId}`;
        const isDashboardNavigation = params.fromDashboard === 'true';
        const dashboardParamsChanged = lastDashboardParams.current !== dashboardParamsKey;

        if (isDashboardNavigation) {
          // FIXED: Apply dashboard filters and mark as loaded
          if (dashboardParamsChanged || isInitialLoad.current) {
            lastDashboardParams.current = dashboardParamsKey;

            // Apply the filters from the URL parameters; everything else is cleared.
            setFilters({
              ...NO_FILTERS,
              type: params.filter === 'household' || params.filter === 'personal' ? params.filter : 'all',
              categories: params.category ? [params.category] : [],
              personId: params.personId || null,
            });
            setSearchTerm('');

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
  }, [params.filter, params.category, params.fromDashboard, params.personId, announceFilter, data.people, loadPersistedFilters, budgetId]);

  // Reload custom categories when data changes (e.g., after clearing all data)
  useEffect(() => {
    const reloadCustomCategories = async () => {
      try {
        const customs = await getCustomExpenseCategories();
        setCustomCategories(customs);
        // Drop selected categories that no longer exist
        const valid = filters.categories.filter((cat) => customs.includes(cat) || DEFAULT_CATEGORIES.includes(cat));
        if (valid.length !== filters.categories.length) changeFilters({ categories: valid });
      } catch (error) {
        console.error('ExpensesScreen: Error reloading custom categories:', error);
      }
    };

    reloadCustomCategories();
  }, [data.people.length, data.expenses.length, filters.categories, changeFilters]);

  // Remember the filters, dashboard ones included, once they have loaded.
  useEffect(() => {
    const id = filtersBudgetId.current;
    if (filtersLoaded.current && !isInitialLoad.current && id) {
      const timeoutId = setTimeout(() => saveExpensesFilters(id, filters), 500);
      return () => clearTimeout(timeoutId);
    }
  }, [filters]);

  // Debounce search for filtering performance
  useEffect(() => {
    const timeoutId = setTimeout(() => setSearchTerm(filters.search.trim()), 300);
    return () => clearTimeout(timeoutId);
  }, [filters.search]);

  // FIXED: Better focus effect handling with proper filter persistence
  useFocusEffect(
    useCallback(() => {
      if (!hasRefreshedOnFocus.current) {
        hasRefreshedOnFocus.current = true;
        refreshData(true);
        // Also refresh custom categories (in case new one added)
        getCustomExpenseCategories().then(setCustomCategories).catch((e) => console.warn('Failed to refresh custom categories', e));
      }

      return () => {
        hasRefreshedOnFocus.current = false;
        // FIXED: Only reset dashboard state when actually leaving the screen for good
        // Don't reset when just navigating away temporarily
      };
    }, [refreshData])
  );

  const handleRemoveExpense = useCallback(
    async (expenseId: string) => {
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
            handleRemoveExpense(expenseId);
          },
        },
      ]);
    },
    [handleRemoveExpense]
  );

  // Route-driven on every form factor (DESIGN.md §2.5): deep-linkable, one path.
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
    setFilters(NO_FILTERS);
    setSearchTerm('');
    announceFilter('All filters cleared');
    if (budgetId) saveExpensesFilters(budgetId, NO_FILTERS);
  }, [announceFilter, budgetId]);

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

  const openSortMenu = useCallback(() => {
    sortButtonRef.current?.measureInWindow((x, y, width, height) => {
      setSortMenuAnchor({ x, y, width, height });
      setShowSortMenu(true);
    });
  }, []);
  const chooseSort = useCallback((by: SortOption, order: SortOrder) => {
    if (by !== sortBy || order !== sortOrder) haptics.selection();
    setSortBy(by);
    setSortOrder(order);
    setShowSortMenu(false);
  }, [sortBy, sortOrder]);

  // Filtering by the debounced search, then sorting.
  const filteredExpenses = useMemo(
    () =>
      sortExpenses(
        filterExpenses(data.expenses, { ...filters, search: searchTerm }, bucketOf),
        { by: sortBy, order: sortOrder },
        data.people
      ),
    [data.expenses, data.people, filters, searchTerm, bucketOf, sortBy, sortOrder]
  );
  const shownExpenses = filteredExpenses;

  const totalMonthlyAmount = filteredExpenses.reduce((sum, e) => {
    return sum + calculateMonthlyAmount(e.amount, e.frequency);
  }, 0);

  const filtersActive = anyFilterActive({ ...filters, search: searchTerm });

  const busy = saving || deletingExpenseId !== null || bulk.busy;
  const subtitle = filtersActive
    ? `${filteredExpenses.length} of ${data.expenses.length} · ${formatCurrency(totalMonthlyAmount)}/mo`
    : `${data.expenses.length} ${data.expenses.length === 1 ? 'expense' : 'expenses'} · ${formatCurrency(totalMonthlyAmount)}/mo`;

  // The table needs expanded width; tablet widths read better as the list.
  const useTable = breakpoint.isExpanded;

  // Only what is on screen can be selected: a row filtered away drops out, so
  // a bulk edit never touches something the person can't see.
  const selectedVisible = shownExpenses.filter((e) => selectedIds.has(e.id));
  const visibleKey = shownExpenses.map((e) => e.id).join('\u0001');
  useEffect(() => {
    const visible = new Set(visibleKey.split('\u0001'));
    setSelectedIds((prev) => {
      const kept = [...prev].filter((id) => visible.has(id));
      return kept.length === prev.size ? prev : new Set(kept);
    });
  }, [visibleKey]);
  const selecting = useTable ? selectedVisible.length > 0 : selectMode;
  const allSelected = shownExpenses.length > 0 && selectedVisible.length === shownExpenses.length;
  const selectedMonthly = selectedVisible.reduce((sum, e) => sum + calculateMonthlyAmount(e.amount, e.frequency), 0);

  const exitSelection = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
    lastToggledId.current = null;
  };
  const startSelection = (id?: string) => {
    haptics.selection();
    setSelectMode(true);
    if (id) {
      setSelectedIds(new Set([id]));
      lastToggledId.current = id;
    }
  };
  const toggleSelected = (id: string, shift = false) => {
    haptics.selection();
    const anchor = lastToggledId.current;
    lastToggledId.current = id;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const ids = shownExpenses.map((e) => e.id);
      const from = anchor && shift ? ids.indexOf(anchor) : -1;
      const to = ids.indexOf(id);
      if (from !== -1 && to !== -1) {
        for (let i = Math.min(from, to); i <= Math.max(from, to); i++) next.add(ids[i]);
      } else if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleAll = () => {
    haptics.selection();
    lastToggledId.current = null;
    setSelectedIds(allSelected ? new Set() : new Set(shownExpenses.map((e) => e.id)));
  };

  const openBulkEdit = () => {
    if (selectedVisible.length === 0) return;
    setBulkTargets(selectedVisible);
    setShowBulkEdit(true);
  };
  const requestBulkDelete = () => {
    if (selectedVisible.length === 0) return;
    setBulkTargets(selectedVisible);
    setConfirmBulkDelete(true);
  };

  const handleBulkApply = async (patch: BulkEditPatch) => {
    if (!(await bulk.applyEdit(bulkTargets.map((e) => e.id), patch))) return;
    setShowBulkEdit(false);
    exitSelection();
  };

  const handleBulkDelete = async () => {
    const deleted = await bulk.deleteAll(bulkTargets.map((e) => e.id));
    setConfirmBulkDelete(false);
    if (deleted) exitSelection();
  };

  // Every category the add/edit form offers (defaults, then custom).
  const bulkCategories = [...DEFAULT_CATEGORIES, ...customCategories.filter((c) => !DEFAULT_CATEGORIES.includes(c))];
  const isDefaultSort = sortBy === 'date' && sortOrder === 'desc';
  const currentSortLabel =
    SORT_MENU.flatMap((g) => g.options.map((o) => ({ ...o, group: g.title })))
      .filter((o) => o.by === sortBy && o.order === sortOrder)
      .map((o) => `${o.group}, ${o.label}`)[0] ?? 'custom order';

  return (
    <View style={themedStyles.container}>
      <StandardHeader
        title={selecting && !useTable ? (selectedVisible.length > 0 ? `${selectedVisible.length} selected` : 'Select expenses') : 'Expenses'}
        subtitle={
          selecting && !useTable
            ? selectedVisible.length > 0
              ? `${formatCurrency(selectedMonthly)}/mo selected`
              : 'Tap expenses to choose them'
            : data.expenses.length > 0
              ? subtitle
              : undefined
        }
        largeTitle={largeTitle}
        showLeftIcon={false}
        showRightIcon={false}
        loading={busy}
        rightButtons={
          noBudget
            ? []
            : selecting && !useTable
            ? [
                ...(selectedVisible.length > 0
                  ? [
                      {
                        icon: 'trash-outline',
                        onPress: requestBulkDelete,
                        backgroundColor: 'transparent',
                        iconColor: tokens.colors.danger,
                        accessibilityLabel: 'Delete selected expenses',
                      },
                      { icon: 'create-outline', onPress: openBulkEdit, accessibilityLabel: 'Edit selected expenses' },
                    ]
                  : []),
                // Where the add button sits, so it turns into the way out.
                {
                  icon: 'close',
                  onPress: exitSelection,
                  backgroundColor: 'transparent',
                  iconColor: tokens.colors.text,
                  accessibilityLabel: 'Cancel selection',
                },
              ]
            : [
                // The table has its own checkboxes; the list needs a way in.
                ...(useTable || data.expenses.length === 0
                  ? []
                  : [
                      {
                        icon: 'checkmark-circle-outline',
                        onPress: () => startSelection(),
                        backgroundColor: 'transparent',
                        iconColor: tokens.colors.brand,
                        accessibilityLabel: 'Select expenses',
                      },
                    ]),
                {
                  icon: filtersActive ? 'options' : 'options-outline',
                  onPress: () => setShowFilterModal(true),
                  backgroundColor: filtersActive ? tokens.colors.brandSubtle : 'transparent',
                  iconColor: tokens.colors.brand,
                  accessibilityLabel: filtersActive ? 'More filters, some applied' : 'More filters',
                },
                { icon: 'add', onPress: handleNavigateToAddExpense, accessibilityLabel: 'Add expense' },
              ]
        }
      />

      <Animated.ScrollView
        {...largeTitle.scrollProps}
        contentContainerStyle={[
          themedStyles.scrollContent,
          { paddingHorizontal: breakpoint.gutter, paddingTop: largeTitle.enabled ? 0 : space.s4 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ width: '100%', maxWidth: breakpoint.contentMaxWidth, alignSelf: 'center' }}>
          <LargeTitle largeTitle={largeTitle} />
          {data.expenses.length > 0 ? (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s2 }}>
                <SearchField
                  value={filters.search}
                  onChangeText={(search) => changeFilters({ search })}
                  placeholder="Search expenses"
                  style={{ flex: 1 }}
                />
                <View ref={sortButtonRef} collapsable={false}>
                  <Pressable
                    onPress={openSortMenu}
                    accessibilityRole="button"
                    accessibilityLabel={`Sort, ${currentSortLabel}`}
                    accessibilityHint="Opens sort options"
                    style={({ pressed }) => ({
                      width: 44,
                      height: 44,
                      borderRadius: radius.md,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: pressed
                        ? tokens.colors.surfaceHover
                        : isDefaultSort
                          ? tokens.colors.surface
                          : tokens.colors.brandSubtle,
                    })}
                  >
                    <Icon
                      name="swap-vertical"
                      size={20}
                      color={isDefaultSort ? tokens.colors.text : tokens.colors.brand}
                    />
                  </Pressable>
                </View>
              </View>

              <ExpenseFilterBar
                people={data.people}
                filters={filters}
                onChange={changeFilters}
                hasActiveFilters={filtersActive}
                onClearAll={handleClearFilters}
              />

              {selecting && !useTable ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44, marginBottom: space.s2 }}>
                  <Pressable
                    onPress={toggleAll}
                    accessibilityRole="button"
                    accessibilityLabel={allSelected ? 'Deselect all expenses' : `Select all ${shownExpenses.length} expenses`}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
                  >
                    <Text style={[type.bodyMed, { color: tokens.colors.brand }]}>
                      {allSelected ? 'Deselect all' : `Select all ${shownExpenses.length}`}
                    </Text>
                  </Pressable>
                </View>
              ) : (
                <View style={{ height: useTable ? space.s2 : space.s4 }} />
              )}
            </>
          ) : null}

          {filteredExpenses.length === 0 ? (
            <ListGroup>
              {noBudget ? (
                <NoBudgetState />
              ) : filtersActive ? (
                <EmptyState
                  icon="search-outline"
                  title="No matching expenses"
                  caption="Try removing a filter or changing your search."
                  actionLabel="Clear filters"
                  onAction={handleClearFilters}
                />
              ) : (
                <EmptyState
                  icon="receipt-outline"
                  title="No expenses yet"
                  caption="Add your first expense to start tracking where the money goes."
                  actionLabel="Add expense"
                  onAction={handleNavigateToAddExpense}
                />
              )}
            </ListGroup>
          ) : useTable ? (
            <>
              <ExpenseTable
                expenses={filteredExpenses}
                people={data.people}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={handleSortPress}
                onEdit={handleEditExpense}
                onDelete={handleDeletePress}
                deletingExpenseId={deletingExpenseId}
                disabled={busy}
                totalMonthly={totalMonthlyAmount}
                selectedIds={selectedIds}
                onToggle={toggleSelected}
                onToggleAll={toggleAll}
              />
              {selectedVisible.length > 0 ? (
                <BulkActionBar
                  count={selectedVisible.length}
                  disabled={busy}
                  onEdit={openBulkEdit}
                  onDelete={requestBulkDelete}
                  onClear={exitSelection}
                />
              ) : null}
            </>
          ) : (
            <ListGroup>
              {filteredExpenses.map((expense, idx) => (
                <ExpenseCard
                  key={expense.id}
                  expense={expense}
                  person={expense.personId ? data.people.find((p) => p.id === expense.personId) : null}
                  isDeleting={deletingExpenseId === expense.id}
                  onPress={() => handleEditExpense(expense)}
                  onDelete={handleDeletePress}
                  selectMode={selecting}
                  selected={selectedIds.has(expense.id)}
                  onToggleSelect={() => toggleSelected(expense.id)}
                  onLongPress={() => startSelection(expense.id)}
                  // Light mode: the total row's divider replaces the last hairline.
                  showSeparator={tokens.isDark || idx < filteredExpenses.length - 1}
                />
              ))}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingHorizontal: space.s4,
                  paddingVertical: space.s4,
                  // Light: surfaceSunken is the page grey, so the total row
                  // melted into the page below. Keep it on the card's white
                  // and set it off from the rows with a firm divider instead.
                  backgroundColor: tokens.isDark ? tokens.colors.surfaceSunken : tokens.colors.surface,
                  borderTopWidth: tokens.isDark ? 0 : 1,
                  borderTopColor: tokens.colors.borderStrong,
                }}
              >
                <Text style={[type.bodyMed, { color: tokens.isDark ? tokens.colors.textMuted : tokens.colors.text }]}>
                  Monthly total
                </Text>
                <AmountText value={totalMonthlyAmount} role="h3" />
              </View>
            </ListGroup>
          )}
        </View>
      </Animated.ScrollView>

      <Menu
        visible={showSortMenu}
        onClose={() => setShowSortMenu(false)}
        anchor={sortMenuAnchor}
        label="Sort expenses"
        sections={SORT_MENU.map((group) => ({
          title: group.title,
          items: group.options.map((o) => ({
            key: `${o.by}-${o.order}`,
            label: o.label,
            icon: o.order === 'asc' ? 'arrow-up' : 'arrow-down',
            checked: sortBy === o.by && sortOrder === o.order,
            onPress: () => chooseSort(o.by, o.order),
          })),
        }))}
      />

      <BulkEditSheet
        visible={showBulkEdit}
        onClose={() => setShowBulkEdit(false)}
        expenses={bulkTargets}
        people={data.people}
        categories={bulkCategories}
        bucketLookup={bucketLookup}
        busy={bulk.busy}
        onApply={handleBulkApply}
      />

      <ConfirmDialog
        visible={confirmBulkDelete}
        title={`Delete ${countLabel(bulkTargets.length)}?`}
        message={`${bulkTargets.length === 1 ? 'It' : 'They'} will be removed from this budget. This can't be undone.`}
        confirmLabel="Delete"
        destructive
        loading={bulk.busy}
        onConfirm={handleBulkDelete}
        onCancel={() => setConfirmBulkDelete(false)}
      />

      <ExpenseFilterModal
        visible={showFilterModal}
        onClose={() => setShowFilterModal(false)}
        filters={filters}
        onApply={setFilters}
        bucketOf={bucketOf}
        people={data.people}
        expenses={data.expenses}
        customCategories={customCategories}
        announceFilter={announceFilter}
      />
    </View>
  );
}

// Nothing of the screen is shown while the budget is locked.
export default function ExpensesScreen() {
  return (
    <LockGate title="Expenses">
      <ExpensesScreenContent />
    </LockGate>
  );
}
