
import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Modal } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { useThemedStyles } from '../hooks/useThemedStyles';
import Icon from './Icon';
import { DEFAULT_CATEGORIES } from '../types/budget';
import { normalizeCategoryName } from '../utils/storage';

interface ExpenseFilterModalProps {
  visible: boolean;
  onClose: () => void;
  // Filter state
  filter: 'all' | 'household' | 'personal';
  setFilter: (filter: 'all' | 'household' | 'personal') => void;
  personFilter: string | null;
  setPersonFilter: (personId: string | null) => void;
  categoryFilter: string | null;
  setCategoryFilter: (category: string | null) => void;
  categoryFilters: string[];
  setCategoryFilters: (categories: string[]) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  hasEndDateFilter: boolean;
  setHasEndDateFilter: (hasEndDate: boolean) => void;
  // Data
  people: any[];
  expenses: any[];
  customCategories: string[];
  // Callbacks
  onClearFilters: () => void;
  announceFilter: (msg: string) => void;
}

export default function ExpenseFilterModal({
  visible,
  onClose,
  filter,
  setFilter,
  personFilter,
  setPersonFilter,
  categoryFilter,
  setCategoryFilter,
  categoryFilters,
  setCategoryFilters,
  searchQuery,
  setSearchQuery,
  hasEndDateFilter,
  setHasEndDateFilter,
  people,
  expenses,
  customCategories,
  onClearFilters,
  announceFilter,
}: ExpenseFilterModalProps) {
  const { currentColors } = useTheme();
  const { themedStyles } = useThemedStyles();

  // FIXED: Local state for temporary filter values (applied when "Apply Filters" is pressed)
  const [tempFilter, setTempFilter] = useState<'all' | 'household' | 'personal'>('all');
  const [tempPersonFilter, setTempPersonFilter] = useState<string | null>(null);
  const [tempCategoryFilters, setTempCategoryFilters] = useState<string[]>([]);
  const [tempSearchQuery, setTempSearchQuery] = useState<string>('');
  const [tempHasEndDateFilter, setTempHasEndDateFilter] = useState<boolean>(false);

  // FIXED: Initialize temp state when modal opens with current filter values
  useEffect(() => {
    if (visible) {
      console.log('ExpenseFilterModal: Initializing temp state with current filters:', {
        filter,
        personFilter,
        categoryFilter,
        searchQuery,
        hasEndDateFilter
      });
      setTempFilter(filter);
      setTempPersonFilter(personFilter);
      // Initialize with multiple categories if available, otherwise single category
      const initialCategories = categoryFilters.length > 0 ? categoryFilters : (categoryFilter ? [categoryFilter] : []);
      setTempCategoryFilters(initialCategories);
      setTempSearchQuery(searchQuery);
      setTempHasEndDateFilter(hasEndDateFilter);
    }
  }, [visible, filter, personFilter, categoryFilter, categoryFilters, searchQuery, hasEndDateFilter]);

  const availableCategories = (() => {
    // Union of defaults + custom + any tag appearing in expenses (normalized)
    const fromExpenses = new Set<string>();
    expenses.forEach((e) => {
      const tag = normalizeCategoryName((e as any).categoryTag || 'Misc');
      if (tag) fromExpenses.add(tag);
    });
    const combined = new Set<string>([...DEFAULT_CATEGORIES, ...customCategories, ...Array.from(fromExpenses)]);
    return Array.from(combined);
  })().sort((a, b) => a.localeCompare(b));

  // NEW: Calculate expense counts for each filter option dynamically
  const expenseCounts = useMemo(() => {
    console.log('ExpenseFilterModal: Calculating expense counts...');
    
    // Helper function to apply filters and count results
    const countExpensesWithFilters = (testFilters: {
      filter?: 'all' | 'household' | 'personal';
      personFilter?: string | null;
      categoryFilter?: string | null;
      categoryFilters?: string[];
      searchQuery?: string;
      hasEndDateFilter?: boolean;
    }) => {
      let filtered = [...expenses];
      
      // Apply expense type filter
      if (testFilters.filter === 'household') {
        filtered = filtered.filter((e) => e.category === 'household');
      } else if (testFilters.filter === 'personal') {
        filtered = filtered.filter((e) => e.category === 'personal');
      }
      
      // Apply person filter
      if (testFilters.personFilter) {
        filtered = filtered.filter((e) => {
          if (e.category === 'household') {
            return e.personId === testFilters.personFilter;
          }
          return e.personId === testFilters.personFilter;
        });
      }
      
      // Apply category filter (support both single and multiple)
      const activeCategories = testFilters.categoryFilters && testFilters.categoryFilters.length > 0 
        ? testFilters.categoryFilters 
        : (testFilters.categoryFilter ? [testFilters.categoryFilter] : []);
      if (activeCategories.length > 0) {
        const selectedCategories = activeCategories.map(cat => normalizeCategoryName(cat));
        filtered = filtered.filter((e) => {
          const expenseCategory = normalizeCategoryName((e as any).categoryTag || 'Misc');
          return selectedCategories.includes(expenseCategory);
        });
      }
      
      // Apply search filter
      if (testFilters.searchQuery && testFilters.searchQuery.trim()) {
        const q = testFilters.searchQuery.toLowerCase();
        filtered = filtered.filter((e) => e.description.toLowerCase().includes(q));
      }
      
      // Apply end date filter
      if (testFilters.hasEndDateFilter) {
        filtered = filtered.filter((e) => {
          const hasEndDate = e.endDate && e.frequency !== 'one-time';
          return hasEndDate;
        });
      }
      
      return filtered.length;
    };

    // Calculate counts for expense types
    const allCount = countExpensesWithFilters({
      filter: 'all',
      personFilter: tempPersonFilter,
      categoryFilters: tempCategoryFilters,
      searchQuery: tempSearchQuery,
      hasEndDateFilter: tempHasEndDateFilter
    });
    
    const householdCount = countExpensesWithFilters({
      filter: 'household',
      personFilter: tempPersonFilter,
      categoryFilters: tempCategoryFilters,
      searchQuery: tempSearchQuery,
      hasEndDateFilter: tempHasEndDateFilter
    });
    
    const personalCount = countExpensesWithFilters({
      filter: 'personal',
      personFilter: tempPersonFilter,
      categoryFilters: tempCategoryFilters,
      searchQuery: tempSearchQuery,
      hasEndDateFilter: tempHasEndDateFilter
    });

    // Calculate counts for people
    const peopleCounts: { [personId: string]: number } = {};
    people.forEach(person => {
      peopleCounts[person.id] = countExpensesWithFilters({
        filter: tempFilter,
        personFilter: person.id,
        categoryFilters: tempCategoryFilters,
        searchQuery: tempSearchQuery,
        hasEndDateFilter: tempHasEndDateFilter
      });
    });
    
    // Count for "All People"
    const allPeopleCount = countExpensesWithFilters({
      filter: tempFilter,
      personFilter: null,
      categoryFilters: tempCategoryFilters,
      searchQuery: tempSearchQuery,
      hasEndDateFilter: tempHasEndDateFilter
    });

    // Calculate counts for categories
    const categoryCounts: { [category: string]: number } = {};
    availableCategories.forEach(category => {
      categoryCounts[category] = countExpensesWithFilters({
        filter: tempFilter,
        personFilter: tempPersonFilter,
        categoryFilter: category,
        searchQuery: tempSearchQuery,
        hasEndDateFilter: tempHasEndDateFilter
      });
    });
    
    // Count for "All Categories"
    const allCategoriesCount = countExpensesWithFilters({
      filter: tempFilter,
      personFilter: tempPersonFilter,
      categoryFilter: null,
      searchQuery: tempSearchQuery,
      hasEndDateFilter: tempHasEndDateFilter
    });

    // Calculate count for end date filter
    const withEndDateCount = countExpensesWithFilters({
      filter: tempFilter,
      personFilter: tempPersonFilter,
      categoryFilters: tempCategoryFilters,
      searchQuery: tempSearchQuery,
      hasEndDateFilter: true
    });
    
    const withoutEndDateCount = countExpensesWithFilters({
      filter: tempFilter,
      personFilter: tempPersonFilter,
      categoryFilters: tempCategoryFilters,
      searchQuery: tempSearchQuery,
      hasEndDateFilter: false
    });

    console.log('ExpenseFilterModal: Calculated counts:', {
      expenseTypes: { all: allCount, household: householdCount, personal: personalCount },
      people: peopleCounts,
      allPeople: allPeopleCount,
      categories: categoryCounts,
      allCategories: allCategoriesCount,
      endDate: { with: withEndDateCount, without: withoutEndDateCount }
    });

    return {
      expenseTypes: { all: allCount, household: householdCount, personal: personalCount },
      people: peopleCounts,
      allPeople: allPeopleCount,
      categories: categoryCounts,
      allCategories: allCategoriesCount,
      endDate: { with: withEndDateCount, without: withoutEndDateCount }
    };
  }, [expenses, tempFilter, tempPersonFilter, tempCategoryFilters, tempSearchQuery, tempHasEndDateFilter, people, availableCategories]);

  const hasActiveFilters = tempCategoryFilters.length > 0 || !!tempSearchQuery.trim() || (tempFilter !== 'all') || !!tempPersonFilter || tempHasEndDateFilter;

  const handleCancel = () => {
    console.log('ExpenseFilterModal: Cancel pressed, resetting temp state');
    // Reset temp state to original values and close without applying
    setTempFilter(filter);
    setTempPersonFilter(personFilter);
    // Reset with current categories
    const currentCategories = categoryFilters.length > 0 ? categoryFilters : (categoryFilter ? [categoryFilter] : []);
    setTempCategoryFilters(currentCategories);
    setTempSearchQuery(searchQuery);
    setTempHasEndDateFilter(hasEndDateFilter);
    onClose();
  };

  const handleApplyFilters = () => {
    console.log('ExpenseFilterModal: Applying filters:', {
      tempFilter,
      tempPersonFilter,
      tempCategoryFilters,
      tempSearchQuery,
      tempHasEndDateFilter
    });
    
    // FIXED: Apply the temporary filter values to the actual state
    setFilter(tempFilter);
    setPersonFilter(tempPersonFilter);
    
    // Apply multiple categories
    setCategoryFilters(tempCategoryFilters);
    // For storage compatibility, also set single category filter to first selected
    const newCategoryFilter = tempCategoryFilters;
    setCategoryFilter(newCategoryFilter);
    setSearchQuery(tempSearchQuery);
    setHasEndDateFilter(tempHasEndDateFilter);

    // FIXED: Build proper announcement message
    let message = 'Filters applied';
    if (hasActiveFilters) {
      const activeFilters = [];
      if (tempSearchQuery.trim()) activeFilters.push(`search: "${tempSearchQuery.trim()}"`);
      if (tempCategoryFilters.length > 0) {
        if (tempCategoryFilters.length === 1) {
          activeFilters.push(`category: ${tempCategoryFilters[0]}`);
        } else {
          activeFilters.push(`categories: ${tempCategoryFilters.join(', ')}`);
        }
      }
      if (tempFilter !== 'all') activeFilters.push(`type: ${tempFilter}`);
      if (tempPersonFilter) {
        const personName = people.find(p => p.id === tempPersonFilter)?.name || 'Unknown';
        activeFilters.push(`person: ${personName}`);
      }
      if (tempHasEndDateFilter) activeFilters.push('has end date');
      message = `Filters applied: ${activeFilters.join(', ')}`;
    } else {
      message = 'No filters applied - showing all expenses';
    }
    announceFilter(message);
    onClose();
  };

  const handleClearFilters = () => {
    console.log('ExpenseFilterModal: Clearing all temp filters');
    setTempFilter('all');
    setTempPersonFilter(null);
    setTempCategoryFilters([]);
    setTempSearchQuery('');
    setTempHasEndDateFilter(false);
  };

  const handleCategoryToggle = (category: string) => {
    setTempCategoryFilters(prev => {
      if (prev.includes(category)) {
        return prev.filter(c => c !== category);
      } else {
        return [...prev, category];
      }
    });
  };

  // FIXED: Common styles for all tappable filter options (compact and blue) - removed flex and width constraints
  const getFilterButtonStyle = (isSelected: boolean) => ({
    backgroundColor: isSelected ? currentColors.secondary : currentColors.backgroundAlt,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderWidth: isSelected ? 2 : 1,
    borderColor: isSelected ? currentColors.secondary : currentColors.border,
    boxShadow: isSelected ? '0px 2px 4px rgba(0,0,0,0.1)' : 'none',
    minHeight: 40,
    flexDirection: 'row' as const,
    marginRight: 8,
    marginBottom: 8,
  });

  const getFilterTextStyle = (isSelected: boolean) => ({
    color: isSelected ? '#FFFFFF' : currentColors.text,
    fontWeight: '600' as const,
    fontSize: 13,
    textAlign: 'center' as const,
  });

  const getCountBubbleStyle = (isSelected: boolean) => ({
    backgroundColor: isSelected ? '#FFFFFF' + '20' : currentColors.textSecondary + '20',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    marginLeft: 6,
  });

  const getCountTextStyle = (isSelected: boolean) => ({
    color: isSelected ? '#FFFFFF' : currentColors.textSecondary,
    fontSize: 11,
    fontWeight: '600' as const,
    textAlign: 'center' as const,
  });

  // Count bubble component
  const CountBubble = ({ count, isSelected }: { count: number; isSelected: boolean }) => (
    <View style={getCountBubbleStyle(isSelected)}>
      <Text style={getCountTextStyle(isSelected)}>
        {count}
      </Text>
    </View>
  );

  // FIXED: FilterButton component with content-based width
  const FilterButton = ({ filterType, label }: { filterType: 'all' | 'household' | 'personal'; label: string }) => {
    const isSelected = tempFilter === filterType;
    const count = expenseCounts.expenseTypes[filterType];
    
    return (
      <TouchableOpacity
        style={getFilterButtonStyle(isSelected)}
        onPress={() => {
          console.log('ExpenseFilterModal: FilterButton pressed:', filterType, 'current tempFilter:', tempFilter);
          setTempFilter(filterType);
          // FIXED: Clear person filter when switching to 'all' or 'household'
          if (filterType !== 'personal') {
            setTempPersonFilter(null);
          }
        }}
        activeOpacity={0.7}
      >
        <Text style={getFilterTextStyle(isSelected)}>
          {label}
        </Text>
        <CountBubble count={count} isSelected={isSelected} />
      </TouchableOpacity>
    );
  };

  // FIXED: PersonButton component with content-based width
  const PersonButton = ({ personId, label, count }: { personId: string | null; label: string; count: number }) => {
    const isSelected = tempPersonFilter === personId;
    
    return (
      <TouchableOpacity
        style={getFilterButtonStyle(isSelected)}
        onPress={() => {
          console.log('ExpenseFilterModal: Person selected:', label);
          setTempPersonFilter(personId);
        }}
      >
        <Text style={getFilterTextStyle(isSelected)}>
          {label}
        </Text>
        <CountBubble count={count} isSelected={isSelected} />
      </TouchableOpacity>
    );
  };

  // FIXED: CategoryButton component with content-based width
  const CategoryButton = ({ category, count }: { category: string; count: number }) => {
    const isSelected = tempCategoryFilters.includes(category);
    
    return (
      <TouchableOpacity
        style={getFilterButtonStyle(isSelected)}
        onPress={() => {
          console.log('ExpenseFilterModal: Category toggled:', category);
          handleCategoryToggle(category);
        }}
        accessibilityLabel={`Toggle category ${category}${isSelected ? ', selected' : ''}`}
      >
        {isSelected && (
          <Icon name="checkmark" size={12} style={{ color: '#FFFFFF', marginRight: 4 }} />
        )}
        <Text style={getFilterTextStyle(isSelected)}>
          {category}
        </Text>
        <CountBubble count={count} isSelected={isSelected} />
      </TouchableOpacity>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleCancel}
    >
      <View style={[themedStyles.container, { backgroundColor: currentColors.background }]}>
        {/* Header */}
        <View style={[themedStyles.header, { height: 64, boxShadow: '0px 1px 2px rgba(0,0,0,0.10)' }]}>
          <View style={{ width: 44, height: 44, justifyContent: 'center', alignItems: 'flex-start' }}>
            <TouchableOpacity
              onPress={handleCancel}
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: currentColors.border + '40',
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <Icon name="close" size={24} style={{ color: currentColors.text }} />
            </TouchableOpacity>
          </View>

          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <Text style={[themedStyles.headerTitle, { textAlign: 'center', lineHeight: 22 }]}>
              Filter & Search
            </Text>
          </View>

          <View style={{ width: 44, height: 44 }}>
            {/* Empty space for symmetry */}
          </View>
        </View>

        <ScrollView style={themedStyles.content} contentContainerStyle={[themedStyles.scrollContent, { paddingHorizontal: 16 }]}>
          {/* Search input */}
          <View style={[themedStyles.section, { paddingBottom: 0 }]}>
            <Text style={[themedStyles.text, { marginBottom: 8, fontWeight: '600', fontSize: 16 }]}>Search</Text>
            <TextInput
              style={[themedStyles.input, { marginBottom: 0 }]}
              placeholder="Search by description"
              placeholderTextColor={currentColors.textSecondary}
              value={tempSearchQuery}
              onChangeText={setTempSearchQuery}
              accessibilityLabel="Search expenses"
            />
          </View>

          {/* FIXED: Expense type filter buttons with content-based width */}
          <View style={[themedStyles.section, { paddingBottom: 0 }]}>
            <Text style={[themedStyles.text, { marginBottom: 12, fontWeight: '600', fontSize: 16 }]}>Expense Type</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 }}>
              <FilterButton filterType="all" label="All" />
              <FilterButton filterType="household" label="Household" />
              <FilterButton filterType="personal" label="Personal" />
            </View>
          </View>

          {/* FIXED: End Date Filter with content-based width and timer icon always */}
          <View style={[themedStyles.section, { paddingBottom: 0 }]}>
            <Text style={[themedStyles.text, { marginBottom: 12, fontWeight: '600', fontSize: 16 }]}>Expiration</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 }}>
              <TouchableOpacity
                style={getFilterButtonStyle(tempHasEndDateFilter)}
                onPress={() => {
                  console.log('ExpenseFilterModal: End date filter toggled from', tempHasEndDateFilter, 'to', !tempHasEndDateFilter);
                  setTempHasEndDateFilter(!tempHasEndDateFilter);
                }}
              >
                <Icon 
                  name="timer-outline"
                  size={14} 
                  style={{ 
                    color: tempHasEndDateFilter ? '#FFFFFF' : currentColors.text,
                    marginRight: 6 
                  }} 
                />
                <Text style={getFilterTextStyle(tempHasEndDateFilter)}>
                  Only expenses with end dates
                </Text>
                <CountBubble count={expenseCounts.endDate.with} isSelected={tempHasEndDateFilter} />
              </TouchableOpacity>
            </View>
          </View>

          {/* FIXED: Person filter with content-based width */}
          {people.length > 0 && (
            <View style={[themedStyles.section, { paddingBottom: 0 }]}>
              <Text style={[themedStyles.text, { marginBottom: 12, fontWeight: '600', fontSize: 16 }]}>Person</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ paddingHorizontal: 4, flexDirection: 'row' }}>
                  <PersonButton 
                    personId={null} 
                    label="All People" 
                    count={expenseCounts.allPeople} 
                  />

                  {people.map((person) => (
                    <PersonButton 
                      key={person.id}
                      personId={person.id} 
                      label={person.name} 
                      count={expenseCounts.people[person.id] || 0} 
                    />
                  ))}
                </View>
              </ScrollView>
            </View>
          )}

          {/* FIXED: Category selection with content-based width */}
          <View style={[themedStyles.section, { paddingBottom: 0 }]}>
            <Text style={[themedStyles.text, { marginBottom: 12, fontWeight: '600', fontSize: 16 }]}>
              Categories {tempCategoryFilters.length > 0 && `(${tempCategoryFilters.length} selected)`}
            </Text>
            
            {/* FIXED: All Categories button with content-based width */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, marginBottom: 12 }}>
              <TouchableOpacity
                style={getFilterButtonStyle(tempCategoryFilters.length === 0)}
                onPress={() => {
                  console.log('ExpenseFilterModal: All Categories selected');
                  setTempCategoryFilters([]);
                }}
              >
                <Text style={getFilterTextStyle(tempCategoryFilters.length === 0)}>
                  All Categories
                </Text>
                <CountBubble count={expenseCounts.allCategories} isSelected={tempCategoryFilters.length === 0} />
              </TouchableOpacity>
            </View>

            {/* Category grid */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 }}>
              {availableCategories.map((cat) => (
                <View key={cat} style={{ margin: 4 }}>
                  <CategoryButton 
                    category={cat} 
                    count={expenseCounts.categories[cat] || 0} 
                  />
                </View>
              ))}
            </View>
          </View>

          {/* Active filter summary */}
          {hasActiveFilters && (
            <View style={[themedStyles.section]}>
              <Text style={[themedStyles.text, { marginBottom: 12, fontWeight: '600', fontSize: 16 }]}>Preview Filters</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  {tempCategoryFilters.length > 0 && (
                    <View
                      style={[
                        themedStyles.badge,
                        {
                          backgroundColor: currentColors.secondary + '20',
                          borderRadius: 16,
                          paddingHorizontal: 10,
                          paddingVertical: 6,
                          marginRight: 8,
                          borderWidth: 1,
                          borderColor: currentColors.secondary,
                        },
                      ]}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Icon name="pricetag-outline" size={14} style={{ color: currentColors.secondary, marginRight: 6 }} />
                        <Text style={[themedStyles.text, { color: currentColors.secondary, fontSize: 12 }]}>
                          {tempCategoryFilters.length === 1 ? tempCategoryFilters[0] : `${tempCategoryFilters.length} categories`}
                        </Text>
                      </View>
                    </View>
                  )}
                  {!!tempSearchQuery.trim() && (
                    <View
                      style={[
                        themedStyles.badge,
                        {
                          backgroundColor: currentColors.primary + '20',
                          borderRadius: 16,
                          paddingHorizontal: 10,
                          paddingVertical: 6,
                          marginRight: 8,
                          borderWidth: 1,
                          borderColor: currentColors.primary,
                        },
                      ]}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Icon name="search-outline" size={14} style={{ color: currentColors.primary, marginRight: 6 }} />
                        <Text style={[themedStyles.text, { color: currentColors.primary, fontSize: 12 }]}>Search: "{tempSearchQuery.trim()}"</Text>
                      </View>
                    </View>
                  )}
                  {tempFilter !== 'all' && (
                    <View
                      style={[
                        themedStyles.badge,
                        {
                          backgroundColor: currentColors.household + '20',
                          borderRadius: 16,
                          paddingHorizontal: 10,
                          paddingVertical: 6,
                          marginRight: 8,
                          borderWidth: 1,
                          borderColor: currentColors.household,
                        },
                      ]}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Icon name="people-outline" size={14} style={{ color: currentColors.household, marginRight: 6 }} />
                        <Text style={[themedStyles.text, { color: currentColors.household, fontSize: 12 }]}>
                          Type: {tempFilter === 'household' ? 'Household' : 'Personal'}
                        </Text>
                      </View>
                    </View>
                  )}
                  {tempPersonFilter && (
                    <View
                      style={[
                        themedStyles.badge,
                        {
                          backgroundColor: currentColors.personal + '20',
                          borderRadius: 16,
                          paddingHorizontal: 10,
                          paddingVertical: 6,
                          marginRight: 8,
                          borderWidth: 1,
                          borderColor: currentColors.personal,
                        },
                      ]}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Icon name="person-outline" size={14} style={{ color: currentColors.personal, marginRight: 6 }} />
                        <Text style={[themedStyles.text, { color: currentColors.personal, fontSize: 12 }]}>
                          Person: {people.find(p => p.id === tempPersonFilter)?.name || 'Unknown'}
                        </Text>
                      </View>
                    </View>
                  )}
                  {tempHasEndDateFilter && (
                    <View
                      style={[
                        themedStyles.badge,
                        {
                          backgroundColor: '#FF9500' + '20',
                          borderRadius: 16,
                          paddingHorizontal: 10,
                          paddingVertical: 6,
                          marginRight: 8,
                          borderWidth: 1,
                          borderColor: '#FF9500',
                        },
                      ]}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Icon name="timer-outline" size={14} style={{ color: '#FF9500', marginRight: 6 }} />
                        <Text style={[themedStyles.text, { color: '#FF9500', fontSize: 12 }]}>
                          Has end date
                        </Text>
                      </View>
                    </View>
                  )}
                </View>
              </ScrollView>
            </View>
          )}
        </ScrollView>

        {/* Bottom action buttons */}
        <View style={[themedStyles.section, { paddingTop: 16, paddingBottom: 32, paddingHorizontal: 16 }]}>
          {/* Clear Filters button - only show when filters are active and position above Apply button */}
          {hasActiveFilters && (
            <TouchableOpacity
              onPress={handleClearFilters}
              style={{
                backgroundColor: currentColors.error + '15',
                borderWidth: 1,
                borderColor: currentColors.error,
                paddingVertical: 14,
                paddingHorizontal: 24,
                borderRadius: 24,
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'row',
                marginBottom: 12,
                minHeight: 48,
              }}
            >
              <Icon name="refresh-outline" size={20} style={{ color: currentColors.error, marginRight: 8 }} />
              <Text style={[themedStyles.text, { color: currentColors.error, fontWeight: '700', fontSize: 16 }]}>
                Clear Filters
              </Text>
            </TouchableOpacity>
          )}

          {/* Apply Filters button */}
          <TouchableOpacity
            onPress={handleApplyFilters}
            style={{
              backgroundColor: currentColors.primary,
              paddingVertical: 16,
              paddingHorizontal: 24,
              borderRadius: 24,
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'row',
              boxShadow: '0px 4px 8px rgba(0,0,0,0.15)',
              minHeight: 48,
            }}
          >
            <Icon name="search-outline" size={20} style={{ color: '#FFFFFF', marginRight: 8 }} />
            <Text style={[themedStyles.text, { color: '#FFFFFF', fontWeight: '700', fontSize: 16 }]}>
              {hasActiveFilters ? 'Apply Filters' : 'Show All Expenses'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
